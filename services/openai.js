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
        // Legacy intent support
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
          throw new Error(`Audio format ${fileExtension} is not supported and ffmpeg is not available for conversion. Please install ffmpeg or send audio in a supported format (mp3, wav, m4a, etc.)`);
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
          reject(new Error(`FFmpeg is not installed or not accessible. Please install ffmpeg on your server: sudo apt install ffmpeg`));
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
              reject(new Error(`FFmpeg is not installed. Please install ffmpeg on your server: sudo apt install ffmpeg`));
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
      const result = await OdooService.createSaleOrder(businessId, {
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
      // Use the proper intent detection service instead of the broken embeddings method
      const IntentDetectionService = require('./intent-detection');
      const result = await IntentDetectionService.detectIntent(message);

      return {
        isFAQ: result && result.intent && result.intent.toLowerCase() === 'faq' && result.confidence >= 0.7,
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
    const calendarKeywords = ["schedule", "meeting", "appointment", "calendar", "book", "reserve", "time", "tomorrow", "today", "next week"];
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
      data.date = tomorrow.toISOString().split('T')[0];
    } else if (lowerMessage.includes("today")) {
      data.date = new Date().toISOString().split('T')[0];
    }

    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';

      // Convert to 24-hour format
      if (period === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }

      data.time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Extract title/description
    const titleMatch = message.match(/(?:with|meeting with|appointment with)\s+([A-Za-z\s]+?)(?:\s+at|\s+on|\s+tomorrow|\s+today|$)/i);
    if (titleMatch) {
      data.title = titleMatch[1].trim();
    } else {
      // Try to extract from the beginning
      const words = message.split(' ');
      if (words.length > 2) {
        data.title = words.slice(0, 3).join(' ');
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

      // Extract email details from the message using AI
      const emailPrompt = `Extract email details from this message: "${message}"

You must respond with ONLY valid JSON in this exact format:
{
  "to": "recipient@example.com",
  "subject": "email subject",
  "body": "email content"
}

Do not include any explanation or additional text, only the JSON.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that extracts email data and responds only with valid JSON. Never include explanatory text, only JSON.",
          },
          { role: "user", content: emailPrompt },
        ],
        temperature: 0.1,
        max_tokens: 150,
      });

      let emailData;
      try {
        const aiResponse = response.choices[0].message.content.trim();
        console.log(`[GMAIL_SEND] AI Response: ${aiResponse}`);

        // Try to extract JSON if it's wrapped in other text
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : aiResponse;

        emailData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error(`[GMAIL_SEND] JSON Parse Error: ${parseError.message}`);
        console.error(`[GMAIL_SEND] Raw AI Response: ${response.choices[0].message.content}`);

        // Fallback: extract email details manually from the original message
        emailData = this.extractEmailDataFallback(message);
      }

      // Validate required fields
      if (!emailData.to || !emailData.subject || !emailData.body) {
        throw new Error("Missing required email fields (to, subject, body)");
      }

      console.log(`[GMAIL_SEND] Extracted email data:`, emailData);

      // Send email using Google Service
      const result = await GoogleService.sendEmail(businessId, {
        to: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
      });

      return `✅ Email sent successfully to ${emailData.to}!\nSubject: ${emailData.subject}`;
    } catch (error) {
      console.error("Error handling Gmail send intent:", error.message);
      return "I apologize, but I encountered an error while trying to send your email. Please make sure you've provided the recipient email, subject, and message content, and verify your Gmail integration is properly configured.";
    }
  }

  // Add fallback method for extracting email data
  extractEmailDataFallback(message) {
    // Simple regex patterns to extract email components
    const emailMatch = message.match(
      /(?:to|send to|recipient|email)\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
    );
    const subjectMatch = message.match(/(?:subject|title|topic)\s*:?\s*(.+?)(?:\n|$)/i);

    return {
      to: emailMatch ? emailMatch[1] : "recipient@example.com",
      subject: subjectMatch ? subjectMatch[1].trim() : "Test Subject",
      body: message.includes("body") ? message.split("body")[1]?.trim() || "Test message" : "Test message",
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
        return `✅ Calendar event "${eventData.title}" created successfully!\n\n📅 Event Details:\n• Title: ${
          eventData.title
        }\n• Start: ${new Date(eventData.start).toLocaleString()}\n• End: ${new Date(
          eventData.end
        ).toLocaleString()}\n• Description: ${eventData.description || "No description"}`;
      } else {
        throw new Error("Calendar event creation returned invalid result");
      }
    } catch (error) {
      console.error("Error handling calendar create intent:", error.message);

      // Provide more specific error messages
      if (error.message.includes("Failed to parse event data")) {
        return "❌ I couldn't understand the meeting details from your message. Please try rephrasing with clear date, time, and title information.";
      } else if (error.message.includes("Missing required event fields")) {
        return "❌ I need more information to create the calendar event. Please include the title, date, and time.";
      } else if (error.message.includes("Failed to create calendar event")) {
        return "❌ I couldn't create the calendar event. Please check your Google Calendar integration is properly configured.";
      } else {
        return "❌ I apologize, but I encountered an error while trying to create your calendar event. Please try again or check your calendar configuration.";
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
        return `✅ Contact "${contactData.firstName} ${contactData.lastName}" created successfully in HubSpot`;
      } else {
        return `❌ Failed to create contact: ${result.error}`;
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
          .map((contact) => `• ${contact.firstName} ${contact.lastName} - ${contact.email}`)
          .join("\n");

        return `📇 Found ${result.contacts.length} contact(s):\n${contactsList}`;
      } else if (result.success) {
        return "📇 No contacts found matching your search criteria.";
      } else {
        return `❌ Failed to search contacts: ${result.error}`;
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
        return `✅ Deal "${dealData.name}" created successfully in HubSpot`;
      } else {
        return `❌ Failed to create deal: ${result.error}`;
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
        return `✅ Company "${companyData.name}" created successfully in HubSpot`;
      } else {
        return `❌ Failed to create company: ${result.error}`;
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
        return `✅ Customer "${customerData.name}" created successfully in Odoo`;
      } else {
        return `❌ Failed to create customer: ${result.error}`;
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
        const customersList = result.customers.map((customer) => `• ${customer.name} - ${customer.email}`).join("\n");

        return `👥 Found ${result.customers.length} customer(s):\n${customersList}`;
      } else if (result.success) {
        return "👥 No customers found matching your search criteria.";
      } else {
        return `❌ Failed to search customers: ${result.error}`;
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
        return `✅ Product "${productData.name}" created successfully in Odoo`;
      } else {
        return `❌ Failed to create product: ${result.error}`;
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

      // Extract sale order details from the message using AI
      const orderPrompt = `Extract sale order details from this message: "${message}"
      
      Return JSON with:
      - partner_id: customer ID or name
      - order_line: array of products with product_id, product_uom_qty, price_unit
      - note: order notes
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: orderPrompt }],
        temperature: 0.1,
        max_tokens: 300,
      });

      const orderData = JSON.parse(response.choices[0].message.content);

      // Create sale order using Odoo Service
      const result = await OdooService.createSaleOrder(businessId, orderData);

      if (result.success) {
        return `✅ Sale order created successfully in Odoo`;
      } else {
        return `❌ Failed to create sale order: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo sale order create intent:", error.message);
      return "I apologize, but I could not create your sale order. Please check your Odoo configuration.";
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
        return `✅ Invoice created successfully in Odoo`;
      } else {
        return `❌ Failed to create invoice: ${result.error}`;
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
          .map((product) => `• ${product.name} - Qty: ${product.qty_available}`)
          .join("\n");

        return `📦 Current inventory:\n${inventoryList}`;
      } else if (result.success) {
        return "📦 Your inventory is currently empty.";
      } else {
        return `❌ Failed to retrieve inventory: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo inventory check intent:", error.message);
      return "I apologize, but I could not retrieve your inventory. Please check your Odoo configuration.";
    }
  }

  async handleOdooLeadCreateIntent(businessId, message, conversationHistory, businessTone) {
    try {
      console.log(`[ODOO_LEAD_CREATE] Processing Odoo lead create request for business ${businessId}: ${message}`);

      // Extract lead details from the message using AI
      const leadPrompt = `Extract lead details from this message: "${message}"
      
      Return JSON with:
      - name: lead name or title
      - partner_name: contact name
      - email_from: contact email
      - phone: contact phone
      - description: lead description
      
      If any field is missing, use reasonable defaults.`;

      const response = await openai.chat.completions.create({
        model: this.chatModel,
        messages: [{ role: "user", content: leadPrompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const leadData = JSON.parse(response.choices[0].message.content);

      // Create lead using Odoo Service
      const result = await OdooService.createLead(businessId, leadData);

      if (result.success) {
        return `✅ Lead "${leadData.name}" created successfully in Odoo`;
      } else {
        return `❌ Failed to create lead: ${result.error}`;
      }
    } catch (error) {
      console.error("Error handling Odoo lead create intent:", error.message);
      return "I apologize, but I could not create your lead. Please check your Odoo configuration.";
    }
  }
}

module.exports = new OpenAIService();
