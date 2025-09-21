const express = require("express");
const router = express.Router();
const WhatsAppService = require("../services/whatsapp");
const OpenAIService = require("../services/openai");
const DatabaseService = require("../services/database");
const BusinessService = require("../services/business");
const CalendarHandler = require("../services/calendar-handler");
const AirtableService = require("../services/airtable");
const EmbeddingsService = require("../services/embeddings");
const pool = require("../config/database");
const path = require("path");
const fs = require("fs-extra");
const IntentDetectionService = require("../services/intent-detection");
const { createResponse } = require("../middleware/error-handler");

// Webhook verification endpoint
router.get("/webhook", async (req, res) => {
  try {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;

    if (!mode || !token) {
      console.log("Webhook verification failed: Missing required parameters");
      return res.status(403).send("Forbidden");
    }

    // Check if the verify token matches any business configuration
    const configs = await BusinessService.getAllWhatsAppConfigs();
    const matchingConfig = configs.find((config) => config.verify_token === token);

    if (mode === "subscribe" && matchingConfig) {
      console.log("Webhook verification successful");
      res.status(200).send(challenge);
    } else {
      console.log("Webhook verification failed: Invalid token or mode");
      res.status(403).send("Forbidden");
    }
  } catch (error) {
    console.error("Webhook verification error:", error);
    res.status(403).send("Forbidden");
  }
});

// Webhook endpoint for receiving messages
router.post("/webhook", async (req, res) => {
  const startTime = Date.now();

  try {
    console.log("=== WEBHOOK RECEIVED ===");

    // Process the incoming message
    const messageData = await WhatsAppService.processIncomingMessage(req.body);

    if (!messageData) {
      console.log("No message data to process - this might be a status update");

      // Check if this is a failed media download status update
      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const statuses = changes?.value?.statuses;

      if (statuses && statuses.length > 0) {
        const status = statuses[0];
        if (status.status === "failed" && status.errors) {
          console.log("Media download failed:", {
            messageId: status.id,
            recipientId: status.recipient_id,
            errors: status.errors,
          });

          // Check if this is a media download error
          const mediaError = status.errors.find((error) => error.code === 131052);
          if (mediaError) {
            console.log("Sending media download failure notification to user");

            // Get the phone number ID from the webhook metadata to identify the business
            const phoneNumberId = changes?.value?.metadata?.phone_number_id;
            if (phoneNumberId) {
              try {
                // Get WhatsApp configuration for this business
                const whatsappConfig = await BusinessService.getWhatsAppConfigByPhoneNumber(phoneNumberId);
                if (whatsappConfig) {
                  // Configure WhatsApp service before sending message
                  WhatsAppService.setBusinessConfig(whatsappConfig);
                  
                  // Send a helpful message to the user about the failed media
                  const recipientId = status.recipient_id;
                  await WhatsAppService.sendMessage(
                    recipientId,
                    "I'm sorry, but I couldn't process your voice message due to a technical issue. " +
                      "This sometimes happens with voice notes. Please try sending your message again, " +
                      "or you can type your message instead. I'm here to help! ��"
                  );
                  console.log("Media download failure notification sent successfully");
                } else {
                  console.error("No WhatsApp configuration found for phone number:", phoneNumberId);
                }
              } catch (error) {
                console.error("Failed to send media download failure notification:", error);
              }
            } else {
              console.error("No phone number ID found in webhook metadata");
            }
          }
        }
      }

      return res.status(200).send("OK");
    }

    // Check if we've already processed this message (optimized query)
    try {
      const existingMessage = await pool.query("SELECT id, created_at FROM messages WHERE message_id = $1 LIMIT 1", [
        messageData.messageId,
      ]);

      if (existingMessage.rows.length > 0) {
        return res.status(200).send("OK");
      }
    } catch (checkError) {
      console.error("Error checking for duplicate message:", checkError);
      // Continue processing even if check fails
    }

    // Identify the business from the phone number ID
    const whatsappConfig = await BusinessService.getWhatsAppConfigByPhoneNumber(messageData.to);
    if (!whatsappConfig) {
      console.error("No WhatsApp configuration found for phone number:", messageData.to);
      return res.status(200).send("OK");
    }

    const businessId = whatsappConfig.business_id;
    console.log(`Processing message for business ID: ${businessId}`);

    // Check if business is active before processing
    const business = await BusinessService.getBusinessById(businessId);
    if (!business) {
      console.error(`Business not found for ID: ${businessId}`);
      return res.status(200).send("OK");
    }

    if (business.status === "inactive") {
      console.log(`Business ${businessId} (${business.name}) is inactive. Skipping response.`);
      return res.status(200).send("OK");
    }

    // Set WhatsApp service configuration for this business
    WhatsAppService.setBusinessConfig(whatsappConfig);

    // Get business tone for AI responses
    const businessTone = await BusinessService.getBusinessTone(businessId);
    console.log(`Using business tone: ${businessTone ? businessTone.name : "default"}`);

    // Create or get conversation
    const conversation = await DatabaseService.createOrGetConversation(businessId, messageData.from);

    // Save the incoming message
    const savedMessage = await DatabaseService.saveMessage({
      businessId: businessId,
      conversationId: conversation.id,
      messageId: messageData.messageId,
      fromNumber: messageData.from,
      toNumber: messageData.to,
      messageType: messageData.messageType,
      content: messageData.content,
      mediaUrl: messageData.mediaUrl,
      localFilePath: null,
      isFromUser: true,
    });

    // Handle media files if present
    let localFilePath = null;
    let aiResponse = "";

    // Handle different message types
    if (messageData.messageType === "image" || messageData.messageType === "audio") {
      try {
        console.log(`Processing ${messageData.messageType} message...`);
        console.log(`Media ID: ${messageData.mediaId}`);

        // Download media file with MIME type information and retry logic
        const mediaData = await WhatsAppService.downloadMedia(messageData.mediaId);
        const mediaStream = mediaData.stream;
        const mimeType = mediaData.mimeType;
        const fileSize = mediaData.fileSize;

        console.log(`Media MIME type: ${mimeType}`);
        console.log(`Media file size: ${fileSize} bytes`);

        // Determine file extension based on MIME type
        let fileExtension;
        if (messageData.messageType === "image") {
          fileExtension = mimeType === "image/png" ? ".png" : ".jpg";
        } else if (messageData.messageType === "audio") {
          // Map MIME types to file extensions for audio
          switch (mimeType) {
            case "audio/aac":
              fileExtension = ".aac";
              break;
            case "audio/mp4":
              fileExtension = ".m4a";
              break;
            case "audio/mpeg":
              fileExtension = ".mp3";
              break;
            case "audio/ogg":
              fileExtension = ".ogg";
              break;
            case "audio/wav":
              fileExtension = ".wav";
              break;
            default:
              fileExtension = ".aac"; // Default fallback
          }
        }

        // Create filename with timestamp and extension
        const timestamp = Date.now();
        const fileName = `${businessId}_${messageData.messageId}_${timestamp}${fileExtension}`;
        const uploadDir = messageData.messageType === "image" ? "uploads/images" : "uploads/audio";

        // Use absolute path for AI processing
        localFilePath = path.resolve(__dirname, "..", uploadDir, fileName);

        console.log(`Saving media to: ${localFilePath}`);
        console.log(`File extension: ${fileExtension}`);

        // Ensure directory exists before saving file
        await fs.ensureDir(path.dirname(localFilePath));

        // Save file with proper error handling
        const writeStream = fs.createWriteStream(localFilePath);
        mediaStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on("finish", resolve);
          writeStream.on("error", (error) => {
            console.error("Error writing file:", error);
            reject(error);
          });
          mediaStream.on("error", (error) => {
            console.error("Error reading media stream:", error);
            reject(error);
          });
        });

        // Verify file was saved
        if (fs.existsSync(localFilePath)) {
          const fileStats = fs.statSync(localFilePath);
          console.log(`Media file saved successfully: ${localFilePath} (${fileStats.size} bytes)`);

          // Verify file size matches expected size
          if (fileSize && fileStats.size !== fileSize) {
            console.warn(`File size mismatch: expected ${fileSize} bytes, got ${fileStats.size} bytes`);
          }
        } else {
          console.error(`Media file was not saved: ${localFilePath}`);
          throw new Error("Media file was not saved");
        }

        // Save media file info to database (use relative path for database)
        const relativePath = path.join(uploadDir, fileName);
        const fileStats = fs.statSync(localFilePath);
        await DatabaseService.saveMediaFile({
          businessId: businessId,
          messageId: savedMessage.id,
          fileName: fileName,
          filePath: relativePath, // Store relative path in database
          fileType: messageData.messageType,
          fileSize: fileStats.size,
        });

        // Update message with local file path (this will update the media_files table)
        await DatabaseService.updateMessageLocalFilePath(messageData.messageId, relativePath);

        console.log(`Media file info saved to database with path: ${relativePath}`);

        // Process media directly without intent detection
        try {
          if (messageData.messageType === "image") {
            console.log("Processing image with OCR/vision analysis...");
            // Use the highest OCR model features as per user preference
            const imageAnalysis = await OpenAIService.analyzeImage(
              localFilePath, 
              "Please analyze this image thoroughly. Extract all text using OCR, describe the visual content, identify any objects, text, or important details. Provide a comprehensive analysis.",
              businessTone
            );
            
            aiResponse = `📸 **Image Analysis:**\n\n${imageAnalysis}`;
            
          } else if (messageData.messageType === "audio") {
            console.log("Processing audio/voice note with transcription...");
            // Transcribe the audio using OpenAI Whisper
            const transcription = await OpenAIService.transcribeAudio(localFilePath);
            
            aiResponse = `🎤 **Voice Note Transcription:**\n\n"${transcription}"\n\nIs there anything specific you'd like me to help you with regarding this message?`;
          }

          console.log("Media processing completed successfully");

          // Save AI response to database
          await DatabaseService.saveMessage({
            businessId: businessId,
            conversationId: conversation.id,
            messageId: `media_${Date.now()}`,
            fromNumber: messageData.to, // From business
            toNumber: messageData.from, // To user
            messageType: "text",
            content: aiResponse,
            mediaUrl: null,
            localFilePath: null,
            isFromUser: false,
          });

          // Send WhatsApp response
          try {
            const response = await WhatsAppService.sendTextMessage(messageData.from, aiResponse);
            console.log("Media processing response sent successfully:", response);
          } catch (whatsappError) {
            console.error("Error sending media processing response:", whatsappError);
          }

          return res.status(200).send("OK");

        } catch (mediaProcessingError) {
          console.error("Error processing media:", mediaProcessingError);
          aiResponse = `I received your ${messageData.messageType} message, but I encountered an error while processing it. Please try again or send a different file.`;
          
          // Save error response to database
          await DatabaseService.saveMessage({
            businessId: businessId,
            conversationId: conversation.id,
            messageId: `media_error_${Date.now()}`,
            fromNumber: messageData.to,
            toNumber: messageData.from,
            messageType: "text",
            content: aiResponse,
            mediaUrl: null,
            localFilePath: null,
            isFromUser: false,
          });

          // Send error response via WhatsApp
          await WhatsAppService.sendTextMessage(messageData.from, aiResponse);
          return res.status(200).send("OK");
        }

      } catch (mediaError) {
        console.error(`Error processing ${messageData.messageType} media:`, mediaError);

        // If media download fails, we should still try to respond to the user
        // but let them know there was an issue with the media
        if (
          mediaError.message.includes("WhatsApp media download failed") ||
          mediaError.message.includes("timeout") ||
          mediaError.message.includes("Network error")
        ) {
          console.log("Media download failed, will inform user in AI response");
          // Set a flag to indicate media processing failed
          messageData.mediaProcessingFailed = true;
        }

        // Continue processing even if media handling fails
        localFilePath = null;
      }
    }

    // Enhanced fast intent detection (only for text messages)
    if (messageData.messageType === "text" && messageData.content) {
      try {
        console.log("Fast intent detection starting...");

        const intentResult = await IntentDetectionService.detectIntent(messageData.content, businessId);

        console.log("Intent detection result:", intentResult);

        // Log performance metrics
        if (intentResult.detectionTime) {
          console.log(`Intent detection took ${intentResult.detectionTime}ms using ${intentResult.method}`);
        }

        // Store intent result for analytics
        messageData.detectedIntent = intentResult;
      } catch (error) {
        console.error("Error in fast intent detection:", error);
      }
    }

    // Check for calendar intent first (before general AI processing)
    if (messageData.messageType === "text" && messageData.content) {
      try {
        console.log("Checking for calendar intent...");
        const calendarResult = await CalendarHandler.processMessage(businessId, messageData.content, messageData.from);

        if (calendarResult) {
          console.log("Calendar response generated:", calendarResult);

          // Save the calendar response to database
          await DatabaseService.saveMessage({
            businessId: businessId,
            conversationId: conversation.id,
            messageId: `calendar_${Date.now()}`,
            fromNumber: messageData.to, // From business
            toNumber: messageData.from, // To user
            messageType: "text",
            content: calendarResult.message,
            mediaUrl: null,
            localFilePath: null,
            isFromUser: false,
          });

          // Send the calendar response via WhatsApp
          try {
            const response = await WhatsAppService.sendTextMessage(messageData.from, calendarResult.message);
            console.log("Calendar response sent successfully:", response);
          } catch (whatsappError) {
            console.error("Error sending calendar response:", whatsappError);
          }

          return res.status(200).send("OK");
        }
      } catch (calendarError) {
        console.error("Error processing calendar message:", calendarError);
        // Continue with regular AI processing if calendar processing fails
      }
    }

    // Enhanced intent detection and processing (PRIORITY - before FAQ detection)
    if (messageData.messageType === "text" && messageData.content) {
      try {
        console.log("Enhanced intent detection starting...");
        
        // Use the proper intent detection system
        const intentResult = await IntentDetectionService.detectIntent(messageData.content, businessId);
        
        console.log("Intent detection result:", intentResult);
        
        // Handle detected intents using the proper intent handlers
        if (intentResult && intentResult.confidence >= 0.7) {
          const response = await OpenAIService.handleDetectedIntent(
            intentResult,
            { content: messageData.content, messageType: messageData.messageType },
            [], // conversationHistory - could be populated if needed
            businessTone,
            businessId,
            messageData.from
          );
          
          if (response) {
            // Save the response to database
            await DatabaseService.saveMessage({
              businessId: businessId,
              conversationId: conversation.id,
              messageId: `intent_${Date.now()}`,
              fromNumber: messageData.to,
              toNumber: messageData.from,
              messageType: "text",
              content: response,
              mediaUrl: null,
              localFilePath: null,
              isFromUser: false,
            });

            // Send the response via WhatsApp
            const whatsappResponse = await WhatsAppService.sendTextMessage(messageData.from, response);
            console.log("Intent response sent successfully:", whatsappResponse);

            return res.status(200).send("OK");
          }
        }
      } catch (error) {
        console.error("Error in intent detection:", error);
        // Continue with other processing if intent detection fails
      }
    }

    // Enhanced FAQ intent detection and processing with embeddings (now happens after Odoo)
    if (messageData.messageType === "text" && messageData.content) {
      try {
        console.log("Enhanced FAQ intent detection with embeddings...");

        // Use enhanced FAQ intent detection with embeddings
        const faqIntent = await OpenAIService.detectFAQIntentWithEmbeddings(messageData.content);

        if (faqIntent && faqIntent.isFAQ) {
          console.log("Enhanced FAQ intent detected:", faqIntent);

          try {
            // Search FAQs in Airtable with semantic search
            console.log("Calling AirtableService.searchFAQs...");
            const faqMatch = await AirtableService.searchFAQs(businessId, messageData.content);

            console.log("FAQ match received from Airtable:", { 
              similarity: faqMatch?.semanticSimilarity, 
              matchScore: faqMatch?.matchScore, 
              matchType: faqMatch?.matchType,
              question: faqMatch?.question?.substring(0, 50) + "...",
              hasAnswer: !!faqMatch?.answer
            });

            // Updated threshold to be more lenient (0.45 instead of 0.75)
            if (faqMatch && (faqMatch.semanticSimilarity > 0.45 || faqMatch.matchScore > 0.2)) {
              console.log("Enhanced FAQ answer found:", faqMatch);
              console.log("FAQ Answer:", faqMatch.answer);

              // Store conversation embedding for context
              try {
                await EmbeddingsService.storeConversationEmbedding(
                  businessId,
                  conversation.id,
                  `msg_${Date.now()}`,
                  messageData.content,
                  "user"
                );
              } catch (embeddingError) {
                console.error("Error storing conversation embedding:", embeddingError);
              }

              // Save the FAQ response to database
              await DatabaseService.saveMessage({
                businessId: businessId,
                conversationId: conversation.id,
                messageId: `faq_${Date.now()}`,
                fromNumber: messageData.to, // From business
                toNumber: messageData.from, // To user
                messageType: "text",
                content: faqMatch.answer,
                mediaUrl: null,
                localFilePath: null,
                isFromUser: false,
              });

              // Store FAQ response embedding
              try {
                await EmbeddingsService.storeConversationEmbedding(
                  businessId,
                  conversation.id,
                  `faq_resp_${Date.now()}`,
                  faqMatch.answer,
                  "assistant"
                );
              } catch (embeddingError) {
                console.error("Error storing FAQ response embedding:", embeddingError);
              }

              // Send the FAQ response via WhatsApp
              try {
                const response = await WhatsAppService.sendTextMessage(messageData.from, faqMatch.answer);
                console.log("Enhanced FAQ response sent successfully:", response);
              } catch (whatsappError) {
                console.error("Error sending FAQ response:", whatsappError);
              }

              return res.status(200).send("OK");
            } else {
              console.log("No suitable FAQ match found with enhanced search, providing FAQ fallback response");

              // Provide a proper FAQ fallback response
              const fallbackResponse = faqMatch ? 
                `I found a related question about "${faqMatch.question}", but I'm not confident this is exactly what you're looking for. Could you please rephrase your question or provide more details? I'm here to help! 😊` :
                `I'm here to help! 😊

However, I wasn't able to find specific information on "${messageData.content.substring(0, 50)}${messageData.content.length > 50 ? "..." : ""}" in our database.  These might be specific tools, software, or services related to a certain company or industry.

For me to provide a more accurate answer, could you please provide more context or details about these terms? Are they related to a certain industry, software, or business process? 🤔 Any additional information would be very helpful!`;

              // Save the fallback response to database
              await DatabaseService.saveMessage({
                businessId: businessId,
                conversationId: conversation.id,
                messageId: `faq_fallback_${Date.now()}`,
                fromNumber: messageData.to, // From business
                toNumber: messageData.from, // To user
                messageType: "text",
                content: fallbackResponse,
                mediaUrl: null,
                localFilePath: null,
                isFromUser: false,
              });

              // Send the fallback response via WhatsApp
              try {
                const response = await WhatsAppService.sendTextMessage(messageData.from, fallbackResponse);
                console.log("FAQ fallback response sent successfully:", response);
              } catch (whatsappError) {
                console.error("Error sending FAQ fallback response:", whatsappError);
              }

              return res.status(200).send("OK");
            }
          } catch (airtableError) {
            console.error("Error in Airtable FAQ search:", airtableError);
            // Continue with regular AI processing if Airtable search fails
          }
        }
      } catch (faqError) {
        console.error("Error in enhanced FAQ processing:", faqError);
        // Continue with regular AI processing if FAQ processing fails
      }
    }

    // Enhanced AI response generation with embeddings
    try {
      console.log("Enhanced AI response generation with embeddings...");

      // Skip AI processing for media messages as they are handled directly above
      if (messageData.messageType === "image" || messageData.messageType === "audio") {
        console.log("Skipping AI processing for media message - already handled directly");
        return res.status(200).send("OK");
      }

      // Get conversation history for context
      const conversationHistory = await DatabaseService.getConversationHistory(conversation.id);

      // Check if media processing failed and we don't have a file path
      if ((messageData.messageType === "image" || messageData.messageType === "audio") && !localFilePath) {
        // Provide a fallback response for failed media processing
        aiResponse = `I received your ${messageData.messageType} message, but I'm having trouble processing it right now. Please try sending it again or describe what you'd like help with.`;
      } else {
        // Use enhanced message processing with embeddings
        const enhancedResult = await OpenAIService.processMessageWithEmbeddings(
          messageData.messageType,
          messageData.content,
          localFilePath, // This can be null
          conversationHistory,
          businessTone,
          businessId
        );

        if (typeof enhancedResult === "string") {
          aiResponse = enhancedResult;
        } else if (enhancedResult.response) {
          aiResponse = enhancedResult.response;
        } else {
          aiResponse = enhancedResult;
        }
      }

      // If media processing failed, add a note to the response
      if (
        messageData.mediaProcessingFailed &&
        (messageData.messageType === "image" || messageData.messageType === "audio")
      ) {
        aiResponse = `I received your ${messageData.messageType} message, but I'm having trouble processing it right now. ${aiResponse}`;
      }

      console.log("Enhanced AI response generated:", aiResponse.substring(0, 100) + "...");
    } catch (aiError) {
      console.error("Error generating AI response:", aiError);
      aiResponse = "Sorry, I encountered an error processing your message. Please try again.";
    }

    // Only proceed with sending response if we have a valid AI response
    if (!aiResponse || aiResponse.trim() === "") {
      console.log("No AI response generated, skipping WhatsApp response");
      return res.status(200).send("OK");
    }

    // Save AI response to database
    await DatabaseService.saveMessage({
      businessId: businessId,
      conversationId: conversation.id,
      messageId: `ai_${Date.now()}`,
      fromNumber: messageData.to, // From business
      toNumber: messageData.from, // To user
      messageType: "text",
      content: aiResponse,
      mediaUrl: null,
      localFilePath: null,
      isFromUser: false,
    });

    // Send WhatsApp response
    try {
      const response = await WhatsAppService.sendTextMessage(messageData.from, aiResponse);
      console.log("WhatsApp response sent successfully:", response);
    } catch (whatsappError) {
      console.error("Error sending WhatsApp response:", whatsappError);
    }

    // Log processing time for performance monitoring
    const processingTime = Date.now() - startTime;
    console.log(`Webhook processing completed in ${processingTime}ms`);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook processing error:", error);

    // Log processing time even for errors
    const processingTime = Date.now() - startTime;
    console.log(`Webhook processing failed after ${processingTime}ms`);

    return res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
