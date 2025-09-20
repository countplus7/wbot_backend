require("dotenv").config();
const { OpenAI } = require("openai");
const fs = require("fs-extra");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const GoogleService = require("./google");
const OdooService = require("./odoo");
const EmbeddingsService = require("./embeddings");
const IntentDetectionService = require("./intent-detection");

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
        case "greeting":
          return await this.handleGreetingIntent(latestMessage.content, conversationHistory, businessTone);
        case "goodbye":
          return await this.handleGoodbyeIntent(latestMessage.content, conversationHistory, businessTone);
        case "question":
          return await this.handleQuestionIntent(businessId, latestMessage.content, conversationHistory, businessTone);
        case "complaint":
          return await this.handleComplaintIntent(businessId, latestMessage.content, conversationHistory, businessTone);
        case "compliment":
          return await this.handleComplimentIntent(latestMessage.content, conversationHistory, businessTone);
        case "appointment":
          return await this.handleAppointmentIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "information_request":
          return await this.handleInformationRequestIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "confirmation":
          return await this.handleConfirmationIntent(latestMessage.content, conversationHistory, businessTone);
        case "cancellation":
          return await this.handleCancellationIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "help_request":
          return await this.handleHelpRequestIntent(
            businessId,
            latestMessage.content,
            conversationHistory,
            businessTone
          );
        case "faq":
          return await this.handleFAQIntent(businessId, latestMessage.content, conversationHistory, businessTone);
        case "gmail_send":
          return await this.handleGmailSendIntent(businessId, latestMessage.content, conversationHistory, businessTone);
        case "calendar_create":
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
        // Legacy intent support
        case "GOOGLE_EMAIL":
          return await this.handleGoogleEmailWithAI(businessId, aiIntent, conversationHistory, businessTone);
        case "GOOGLE_CALENDAR":
          return await this.handleGoogleCalendarWithAI(businessId, aiIntent, conversationHistory, businessTone);
        case "HUBSPOT":
          return await this.handleHubSpotWithAI(businessId, aiIntent, conversationHistory, businessTone);
        case "ODOO":
          return await this.handleOdooWithAI(businessId, aiIntent, phoneNumber, conversationHistory, businessTone);
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

      const allMessages = [{ role: "system", content: systemPrompt }, ...formattedHistory, ...messages];

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error generating general response:", error.message);
      return "I apologize, but I am having trouble processing your request. Please try again.";
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
   * Transcribe audio file
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
        console.log(`[DEBUG] Unsupported format ${fileExtension}, attempting to convert...`);

        // Convert OGG to WAV using ffmpeg
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
            reject(new Error(`FFmpeg is not installed. Please install ffmpeg on your server: sudo apt install ffmpeg`));
          } else {
            reject(new Error(`Failed to convert audio: ${error.message}`));
          }
        })
        .save(outputPath);
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
      const result = await OdooService.createOrder(businessId, {
        customer_phone: phoneNumber,
        message: orderRequest.message,
      });

      return `✅ Order created successfully. Order ID: ${result.id}`;
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
      const result = await this.embeddingsService.detectIntentWithEmbeddings(message, {
        intentType: "FAQ",
      });

      return {
        isFAQ: result && result.confidence >= 0.7,
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
   * Detect calendar intent (legacy compatibility)
   */
  detectCalendarIntent(message) {
    const calendarKeywords = ["schedule", "meeting", "appointment", "calendar", "book", "reserve", "time"];
    const hasCalendarKeyword = calendarKeywords.some((keyword) =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );

    if (hasCalendarKeyword) {
      return {
        type: "calendar",
        message: message,
        confidence: 0.7,
      };
    }
    return null;
  }

  // Intent-specific handlers (simplified and cleaned up)
  async handleGreetingIntent(message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a friendly business assistant. Respond warmly to greetings.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Acknowledge the greeting and offer assistance.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling greeting intent:", error.message);
      return "Hello! How can I help you today?";
    }
  }

  async handleGoodbyeIntent(message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a professional business assistant. Respond politely to goodbyes.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Acknowledge the goodbye and offer final assistance.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.6,
        max_tokens: 100,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling goodbye intent:", error.message);
      return "Thank you for contacting us! Have a great day!";
    }
  }

  async handleQuestionIntent(businessId, message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a knowledgeable business assistant. Answer questions clearly and helpfully.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Provide accurate and helpful answers to customer questions.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling question intent:", error.message);
      return "I would be happy to help answer your question. Could you please provide more details?";
    }
  }

  async handleComplaintIntent(businessId, message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a professional business assistant. Handle complaints with empathy and professionalism.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Acknowledge the complaint, show understanding, and offer solutions.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.6,
        max_tokens: 300,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling complaint intent:", error.message);
      return "I understand your concern and apologize for any inconvenience. Let me help resolve this issue for you.";
    }
  }

  async handleComplimentIntent(message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a gracious business assistant. Respond warmly to compliments.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Acknowledge the compliment graciously and express appreciation.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling compliment intent:", error.message);
      return "Thank you so much for your kind words! We really appreciate your feedback.";
    }
  }

  async handleAppointmentIntent(businessId, message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a helpful business assistant. Handle appointment requests professionally.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Help with appointment scheduling and provide relevant information.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling appointment intent:", error.message);
      return "I would be happy to help you with your appointment. What date and time would work best for you?";
    }
  }

  async handleInformationRequestIntent(businessId, message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a helpful business assistant. Provide information clearly and accurately.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Answer information requests with helpful and accurate details.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling information request intent:", error.message);
      return "I would be happy to provide you with information. What specifically would you like to know?";
    }
  }

  async handleConfirmationIntent(message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a business assistant. Respond positively to confirmations and agreements.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Acknowledge the confirmation and provide next steps if appropriate.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling confirmation intent:", error.message);
      return "Perfect! I have noted your confirmation. Is there anything else I can help you with?";
    }
  }

  async handleCancellationIntent(businessId, message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a business assistant. Handle cancellations professionally and helpfully.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Acknowledge the cancellation request and provide information about the cancellation process.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.6,
        max_tokens: 200,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling cancellation intent:", error.message);
      return "I understand you would like to cancel. Let me help you with that process. Could you provide more details?";
    }
  }

  async handleHelpRequestIntent(businessId, message, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a helpful business assistant. Provide assistance and guidance.

${businessTone ? `Business Tone: ${businessTone.tone_instructions}` : ""}

Offer help and ask clarifying questions to better understand what the customer needs.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error handling help request intent:", error.message);
      return "I am here to help! What specific assistance do you need? Please let me know how I can support you.";
    }
  }

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

  // Legacy integration handlers (simplified)
  async handleGoogleEmailWithAI(businessId, intent, conversationHistory, businessTone) {
    try {
      if (intent.action === "send" && intent.user_email && intent.subject && intent.body) {
        const result = await GoogleService.sendEmail(businessId, {
          to: intent.user_email,
          subject: intent.subject,
          body: intent.body,
          isHtml: false,
        });
        return `✅ Email sent successfully to ${intent.user_email}`;
      }
      return "I would be happy to help you send an email. Please provide the recipient, subject, and message content.";
    } catch (error) {
      console.error("Error handling Google email:", error.message);
      return "I apologize, but I could not send the email. Please check your email configuration.";
    }
  }

  async handleGoogleCalendarWithAI(businessId, intent, conversationHistory, businessTone) {
    try {
      if (intent.action === "schedule") {
        const eventData = {
          title: intent.title || "Meeting",
          startTime: intent.startTime || new Date().toISOString(),
          endTime: intent.endTime || new Date(Date.now() + 3600000).toISOString(),
          description: intent.description || "",
        };

        const result = await GoogleService.createCalendarEvent(businessId, eventData);
        return `✅ Calendar event created successfully`;
      }
      return "I would be happy to help you with calendar scheduling. What would you like to schedule?";
    } catch (error) {
      console.error("Error handling Google calendar:", error.message);
      return "I apologize, but I could not access your calendar. Please check your calendar configuration.";
    }
  }

  async handleHubSpotWithAI(businessId, intent, conversationHistory, businessTone) {
    try {
      return "I would be happy to help you with HubSpot operations. What would you like to do?";
    } catch (error) {
      console.error("Error handling HubSpot request:", error.message);
      return "I apologize, but I could not process your HubSpot request. Please check your HubSpot configuration.";
    }
  }

  async handleOdooWithAI(businessId, intent, phoneNumber, conversationHistory, businessTone) {
    try {
      return "I would be happy to help you with Odoo operations. What would you like to do?";
    } catch (error) {
      console.error("Error handling Odoo request:", error.message);
      return "I apologize, but I could not process your Odoo request. Please check your Odoo configuration.";
    }
  }

  // Gmail intent handlers
  async handleGmailSendIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[GMAIL_SEND] Processing Gmail send request for business ${businessId}: ${message}`);

      // Extract email details from the message using AI
      const emailPrompt = `Extract email details from this message: "${message}"
      
      Return JSON with:
      - to: recipient email address
      - subject: email subject
      - body: email content
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: emailPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const emailData = JSON.parse(response.choices[0].message.content);

      // Send email using Google Service
      const result = await GoogleService.sendEmail(businessId, {
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
      });

      if (result.success) {
        return `✅ Email sent successfully to ${emailData.to}`;
      } else {
        return `❌ Failed to send email: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Gmail send intent:", error.message);
      return "I apologize, but I could not send your email. Please check your Gmail configuration.";
    }
  }

  // Calendar intent handlers
  async handleCalendarCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[CALENDAR_CREATE] Processing calendar create request for business ${businessId}: ${message}`);

      // Extract event details from the message using AI
      const eventPrompt = `Extract calendar event details from this message: "${message}"
      
      Return JSON with:
      - title: event title
      - start: start date/time (ISO format)
      - end: end date/time (ISO format)
      - description: event description
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: eventPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const eventData = JSON.parse(response.choices[0].message.content);

      // Create calendar event using Google Service
      const result = await GoogleService.createCalendarEvent(businessId, eventData);

      if (result.success) {
        return `✅ Calendar event "${eventData.title}" created successfully`;
      } else {
        return `❌ Failed to create calendar event: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling calendar create intent:", error.message);
      return "I apologize, but I could not create your calendar event. Please check your calendar configuration.";
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
          .map((event) => `• ${event.summary} - ${new Date(event.start.dateTime || event.start.date).toLocaleString()}`)
          .join("\n");

        return `📅 Your upcoming events:\n${eventsList}`;
      } else if (result.success) {
        return "📅 You have no upcoming events scheduled.";
      } else {
        return `❌ Failed to check calendar: ${result.error}`;
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
        return `✅ Calendar event updated successfully`;
      } else {
        return `❌ Failed to update calendar event: ${result.error}`;
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
        return `✅ Calendar event deleted successfully`;
      } else {
        return `❌ Failed to delete calendar event: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling calendar delete intent:", error.message);
      return "I apologize, but I could not delete your calendar event. Please check your calendar configuration.";
    }
  }
}

module.exports = new OpenAIService();
