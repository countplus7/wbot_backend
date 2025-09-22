require("dotenv").config();
const { OpenAI } = require("openai");
const fs = require("fs-extra");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const GoogleService = require("./google");
const OdooService = require("./odoo");
const EmbeddingsService = require("./embeddings");
const IntentDetectionService = require("./intent-detection");
const HubSpotService = require("./hubspot");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.model = "gpt-4";
    this.chatModel = "gpt-4";
    this.visionModel = "gpt-4o";
    this.embeddingsService = EmbeddingsService;
    this.intentDetectionService = IntentDetectionService;
  }

  /**
   * Main chat completion method with intent detection
   */
  async chatCompletion(messages, conversationHistory = [], businessTone = null, businessId = null, phoneNumber = null) {
    try {
      const latestMessage = messages[messages.length - 1];

      // Use intent detection system
      let aiIntent = null;
      if (businessId) {
        try {
          aiIntent = await this.intentDetectionService.detectIntent(latestMessage.content, businessId);
        } catch (error) {
          console.error("Error in intent detection:", error.message);
          aiIntent = null;
        }
      }

      // Handle detected intents with confidence threshold
      if (aiIntent && aiIntent.confidence >= 0.65) {
        return await this.handleDetectedIntent(
          aiIntent,
          latestMessage,
          conversationHistory,
          businessTone,
          businessId,
          phoneNumber
        );
      }

      // Fallback to general chat completion
      return await this.generateGeneralResponse(messages, conversationHistory, businessTone);
    } catch (error) {
      console.error("OpenAI chat completion error:", error.message);
      return "I apologize, but I am experiencing technical difficulties. Please try again later.";
    }
  }

  /**
   * Handle detected intents
   */
  async handleDetectedIntent(aiIntent, latestMessage, conversationHistory, businessTone, businessId, phoneNumber) {
    try {
      switch (aiIntent.intent) {
        case "faq":
          return await this.handleFAQIntent(businessId, latestMessage.content, conversationHistory, businessTone);
        case "gmail_send":
          return await this.handleGmailSendIntent(businessId, latestMessage.content, conversationHistory, businessTone);
        case "calendar_create":
        case "APPOINTMENT": // Handle both calendar_create and APPOINTMENT intents
          return await this.handleCalendarCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "calendar_check":
          return await this.handleCalendarCheckIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "calendar_update":
          return await this.handleCalendarUpdateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "calendar_delete":
          return await this.handleCalendarDeleteIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        // HubSpot intents
        case "hubspot_contact_create":
          return await this.handleHubSpotContactCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "hubspot_contact_search":
          return await this.handleHubSpotContactSearchIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "hubspot_contact_update":
          return await this.handleHubSpotContactUpdateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "hubspot_deal_create":
          return await this.handleHubSpotDealCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "hubspot_deal_update":
          return await this.handleHubSpotDealUpdateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "hubspot_company_create":
          return await this.handleHubSpotCompanyCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "hubspot_pipeline_view":
          return await this.handleHubSpotPipelineViewIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        // Odoo intents
        case "odoo_customer_create":
          return await this.handleOdooCustomerCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_customer_search":
          return await this.handleOdooCustomerSearchIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_product_create":
          return await this.handleOdooProductCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_sale_order_create":
          return await this.handleOdooSaleOrderCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_invoice_create":
          return await this.handleOdooInvoiceCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_inventory_check":
          return await this.handleOdooInventoryCheckIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_lead_create":
          return await this.handleOdooLeadCreateIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_order_status":
          return await this.handleOdooOrderStatusIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "odoo_order_cancel":
          return await this.handleOdooOrderCancelIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        default:
          return await this.generateGeneralResponse([latestMessage], conversationHistory, businessTone);
      }
    } catch (error) {
      console.error("Error handling detected intent:", error.message);
      return await this.generateGeneralResponse([latestMessage], conversationHistory, businessTone);
    }
  }

  /**
   * Generate general response using OpenAI
   */
  async generateGeneralResponse(messages, conversationHistory = [], businessTone = null) {
    try {
      const systemPrompt = this.buildSystemPrompt(businessTone);

      // Format conversation history properly for AI service
      const formattedHistory = conversationHistory
        .map((msg) => ({
          role: msg.direction === "inbound" ? "user" : "assistant",
          content: msg.content || "",
        }))
        .filter((msg) => msg.content && msg.content.trim().length > 0);

      // Ensure messages are properly formatted
      const formattedMessages = messages
        .map((msg) => {
          if (typeof msg === "string") {
            return { role: "user", content: msg };
          }
          if (msg.content && !msg.role) {
            return { role: "user", content: msg.content };
          }
          return msg;
        })
        .filter((msg) => msg.content && msg.content.trim().length > 0);

      const allMessages = [{ role: "system", content: systemPrompt }, ...formattedHistory, ...formattedMessages];

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error generating general response:", error.message);
      return "I apologize, but I'm having trouble processing your request right now. Please try again.";
    }
  }

  /**
   * Build system prompt with business tone
   */
  buildSystemPrompt(businessTone = null) {
    let prompt =
      "You are a helpful business assistant. Provide clear, professional, and helpful responses to customer inquiries.";

    if (businessTone && businessTone.tone_instructions) {
      prompt += `\n\nBusiness Tone: ${businessTone.tone_instructions}`;
    }

    return prompt;
  }

  /**
   * Analyze image with context
   */
  async analyzeImage(imagePath, userMessage = "", businessTone = null) {
    try {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");

      const prompt = userMessage || "Please analyze this image and provide a helpful description.";
      const systemPrompt = this.buildSystemPrompt(businessTone);

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error analyzing image:", error.message);
      return "I apologize, but I could not analyze the image. Please try again or provide more details.";
    }
  }

  /**
   * Check if ffmpeg is available on the system
   */
  async isFfmpegAvailable() {
    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          console.warn(`[DEBUG] FFmpeg not available: ${err.message}`);
          resolve(false);
        } else {
          console.log(`[DEBUG] FFmpeg is available`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Transcribe audio file with fallback handling
   */
  async transcribeAudio(audioPath) {
    try {
      console.log(`[DEBUG] Starting audio transcription for: ${audioPath}`);

      if (!fs.existsSync(audioPath)) {
        console.error(`[DEBUG] Audio file not found: ${audioPath}`);
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Check if the file is in a supported format
      const supportedFormats = [".mp3", ".mp4", ".mpeg", ".mpga", ".m4a", ".wav", ".webm"];
      const fileExtension = path.extname(audioPath).toLowerCase();

      if (!supportedFormats.includes(fileExtension)) {
        console.log(`[DEBUG] Unsupported format ${fileExtension}, checking if conversion is possible...`);

        // Check if ffmpeg is available before attempting conversion
        const ffmpegAvailable = await this.isFfmpegAvailable();

        if (!ffmpegAvailable) {
          console.warn(`[DEBUG] FFmpeg not available, cannot convert ${fileExtension} format`);
          throw new Error(
            `Audio format ${fileExtension} is not supported and ffmpeg is not available for conversion. Please install ffmpeg or send audio in a supported format (mp3, wav, m4a, etc.)`
          );
        }

        // Convert to WAV using ffmpeg
        const wavPath = audioPath.replace(fileExtension, ".wav");
        await this.convertAudioToWav(audioPath, wavPath);

        // Use the converted WAV file for transcription
        const audioFile = fs.createReadStream(wavPath);
        const response = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });

        // Clean up the temporary WAV file
        fs.unlinkSync(wavPath);

        console.log(`[DEBUG] Transcription successful: ${response.text}`);
        return response.text;
      } else {
        console.log(`[DEBUG] Supported format ${fileExtension}, proceeding with transcription...`);
        const audioFile = fs.createReadStream(audioPath);
        const response = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        });

        console.log(`[DEBUG] Transcription successful: ${response.text}`);
        return response.text;
      }
    } catch (error) {
      console.error(`[DEBUG] Error transcribing audio:`, error.message);
      console.error(`[DEBUG] Full error:`, error);
      throw error;
    }
  }

  // Add this helper method for audio conversion using fluent-ffmpeg
  async convertAudioToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      // Check if ffmpeg is available
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          console.warn(`[DEBUG] FFmpeg not available: ${err.message}`);
          reject(
            new Error(
              `FFmpeg is not installed or not accessible. Please install ffmpeg on your server: sudo apt install ffmpeg`
            )
          );
          return;
        }

        // Set ffmpeg path if needed (uncomment and modify if ffmpeg is not in PATH)
        // ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

        ffmpeg(inputPath)
          .audioFrequency(16000) // Set sample rate to 16kHz (optimal for Whisper)
          .audioChannels(1) // Convert to mono
          .audioCodec("pcm_s16le") // Use PCM 16-bit little-endian (WAV format)
          .format("wav")
          .on("start", (commandLine) => {
            console.log(`[DEBUG] FFmpeg command: ${commandLine}`);
          })
          .on("progress", (progress) => {
            console.log(`[DEBUG] Conversion progress: ${progress.percent}% done`);
          })
          .on("end", () => {
            console.log(`[DEBUG] Audio converted successfully: ${outputPath}`);
            resolve();
          })
          .on("error", (error) => {
            console.error(`[DEBUG] Audio conversion failed:`, error.message);
            if (error.message.includes("Cannot find ffmpeg")) {
              reject(
                new Error(`FFmpeg is not installed. Please install ffmpeg on your server: sudo apt install ffmpeg`)
              );
            } else {
              reject(new Error(`Failed to convert audio: ${error.message}`));
            }
          })
          .save(outputPath);
      });
    });
  }

  /**
   * Process different message types
   */
  async processMessage(
    messageType,
    content,
    filePath = null,
    conversationHistory = [],
    businessTone = null,
    businessId = null
  ) {
    try {
      switch (messageType) {
        case "text":
          return await this.chatCompletion([{ role: "user", content }], conversationHistory, businessTone, businessId);

        case "image":
          if (!filePath) {
            throw new Error("Image file path is required for image analysis");
          }
          return await this.analyzeImage(filePath, content, businessTone);

        case "audio":
          if (!filePath) {
            throw new Error("Audio file path is required for transcription");
          }
          const transcription = await this.transcribeAudio(filePath);
          return await this.chatCompletion(
            [{ role: "user", content: transcription }],
            conversationHistory,
            businessTone,
            businessId
          );

        default:
          throw new Error(`Unsupported message type: ${messageType}`);
      }
    } catch (error) {
      console.error("Error processing message:", error.message);
      return "I apologize, but I could not process your message. Please try again.";
    }
  }

  /**
   * Detect Odoo order request (legacy compatibility)
   */
  detectOdooOrderRequest(message) {
    const orderKeywords = ["order", "purchase", "buy", "place order", "create order"];
    const hasOrderKeyword = orderKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));

    if (hasOrderKeyword) {
      return {
        type: "order",
        message: message,
        confidence: 0.7,
      };
    }
    return null;
  }

  /**
   * Detect Odoo invoice request (legacy compatibility)
   */
  detectOdooInvoiceRequest(message) {
    const invoiceKeywords = ["invoice", "bill", "payment", "invoice status", "check invoice"];
    const hasInvoiceKeyword = invoiceKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));

    if (hasInvoiceKeyword) {
      return {
        type: "invoice",
        message: message,
        confidence: 0.7,
      };
    }
    return null;
  }

  /**
   * Detect Odoo lead request (legacy compatibility)
   */
  detectOdooLeadRequest(message) {
    const leadKeywords = ["lead", "prospect", "potential customer", "new lead", "create lead"];
    const hasLeadKeyword = leadKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));

    if (hasLeadKeyword) {
      return {
        type: "lead",
        message: message,
        confidence: 0.7,
      };
    }
    return null;
  }

  /**
   * Detect Odoo ticket request (legacy compatibility)
   */
  detectOdooTicketRequest(message) {
    const ticketKeywords = ["ticket", "support", "issue", "problem", "help", "complaint"];
    const hasTicketKeyword = ticketKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));

    if (hasTicketKeyword) {
      return {
        type: "ticket",
        message: message,
        confidence: 0.7,
      };
    }
    return null;
  }

  /**
   * Handle Odoo order (legacy compatibility)
   */
  async handleOdooOrder(businessId, orderRequest, phoneNumber) {
    try {
      // For now, return a message that order creation requires more details
      return "✅ I understand you want to create an order. To create a proper order, please provide more details like:\n� What product do you want to order?\n� How many units?\n� Any special requirements?\n\nFor example: 'Create an order for 5 laptops'";
    } catch (error) {
      console.error("Error handling Odoo order:", error.message);
      return "❌ Sorry, I could not process your order. Please try again or contact support.";
    }
  }

  /**
   * Detect FAQ intent with embeddings (legacy compatibility)
   */
  async detectFAQIntentWithEmbeddings(message) {
    try {
      // Use the proper intent detection service instead of the broken embeddings method
      const IntentDetectionService = require("./intent-detection");
      const result = await IntentDetectionService.detectIntent(message);

      return {
        isFAQ: result && result.intent && result.intent.toLowerCase() === "faq" && result.confidence >= 0.7,
        confidence: result ? result.confidence : 0,
        response: result ? result.response : null,
      };
    } catch (error) {
      console.error("Error in FAQ intent detection:", error.message);
      return { isFAQ: false, confidence: 0, response: null };
    }
  }

  /**
   * Process message with embeddings (legacy compatibility)
   */
  async processMessageWithEmbeddings(
    messageType,
    content,
    filePath = null,
    conversationHistory = [],
    businessTone = null,
    businessId = null
  ) {
    try {
      if (messageType === "text" && content) {
        const faqResult = await this.detectFAQIntentWithEmbeddings(content);
        if (faqResult.isFAQ && faqResult.response) {
          return faqResult.response;
        }
      }

      return await this.processMessage(messageType, content, filePath, conversationHistory, businessTone, businessId);
    } catch (error) {
      console.error("Error in enhanced message processing:", error.message);
      return await this.processMessage(messageType, content, filePath, conversationHistory, businessTone, businessId);
    }
  }

  /**
   * Detect calendar intent with better parsing
   */
  detectCalendarIntent(message) {
    const calendarKeywords = [
      "schedule",
      "meeting",
      "appointment",
      "calendar",
      "book",
      "reserve",
      "time",
      "tomorrow",
      "today",
      "next week",
    ];
    const hasCalendarKeyword = calendarKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasCalendarKeyword) {
      // Try to extract more specific information
      const lowerMessage = message.toLowerCase();

      // Determine the type of calendar request
      let intent = "schedule_meeting"; // default
      if (lowerMessage.includes("appointment") || lowerMessage.includes("book")) {
        intent = "book_appointment";
      } else if (lowerMessage.includes("meeting")) {
        intent = "schedule_meeting";
      } else if (lowerMessage.includes("remind")) {
        intent = "create_reminder";
      } else if (lowerMessage.includes("available") || lowerMessage.includes("free")) {
        intent = "check_availability";
      }

      // Try to extract basic data
      const extractedData = this.extractCalendarData(message);

      return {
        type: "calendar",
        intent: intent,
        message: message,
        extractedData: extractedData,
        confidence: 0.8,
      };
    }
    return null;
  }

  /**
   * Extract calendar data from message
   */
  extractCalendarData(message) {
    const data = {};
    const lowerMessage = message.toLowerCase();

    // Extract time references
    if (lowerMessage.includes("tomorrow")) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split("T")[0];
    } else if (lowerMessage.includes("today")) {
      data.date = new Date().toISOString().split("T")[0];
    }

    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : "";

      // Convert to 24-hour format
      if (period === "pm" && hours !== 12) {
        hours += 12;
      } else if (period === "am" && hours === 12) {
        hours = 0;
      }

      data.time = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }

    // Extract title/description
    const titleMatch = message.match(
      /(?:with|meeting with|appointment with)\s+([A-Za-z\s]+?)(?:\s+at|\s+on|\s+tomorrow|\s+today|$)/i
    );
    if (titleMatch) {
      data.title = titleMatch[1].trim();
    } else {
      // Try to extract from the beginning
      const words = message.split(" ");
      if (words.length > 2) {
        data.title = words.slice(0, 3).join(" ");
      }
    }

    return data;
  }

  // Intent-specific handlers
  async handleFAQIntent(businessId, message, conversationHistory, businessTone) {
    try {
      // Use embeddings service for FAQ detection
      const faqResult = await this.embeddingsService.detectIntentWithEmbeddings(message, {
        businessId,
        intentType: "FAQ",
      });

      if (faqResult && faqResult.confidence >= 0.7) {
        return faqResult.response;
      }

      // Fallback to general response
      return await this.generateGeneralResponse(
        [{ role: "user", content: message }],
        conversationHistory,
        businessTone
      );
    } catch (error) {
      console.error("Error handling FAQ intent:", error.message);
      return await this.generateGeneralResponse(
        [{ role: "user", content: message }],
        conversationHistory,
        businessTone
      );
    }
  }

  // Gmail intent handlers
  async handleGmailSendIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[GMAIL_SEND] Processing Gmail send request for business ${businessId}: ${message}`);

      // Check if this is a follow-up to a previous incomplete email request
      const isFollowUp = this.isEmailFollowUp(message, conversationHistory);

      if (isFollowUp) {
        return await this.handleEmailFollowUp(businessId, message, conversationHistory, businessTone);
      }

      // Extract email details from the message using AI
      const emailPrompt = `Analyze this email request: "${message}"

Determine what information is provided and what is missing.

Return JSON with this structure:
{
  "has_subject": true/false,
  "has_body": true/false,
  "subject": "email subject if provided",
  "body": "email content if provided",
  "is_complete": true/false,
  "missing_fields": ["list of missing required fields"]
}

Required fields: subject, body
Note: Email will be sent TO the business owner FROM the integrated Google Workspace account.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: emailPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        console.log("AI response for email analysis:", responseContent);

        // Try to extract JSON from the response if it's wrapped in text
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;

        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing email analysis:", parseError);
        console.log("Raw AI response:", response.choices[0].message.content);

        // Fallback: manually analyze the message for common patterns
        analysis = this.manualEmailAnalysis(message);
      }

      console.log("Email analysis:", analysis);

      if (analysis.is_complete) {
        // All information provided, send the email
        return await this.sendCompleteEmail(businessId, analysis, message);
      } else {
        // Missing information, ask for it
        return await this.askForMissingEmailInfo(analysis, message);
      }
    } catch (error) {
      console.error("Error handling Gmail send intent:", error.message);
      return "I apologize, but I could not process your email request. Please try again.";
    }
  }

  isEmailFollowUp(message, conversationHistory) {
    // Check if the last few messages indicate we're in an email sending flow
    const recentMessages = conversationHistory.slice(-5);

    // Check if bot recently asked for email details
    const botAskedForEmail = recentMessages.some(
      (msg) =>
        msg.content &&
        (msg.content.includes("What should the email subject be") ||
          msg.content.includes("What should the email content be") ||
          msg.content.includes("email subject") ||
          msg.content.includes("email content") ||
          msg.content.includes("email details") ||
          msg.content.includes("To send your email, I need"))
    );

    // Check if current message looks like email details (Subject: ... Message: ...)
    const messageHasEmailFormat =
      message &&
      (/subject\s*:\s*.+/i.test(message) ||
        /message\s*:\s*.+/i.test(message) ||
        (message.toLowerCase().includes("subject") && message.toLowerCase().includes("message")));

    return botAskedForEmail || messageHasEmailFormat;
  }

  async handleEmailFollowUp(businessId, message, conversationHistory, businessTone) {
    try {
      // Get the context from recent conversation
      const recentMessages = conversationHistory.slice(-5);
      const contextPrompt = `Based on this conversation context, determine if we now have enough information to send an email:

Recent conversation:
${recentMessages.map((msg) => `${msg.direction}: ${msg.content}`).join("\n")}

Latest message: "${message}"

Return JSON:
{
  "has_all_info": true/false,
  "subject": "email subject if provided",
  "body": "email content if provided",
  "missing": ["any still missing fields"]
}`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: contextPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      let followUpAnalysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        followUpAnalysis = JSON.parse(jsonString);
      } catch (parseError) {
        return "I'm having trouble understanding your email details. Could you please provide:\n� Email subject\n� Email message content";
      }

      if (followUpAnalysis.has_all_info) {
        // We have all the information, send the email
        return await this.sendCompleteEmail(businessId, followUpAnalysis, message);
      } else {
        // Still missing information
        return this.askForMissingEmailInfo(followUpAnalysis, message);
      }
    } catch (error) {
      console.error("Error handling email follow-up:", error.message);
      return "I'm having trouble processing your email. Please provide:\n� Email subject\n� Email message content";
    }
  }

  async askForMissingEmailInfo(analysis, originalMessage) {
    const missing = analysis.missing_fields || [];

    if (missing.includes("subject") && missing.includes("body")) {
      return `I'd be happy to help you send an email! ??

To send your email, I need a few more details:

**Subject:** What should the email subject be?
**Message:** What should the email content be?

For example: "Subject: Meeting Request, Message: Hi, I'd like to schedule a meeting for tomorrow."`;
    } else if (missing.includes("subject")) {
      return `Great! I can see your message: "${analysis.body}"

Just need to know: **What should the email subject be?**`;
    } else if (missing.includes("body")) {
      return `Perfect! I have the subject: "${analysis.subject}"

Now I need to know: **What should the email message content be?**`;
    } else {
      return `I need a bit more information to send your email. Could you please specify:\n� Email subject\n� Email message content`;
    }
  }

  async sendCompleteEmail(businessId, analysis, message) {
    try {
      // Get business owner email from Google Workspace integration
      const businessOwnerEmail = await this.getBusinessOwnerEmail(businessId);

      if (!businessOwnerEmail) {
        return `❌ **Unable to Send Email**

I couldn't find a configured email address for this business. Please ensure:
• Google Workspace integration is set up
• You've authorized Gmail access in your integrations

You can configure this in your business settings.`;
      }

      const emailData = {
        to: businessOwnerEmail,
        subject: analysis.subject,
        body: analysis.body,
      };

      console.log("Sending email with data:", emailData);

      // Send email using Google Service
      const result = await GoogleService.sendEmail(businessId, emailData);

      return `✅ **Email Sent Successfully!**

📧 **Email Details:**
• To: ${businessOwnerEmail}
• Subject: ${analysis.subject}
• Message: ${analysis.body.substring(0, 100)}${analysis.body.length > 100 ? "..." : ""}

Your email has been sent via Gmail! 🚀`;
    } catch (error) {
      console.error("Error sending complete email:", error.message);

      if (error.message.includes("No Google integration found")) {
        return `❌ **Email Setup Required**

To send emails, please set up Google Workspace integration:
1. Go to your business integrations 
2. Connect Google Workspace
3. Authorize Gmail access

Once configured, you'll be able to send emails through WhatsApp!`;
      }

      return `❌ I encountered an error while sending your email: ${error.message}

Please check your email configuration or try again.`;
    }
  }

  async getBusinessOwnerEmail(businessId) {
    try {
      // Try to get email from Google Workspace integration
      const userInfo = await GoogleService.getUserInfo(businessId);
      if (userInfo && userInfo.email) {
        return userInfo.email;
      }
    } catch (error) {
      console.warn("Could not get email from Google integration:", error.message);
    }

    return null;
  }

  manualEmailAnalysis(message) {
    const lowerMessage = message.toLowerCase();

    // Check for subject patterns
    const subjectPatterns = [
      /(?:subject|title):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:about|regarding):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:re:|subject:)\s*([^,]+?)(?:\s|,|$)/i,
    ];

    let subject = null;
    for (const pattern of subjectPatterns) {
      const match = message.match(pattern);
      if (match) {
        subject = match[1].trim();
        break;
      }
    }

    // Check for body/message patterns
    const bodyPatterns = [
      /(?:message|body|content):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:saying|tell them):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:write|send):\s*([^,]+?)(?:\s|,|$)/i,
    ];

    let body = null;
    for (const pattern of bodyPatterns) {
      const match = message.match(pattern);
      if (match) {
        body = match[1].trim();
        break;
      }
    }

    const hasSubject = !!subject;
    const hasBody = !!body;
    const isComplete = hasSubject && hasBody;

    const missingFields = [];
    if (!hasSubject) missingFields.push("subject");
    if (!hasBody) missingFields.push("body");

    return {
      has_subject: hasSubject,
      has_body: hasBody,
      subject: subject,
      body: body,
      is_complete: isComplete,
      missing_fields: missingFields,
    };
  }

  // Calendar intent handlers
  // Calendar intent handlers
  async handleCalendarCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[CALENDAR_CREATE] Processing calendar create request for business ${businessId}: ${message}`);

      // Extract event details from the message using AI with improved prompt
      const eventPrompt = `Extract calendar event details from this message: "${message}"
  
  You must respond with ONLY valid JSON in this exact format:
  {
    "title": "Meeting with John",
    "start": "2024-01-20T15:00:00.000Z",
    "end": "2024-01-20T16:00:00.000Z",
    "description": "Meeting description"
  }
  
  IMPORTANT:
  - Use proper ISO 8601 format for dates (YYYY-MM-DDTHH:mm:ss.sssZ)
  - If "tomorrow" is mentioned, calculate the actual date
  - If time is mentioned (like "3 PM"), use 24-hour format (15:00)
  - Default duration is 1 hour if not specified
  - Extract attendee names from the message if mentioned
  
  Do not include any explanation or additional text, only the JSON.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that extracts calendar event data and responds only with valid JSON. Never include explanatory text, only JSON.",
          },
          { role: "user", content: eventPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
      });

      let eventData;
      try {
        const aiResponse = response.choices[0].message.content.trim();
        console.log(`[CALENDAR_CREATE] AI Response: ${aiResponse}`);

        // Try to extract JSON if it's wrapped in other text
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;

        eventData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error(`[CALENDAR_CREATE] JSON Parse Error: ${parseError.message}`);
        console.error(`[CALENDAR_CREATE] Raw AI Response: ${response.choices[0].message.content}`);
        throw new Error("Failed to parse event data from message");
      }

      // Validate required fields
      if (!eventData.title || !eventData.start || !eventData.end) {
        throw new Error("Missing required event fields (title, start, end)");
      }

      console.log(`[CALENDAR_CREATE] Extracted event data:`, eventData);

      // Create calendar event using Google Service
      const result = await GoogleService.createCalendarEvent(businessId, eventData);

      console.log(`[CALENDAR_CREATE] Google Service result:`, result);

      // Google Service returns the event data directly, not a success object
      if (result && result.id) {
        return `? Calendar event "${eventData.title}" created successfully!\n\n?? Event Details:\n� Title: ${
          eventData.title
        }\n� Start: ${new Date(eventData.start).toLocaleString()}\n� End: ${new Date(
          eventData.end
        ).toLocaleString()}\n� Description: ${eventData.description || "No description"}`;
      } else {
        throw new Error("Calendar event creation returned invalid result");
      }
    } catch (error) {
      console.error("Error handling calendar create intent:", error.message);

      // Provide more specific error messages
      if (error.message.includes("Failed to parse event data")) {
        return "? I couldn't understand the meeting details from your message. Please try rephrasing with clear date, time, and title information.";
      } else if (error.message.includes("Missing required event fields")) {
        return "? I need more information to create the calendar event. Please include the title, date, and time.";
      } else if (error.message.includes("Failed to create calendar event")) {
        return "? I couldn't create the calendar event. Please check your Google Calendar integration is properly configured.";
      } else {
        return "? I apologize, but I encountered an error while trying to create your calendar event. Please try again or check your calendar configuration.";
      }
    }
  }

  async handleCalendarCheckIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[CALENDAR_CHECK] Processing calendar check request for business ${businessId}: ${message}`);

      // Get calendar events using Google Service
      const result = await GoogleService.getCalendarEvents(businessId, {
        timeMin: new Date().toISOString(),
        maxResults: 10,
      });

      if (result.success && result.events.length > 0) {
        const eventsList = result.events
          .map((event) => `� ${event.summary} - ${new Date(event.start.dateTime || event.start.date).toLocaleString()}`)
          .join("\n");

        return `?? Your upcoming events:\n${eventsList}`;
      } else if (result.success) {
        return "?? You have no upcoming events scheduled.";
      } else {
        return `? Failed to check calendar: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling calendar check intent:", error.message);
      return "I apologize, but I could not check your calendar. Please check your calendar configuration.";
    }
  }

  async handleCalendarUpdateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[CALENDAR_UPDATE] Processing calendar update request for business ${businessId}: ${message}`);

      // Extract update details from the message using AI
      const updatePrompt = `Extract calendar update details from this message: "${message}"
      
      Return JSON with:
      - eventId: event ID to update (if mentioned)
      - title: new event title
      - start: new start date/time (ISO format)
      - end: new end date/time (ISO format)
      - description: new event description
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: updatePrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const updateData = JSON.parse(response.choices[0].message.content);

      // Update calendar event using Google Service
      const result = await GoogleService.updateCalendarEvent(businessId, updateData.eventId, updateData);

      if (result.success) {
        return `? Calendar event updated successfully`;
      } else {
        return `? Failed to update calendar event: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling calendar update intent:", error.message);
      return "I apologize, but I could not update your calendar event. Please check your calendar configuration.";
    }
  }

  async handleCalendarDeleteIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[CALENDAR_DELETE] Processing calendar delete request for business ${businessId}: ${message}`);

      // Extract event ID from the message using AI
      const deletePrompt = `Extract event ID or details from this message: "${message}"
      
      Return JSON with:
      - eventId: event ID to delete (if mentioned)
      - title: event title to search for
      
      If eventId is not provided, we'll search by title.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: deletePrompt }],
        temperature: 0.1,
        max_tokens: 100,
      });

      const deleteData = JSON.parse(response.choices[0].message.content);

      // Delete calendar event using Google Service
      const result = await GoogleService.deleteCalendarEvent(businessId, deleteData.eventId || deleteData.title);

      if (result.success) {
        return `? Calendar event deleted successfully`;
      } else {
        return `? Failed to delete calendar event: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling calendar delete intent:", error.message);
      return "I apologize, but I could not delete your calendar event. Please check your calendar configuration.";
    }
  }

  // HubSpot intent handlers
  async handleHubSpotContactCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_CONTACT_CREATE] Processing HubSpot contact create request for business ${businessId}: ${message}`
      );

      // Extract contact details from the message using AI
      const contactPrompt = `Extract contact details from this message: "${message}"
      
      Return JSON with:
      - firstName: contact first name
      - lastName: contact last name
      - email: contact email address
      - phone: contact phone number
      - company: company name
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: contactPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const contactData = JSON.parse(response.choices[0].message.content);

      // Create contact using HubSpot Service
      const result = await HubSpotService.createContact(businessId, contactData);

      if (result.success) {
        return `? Contact "${contactData.firstName} ${contactData.lastName}" created successfully in HubSpot`;
      } else {
        return `? Failed to create contact: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling HubSpot contact create intent:", error.message);
      return "I apologize, but I could not create your contact. Please check your HubSpot configuration.";
    }
  }

  async handleHubSpotContactSearchIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_CONTACT_SEARCH] Processing HubSpot contact search request for business ${businessId}: ${message}`
      );

      // Extract search criteria from the message using AI
      const searchPrompt = `Extract search criteria from this message: "${message}"
      
      Return JSON with:
      - searchTerm: name, email, or phone to search for
      
      If searchTerm is not provided, use "all" to get recent contacts.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: searchPrompt }],
        temperature: 0.1,
        max_tokens: 100,
      });

      const searchData = JSON.parse(response.choices[0].message.content);

      // Search contacts using HubSpot Service
      const result = await HubSpotService.searchContacts(businessId, searchData.searchTerm);

      if (result.success && result.contacts.length > 0) {
        const contactsList = result.contacts
          .map((contact) => `� ${contact.firstName} ${contact.lastName} - ${contact.email}`)
          .join("\n");

        return `?? Found ${result.contacts.length} contact(s):\n${contactsList}`;
      } else if (result.success) {
        return "?? No contacts found matching your search criteria.";
      } else {
        return `? Failed to search contacts: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling HubSpot contact search intent:", error.message);
      return "I apologize, but I could not search your contacts. Please check your HubSpot configuration.";
    }
  }

  async handleHubSpotContactUpdateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_CONTACT_UPDATE] Processing HubSpot contact update request for business ${businessId}: ${message}`
      );

      return "I apologize, but contact update functionality is not yet implemented. Please use the HubSpot web interface to update contacts.";
    } catch (error) {
      console.error("Error handling HubSpot contact update intent:", error.message);
      return "I apologize, but I could not update your contact. Please check your HubSpot configuration.";
    }
  }

  async handleHubSpotDealCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_DEAL_CREATE] Processing HubSpot deal create request for business ${businessId}: ${message}`
      );

      // Extract deal details from the message using AI
      const dealPrompt = `Extract deal details from this message: "${message}"
      
      Return JSON with:
      - name: name of the deal
      - amount: deal amount (number)
      - stage: deal stage
      - closeDate: close date (ISO format)
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: dealPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const dealData = JSON.parse(response.choices[0].message.content);

      // Create deal using HubSpot Service
      const result = await HubSpotService.createDeal(businessId, dealData);

      if (result.success) {
        return `? Deal "${dealData.name}" created successfully in HubSpot`;
      } else {
        return `? Failed to create deal: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling HubSpot deal create intent:", error.message);
      return "I apologize, but I could not create your deal. Please check your HubSpot configuration.";
    }
  }

  async handleHubSpotDealUpdateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_DEAL_UPDATE] Processing HubSpot deal update request for business ${businessId}: ${message}`
      );

      return "I apologize, but deal update functionality is not yet implemented. Please use the HubSpot web interface to update deals.";
    } catch (error) {
      console.error("Error handling HubSpot deal update intent:", error.message);
      return "I apologize, but I could not update your deal. Please check your HubSpot configuration.";
    }
  }

  async handleHubSpotCompanyCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_COMPANY_CREATE] Processing HubSpot company create request for business ${businessId}: ${message}`
      );

      // Extract company details from the message using AI
      const companyPrompt = `Extract company details from this message: "${message}"
      
      Return JSON with:
      - name: company name
      - domain: company domain/website
      - industry: company industry
      - city: company city
      - state: company state
      - country: company country
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: companyPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const companyData = JSON.parse(response.choices[0].message.content);

      // Create company using HubSpot Service
      const result = await HubSpotService.createCompany(businessId, companyData);

      if (result.success) {
        return `? Company "${companyData.name}" created successfully in HubSpot`;
      } else {
        return `? Failed to create company: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling HubSpot company create intent:", error.message);
      return "I apologize, but I could not create your company. Please check your HubSpot configuration.";
    }
  }

  async handleHubSpotPipelineViewIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[HUBSPOT_PIPELINE_VIEW] Processing HubSpot pipeline view request for business ${businessId}: ${message}`
      );

      return "I apologize, but pipeline view functionality is not yet implemented. Please use the HubSpot web interface to view your sales pipeline.";
    } catch (error) {
      console.error("Error handling HubSpot pipeline view intent:", error.message);
      return "I apologize, but I could not retrieve your pipeline. Please check your HubSpot configuration.";
    }
  }

  // Odoo intent handlers
  async handleOdooCustomerCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_CUSTOMER_CREATE] Processing Odoo customer create request for business ${businessId}: ${message}`
      );

      // Extract customer details from the message using AI
      const customerPrompt = `Extract customer details from this message: "${message}"
      
      Return JSON with:
      - name: customer name
      - email: customer email address
      - phone: customer phone number
      - street: customer street address
      - city: customer city
      - country: customer country
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: customerPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const customerData = JSON.parse(response.choices[0].message.content);

      // Create customer using Odoo Service
      const result = await OdooService.createCustomer(businessId, customerData);

      if (result.success) {
        return `? Customer "${customerData.name}" created successfully in Odoo`;
      } else {
        return `? Failed to create customer: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo customer create intent:", error.message);
      return "I apologize, but I could not create your customer. Please check your Odoo configuration.";
    }
  }

  async handleOdooCustomerSearchIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_CUSTOMER_SEARCH] Processing Odoo customer search request for business ${businessId}: ${message}`
      );

      // Extract search criteria from the message using AI
      const searchPrompt = `Extract search criteria from this message: "${message}"
      
      Return JSON with:
      - searchTerm: name, email, or phone to search for
      
      If searchTerm is not provided, use "all" to get recent customers.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: searchPrompt }],
        temperature: 0.1,
        max_tokens: 100,
      });

      const searchData = JSON.parse(response.choices[0].message.content);

      // Search customers using Odoo Service
      const result = await OdooService.searchCustomers(businessId, searchData.searchTerm);

      if (result.success && result.customers.length > 0) {
        const customersList = result.customers.map((customer) => `� ${customer.name} - ${customer.email}`).join("\n");

        return `?? Found ${result.customers.length} customer(s):\n${customersList}`;
      } else if (result.success) {
        return "?? No customers found matching your search criteria.";
      } else {
        return `? Failed to search customers: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo customer search intent:", error.message);
      return "I apologize, but I could not search your customers. Please check your Odoo configuration.";
    }
  }

  async handleOdooProductCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_PRODUCT_CREATE] Processing Odoo product create request for business ${businessId}: ${message}`
      );

      // Extract product details from the message using AI
      const productPrompt = `Extract product details from this message: "${message}"
      
      Return JSON with:
      - name: product name
      - type: product type (consu, service, product)
      - list_price: product price
      - standard_price: cost price
      - description: product description
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: productPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const productData = JSON.parse(response.choices[0].message.content);

      // Create product using Odoo Service
      const result = await OdooService.createProduct(businessId, productData);

      if (result.success) {
        return `? Product "${productData.name}" created successfully in Odoo`;
      } else {
        return `? Failed to create product: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo product create intent:", error.message);
      return "I apologize, but I could not create your product. Please check your Odoo configuration.";
    }
  }

  async handleOdooSaleOrderCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_SALE_ORDER_CREATE] Processing Odoo sale order create request for business ${businessId}: ${message}`
      );

      // Check if this is a follow-up to a previous incomplete order request
      const isFollowUp = this.isOrderFollowUp(message, conversationHistory);

      if (isFollowUp) {
        return await this.handleOrderFollowUp(businessId, message, conversationHistory, businessTone);
      }

      // Extract order details from the message using AI
      const orderPrompt = `You are a JSON parser. Analyze this order request: "${message}"

IMPORTANT: Return ONLY valid JSON, no explanations or additional text.

Return JSON with this exact structure:
{
  "has_customer": true,
  "has_products": true,
  "has_quantities": true,
  "customer_info": "John Smith",
  "products": [{"name": "laptop", "quantity": 2}],
  "is_complete": true,
  "missing_fields": []
}

Analyze the message and return the appropriate JSON. Required fields: customer, products, quantities.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: orderPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        console.log("AI response for order analysis:", responseContent);

        // Try to extract JSON from the response if it's wrapped in text
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;

        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing order analysis:", parseError);
        console.log("Raw AI response:", response.choices[0].message.content);

        // Fallback: manually analyze the message for common patterns
        analysis = this.manualOrderAnalysis(message);
      }

      console.log("Order analysis:", analysis);

      if (analysis.is_complete) {
        // All information provided, create the order
        return await this.createCompleteOrder(businessId, analysis, message);
      } else {
        // Missing information, ask for it
        return await this.askForMissingOrderInfo(analysis, message);
      }
    } catch (error) {
      console.error("Error handling Odoo sale order create intent:", error.message);
      return "I apologize, but I could not process your order request. Please try again.";
    }
  }

  isOrderFollowUp(message, conversationHistory) {
    // Check if the last few messages indicate we're in an order creation flow
    const recentMessages = conversationHistory.slice(-3);
    return recentMessages.some(
      (msg) =>
        msg.content &&
        (msg.content.includes("What customer") ||
          msg.content.includes("What product") ||
          msg.content.includes("How many") ||
          msg.content.includes("order details"))
    );
  }

  async handleOrderFollowUp(businessId, message, conversationHistory, businessTone) {
    try {
      // Get the context from recent conversation
      const recentMessages = conversationHistory.slice(-5);
      const contextPrompt = `Based on this conversation context, determine if we now have enough information to create an order:

Recent conversation:
${recentMessages.map((msg) => `${msg.direction}: ${msg.content}`).join("\n")}

Latest message: "${message}"

Return JSON:
{
  "has_all_info": true/false,
  "customer": "customer name if provided",
  "products": [{"name": "product", "quantity": number}],
  "missing": ["any still missing fields"]
}`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: contextPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      let followUpAnalysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        followUpAnalysis = JSON.parse(jsonString);
      } catch (parseError) {
        return "I'm having trouble understanding your order details. Could you please provide:\n� Customer name\n� Product name\n� Quantity";
      }

      if (followUpAnalysis.has_all_info) {
        // We have all the information, create the order
        return await this.createCompleteOrder(businessId, followUpAnalysis, message);
      } else {
        // Still missing information
        return this.askForMissingOrderInfo(followUpAnalysis, message);
      }
    } catch (error) {
      console.error("Error handling order follow-up:", error.message);
      return "I'm having trouble processing your order. Please provide:\n� Customer name\n� Product name\n� Quantity";
    }
  }

  async askForMissingOrderInfo(analysis, originalMessage) {
    const missing = analysis.missing_fields || [];

    if (missing.includes("customer") && missing.includes("products")) {
      return `I'd be happy to help you create an order! ??

To create your order, I need a few more details:

**Customer:** Who is this order for?
**Product:** What product would you like to order?
**Quantity:** How many units?

For example: "Order for John Smith, 5 laptops"`;
    } else if (missing.includes("customer")) {
      return `Great! I can see you want to order ${analysis.products?.map((p) => `${p.quantity} ${p.name}`).join(", ")}.

Just need to know: **Who is this order for?** (customer name)`;
    } else if (missing.includes("products")) {
      return `Perfect! I have the customer: ${analysis.customer_info}

Now I need to know: **What product would you like to order and how many?**`;
    } else if (missing.includes("quantities")) {
      return `Got it! Customer: ${analysis.customer_info}, Product: ${analysis.products?.map((p) => p.name).join(", ")}

Just need: **How many units of each product?**`;
    } else {
      return `I need a bit more information to create your order. Could you please specify:\n� Customer name\n� Product details\n� Quantities`;
    }
  }

  async createCompleteOrder(businessId, analysis, message) {
    try {
      // Get customer ID
      let customerId = 1; // fallback
      if (analysis.customer || analysis.customer_info) {
        const customerName = analysis.customer || analysis.customer_info;
        const customerSearch = await OdooService.searchCustomers(businessId, customerName);
        if (customerSearch.success && customerSearch.customers.length > 0) {
          customerId = customerSearch.customers[0].id;
        }
      }

      // Get product IDs
      const orderLines = [];
      for (const product of analysis.products || []) {
        const products = await OdooService.getProducts(businessId, 100);
        const matchingProduct = products.find(
          (p) =>
            p.name.toLowerCase().includes(product.name.toLowerCase()) ||
            product.name.toLowerCase().includes(p.name.toLowerCase())
        );

        if (matchingProduct) {
          orderLines.push({
            product_id: matchingProduct.id,
            quantity: product.quantity || 1,
            price_unit: matchingProduct.list_price || 0,
          });
        }
      }

      if (orderLines.length === 0) {
        return "I couldn't find the products you mentioned. Please check the product names and try again.";
      }

      const orderData = {
        partner_id: customerId,
        order_lines: orderLines,
        note: `Order created via WhatsApp: ${message}`,
      };

      console.log("Creating order with data:", orderData);

      const result = await OdooService.createSaleOrder(businessId, orderData);

      if (result.success) {
        const customerName = analysis.customer || analysis.customer_info || "Customer";
        const productSummary = orderLines.map((line) => `${line.quantity} units`).join(", ");

        return `? **Order Created Successfully!**

?? **Order Details:**
� Customer: ${customerName}
� Products: ${productSummary}
� Order ID: ${result.id}

Your order has been created in Odoo and is ready for processing! ??`;
      } else {
        return `? Sorry, I couldn't create your order: ${result.error}`;
      }
    } catch (error) {
      console.error("Error creating complete order:", error.message);
      return "? I encountered an error while creating your order. Please try again or contact support.";
    }
  }

  async handleOdooInvoiceCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_INVOICE_CREATE] Processing Odoo invoice create request for business ${businessId}: ${message}`
      );

      // Extract invoice details from the message using AI
      const invoicePrompt = `Extract invoice details from this message: "${message}"
      
      Return JSON with:
      - partner_id: customer ID or name
      - invoice_line_ids: array of products with product_id, quantity, price_unit
      - note: invoice notes
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: invoicePrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      const invoiceData = JSON.parse(response.choices[0].message.content);

      // Create invoice using Odoo Service
      const result = await OdooService.createInvoice(businessId, invoiceData);

      if (result.success) {
        return `? Invoice created successfully in Odoo`;
      } else {
        return `? Failed to create invoice: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo invoice create intent:", error.message);
      return "I apologize, but I could not create your invoice. Please check your Odoo configuration.";
    }
  }

  async handleOdooInventoryCheckIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_INVENTORY_CHECK] Processing Odoo inventory check request for business ${businessId}: ${message}`
      );

      // Get inventory data using Odoo Service
      const result = await OdooService.getInventory(businessId);

      if (result.success && result.products.length > 0) {
        const inventoryList = result.products
          .map((product) => `� ${product.name} - Qty: ${product.qty_available}`)
          .join("\n");

        return `?? Current inventory:\n${inventoryList}`;
      } else if (result.success) {
        return "?? Your inventory is currently empty.";
      } else {
        return `? Failed to retrieve inventory: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo inventory check intent:", error.message);
      return "I apologize, but I could not retrieve your inventory. Please check your Odoo configuration.";
    }
  }

  async handleOdooLeadCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[ODOO_LEAD_CREATE] Processing Odoo lead create request for business ${businessId}: ${message}`);

      // Check if this is a follow-up to a previous incomplete lead request
      const isFollowUp = this.isLeadFollowUp(message, conversationHistory);

      if (isFollowUp) {
        return await this.handleLeadFollowUp(businessId, message, conversationHistory, businessTone);
      }

      // Extract lead details from the message using AI
      const leadPrompt = `Analyze this lead creation request: "${message}"

IMPORTANT: Parse the message carefully. Look for these specific patterns:
- "Lead: [name]" = lead name
- "Contact: [name]" = contact name  
- "Email: [email]" = email address
- "Phone: [phone]" = phone number
- "Description: [text]" = description

Return JSON with this structure:
{
  "has_name": true/false,
  "has_contact_name": true/false,
  "has_email": true/false,
  "has_phone": true/false,
  "has_description": true/false,
  "name": "lead name if provided",
  "contact_name": "contact name if provided",
  "email": "contact email if provided",
  "phone": "contact phone if provided",
  "description": "lead description if provided",
  "is_complete": true/false,
  "missing_fields": ["list of missing required fields"]
}

Required fields: name, contact_name, email, phone, description

Example parsing:
Input: "Lead: New Customer Inquiry, Contact: John Smith, Email: john@example.com, Phone: 123-456-7890, Description: Interested in our services"
Output: {
  "has_name": true,
  "has_contact_name": true,
  "has_email": true,
  "has_phone": true,
  "has_description": true,
  "name": "New Customer Inquiry",
  "contact_name": "John Smith",
  "email": "john@example.com",
  "phone": "123-456-7890",
  "description": "Interested in our services",
  "is_complete": true,
  "missing_fields": []
}`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: leadPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        console.log("AI response for lead analysis:", responseContent);

        // Try to extract JSON from the response if it's wrapped in text
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;

        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing lead analysis:", parseError);
        console.log("Raw AI response:", response.choices[0].message.content);

        // Fallback: manually analyze the message for common patterns
        analysis = this.manualLeadAnalysis(message);
      }

      console.log("Lead analysis:", analysis);

      if (analysis.is_complete) {
        // All information provided, create the lead
        return await this.createCompleteLead(businessId, analysis, message);
      } else {
        // Missing information, ask for it
        return await this.askForMissingLeadInfo(analysis, message);
      }
    } catch (error) {
      console.error("Error handling Odoo lead create intent:", error.message);
      return "I apologize, but I could not process your lead request. Please try again.";
    }
  }

  isLeadFollowUp(message, conversationHistory) {
    // Check if the last few messages indicate we're in a lead creation flow
    const recentMessages = conversationHistory.slice(-3);
    return recentMessages.some(
      (msg) =>
        msg.content &&
        (msg.content.includes("What is the lead name") ||
          msg.content.includes("What is the contact name") ||
          msg.content.includes("What is the email") ||
          msg.content.includes("What is the phone") ||
          msg.content.includes("lead details") ||
          msg.content.includes("contact information"))
    );
  }

  async handleLeadFollowUp(businessId, message, conversationHistory, businessTone) {
    try {
      // Get the context from recent conversation
      const recentMessages = conversationHistory.slice(-5);
      const contextPrompt = `Based on this conversation context, determine if we now have enough information to create a lead:

Recent conversation:
${recentMessages.map((msg) => `${msg.direction}: ${msg.content}`).join("\n")}

Latest message: "${message}"

Return JSON:
{
  "has_all_info": true/false,
  "name": "lead name if provided",
  "contact_name": "contact name if provided",
  "email": "contact email if provided",
  "phone": "contact phone if provided",
  "description": "lead description if provided",
  "missing": ["any still missing fields"]
}`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: contextPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      let followUpAnalysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        followUpAnalysis = JSON.parse(jsonString);
      } catch (parseError) {
        return "I'm having trouble understanding your lead details. Could you please provide:\n� Lead name\n� Contact name\n� Email\n� Phone\n� Description";
      }

      if (followUpAnalysis.has_all_info) {
        // We have all the information, create the lead
        return await this.createCompleteLead(businessId, followUpAnalysis, message);
      } else {
        // Still missing information
        return this.askForMissingLeadInfo(followUpAnalysis, message);
      }
    } catch (error) {
      console.error("Error handling lead follow-up:", error.message);
      return "I'm having trouble processing your lead. Please provide:\n� Lead name\n� Contact name\n� Email\n� Phone\n� Description";
    }
  }

  async askForMissingLeadInfo(analysis, originalMessage) {
    const missing = analysis.missing_fields || [];

    if (missing.length >= 3) {
      return `I'd be happy to help you create a lead! ??

To create your lead, I need the following information:

**Lead Name:** What should we call this lead?
**Contact Name:** Who is the contact person?
**Email:** What's their email address?
**Phone:** What's their phone number?
**Description:** What is this lead about?

For example: "Lead: New Customer Inquiry, Contact: John Smith, Email: john@example.com, Phone: 123-456-7890, Description: Interested in our services"`;
    } else if (missing.length === 1) {
      const field = missing[0];
      const fieldDisplay = this.getFieldDisplayName(field);
      return `Almost there! I just need the **${fieldDisplay}** to complete your lead.`;
    } else {
      const missingFields = missing.map((field) => this.getFieldDisplayName(field)).join(", ");
      return `I need a few more details to create your lead: **${missingFields}**`;
    }
  }

  getFieldDisplayName(field) {
    const fieldNames = {
      name: "Lead Name",
      contact_name: "Contact Name",
      email: "Email",
      phone: "Phone",
      description: "Description",
    };
    return fieldNames[field] || field;
  }

  async createCompleteLead(businessId, analysis, message) {
    try {
      const leadData = {
        name: analysis.name,
        partner_name: analysis.contact_name,
        email: analysis.email,
        phone: analysis.phone,
        description: analysis.description,
      };

      console.log("Creating lead with data:", leadData);

      // Create lead using Odoo Service
      const result = await OdooService.createLead(businessId, leadData);

      if (result.success) {
        return `? **Lead Created Successfully!**

?? **Lead Details:**
� Lead Name: ${analysis.name}
� Contact: ${analysis.contact_name}
� Email: ${analysis.email}
� Phone: ${analysis.phone}
� Description: ${analysis.description}
� Lead ID: ${result.id}

Your lead has been created in Odoo and is ready for follow-up! ??`;
      } else {
        return `? Sorry, I couldn't create your lead: ${result.error}`;
      }
    } catch (error) {
      console.error("Error creating complete lead:", error.message);
      return "? I encountered an error while creating your lead. Please try again or contact support.";
    }
  }

  manualLeadAnalysis(message) {
    const lowerMessage = message.toLowerCase();

    // Check for lead name patterns
    const namePatterns = [
      /(?:lead|title):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:name):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:about):\s*([^,]+?)(?:\s|,|$)/i,
    ];

    let name = null;
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match) {
        name = match[1].trim();
        break;
      }
    }

    // Check for contact name patterns
    const contactPatterns = [/(?:contact|person):\s*([^,]+?)(?:\s|,|$)/i, /(?:for|with)\s+([a-zA-Z\s]+?)(?:\s|,|$)/i];

    let contactName = null;
    for (const pattern of contactPatterns) {
      const match = message.match(pattern);
      if (match) {
        contactName = match[1].trim();
        break;
      }
    }

    // Check for email patterns
    const emailPatterns = [/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i];

    let email = null;
    for (const pattern of emailPatterns) {
      const match = message.match(pattern);
      if (match) {
        email = match[1].trim();
        break;
      }
    }

    // Check for phone patterns
    const phonePatterns = [/(?:phone|tel):\s*([^,]+?)(?:\s|,|$)/i, /(\+?[\d\s\-\(\)]{10,})/i];

    let phone = null;
    for (const pattern of phonePatterns) {
      const match = message.match(pattern);
      if (match) {
        phone = match[1].trim();
        break;
      }
    }

    // Check for description patterns
    const descriptionPatterns = [
      /(?:description|about|details):\s*([^,]+?)(?:\s|,|$)/i,
      /(?:interested in|looking for):\s*([^,]+?)(?:\s|,|$)/i,
    ];

    let description = null;
    for (const pattern of descriptionPatterns) {
      const match = message.match(pattern);
      if (match) {
        description = match[1].trim();
        break;
      }
    }

    const hasName = !!name;
    const hasContactName = !!contactName;
    const hasEmail = !!email;
    const hasPhone = !!phone;
    const hasDescription = !!description;
    const isComplete = hasName && hasContactName && hasEmail && hasPhone && hasDescription;

    const missingFields = [];
    if (!hasName) missingFields.push("name");
    if (!hasContactName) missingFields.push("contact_name");
    if (!hasEmail) missingFields.push("email");
    if (!hasPhone) missingFields.push("phone");
    if (!hasDescription) missingFields.push("description");

    return {
      has_name: hasName,
      has_contact_name: hasContactName,
      has_email: hasEmail,
      has_phone: hasPhone,
      has_description: hasDescription,
      name: name,
      contact_name: contactName,
      email: email,
      phone: phone,
      description: description,
      is_complete: isComplete,
      missing_fields: missingFields,
    };
  }

  // New Odoo Order Management Intent Handlers
  async handleOdooOrderStatusIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[ODOO_ORDER_STATUS] Processing order status request for business ${businessId}: ${message}`);

      // Check if this is a follow-up to a previous order status request
      const isFollowUp = this.isOrderStatusFollowUp(message, conversationHistory);

      if (isFollowUp) {
        return await this.handleOrderStatusFollowUp(businessId, message, conversationHistory, businessTone);
      }

      // Extract order identifier from the message
      const orderPrompt = `Extract order identifier from this message: "${message}"

Return JSON with this structure:
{
  "order_id": "order ID if provided",
  "has_order_id": true/false
}

Look for patterns like:
- "Order ID: 123"
- "Check status of order 456"
- "What's the status of order 789"`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: orderPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing order status analysis:", parseError);
        analysis = this.manualOrderStatusAnalysis(message);
      }

      if (analysis.has_order_id && analysis.order_id) {
        // Order ID provided, get the status
        const result = await OdooService.getOrderStatus(businessId, parseInt(analysis.order_id));
        return this.formatOrderStatusResponse(result);
      } else {
        // No order ID provided, ask for it
        return `I'd be happy to help you check an order status! ??

To check an order status, I need the **Order ID** of the order you want to check.

Please provide the Order ID (the numeric ID of the order).

For example: "Order ID: 123" or "Check status of order 456"`;
      }
    } catch (error) {
      console.error("Error handling Odoo order status intent:", error.message);
      return "I apologize, but I could not check the order status. Please try again.";
    }
  }

  async handleOdooOrderCancelIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[ODOO_ORDER_CANCEL] Processing order cancellation request for business ${businessId}: ${message}`);

      // Check if this is a follow-up to a previous order cancellation request
      const isFollowUp = this.isOrderCancelFollowUp(message, conversationHistory);

      if (isFollowUp) {
        return await this.handleOrderCancelFollowUp(businessId, message, conversationHistory, businessTone);
      }

      // Extract order identifier from the message
      const orderPrompt = `Extract order identifier from this message: "${message}"

Return JSON with this structure:
{
  "order_id": "order ID if provided",
  "has_order_id": true/false,
  "confirmation": true/false
}

Look for patterns like:
- "Cancel order 123"
- "Cancel order 456"
- "Yes, cancel order 789" (confirmation)
- "No, don't cancel" (confirmation)`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: orderPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing order cancel analysis:", parseError);
        analysis = this.manualOrderCancelAnalysis(message);
      }

      if (analysis.has_order_id && analysis.order_id) {
        if (analysis.confirmation === false) {
          return "Order cancellation cancelled. No changes were made.";
        }

        // Order ID provided, cancel the order
        const result = await OdooService.cancelOrder(businessId, parseInt(analysis.order_id));
        return this.formatOrderCancelResponse(result);
      } else {
        // No order ID provided, ask for it
        return `I'd be happy to help you cancel an order! ??

To cancel an order, I need the **Order ID** of the order you want to cancel.

Please provide the Order ID (the numeric ID of the order).

For example: "Cancel order 123" or "Cancel order 456"

?? **Warning:** Cancelling an order cannot be undone. Please make sure you want to cancel the order.`;
      }
    } catch (error) {
      console.error("Error handling Odoo order cancel intent:", error.message);
      return "I apologize, but I could not cancel the order. Please try again.";
    }
  }

  // Updated follow-up detection methods with better pattern matching
  isOrderStatusFollowUp(message, conversationHistory) {
    const recentMessages = conversationHistory.slice(-3);
    return recentMessages.some(
      (msg) =>
        msg.content &&
        (msg.content.includes("check an order status") ||
          msg.content.includes("I need the **Order ID**") ||
          msg.content.includes("I need the Order ID") ||
          msg.content.includes("Please provide the Order ID") ||
          msg.content.includes("order status") ||
          msg.content.includes("To check an order status"))
    );
  }

  isOrderCancelFollowUp(message, conversationHistory) {
    const recentMessages = conversationHistory.slice(-3);
    return recentMessages.some(
      (msg) =>
        msg.content &&
        (msg.content.includes("cancel an order") ||
          msg.content.includes("I need the **Order ID**") ||
          msg.content.includes("I need the Order ID") ||
          msg.content.includes("Please provide the Order ID") ||
          msg.content.includes("cancel order") ||
          msg.content.includes("To cancel an order"))
    );
  }

  // Updated manual analysis methods with better regex patterns
  manualOrderStatusAnalysis(message) {
    // Look for "Order ID: 5" or just "5" or "order 5" patterns
    const orderIdMatch = message.match(/(?:order\s+id\s*:?\s*)?(\d+)/i);

    return {
      order_id: orderIdMatch ? orderIdMatch[1] : null,
      has_order_id: !!orderIdMatch,
    };
  }

  manualOrderCancelAnalysis(message) {
    // Look for "Order ID: 5" or just "5" or "order 5" patterns
    const orderIdMatch = message.match(/(?:order\s+id\s*:?\s*)?(\d+)/i);
    const confirmationMatch = message.match(/(yes|no|confirm|cancel)/i);

    return {
      order_id: orderIdMatch ? orderIdMatch[1] : null,
      has_order_id: !!orderIdMatch,
      confirmation: confirmationMatch ? confirmationMatch[1].toLowerCase().includes("yes") : null,
    };
  }

  manualOrderSearchAnalysis(message) {
    const searchMatch = message.match(/(?:for|with|containing)\s+([^,]+?)(?:\s|$)/i);

    return {
      search_term: searchMatch ? searchMatch[1].trim() : null,
      has_search_term: !!searchMatch,
    };
  }

  // Helper methods for formatting responses
  formatOrderStatusResponse(result) {
    if (!result.success) {
      return `? **Error:** ${result.error}`;
    }

    const order = result.order;
    const stateDisplay = this.getOrderStateDisplay(order.state);

    return `?? **Order Status**

**Order:** ${order.name} (ID: ${order.id})
**Customer:** ${order.customer}
**Status:** ${stateDisplay}
**Total Amount:** $${order.amount_total}
**Order Date:** ${new Date(order.date_order).toLocaleDateString()}

**Order Items:**
${order.order_lines.map((line) => `� ${line.product} - Qty: ${line.quantity} - $${line.total}`).join("\n")}

${this.getOrderStatusMessage(order.state)}`;
  }

  formatOrderCancelResponse(result) {
    if (!result.success) {
      return `? **Cancellation Failed:** ${result.error}`;
    }

    return `? **Order Cancelled Successfully**

Order ID ${result.orderId} has been cancelled and is no longer active.

?? **Note:** This action cannot be undone.`;
  }

  formatOrderSearchResponse(result, action) {
    if (!result.success) {
      return `? **Search Failed:** ${result.error}`;
    }

    if (result.orders.length === 0) {
      return `?? **No Orders Found**

No orders match your search criteria. Please try a different search term.`;
    }

    if (result.orders.length === 1 && action === "cancel") {
      const order = result.orders[0];
      return ` **Found Order**

**Order:** ${order.name} (ID: ${order.id})
**Customer:** ${order.partner_id ? order.partner_id[1] : "Unknown"}
**Status:** ${this.getOrderStateDisplay(order.state)}
**Amount:** $${order.amount_total}

?? **Are you sure you want to cancel this order?** Please confirm by saying "Yes, cancel order ${
        order.id
      }" or "Cancel order ${order.id}".`;
    }

    const orderList = result.orders
      .map(
        (order) =>
          `� **${order.name}** (ID: ${order.id}) - ${
            order.partner_id ? order.partner_id[1] : "Unknown"
          } - ${this.getOrderStateDisplay(order.state)} - $${order.amount_total}`
      )
      .join("\n");

    return ` **Found ${result.orders.length} Order(s)**

${orderList}

${action === "status" ? "To check the status of a specific order, please provide the Order ID or Name." : ""}
${action === "cancel" ? "To cancel a specific order, please provide the Order ID or Name." : ""}`;
  }

  getOrderStateDisplay(state) {
    const stateMap = {
      draft: " Draft",
      sent: " Quotation Sent",
      sale: "? Sales Order",
      done: "? Done",
      cancel: "? Cancelled",
    };
    return stateMap[state] || state;
  }

  getOrderStatusMessage(state) {
    const messages = {
      draft: "This order is in draft status and can still be modified.",
      sent: "This quotation has been sent to the customer.",
      sale: "This order has been confirmed and is being processed.",
      done: "This order has been completed.",
      cancel: "This order has been cancelled.",
    };
    return messages[state] || "";
  }

  async handleOrderStatusFollowUp(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_ORDER_STATUS_FOLLOWUP] Processing order status follow-up for business ${businessId}: ${message}`
      );

      // Extract order identifier from the follow-up message
      const orderPrompt = `Extract order identifier from this follow-up message: "${message}"

Return JSON with this structure:
{
  "order_id": "order ID if provided",
  "has_order_id": true/false
}

Look for patterns like:
- "Order ID: 123"
- "5"
- "SO001"`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: orderPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing order status follow-up analysis:", parseError);
        analysis = this.manualOrderStatusAnalysis(message);
      }

      if (analysis.has_order_id && analysis.order_id) {
        // Order ID provided, get the status
        const result = await OdooService.getOrderStatus(businessId, parseInt(analysis.order_id));
        return this.formatOrderStatusResponse(result);
      } else {
        return "I could not find an order ID in your message. Please provide the Order ID in the format: Order ID: 123";
      }
    } catch (error) {
      console.error("Error handling order status follow-up:", error.message);
      return "I apologize, but I could not check the order status. Please try again.";
    }
  }

  async handleOrderCancelFollowUp(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(
        `[ODOO_ORDER_CANCEL_FOLLOWUP] Processing order cancel follow-up for business ${businessId}: ${message}`
      );

      // Extract order identifier from the follow-up message
      const orderPrompt = `Extract order identifier from this follow-up message: "${message}"

Return JSON with this structure:
{
  "order_id": "order ID if provided",
  "has_order_id": true/false,
  "confirmation": true/false
}

Look for patterns like:
- "Order ID: 123"
- "Cancel order 456"
- "Yes, cancel order 789"
- "5"`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: orderPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      let analysis;
      try {
        const responseContent = response.choices[0].message.content.trim();
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseContent;
        analysis = JSON.parse(jsonString);
      } catch (parseError) {
        console.error("Error parsing order cancel follow-up analysis:", parseError);
        analysis = this.manualOrderCancelAnalysis(message);
      }

      if (analysis.has_order_id && analysis.order_id) {
        if (analysis.confirmation === false) {
          return "Order cancellation cancelled. No changes were made.";
        }

        // Order ID provided, cancel the order
        const result = await OdooService.cancelOrder(businessId, parseInt(analysis.order_id));
        return this.formatOrderCancelResponse(result);
      } else {
        return "I could not find an order ID in your message. Please provide the Order ID in the format: Order ID: 123";
      }
    } catch (error) {
      console.error("Error handling order cancel follow-up:", error.message);
      return "I apologize, but I could not cancel the order. Please try again.";
    }
  }
}

module.exports = new OpenAIService();
