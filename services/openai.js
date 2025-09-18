require("dotenv").config();
const { OpenAI } = require("openai");
const fs = require("fs-extra");
const path = require("path");
const GoogleService = require("./google");
const OdooService = require("./odoo");
const EmbeddingsService = require("./embeddings");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.model = "gpt-4";
    this.visionModel = "gpt-4o"; // Updated from deprecated gpt-4-vision-preview
    this.embeddingsService = EmbeddingsService;
  }

  async chatCompletion(messages, conversationHistory = [], businessTone = null, businessId = null, phoneNumber = null) {
    try {
      const latestMessage = messages[messages.length - 1];

      // Enhanced AI-powered intent detection with better error handling
      let aiIntent = null;
      if (businessId) {
        try {
          console.log("Attempting AI intent detection for message:", latestMessage.content);
          aiIntent = await this.detectIntentWithAI(latestMessage.content, conversationHistory, businessId);
          console.log("AI Intent detected:", aiIntent);
        } catch (error) {
          console.error("Error in AI intent detection:", error);
          console.log("Falling back to keyword-based detection");
          aiIntent = null;
        }
      }

      // Handle AI-detected intents first
      if (aiIntent && aiIntent.confidence >= 0.7) {
        console.log(`Routing to AI handler for intent: ${aiIntent.intent}`);
        switch (aiIntent.intent) {
          case "GOOGLE_EMAIL":
            return await this.handleGoogleEmailWithAI(businessId, aiIntent, conversationHistory, businessTone);

          case "GOOGLE_CALENDAR":
            return await this.handleGoogleCalendarWithAI(businessId, aiIntent, conversationHistory, businessTone);

          case "HUBSPOT":
            return await this.handleHubSpotWithAI(businessId, aiIntent, conversationHistory, businessTone);

          case "ODOO":
            return await this.handleOdooWithAI(businessId, aiIntent, phoneNumber, conversationHistory, businessTone);

          case "GENERAL":
            // Fall through to regular chat completion
            break;
        }
      }

      // Fallback to existing detection methods if AI detection fails or confidence is low
      console.log("Using fallback keyword-based detection");
      const emailRequest = this.detectEmailRequest(latestMessage.content);
      const calendarRequest = this.detectCalendarRequest(latestMessage.content);

      console.log("Fallback detection results:", {
        emailRequest: !!emailRequest,
        calendarRequest: !!calendarRequest,
        message: latestMessage.content,
      });

      // Check for Odoo operations
      const odooOrderRequest = this.detectOdooOrderRequest(latestMessage.content);
      const odooInvoiceRequest = this.detectOdooInvoiceRequest(latestMessage.content);
      const odooLeadRequest = this.detectOdooLeadRequest(latestMessage.content);
      const odooTicketRequest = this.detectOdooTicketRequest(latestMessage.content);

      // Handle Odoo order request
      if (odooOrderRequest && businessId && phoneNumber) {
        try {
          const result = await this.handleOdooOrder(businessId, odooOrderRequest, phoneNumber);
          return result;
        } catch (error) {
          console.error("Error processing Odoo order:", error);
          return `❌ Sorry, I couldn't process your order. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle Odoo invoice request
      if (odooInvoiceRequest && businessId) {
        try {
          const result = await this.handleOdooInvoice(businessId, odooInvoiceRequest);
          return result;
        } catch (error) {
          console.error("Error processing Odoo invoice request:", error);
          return `❌ Sorry, I couldn't check your invoice. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle Odoo lead request
      if (odooLeadRequest && businessId && phoneNumber) {
        try {
          const result = await this.handleOdooLead(businessId, odooLeadRequest, phoneNumber);
          return result;
        } catch (error) {
          console.error("Error processing Odoo lead:", error);
          return `❌ Sorry, I couldn't create the lead. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle Odoo ticket request
      if (odooTicketRequest && businessId && phoneNumber) {
        try {
          const result = await this.handleOdooTicket(businessId, odooTicketRequest, phoneNumber);
          return result;
        } catch (error) {
          console.error("Error processing Odoo ticket:", error);
          return `❌ Sorry, I couldn't create the support ticket. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle email sending request
if (emailRequest && businessId) {
  try {
    // Get the business's own email address to send to
    const userInfo = await GoogleService.getUserInfo(businessId);
    const businessEmail = userInfo.email;

    // Create the email content with sender information
    const emailBody = `From: ${emailRequest.user_email || emailRequest.to}
Subject: ${emailRequest.subject}

${emailRequest.body}

---
This email was sent via WhatsApp by: ${emailRequest.user_email || emailRequest.to}`;

    const result = await GoogleService.sendEmail(businessId, {
      to: businessEmail, // Send to business's own email
      subject: `[WhatsApp] ${emailRequest.subject}`,
      body: emailBody,
    });

    const senderEmail = emailRequest.user_email || emailRequest.to;
    return `✅ Email sent successfully to the business!\n\nFrom: ${senderEmail}\nSubject: ${emailRequest.subject}\n\nMessage: ${emailRequest.body}`;
  } catch (error) {
    console.error("Error sending email:", error);
    return `❌ Sorry, I couldn't send the email. Please make sure Google Workspace integration is properly configured. Error: ${error.message}`;
  }
}

      // Handle calendar request
      if (calendarRequest && businessId) {
        try {
          let events = [];
          let response = "";

          switch (calendarRequest.type) {
            case "upcoming":
              events = await GoogleService.getUpcomingEvents(businessId, calendarRequest.maxResults || 5);
              response = `📅 Here are your upcoming events (${events.length} found):\n\n`;
              break;
            case "today":
              const today = new Date();
              const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
              const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
              events = await GoogleService.getEventsByDateRange(
                businessId,
                startOfDay,
                endOfDay,
                calendarRequest.maxResults || 10
              );
              response = `📅 Here are your events for today (${events.length} found):\n\n`;
              break;
            case "search":
              events = await GoogleService.searchCalendarEvents(
                businessId,
                calendarRequest.query,
                calendarRequest.maxResults || 5
              );
              response = `📅 Search results for "${calendarRequest.query}" (${events.length} found):\n\n`;
              break;
            default:
              events = await GoogleService.getUpcomingEvents(businessId, 5);
              response = `📅 Here are your upcoming events (${events.length} found):\n\n`;
          }

          if (events.length === 0) {
            return `📅 No calendar events found for your request.`;
          }

          // Format events for display
          events.forEach((event, index) => {
            const startTime = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString() : "All day";
            const attendees =
              event.attendees && event.attendees.length > 0
                ? `\n   👥 Attendees: ${event.attendees.map((a) => a.email).join(", ")}`
                : "";

            response += `${index + 1}. **${event.summary || "No Title"}**\n`;
            response += `   🕐 Time: ${startTime}\n`;
            if (event.description) {
              response += `   📝 Description: ${event.description.substring(0, 100)}...\n`;
              response += `${attendees}\n\n`;
            }
          });

          return response;
        } catch (error) {
          console.error("Error handling calendar request:", error);
          return `❌ Sorry, I couldn't access your calendar. Please make sure Google Workspace integration is properly configured. Error: ${error.message}`;
        }
      }

      let systemContent = `You are a helpful AI assistant integrated with WhatsApp and Google Workspace. 
You can send emails through Gmail when users request it. Be conversational, friendly, and helpful. 
Keep responses concise but informative. If you're analyzing images, describe what you see clearly and provide relevant insights.

When users ask to send emails, you can help them by sending emails through Gmail integration.
Format for email sending: "send email to [email] with subject [subject] and body [body]"`;
      // Apply business-specific tone if provided
      if (businessTone && businessTone.tone_instructions) {
        systemContent += `\n\n${businessTone.tone_instructions}`;
      }

      const systemMessage = {
        role: "system",
        content: systemContent,
      };

      // Validate and filter messages to ensure they have required properties
      const validHistory = conversationHistory.filter((msg) => msg && msg.role && msg.content);
      const validMessages = messages.filter((msg) => msg && msg.role && msg.content);
      const allMessages = [systemMessage, ...validHistory, ...validMessages];

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: allMessages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI chat completion error:", error);
      throw new Error("Failed to generate AI response");
    }
  }

  /**
   * Build system prompt with business tone
   */
  buildSystemPrompt(businessTone = null) {
    let systemContent = `You are a helpful AI assistant integrated with WhatsApp and Google Workspace. 
    You can send emails through Gmail when users request it. Be conversational, friendly, and helpful. 
    Keep responses concise but informative. If you're analyzing images, describe what you see clearly and provide relevant insights.
    
    When users ask to send emails, you can help them by sending emails through Gmail integration.
    Format for email sending: "send email to [email] with subject [subject] and body [body]"`;

    // Apply business-specific tone if provided
    if (businessTone && businessTone.tone_instructions) {
      systemContent += `\n\n${businessTone.tone_instructions}`;
    }

    return systemContent;
  }

  async analyzeImage(imagePath, userMessage = "", businessTone = null) {
    try {
      console.log(`OpenAI: Analyzing image at path: ${imagePath}`);

      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        console.error(`OpenAI: Image file not found: ${imagePath}`);
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString("base64");

      console.log(`OpenAI: Image file size: ${imageBuffer.length} bytes`);
      console.log(`OpenAI: Base64 length: ${base64Image.length} characters`);

      let promptText =
        "Please analyze this image and describe what you see in detail. Include any text, objects, people, colors, or important details. Be specific and helpful in your description.";

      // If user sent a message with the image, include it in the analysis
      if (userMessage && userMessage.trim() !== "" && userMessage !== "User sent a image message") {
        promptText += ` The user also sent this message with the image: "${userMessage}". Please consider this context in your analysis.`;
      }

      // Apply business-specific tone if provided
      if (businessTone && businessTone.tone_instructions) {
        promptText += `\n\n${businessTone.tone_instructions}`;
      }

      console.log(`OpenAI: Using prompt: ${promptText}`);

      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ];

      console.log(`OpenAI: Sending request to OpenAI with model: ${this.visionModel}`);

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: messages,
        max_tokens: 1500,
        temperature: 0.7,
      });

      console.log(`OpenAI: Received response: ${response.choices[0].message.content}`);
      return response.choices[0].message.content;
    } catch (error) {
      console.error("OpenAI image analysis error:", error);
      console.error("OpenAI error details:", error.message);
      console.error("OpenAI error stack:", error.stack);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  async transcribeAudio(audioPath) {
    try {
      // Check if file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const fileStats = fs.statSync(audioPath);
      console.log(`Transcribing audio file: ${audioPath} (${fileStats.size} bytes)`);

      const audioFile = fs.createReadStream(audioPath);

      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        response_format: "text",
        language: "en",
        temperature: 0.2, // Lower temperature for more accurate transcription
      });

      console.log(`Audio transcription completed: "${response}"`);
      return response;
    } catch (error) {
      console.error("OpenAI transcription error:", error);

      // Provide more specific error messages
      if (error.code === "invalid_file_format") {
        throw new Error(`Unsupported audio format for transcription: ${audioPath}`);
      } else if (error.code === "file_too_large") {
        throw new Error(`Audio file too large for transcription: ${audioPath}`);
      } else if (error.message.includes("timeout")) {
        throw new Error(`Audio transcription timeout: ${audioPath}`);
      }

      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }

  async processMessage(
    messageType,
    content,
    filePath = null,
    conversationHistory = [],
    businessTone = null,
    businessId = null,
    phoneNumber = null
  ) {
    try {
      console.log(`OpenAI: Processing message type: ${messageType}`);
      console.log(`OpenAI: Content: ${content}`);
      console.log(`OpenAI: File path: ${filePath}`);
      console.log(`OpenAI: File exists: ${filePath ? fs.existsSync(filePath) : "N/A"}`);

      let aiResponse = "";
      let intent = null; // Initialize intent variable

      switch (messageType) {
        case "text":
          console.log("OpenAI: Processing text message");
          aiResponse = await this.chatCompletion(
            [{ role: "user", content: content }],
            conversationHistory,
            businessTone,
            businessId,
            phoneNumber
          );
          break;

        case "image":
          console.log("OpenAI: Processing image message");
          if (!filePath) {
            console.error("OpenAI: Image file path is required for image analysis");
            throw new Error("Image file path is required for image analysis");
          }
          if (!fs.existsSync(filePath)) {
            console.error(`OpenAI: Image file does not exist: ${filePath}`);
            throw new Error(`Image file does not exist: ${filePath}`);
          }
          // For images, analyze directly and provide a conversational response
          const imageAnalysis = await this.analyzeImage(filePath, content, businessTone);

          // If there's user text with the image, combine it with the analysis
          if (content && content.trim() !== "" && content !== `User sent a ${messageType} message`) {
            aiResponse = await this.chatCompletion(
              [
                {
                  role: "user",
                  content: `User sent an image with this message: "${content}". Here's what I see in the image: ${imageAnalysis}. Please respond to both the image and the user's message.`,
                },
              ],
              conversationHistory,
              businessTone,
              businessId,
              phoneNumber
            );
          } else {
            // Just respond to the image analysis
            aiResponse = await this.chatCompletion(
              [
                {
                  role: "user",
                  content: `I analyzed this image and here's what I see: ${imageAnalysis}. Please provide a helpful response about what's in the image.`,
                },
              ],
              conversationHistory,
              businessTone,
              businessId,
              phoneNumber
            );
          }
          break;

        case "audio":
          console.log("OpenAI: Processing audio message");
          if (!filePath) {
            console.error("OpenAI: Audio file path is required for transcription");
            throw new Error("Audio file path is required for transcription");
          }
          if (!fs.existsSync(filePath)) {
            console.error(`OpenAI: Audio file does not exist: ${filePath}`);
            throw new Error(`Audio file does not exist: ${filePath}`);
          }
          const transcription = await this.transcribeAudio(filePath);
          aiResponse = await this.chatCompletion(
            [
              {
                role: "user",
                content: `Transcribed audio: "${transcription}". Please respond to this message naturally and conversationally.`,
              },
            ],
            conversationHistory,
            businessTone,
            businessId,
            phoneNumber
          );
          break;

        default:
          console.error(`OpenAI: Unsupported message type: ${messageType}`);
          throw new Error(`Unsupported message type: ${messageType}`);
      }

      console.log(`OpenAI: Generated response: ${aiResponse}`);
      return aiResponse;
    } catch (error) {
      console.error("OpenAI: Error processing message:", error);
      console.error("OpenAI: Error details:", error.message);
      console.error("OpenAI: Error stack:", error.stack);
      throw error;
    }
  }

  detectEmailRequest(message) {
    // Format 1: "send email to [email] with subject [subject] and body [body]"
    let emailRegex = /send\s+email\s+to\s+([^\s]+@[^\s]+)\s+with\s+subject\s+([^and]+?)\s+and\s+body\s+(.+)/i;
    let match = message.match(emailRegex);

    if (match) {
      return {
        to: match[1].trim(),
        subject: match[2].trim(),
        body: match[3].trim(),
      };
    }

    // Bot-requested format - "Email address: [email]\nSubject: [subject]\nBody: [body]"
    const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  
  if (lines.length >= 3) {
    let userEmail = "";
    let subject = "";
    let body = "";
  
    // Parse the bot-requested format
    for (const line of lines) {
      if (line.toLowerCase().startsWith("email address:")) {
        userEmail = line.substring(14).trim();
      } else if (line.toLowerCase().startsWith("subject:")) {
        subject = line.substring(8).trim();
      } else if (line.toLowerCase().startsWith("body:")) {
        body = line.substring(5).trim();
      }
    }
  
    // Validate that all required fields are present and email is valid
    if (userEmail && subject && body && userEmail.includes("@")) {
      return {
        user_email: userEmail,  // This is the sender's email address
        subject: subject,
        body: body,
      };
    }
  }

    return null;
  }

  extractNumber(message) {
    const numberMatch = message.match(/(\d+)/);
    return numberMatch ? parseInt(numberMatch[1]) : null;
  }

  detectCalendarRequest(message) {
    const lowercaseMessage = message.toLowerCase();

    // Check for upcoming events / schedule
    if (
      lowercaseMessage.includes("upcoming") &&
      (lowercaseMessage.includes("event") ||
        lowercaseMessage.includes("meeting") ||
        lowercaseMessage.includes("schedule"))
    ) {
      return { type: "upcoming", maxResults: this.extractNumber(message) || 5 };
    }

    // Check for today's events
    if (
      lowercaseMessage.includes("today") &&
      (lowercaseMessage.includes("event") ||
        lowercaseMessage.includes("meeting") ||
        lowercaseMessage.includes("schedule"))
    ) {
      return { type: "today", maxResults: this.extractNumber(message) || 10 };
    }

    // Check for general schedule/calendar requests
    if (
      (lowercaseMessage.includes("schedule") ||
        lowercaseMessage.includes("calendar") ||
        lowercaseMessage.includes("agenda")) &&
      (lowercaseMessage.includes("show") || lowercaseMessage.includes("check") || lowercaseMessage.includes("what"))
    ) {
      return { type: "upcoming", maxResults: this.extractNumber(message) || 5 };
    }

    return null;
  }

  extractNumber(message) {
    const numberMatch = message.match(/(\d+)/);
    return numberMatch ? parseInt(numberMatch[1]) : null;
  }

  // Enhanced Calendar Intent Detection Methods

  /**
   * Detect calendar booking intent from message
   */
  detectCalendarBookingIntent(message) {
    const lowercaseMessage = message.toLowerCase();

    // Booking keywords
    const bookingKeywords = [
      "book",
      "schedule",
      "appointment",
      "meeting",
      "reserve",
      "set up",
      "arrange",
      "plan",
      "organize",
      "fix",
      "make an appointment",
    ];

    // Time indicators
    const timeKeywords = [
      "tomorrow",
      "today",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "am",
      "pm",
      "morning",
      "afternoon",
      "evening",
      "night",
      "at",
      "on",
      "for",
    ];

    // Check if message contains booking intent
    const hasBookingIntent = bookingKeywords.some((keyword) => lowercaseMessage.includes(keyword));
    const hasTimeIntent = timeKeywords.some((keyword) => lowercaseMessage.includes(keyword));

    if (hasBookingIntent && hasTimeIntent) {
      return {
        intent: "book_appointment",
        confidence: 0.8,
        extractedData: this.extractBookingData(message),
      };
    }

    return null;
  }

  /**
   * Detect availability check intent
   */
  detectAvailabilityIntent(message) {
    const lowercaseMessage = message.toLowerCase();

    const availabilityKeywords = [
      "available",
      "free",
      "busy",
      "open",
      "check",
      "are you free",
      "do you have time",
      "when are you available",
      "what time",
    ];

    const hasAvailabilityIntent = availabilityKeywords.some((keyword) => lowercaseMessage.includes(keyword));

    if (hasAvailabilityIntent) {
      return {
        intent: "check_availability",
        confidence: 0.7,
        extractedData: this.extractTimeData(message),
      };
    }

    return null;
  }

  /**
   * Detect reminder intent
   */
  detectReminderIntent(message) {
    const lowercaseMessage = message.toLowerCase();

    const reminderKeywords = ["remind", "reminder", "remember", "don't forget", "call me", "notify", "alert", "ping"];

    const hasReminderIntent = reminderKeywords.some((keyword) => lowercaseMessage.includes(keyword));

    if (hasReminderIntent) {
      return {
        intent: "create_reminder",
        confidence: 0.8,
        extractedData: this.extractReminderData(message),
      };
    }

    return null;
  }

  /**
   * Detect meeting scheduling intent
   */
  detectMeetingIntent(message) {
    const lowercaseMessage = message.toLowerCase();

    const meetingKeywords = [
      "meeting",
      "call",
      "conference",
      "video call",
      "zoom",
      "teams",
      "discuss",
      "talk",
      "chat",
      "conversation",
    ];

    const participantKeywords = ["with", "and", "include", "invite", "add"];

    const hasMeetingIntent = meetingKeywords.some((keyword) => lowercaseMessage.includes(keyword));
    const hasParticipants = participantKeywords.some((keyword) => lowercaseMessage.includes(keyword));

    if (hasMeetingIntent) {
      return {
        intent: "schedule_meeting",
        confidence: 0.8,
        extractedData: this.extractMeetingData(message),
      };
    }

    return null;
  }

  /**
   * Extract booking data from message
   */
  extractBookingData(message) {
    const data = {
      title: "",
      time: null,
      date: null,
      duration: 60, // default 1 hour
      description: "",
    };

    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : "";

      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;

      data.time = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }

    // Extract date - FIXED VERSION
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);

    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split("T")[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split("T")[0];
    } else {
      // Check for day names
      const dayMatch = message.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (dayMatch) {
        data.date = this.getNextDayOfWeek(dayMatch[1].toLowerCase());
      }
    }

    // Extract title/description - IMPROVED VERSION
    const titleMatch = message.match(
      /(?:book|schedule|appointment)\s+(?:for\s+)?(.+?)(?:\s+tomorrow|\s+today|\s+at|\s+on|\s+next|\s+monday|\s+tuesday|\s+wednesday|\s+thursday|\s+friday|\s+saturday|\s+sunday|$)/i
    );
    if (titleMatch) {
      data.title = titleMatch[1].trim();
    }

    console.log("Extracted booking data:", data); // Debug log

    return data;
  }

  /**
   * Extract time data from message
   */
  extractTimeData(message) {
    const data = {
      date: null,
      time: null,
    };

    // Extract date
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);
    const fridayMatch = message.match(/friday/i);

    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split("T")[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split("T")[0];
    } else if (fridayMatch) {
      data.date = this.getNextDayOfWeek("friday");
    }

    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : "";

      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;

      data.time = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }

    return data;
  }

  /**
   * Extract reminder data from message
   */
  extractReminderData(message) {
    const data = {
      title: "",
      time: null,
      date: null,
      description: "",
    };

    // Extract reminder text
    const reminderMatch = message.match(
      /(?:remind|reminder)\s+(?:me\s+to\s+)?(.+?)(?:\s+at|\s+on|\s+tomorrow|\s+today|$)/i
    );
    if (reminderMatch) {
      data.title = reminderMatch[1].trim();
    }

    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : "";

      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;

      data.time = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }

    // Extract date
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);

    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split("T")[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split("T")[0];
    }

    return data;
  }

  /**
   * Extract meeting data from message
   */
  extractMeetingData(message) {
    const data = {
      title: "",
      time: null,
      date: null,
      participants: [],
      duration: 60,
    };

    // Extract participants
    const withMatch = message.match(/with\s+([^at]+?)(?:\s+at|\s+on|\s+tomorrow|\s+today|$)/i);
    if (withMatch) {
      const participants = withMatch[1].split(/[,\s]+/).filter((p) => p.trim());
      data.participants = participants.map((p) => p.trim());
    }

    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : "";

      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;

      data.time = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }

    // Extract date
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);
    const mondayMatch = message.match(/monday/i);

    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split("T")[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split("T")[0];
    } else if (mondayMatch) {
      data.date = this.getNextDayOfWeek("monday");
    }

    return data;
  }

  /**
   * Get next occurrence of a day of the week
   */
  getNextDayOfWeek(dayName) {
    const days = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const targetDay = days[dayName.toLowerCase()];
    const today = new Date();
    const currentDay = today.getDay();

    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);

    return targetDate.toISOString().split("T")[0];
  }

  /**
   * Main calendar intent detection method
   */
  detectCalendarIntent(message) {
    // Try different intent detectors
    const bookingIntent = this.detectCalendarBookingIntent(message);
    if (bookingIntent) return bookingIntent;

    const availabilityIntent = this.detectAvailabilityIntent(message);
    if (availabilityIntent) return availabilityIntent;

    const reminderIntent = this.detectReminderIntent(message);
    if (reminderIntent) return reminderIntent;

    const meetingIntent = this.detectMeetingIntent(message);
    if (meetingIntent) return meetingIntent;

    return null;
  }

  /**
   * AI-Powered Universal Intent Detection
   * This replaces simple keyword matching with sophisticated NLP analysis
   */
  async detectIntentWithAI(message, conversationHistory = [], businessId = null) {
    try {
      console.log("AI Intent Detection - Input message:", message);

      const systemPrompt = `You are an AI assistant that analyzes customer messages to detect business intents across multiple systems.

Your task is to analyze the customer's message and determine if they want to interact with:
1. GOOGLE_EMAIL - Send emails via Gmail
2. GOOGLE_CALENDAR - Schedule, check availability, create events
3. HUBSPOT - CRM operations (contacts, companies, deals, search)
4. ODOO - ERP operations (orders, invoices, products, support)
5. GENERAL - General conversation or unrelated requests

For email messages, extract:
- user_email: sender's email address (required)
- subject: email subject/title (required)
- body: email content (required)
- action: "send"

Note: When sending emails, the email will be sent to the business's own Gmail account (self-email).
The user_email field is used to identify who is sending the email.

Examples:
- "I want to send an email\nMy email: john@example.com\nTitle: Meeting Request\nContent: Let's meet tomorrow" → {"intent": "GOOGLE_EMAIL", "action": "send", "user_email": "john@example.com", "subject": "Meeting Request", "body": "Let's meet tomorrow", "confidence": 0.95}
- "Schedule a meeting tomorrow at 2pm" → {"intent": "GOOGLE_CALENDAR", "action": "schedule", "time": "tomorrow at 2pm", "confidence": 0.9}

Return ONLY valid JSON. If no clear intent is detected, return {"intent": "GENERAL", "confidence": 0.5}.`;

      const userPrompt = `Analyze this customer message: "${message}"

${
  conversationHistory.length > 0
    ? `Previous conversation context: ${conversationHistory
        .slice(-3)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n")}`
    : ""
}

Extract the intent and relevant information.`;

      console.log("AI Intent Detection - Making API call to OpenAI");

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
      });

      console.log("AI Intent Detection - Raw response:", response.choices[0].message.content);

      // Use the safe JSON parser
      const result = this.safeParseJSON(response.choices[0].message.content);

      console.log("AI Intent Detection - Parsed result:", result);

      // Only return intents with high confidence
      if (result.confidence >= 0.7) {
        return {
          ...result,
          originalMessage: message,
        };
      }

      console.log("AI Intent Detection - Low confidence, returning null");
      return null;
    } catch (error) {
      console.error("Error in AI intent detection:", error);
      console.error("Error details:", error.message);
      // Fallback to simple keyword matching if AI fails
      return null;
    }
  }

  /**
   * Enhanced Google Workspace Intent Detection
   */
  async detectGoogleWorkspaceIntentWithAI(message, conversationHistory = []) {
    try {
      const systemPrompt = `You are an AI assistant specialized in Google Workspace operations.

Analyze the customer's message to detect Google Workspace intents:

EMAIL OPERATIONS:
- SEND_EMAIL: Send new emails

CALENDAR OPERATIONS:
- SCHEDULE_EVENT: Create new calendar events, meetings, appointments
- CHECK_AVAILABILITY: Check free time, availability
- LIST_EVENTS: Show upcoming events, schedule, agenda
- UPDATE_EVENT: Modify existing events

Extract detailed information in JSON format:

Examples:
- "Send email to john@example.com about the project update" → {"intent": "SEND_EMAIL", "to": "john@example.com", "subject": "project update", "confidence": 0.95}
- "Schedule a meeting tomorrow at 2pm with the team" → {"intent": "SCHEDULE_EVENT", "time": "tomorrow at 2pm", "attendees": "team", "confidence": 0.95}
- "What's on my calendar today?" → {"intent": "LIST_EVENTS", "timeframe": "today", "confidence": 0.9}

Return ONLY valid JSON.`;

      const userPrompt = `Analyze this Google Workspace request: "${message}"

${
  conversationHistory.length > 0
    ? `Context: ${conversationHistory
        .slice(-2)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n")}`
    : ""
}

Extract the Google Workspace intent and details.`;

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 250,
      });

      // Use the safe JSON parser
      const result = this.safeParseJSON(response.choices[0].message.content);

      if (result.confidence >= 0.7) {
        return {
          ...result,
          originalMessage: message,
        };
      }

      return null;
    } catch (error) {
      console.error("Error in Google Workspace AI intent detection:", error);
      return null;
    }
  }

  /**
   * Enhanced HubSpot Intent Detection
   */
  async detectHubSpotIntentWithAI(message, conversationHistory = []) {
    try {
      const systemPrompt = `You are an AI assistant specialized in HubSpot CRM operations.
  
  Analyze the customer's message to detect HubSpot intents:
  
  HUBSPOT OPERATIONS:
  - CREATE_CONTACT: Create new contacts, leads, prospects
  - CREATE_COMPANY: Add new companies, organizations
  - CREATE_DEAL: Create new deals, opportunities, sales
  - SEARCH_CONTACTS: Find existing contacts, search by email/name
  - UPDATE_CONTACT: Modify existing contact information
  - UPDATE_COMPANY: Modify existing company information
  - UPDATE_DEAL: Modify existing deal information
  
  Extract detailed information in JSON format:
  
  Examples:
  - "Create a contact for john@example.com" → {"intent": "CREATE_CONTACT", "email": "john@example.com", "confidence": 0.95}
  - "Add a new company called TechCorp" → {"intent": "CREATE_COMPANY", "companyName": "TechCorp", "confidence": 0.9}
  - "Create a deal for $5000" → {"intent": "CREATE_DEAL", "amount": 5000, "confidence": 0.9}
  - "Search for contacts with email example.com" → {"intent": "SEARCH_CONTACTS", "searchTerm": "example.com", "confidence": 0.95}
  
  Return ONLY valid JSON.`;

      const userPrompt = `Analyze this HubSpot request: "${message}"
  
  ${
    conversationHistory.length > 0
      ? `Context: ${conversationHistory
          .slice(-2)
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n")}`
      : ""
  }
  Extract the HubSpot intent and details.`;

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 250,
      });

      const result = this.safeParseJSON(response.choices[0].message.content);

      if (result.confidence >= 0.7) {
        return {
          ...result,
          originalMessage: message,
        };
      }

      return null;
    } catch (error) {
      console.error("Error in HubSpot AI intent detection:", error);
      return null;
    }
  }

  /**
   * Enhanced Odoo Intent Detection
   */
  async detectOdooIntentWithAI(message, conversationHistory = []) {
    try {
      const systemPrompt = `You are an AI assistant specialized in Odoo ERP operations.

Analyze the customer's message to detect Odoo intents:

SALES OPERATIONS:
- CREATE_ORDER: Create sales orders, purchase orders
- SEARCH_PRODUCT: Find products, check availability
- UPDATE_ORDER: Modify existing orders
- CANCEL_ORDER: Cancel orders

INVOICE OPERATIONS:
- CHECK_INVOICE: Check invoice status, payment status
- CREATE_INVOICE: Generate new invoices
- PAY_INVOICE: Process payments

CRM OPERATIONS:
- CREATE_LEAD: Create new leads, prospects
- UPDATE_LEAD: Modify leads
- CONVERT_LEAD: Convert leads to opportunities

SUPPORT OPERATIONS:
- CREATE_TICKET: Create support tickets
- UPDATE_TICKET: Modify tickets
- CHECK_TICKET: Check ticket status

Extract detailed information in JSON format:

Examples:
- "I want to order 3 pizzas" → {"intent": "CREATE_ORDER", "product": "pizza", "quantity": 3, "confidence": 0.95}
- "What's the status of invoice #INV123?" → {"intent": "CHECK_INVOICE", "invoice_number": "INV123", "confidence": 0.9}
- "Create a lead for ABC Company" → {"intent": "CREATE_LEAD", "company": "ABC Company", "confidence": 0.95}
- "I have a problem with my order" → {"intent": "CREATE_TICKET", "issue_type": "order_problem", "confidence": 0.9}

Return ONLY valid JSON.`;

      const userPrompt = `Analyze this Odoo request: "${message}"

${
  conversationHistory.length > 0
    ? `Context: ${conversationHistory
        .slice(-2)
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join("\n")}`
    : ""
}

Extract the Odoo intent and details.`;

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 250,
      });

      // Use the safe JSON parser
      const result = this.safeParseJSON(response.choices[0].message.content);

      if (result.confidence >= 0.7) {
        return {
          ...result,
          originalMessage: message,
        };
      }

      return null;
    } catch (error) {
      console.error("Error in Odoo AI intent detection:", error);
      return null;
    }
  }

  /**
   * Enhanced Response Generation with Context
   */
  async generateContextualResponse(intent, data, businessTone = null, conversationHistory = []) {
    try {
      const systemPrompt = `You are a helpful customer service assistant. Generate natural, contextual responses based on the detected intent and data.

Business tone: ${businessTone || "Professional and friendly"}

Guidelines:
- Be conversational and helpful
- Use emojis appropriately
- Provide clear next steps when possible
- Keep responses concise but informative
- Match the business tone
- Reference conversation context when relevant
- Be specific about what was accomplished`;

      let userPrompt = "";

      switch (intent.intent) {
        case "GOOGLE_EMAIL":
          if (intent.action === "send") {
            userPrompt = `Generate a response for successfully sending an email. To: ${data.to}, Subject: ${
              data.subject || "No subject"
            }`;
          }
          break;
        case "GOOGLE_CALENDAR":
          if (intent.action === "schedule") {
            userPrompt = `Generate a response for scheduling an event. Time: ${data.time}, Title: ${
              data.title || "Meeting"
            }`;
          } else if (intent.action === "list") {
            userPrompt = `Generate a response for showing calendar events. Timeframe: ${data.timeframe || "upcoming"}`;
          }
          break;
        case "HUBSPOT":
          userPrompt = `Generate a response for HubSpot ${intent.action}. Details: ${JSON.stringify(data)}`;
          break;
        case "ODOO":
          if (intent.action === "order") {
            userPrompt = `Generate a response for processing an order. Product: ${data.product}, Quantity: ${data.quantity}`;
          } else if (intent.action === "invoice") {
            userPrompt = `Generate a response for invoice inquiry. Invoice: ${data.invoice_number}, Status: ${data.status}`;
          }
          break;
        default:
          userPrompt = `Generate a general helpful response.`;
      }

      const contextInfo =
        conversationHistory.length > 0
          ? `\n\nPrevious conversation context: ${conversationHistory
              .slice(-2)
              .map((msg) => `${msg.role}: ${msg.content}`)
              .join("\n")}`
          : "";

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt + contextInfo },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error in AI response generation:", error);
      return null;
    }
  }

  // Odoo intent detection methods
  detectOdooOrderRequest(message) {
    const orderKeywords = ["order", "buy", "purchase", "pizza", "food", "delivery", "quantity"];
    const quantityRegex = /(\d+)\s+(pizzas?|items?|products?)/i;
    const orderRegex = /(?:i\s+want\s+to\s+)?(?:order|buy|purchase)\s+(\d+)\s+(.+)/i;

    const hasOrderIntent = orderKeywords.some((keyword) => message.toLowerCase().includes(keyword));

    if (hasOrderIntent) {
      const quantityMatch = message.match(quantityRegex);
      const orderMatch = message.match(orderRegex);

      if (quantityMatch) {
        return {
          type: "order",
          quantity: parseInt(quantityMatch[1]),
          product: quantityMatch[2],
          originalMessage: message,
        };
      } else if (orderMatch) {
        return {
          type: "order",
          quantity: parseInt(orderMatch[1]),
          product: orderMatch[2],
          originalMessage: message,
        };
      }
    }

    return null;
  }

  detectOdooInvoiceRequest(message) {
    const invoiceKeywords = ["invoice", "payment", "bill", "amount due", "status"];
    const invoiceRegex = /(?:invoice|bill)\s*#?([A-Z0-9]+)/i;

    const hasInvoiceIntent = invoiceKeywords.some((keyword) => message.toLowerCase().includes(keyword));

    if (hasInvoiceIntent) {
      const invoiceMatch = message.match(invoiceRegex);
      return {
        type: "invoice",
        invoiceNumber: invoiceMatch ? invoiceMatch[1] : null,
        originalMessage: message,
      };
    }

    return null;
  }

  detectOdooLeadRequest(message) {
    const leadKeywords = ["lead", "inquiry", "interested", "quote", "information"];
    const hasLeadIntent = leadKeywords.some((keyword) => message.toLowerCase().includes(keyword));

    if (hasLeadIntent) {
      return {
        type: "lead",
        description: message,
        originalMessage: message,
      };
    }

    return null;
  }

  detectOdooTicketRequest(message) {
    const ticketKeywords = ["support", "help", "issue", "problem", "ticket"];
    const hasTicketIntent = ticketKeywords.some((keyword) => message.toLowerCase().includes(keyword));

    if (hasTicketIntent) {
      return {
        type: "ticket",
        subject: message.substring(0, 100),
        description: message,
        originalMessage: message,
      };
    }

    return null;
  }

  // Odoo operation handlers
  async handleOdooOrder(businessId, orderRequest, phoneNumber) {
    try {
      // First, check what modules are available
      const modules = await OdooService.checkAvailableModules(businessId);

      if (!modules.hasProducts) {
        return `❌ Sorry, the Sales module is not installed in this Odoo instance. To process orders, please install the Sales module in your Odoo system.\n\nAvailable modules: ${
          modules.availableModels.join(", ") || "None detected"
        }`;
      }

      if (!modules.hasPartners) {
        return `❌ Sorry, the Partners module is not available in this Odoo instance. This is required to manage customers.`;
      }

      // First, search for or create customer
      let customer = await OdooService.searchCustomer(businessId, phoneNumber);

      if (!customer) {
        // Create new customer
        const customerData = {
          name: `Customer ${phoneNumber}`,
          phone: phoneNumber,
          email: null,
        };
        const customerResult = await OdooService.createCustomer(businessId, customerData);
        customer = { id: customerResult.id };
      }

      // Get products to find the right product
      const products = await OdooService.getProducts(businessId);
      const product = products.find((p) => p.name.toLowerCase().includes(orderRequest.product.toLowerCase()));

      if (!product) {
        return `❌ Sorry, I couldn't find "${orderRequest.product}" in our system. Available products: ${products
          .map((p) => p.name)
          .join(", ")}`;
      }

      // Check if sales module is available for creating orders
      if (!modules.hasSales) {
        const quantityInfo =
          product.qty_available !== undefined
            ? `\n• Available quantity: ${product.qty_available}`
            : `\n• Quantity info: Not available (Inventory module not installed)`;

        return `✅ Product found: ${product.name} ($${product.list_price})\n\n❌ However, the Sales module is not installed, so I cannot create an order. Please install the Sales module in your Odoo system to enable order processing.\n\nProduct details:\n• Name: ${product.name}\n• Price: $${product.list_price}${quantityInfo}`;
      }

      // Create sale order
      const orderData = {
        partner_id: customer.id,
        order_lines: [
          {
            product_id: product.id,
            quantity: orderRequest.quantity,
            price_unit: product.list_price,
          },
        ],
      };

      const orderResult = await OdooService.createSaleOrder(businessId, orderData);
      const total = orderRequest.quantity * product.list_price;

      return `✅ Order created successfully!\n\n📋 Order Details:\n• Product: ${product.name}\n• Quantity: ${orderRequest.quantity}\n• Unit Price: $${product.list_price}\n• Total: $${total}\n• Order ID: ${orderResult.id}\n\n🚚 Your order will be processed shortly. Thank you for your business!`;
    } catch (error) {
      console.error("Error handling Odoo order:", error);

      if (error.message.includes("Sales module is not installed")) {
        return `❌ ${error.message}\n\nTo enable order processing, please:\n1. Go to your Odoo Apps menu\n2. Search for "Sales"\n3. Install the Sales module\n4. Configure your products\n\nThen try your order again!`;
      }

      throw error;
    }
  }

  async handleOdooInvoice(businessId, invoiceRequest) {
    try {
      if (invoiceRequest.invoiceNumber) {
        const invoice = await OdooService.getInvoice(businessId, invoiceRequest.invoiceNumber);

        if (invoice) {
          return `📄 Invoice ${invoice.name}\n\n💰 Amount: $${invoice.amount_total}\n📊 Status: ${
            invoice.payment_state
          }\n State: ${invoice.state}\n\n${
            invoice.payment_state === "paid"
              ? "✅ This invoice has been paid."
              : "⏳ This invoice is still pending payment."
          }`;
        } else {
          return `❌ Invoice ${invoiceRequest.invoiceNumber} not found. Please check the invoice number and try again.`;
        }
      } else {
        return `❌ Please provide an invoice number to check the status. For example: "What's the status of invoice INV123?"`;
      }
    } catch (error) {
      console.error("Error handling Odoo invoice:", error);
      throw error;
    }
  }

  async handleOdooLead(businessId, leadRequest, phoneNumber) {
    try {
      // Search for existing customer
      let customer = await OdooService.searchCustomer(businessId, phoneNumber);

      if (!customer) {
        // Create new customer
        const customerData = {
          name: `Customer ${phoneNumber}`,
          phone: phoneNumber,
          email: null,
        };
        const customerResult = await OdooService.createCustomer(businessId, customerData);
        customer = { id: customerResult.id };
      }

      // Create lead
      const leadData = {
        name: `Lead from WhatsApp - ${phoneNumber}`,
        partner_name: customer.name,
        email: customer.email,
        phone: phoneNumber,
        description: leadRequest.description,
      };

      const leadResult = await OdooService.createLead(businessId, leadData);

      return `✅ Lead created successfully!\n\n📋 Lead Details:\n• Name: ${leadData.name}\n• Contact: ${phoneNumber}\n• Description: ${leadRequest.description}\n• Lead ID: ${leadResult.id}\n\nOur sales team will follow up with you shortly. Thank you for your interest!`;
    } catch (error) {
      console.error("Error handling Odoo lead:", error);
      throw error;
    }
  }

  async handleOdooTicket(businessId, ticketRequest, phoneNumber) {
    try {
      // Search for existing customer
      let customer = await OdooService.searchCustomer(businessId, phoneNumber);

      if (!customer) {
        // Create new customer
        const customerData = {
          name: `Customer ${phoneNumber}`,
          phone: phoneNumber,
          email: null,
        };
        const customerResult = await OdooService.createCustomer(businessId, customerData);
        customer = { id: customerResult.id };
      }

      // Create support ticket
      const ticketData = {
        subject: ticketRequest.subject,
        description: ticketRequest.description,
        partner_id: customer.id,
        priority: "1", // Normal priority
      };

      const ticketResult = await OdooService.createTicket(businessId, ticketData);

      return `✅ Support ticket created successfully!\n\n🎫 Ticket Details:\n• Subject: ${ticketRequest.subject}\n• Description: ${ticketRequest.description}\n• Ticket ID: ${ticketResult.id}\n• Priority: Normal\n\nOur support team will review your ticket and get back to you as soon as possible. Thank you for contacting us!`;
    } catch (error) {
      console.error("Error handling Odoo ticket:", error);
      throw error;
    }
  }

  /**
   * Handle Google Email operations with AI
   */
  async handleGoogleEmailWithAI(businessId, intent, conversationHistory, businessTone) {
    try {
      const GoogleService = require("./google");

      switch (intent.action) {
        case "send":
          try {
            // Validate required fields
            const validation = this.validateEmailRequirements(intent, businessId);

            if (!validation.isValid) {
              return await this.generateEmailGuidance(validation.missingFields, businessId);
            }

            // Get the business's own email address
            const userInfo = await GoogleService.getUserInfo(businessId);
            const businessEmail = userInfo.email;

            // Create the email content with user information
            const emailBody = `From: ${intent.user_email}
Subject: ${intent.subject}

${intent.body}

---
This email was sent via WhatsApp by: ${intent.user_email}`;

            const emailResult = await GoogleService.sendEmail(businessId, {
              to: businessEmail, // Send to business's own email
              subject: `[WhatsApp] ${intent.subject}`,
              body: emailBody,
            });

            if (emailResult && emailResult.id) {
              const businessConfig = await require("./business").getBusinessById(businessId);
              const businessName = businessConfig?.name || "our team";

              let response = `✅ Email sent successfully to ${businessName}!\n\n`;
              response += `�� **Email Details:**\n`;
              response += `• From: ${intent.user_email}\n`;
              response += `• Subject: ${intent.subject}\n`;
              response += `• Message ID: ${emailResult.id}\n\n`;
              response += `The email has been delivered to ${businessName}'s inbox. `;
              response += `You should receive a response soon!`;

              return response;
            } else {
              return `❌ Sorry, I couldn't send the email. The response was invalid.`;
            }
          } catch (error) {
            console.error("Error sending email:", error);
            return `❌ Sorry, I couldn't send the email. ${error.message}`;
          }

        default:
          return `I understand you want to work with emails, but I'm not sure what specific action you'd like to take.`;
      }
    } catch (error) {
      console.error("Error handling Google Email with AI:", error);
      return `❌ Sorry, I encountered an error with your email request. Please try again.`;
    }
  }

  /**
   * Handle Google Calendar operations with AI
   */
  async handleGoogleCalendarWithAI(businessId, intent, conversationHistory, businessTone) {
    try {
      const GoogleService = require("./google");

      switch (intent.action) {
        case "schedule":
          const eventResult = await GoogleService.createEvent(businessId, {
            summary: intent.title || "Meeting",
            start: intent.start_time,
            end: intent.end_time,
            attendees: intent.attendees ? intent.attendees.split(",").map((email) => email.trim()) : [],
          });

          if (eventResult.success) {
            return await this.generateContextualResponse(
              intent,
              {
                title: intent.title || "Meeting",
                time: intent.start_time,
                success: true,
              },
              businessTone,
              conversationHistory
            );
          } else {
            return `❌ Sorry, I couldn't schedule the event. ${eventResult.error}`;
          }

        case "list":
          const events = await GoogleService.getEvents(businessId, {
            timeMin: intent.timeMin,
            timeMax: intent.timeMax,
            maxResults: intent.maxResults || 10,
          });

          if (events.success && events.events.length > 0) {
            const eventList = events.events.map((event) => `• ${event.summary} - ${event.start}`).join("\n");

            return await this.generateContextualResponse(
              intent,
              {
                timeframe: intent.timeframe || "upcoming",
                count: events.events.length,
                events: eventList,
              },
              businessTone,
              conversationHistory
            );
          } else {
            return `📅 No events found for the requested time period.`;
          }

        default:
          return `I understand you want to work with your calendar, but I'm not sure what specific action you'd like to take.`;
      }
    } catch (error) {
      console.error("Error handling Google Calendar with AI:", error);
      return `❌ Sorry, I encountered an error with your calendar request. Please try again.`;
    }
  }

  /**
   * Handle HubSpot operations with AI
   */
  async handleHubSpotWithAI(businessId, intent, conversationHistory, businessTone) {
    try {
      const HubSpotService = require("./hubspot");

      switch (intent.action) {
        case "create_contact":
          const contactResult = await HubSpotService.createContact(businessId, {
            email: intent.email,
            firstName: intent.firstName,
            lastName: intent.lastName,
            phone: intent.phone,
            company: intent.company,
            jobTitle: intent.jobTitle,
          });

          if (contactResult.success) {
            return await this.generateContextualResponse(
              intent,
              {
                email: intent.email,
                contactId: contactResult.contactId,
                success: true,
              },
              businessTone,
              conversationHistory
            );
          } else {
            return `❌ Sorry, I couldn't create the contact. ${contactResult.error}`;
          }

        case "create_company":
          const companyResult = await HubSpotService.createCompany(businessId, {
            name: intent.companyName,
            domain: intent.domain,
            industry: intent.industry,
            phone: intent.phone,
            address: intent.address,
            city: intent.city,
            state: intent.state,
            country: intent.country,
          });

          if (companyResult.success) {
            return await this.generateContextualResponse(
              intent,
              {
                companyName: intent.companyName,
                companyId: companyResult.companyId,
                success: true,
              },
              businessTone,
              conversationHistory
            );
          } else {
            return `❌ Sorry, I couldn't create the company. ${companyResult.error}`;
          }

        case "create_deal":
          const dealResult = await HubSpotService.createDeal(businessId, {
            name: intent.dealName,
            amount: intent.amount,
            stage: intent.stage,
            closeDate: intent.closeDate,
            description: intent.description,
            pipeline: intent.pipeline,
          });

          if (dealResult.success) {
            return await this.generateContextualResponse(
              intent,
              {
                dealName: intent.dealName,
                dealId: dealResult.dealId,
                success: true,
              },
              businessTone,
              conversationHistory
            );
          } else {
            return `❌ Sorry, I couldn't create the deal. ${dealResult.error}`;
          }

        case "search_contacts":
          const searchResult = await HubSpotService.searchContacts(businessId, intent.searchTerm);

          if (searchResult.success) {
            return await this.generateContextualResponse(
              intent,
              {
                searchTerm: intent.searchTerm,
                contacts: searchResult.contacts,
                total: searchResult.total,
                success: true,
              },
              businessTone,
              conversationHistory
            );
          } else {
            return `❌ Sorry, I couldn't search contacts. ${searchResult.error}`;
          }

        default:
          return `❌ I'm not sure how to handle that HubSpot action. Please try again with a specific request like creating a contact, company, or deal.`;
      }
    } catch (error) {
      console.error("Error handling HubSpot request:", error);
      return `❌ Sorry, I encountered an error with your HubSpot request. Please make sure HubSpot integration is properly configured.`;
    }
  }

  /**
   * Handle Odoo operations with AI
   */
  async handleOdooWithAI(businessId, intent, phoneNumber, conversationHistory, businessTone) {
    try {
      const OdooService = require("./odoo");

      switch (intent.action) {
        case "order":
          const orderResult = await this.handleOdooOrder(businessId, intent.extractedData, phoneNumber);
          return orderResult;
        case "invoice":
          const invoiceResult = await this.handleOdooInvoice(businessId, intent.extractedData);
          return invoiceResult;
        case "lead":
          const leadResult = await this.handleOdooLead(businessId, intent.extractedData, phoneNumber);
          return leadResult;
        case "ticket":
          const ticketResult = await this.handleOdooTicket(businessId, intent.extractedData, phoneNumber);
          return ticketResult;
        default:
          return `I understand you want to work with Odoo, but I'm not sure what specific action you'd like to take.`;
      }
    } catch (error) {
      console.error("Error handling Odoo with AI:", error);
      return `❌ Sorry, I encountered an error with your Odoo request. Please try again.`;
    }
  }

  /**
   * Handle General Intent
   */
  async handleGeneralIntent(intent, conversationHistory, businessTone) {
    try {
      const systemPrompt = `You are a helpful AI assistant. Generate a response based on the intent and data.

Guidelines:
- Be conversational and helpful
- Use emojis appropriately
- Provide clear next steps when possible
- Keep responses concise but informative
- Match the business tone
- Reference conversation context when relevant
- Be specific about what was accomplished`;

      let userPrompt = "";

      switch (intent.intent) {
        case "GENERAL":
          userPrompt = `Generate a general helpful response.`;
          break;
        case "GOOGLE_EMAIL":
          userPrompt = `Generate a response for working with emails.`;
          break;
        case "GOOGLE_CALENDAR":
          userPrompt = `Generate a response for working with your calendar.`;
          break;
        case "HUBSPOT":
          userPrompt = `Generate a response for working with HubSpot.`;
          break;
        case "ODOO":
          userPrompt = `Generate a response for working with Odoo.`;
          break;
        default:
          userPrompt = `Generate a general helpful response.`;
      }

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error handling General Intent:", error);
      return `❌ Sorry, I encountered an error with your general request. Please try again.`;
    }
  }

  /**
   * Helper function to safely parse JSON responses that might be wrapped in markdown code blocks
   */
  safeParseJSON(jsonString) {
    try {
      // First try to parse as-is
      return JSON.parse(jsonString);
    } catch (error) {
      try {
        // Remove markdown code block markers if present
        let cleaned = jsonString.trim();

        // Remove ```json and ``` markers
        if (cleaned.startsWith("```json")) {
          cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        // Try parsing the cleaned string
        return JSON.parse(cleaned);
      } catch (secondError) {
        console.error("Failed to parse JSON after cleaning:", secondError);
        console.error("Original string:", jsonString);
        throw new Error(`Invalid JSON response: ${secondError.message}`);
      }
    }
  }

  /**
   * Detect if a message is a FAQ question
   */
  async detectFAQIntent(message) {
    try {
      console.log("FAQ Intent Detection - Input message:", message);

      const systemPrompt = `You are an AI assistant that analyzes customer messages to detect business intents across multiple systems.

Your task is to analyze the customer's message and determine if they want to interact with:
1. GOOGLE_EMAIL - Send emails via Gmail
2. GOOGLE_CALENDAR - Schedule, check availability, create events
3. HUBSPOT - CRM operations (contacts, companies, deals, search)
4. ODOO - ERP operations (orders, invoices, products, support)
5. GENERAL - General conversation or unrelated requests

For email messages, extract:
- user_email: sender's email address (required for sending)
- subject: email subject/title (required for sending)
- body: email content (required for sending)
- action: "send"

IMPORTANT: When users want to send emails, they are actually sending emails to the business's own Gmail account (self-email). 
The user_email field identifies who is sending the email, and the email will be delivered to the business's inbox.

Examples:
- "I want to send an email\nMy email: john@example.com\nTitle: Meeting Request\nContent: Let's meet tomorrow" → {"intent": "GOOGLE_EMAIL", "action": "send", "user_email": "john@example.com", "subject": "Meeting Request", "body": "Let's meet tomorrow", "confidence": 0.95}
- "Schedule a meeting tomorrow at 2pm" → {"intent": "GOOGLE_CALENDAR", "action": "schedule", "time": "tomorrow at 2pm", "confidence": 0.9}

Return ONLY valid JSON. If no clear intent is detected, return {"intent": "GENERAL", "confidence": 0.5}.`;

      const userPrompt = `Analyze this customer message: "${message}"

Determine if this is a FAQ-type question.`;

      console.log("FAQ Intent Detection - Making API call to OpenAI");

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
      });

      console.log("FAQ Intent Detection - Raw response:", response.choices[0].message.content);

      // Use the safe JSON parser
      const result = this.safeParseJSON(response.choices[0].message.content);

      console.log("FAQ Intent Detection - Parsed result:", result);

      // Only return FAQ intent with high confidence
      if (result.isFAQ && result.confidence >= 0.7) {
        return {
          ...result,
          originalMessage: message,
        };
      }

      console.log("FAQ Intent Detection - Not a FAQ or low confidence");
      return null;
    } catch (error) {
      console.error("Error in FAQ intent detection:", error);
      console.error("Error details:", error.message);
      return null;
    }
  }

  /**
   * Enhanced FAQ intent detection using embeddings
   */
  async detectFAQIntentWithEmbeddings(message) {
    try {
      console.log("Enhanced FAQ Intent Detection - Input message:", message);

      // Use embeddings for more accurate FAQ detection
      const intentResult = await this.embeddingsService.detectIntentWithEmbeddings(message, {
        FAQ: [
          "What are your business hours?",
          "How do I return a product?",
          "What payment methods do you accept?",
          "Do you offer delivery?",
          "What is your refund policy?",
          "How can I contact support?",
          "What are your shipping options?",
          "What is your return policy?",
          "How long does shipping take?",
          "Do you have a mobile app?",
          "What are your store locations?",
          "How do I track my order?",
          "What is your warranty policy?",
          "How do I cancel my subscription?",
          "What payment methods do you accept?",
        ],
      });

      // If embeddings detect FAQ with high confidence, use that
      if (intentResult.intent === "FAQ" && intentResult.confidence >= 0.7) {
        console.log("FAQ Intent Detection - Embeddings result:", intentResult);

        // Determine question type using embeddings
        const questionTypeResult = await this.embeddingsService.detectIntentWithEmbeddings(message, {
          product: [
            "What products do you sell?",
            "Do you have this item in stock?",
            "What are your best sellers?",
            "How much does this cost?",
          ],
          service: ["What services do you offer?", "How can you help me?", "What support do you provide?"],
          policy: [
            "What is your refund policy?",
            "What is your return policy?",
            "What is your warranty policy?",
            "What are your terms of service?",
          ],
          procedure: [
            "How do I return a product?",
            "How do I track my order?",
            "How do I cancel my subscription?",
            "How do I update my account?",
          ],
          pricing: [
            "How much does this cost?",
            "What are your prices?",
            "Do you offer discounts?",
            "What payment plans do you have?",
          ],
          general: [
            "What are your business hours?",
            "How can I contact you?",
            "Where are you located?",
            "What is your phone number?",
          ],
        });

        return {
          isFAQ: true,
          confidence: intentResult.confidence,
          questionType: questionTypeResult.intent,
          originalMessage: message,
          method: "embeddings",
        };
      }

      // Fallback to original chat completions method
      console.log("FAQ Intent Detection - Falling back to chat completions");
      return await this.detectFAQIntent(message);
    } catch (error) {
      console.error("Error in enhanced FAQ intent detection:", error);
      // Fallback to original method
      return await this.detectFAQIntent(message);
    }
  }

  /**
   * Enhanced general intent detection using embeddings
   */
  async detectIntentWithEmbeddings(message, conversationHistory = [], businessId = null) {
    try {
      console.log("Enhanced Intent Detection - Input message:", message);

      // Use embeddings for intent detection
      const intentResult = await this.embeddingsService.detectIntentWithEmbeddings(message);

      console.log("Enhanced Intent Detection - Embeddings result:", intentResult);

      // If we have conversation history, analyze context
      if (conversationHistory.length > 0) {
        const contextAnalysis = await this.embeddingsService.analyzeConversationContext(conversationHistory, message);
        console.log("Conversation context analysis:", contextAnalysis);

        // Adjust confidence based on context
        if (contextAnalysis.context === "continuation" && contextAnalysis.confidence > 0.8) {
          // If this is a continuation of a previous topic, maintain the same intent
          const lastMessage = conversationHistory[conversationHistory.length - 1];
          if (lastMessage.intent) {
            intentResult.intent = lastMessage.intent;
            intentResult.confidence = Math.min(intentResult.confidence + 0.1, 1.0);
            intentResult.contextAware = true;
          }
        }
      }

      return intentResult;
    } catch (error) {
      console.error("Error in enhanced intent detection:", error);
      // Fallback to original method
      return await this.detectIntentWithAI(message, conversationHistory, businessId);
    }
  }

  /**
   * Validate email sending requirements and provide user guidance
   */
  validateEmailRequirements(intent, businessId) {
    const missingFields = [];
    const fieldLabels = {
      user_email: "your email address",
      subject: "email subject/title",
      body: "email content",
    };

    Object.keys(fieldLabels).forEach((field) => {
      if (!intent[field] || intent[field].trim() === "") {
        missingFields.push(fieldLabels[field]);
      }
    });

    return {
      isValid: missingFields.length === 0,
      missingFields,
      fieldLabels,
    };
  }

  /**
   * Generate user guidance for missing email fields
   */
  async generateEmailGuidance(missingFields, businessId) {
    const businessConfig = await require("./business").getBusinessById(businessId);
    const businessName = businessConfig?.name || "our team";

    let message = `I'd be happy to help you send an email to ${businessName}! `;
    message += `However, I need some additional information:\n\n`;
    message += `Please provide:\n`;
    missingFields.forEach((field) => {
      message += `• ${field}\n`;
    });
    message += `\nYou can provide this information in your next message. `;
    message += `For example:\n`;
    message += `"My email: your@email.com\n`;
    message += `Title: Your Subject\n`;
    message += `Content: Your message content"`;

    return message;
  }

  /**
   * Enhanced message processing with embeddings
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
      console.log(`Enhanced OpenAI Processing - Message type: ${messageType}`);
      console.log(`Enhanced OpenAI Processing - Content: ${content}`);

      let aiResponse = "";
      let intent = null; // Initialize intent variable

      // Analyze conversation context if we have history
      let contextAnalysis = null;
      if (conversationHistory.length > 0) {
        contextAnalysis = await this.embeddingsService.analyzeConversationContext(conversationHistory, content);
        console.log("Conversation context for processing:", contextAnalysis);
      }

      switch (messageType) {
        case "text":
          console.log("Enhanced OpenAI Processing - Processing text message");

          // Enhanced intent detection
          intent = await this.detectIntentWithEmbeddings(content, conversationHistory, businessId);
          console.log("Enhanced intent detection result:", intent);

          // Process based on detected intent
          if (intent.intent === "FAQ" && intent.confidence >= 0.7) {
            // This will be handled by the FAQ system
            return {
              intent: "FAQ",
              confidence: intent.confidence,
              method: "embeddings",
            };
          }

          // Enhanced chat completion with context
          aiResponse = await this.chatCompletionWithContext(
            [{ role: "user", content: content }],
            conversationHistory,
            businessTone,
            contextAnalysis
          );
          break;

        case "image":
          console.log("Enhanced OpenAI Processing - Processing image message");
          if (!filePath) {
            throw new Error("Image file path is required for image analysis");
          }
          if (!fs.existsSync(filePath)) {
            throw new Error(`Image file does not exist: ${filePath}`);
          }

          // Enhanced intent detection for image
          intent = await this.detectIntentWithEmbeddings(content, conversationHistory, businessId);

          // Enhanced image analysis with context
          const imageAnalysis = await this.analyzeImageWithContext(filePath, content, businessTone, contextAnalysis);
          aiResponse = imageAnalysis;
          break;

        case "audio":
          console.log("Enhanced OpenAI Processing - Processing audio message");
          if (!filePath) {
            throw new Error("Audio file path is required for audio transcription");
          }
          if (!fs.existsSync(filePath)) {
            throw new Error(`Audio file does not exist: ${filePath}`);
          }

          const transcription = await this.transcribeAudio(filePath);
          console.log("Audio transcription:", transcription);

          // Process transcribed text with enhanced intent detection
          const audioIntent = await this.detectIntentWithEmbeddings(transcription, conversationHistory, businessId);
          console.log("Audio intent detection result:", audioIntent);

          if (audioIntent.intent === "FAQ" && audioIntent.confidence >= 0.7) {
            return {
              intent: "FAQ",
              confidence: audioIntent.confidence,
              method: "embeddings",
              transcription: transcription,
            };
          }

          // Enhanced chat completion for transcribed audio
          aiResponse = await this.chatCompletionWithContext(
            [{ role: "user", content: `[Audio transcription] ${transcription}` }],
            conversationHistory,
            businessTone,
            contextAnalysis
          );
          break;

        default:
          throw new Error(`Unsupported message type: ${messageType}`);
      }

      return {
        response: aiResponse,
        intent: intent?.intent || "GENERAL",
        confidence: intent?.confidence || 0.5,
        method: "embeddings",
        context: contextAnalysis,
      };
    } catch (error) {
      console.error("Error in enhanced message processing:", error);
      // Fallback to original processing
      return await this.processMessage(messageType, content, filePath, conversationHistory, businessTone);
    }
  }

  /**
   * Enhanced chat completion with conversation context
   */
  async chatCompletionWithContext(messages, conversationHistory = [], businessTone = null, contextAnalysis = null) {
    try {
      console.log("Enhanced Chat Completion - Processing with context");

      let systemPrompt = this.buildSystemPrompt(businessTone);

      // Add context information to system prompt
      if (contextAnalysis && contextAnalysis.relevantHistory.length > 0) {
        systemPrompt += `\n\nConversation Context:
The user is continuing a conversation. Here are the most relevant previous messages:
${contextAnalysis.relevantHistory
  .map((msg) => `- ${msg.content || msg.message} (relevance: ${msg.relevance.toFixed(2)})`)
  .join("\n")}

Use this context to provide more relevant and coherent responses.`;
      }

      // Build conversation history with embeddings-based relevance
      const relevantHistory = contextAnalysis?.relevantHistory || conversationHistory.slice(-5);
      const historyMessages = relevantHistory.map((msg) => ({
        role: msg.role || "user",
        content: msg.content || msg.message,
      }));

      const allMessages = [{ role: "system", content: systemPrompt }, ...historyMessages, ...messages];

      console.log("Enhanced Chat Completion - Making API call with context");

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: allMessages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const aiResponse = response.choices[0].message.content;
      console.log("Enhanced Chat Completion - Response generated");

      return aiResponse;
    } catch (error) {
      console.error("Error in enhanced chat completion:", error);
      // Fallback to original method
      return await this.chatCompletion(messages, conversationHistory, businessTone);
    }
  }

  /**
   * Enhanced image analysis with context
   */
  async analyzeImageWithContext(imagePath, userMessage = "", businessTone = null, contextAnalysis = null) {
    try {
      console.log("Enhanced Image Analysis - Processing with context");

      let systemPrompt = this.buildSystemPrompt(businessTone);

      // Add context information for image analysis
      if (contextAnalysis && contextAnalysis.relevantHistory.length > 0) {
        systemPrompt += `\n\nConversation Context:
The user is continuing a conversation. Here are the most relevant previous messages:
${contextAnalysis.relevantHistory
  .map((msg) => `- ${msg.content || msg.message} (relevance: ${msg.relevance.toFixed(2)})`)
  .join("\n")}

Use this context to provide more relevant analysis of the image.`;
      }

      const response = await openai.chat.completions.create({
        model: this.visionModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userMessage
                  ? `User message: "${userMessage}"\n\nPlease analyze this image and respond appropriately.`
                  : "Please analyze this image and provide a helpful response.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${fs.readFileSync(imagePath, "base64")}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const analysis = response.choices[0].message.content;
      console.log("Enhanced Image Analysis - Analysis completed");

      return analysis;
    } catch (error) {
      console.error("Error in enhanced image analysis:", error);
      // Fallback to original method
      return await this.analyzeImage(imagePath, userMessage, businessTone);
    }
  }

  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2) {
      console.warn("One or both embeddings are undefined, returning 0 similarity");
      return 0;
    }
    // ... rest of the function
  }
}

module.exports = new OpenAIService();
