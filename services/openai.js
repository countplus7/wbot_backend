require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const GoogleService = require('./google');
const OdooService = require('./odoo');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  constructor() {
    this.model = 'gpt-4';
    this.visionModel = 'gpt-4o'; // Updated from deprecated gpt-4-vision-preview
  }

  async chatCompletion(messages, conversationHistory = [], businessTone = null, businessId = null, phoneNumber = null) {
    try {
      // Check if the latest message contains an email request
      const latestMessage = messages[messages.length - 1];
      const emailRequest = this.detectEmailRequest(latestMessage.content);
      const emailReadRequest = this.detectEmailReadRequest(latestMessage.content);
      const calendarRequest = this.detectCalendarRequest(latestMessage.content);
      
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
          console.error('Error processing Odoo order:', error);
          return `❌ Sorry, I couldn't process your order. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle Odoo invoice request
      if (odooInvoiceRequest && businessId) {
        try {
          const result = await this.handleOdooInvoice(businessId, odooInvoiceRequest);
          return result;
        } catch (error) {
          console.error('Error processing Odoo invoice request:', error);
          return `❌ Sorry, I couldn't check your invoice. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle Odoo lead request
      if (odooLeadRequest && businessId && phoneNumber) {
        try {
          const result = await this.handleOdooLead(businessId, odooLeadRequest, phoneNumber);
          return result;
        } catch (error) {
          console.error('Error processing Odoo lead:', error);
          return `❌ Sorry, I couldn't create the lead. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle Odoo ticket request
      if (odooTicketRequest && businessId && phoneNumber) {
        try {
          const result = await this.handleOdooTicket(businessId, odooTicketRequest, phoneNumber);
          return result;
        } catch (error) {
          console.error('Error processing Odoo ticket:', error);
          return `❌ Sorry, I couldn't create the support ticket. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle email sending request
      if (emailRequest && businessId) {
        try {
          const result = await GoogleService.sendEmail(businessId, {
            to: emailRequest.to,
            subject: emailRequest.subject,
            body: emailRequest.body
          });
          
          return `✅ Email sent successfully to ${emailRequest.to}!\n\nSubject: ${emailRequest.subject}\n\nMessage: ${emailRequest.body}`;
        } catch (error) {
          console.error('Error sending email:', error);
          return `❌ Sorry, I couldn't send the email. Please make sure Google Workspace integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle email reading request
      if (emailReadRequest && businessId) {
        try {
          let emails = [];
          let response = '';

          switch (emailReadRequest.type) {
            case 'unread':
              emails = await GoogleService.getUnreadEmails(businessId, emailReadRequest.maxResults || 5);
              response = `📧 Here are your unread emails (${emails.length} found):\n\n`;
              break;
            case 'recent':
              emails = await GoogleService.getEmails(businessId, { maxResults: emailReadRequest.maxResults || 5 });
              response = `📧 Here are your recent emails (${emails.length} found):\n\n`;
              break;
            case 'search':
              emails = await GoogleService.searchEmails(businessId, emailReadRequest.query, emailReadRequest.maxResults || 5);
              response = `📧 Search results for "${emailReadRequest.query}" (${emails.length} found):\n\n`;
              break;
            case 'label':
              emails = await GoogleService.getEmailsByLabel(businessId, emailReadRequest.label, emailReadRequest.maxResults || 5);
              response = `📧 Emails from "${emailReadRequest.label}" (${emails.length} found):\n\n`;
              break;
            default:
              emails = await GoogleService.getEmails(businessId, { maxResults: 5 });
              response = `📧 Here are your recent emails (${emails.length} found):\n\n`;
          }

          if (emails.length === 0) {
            return `📧 No emails found for your request.`;
          }

          // Format emails for display
          emails.forEach((email, index) => {
            const date = new Date(email.internalDate).toLocaleString();
            const isUnread = email.labelIds && email.labelIds.includes('UNREAD') ? '🔵 ' : '';
            const attachmentInfo = email.attachments && email.attachments.length > 0 ? ` 📎 (${email.attachments.length} attachments)` : '';
            
            response += `${index + 1}. ${isUnread}**${email.subject || 'No Subject'}**\n`;
            response += `   📤 From: ${email.from || 'Unknown'}\n`;
            response += `   📅 Date: ${date}\n`;
            response += `   💬 Preview: ${(email.snippet || email.body || '').substring(0, 100)}...${attachmentInfo}\n\n`;
          });

          return response;
        } catch (error) {
          console.error('Error reading emails:', error);
          return `❌ Sorry, I couldn't read your emails. Please make sure Google Workspace integration is properly configured. Error: ${error.message}`;
        }
      }

      // Handle calendar request
      if (calendarRequest && businessId) {
        try {
          let events = [];
          let response = '';

          switch (calendarRequest.type) {
            case 'upcoming':
              events = await GoogleService.getUpcomingEvents(businessId, calendarRequest.maxResults || 5);
              response = `📅 Here are your upcoming events (${events.length} found):\n\n`;
              break;
            case 'today':
              const today = new Date();
              const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
              const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
              events = await GoogleService.getEventsByDateRange(businessId, startOfDay, endOfDay, calendarRequest.maxResults || 10);
              response = `📅 Here are your events for today (${events.length} found):\n\n`;
              break;
            case 'search':
              events = await GoogleService.searchCalendarEvents(businessId, calendarRequest.query, calendarRequest.maxResults || 5);
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
            const startTime = event.start?.dateTime ? new Date(event.start.dateTime).toLocaleString() : 'All day';
            const attendees = event.attendees && event.attendees.length > 0 ? 
              `\n   👥 Attendees: ${event.attendees.map(a => a.email).join(', ')}` : '';
            
            response += `${index + 1}. **${event.summary || 'No Title'}**\n`;
            response += `   🕐 Time: ${startTime}\n`;
            if (event.description) {
              response += `   📝 Description: ${event.description.substring(0, 100)}...\n`;
            response += `${attendees}\n\n`;
            }
          });

          return response;
        } catch (error) {
          console.error('Error handling calendar request:', error);
          return `❌ Sorry, I couldn't access your calendar. Please make sure Google Workspace integration is properly configured. Error: ${error.message}`;
        }
      }



      let systemContent = `You are a helpful AI assistant integrated with WhatsApp and Google Workspace. 
      You can send and read emails through Gmail when users request it. Be conversational, friendly, and helpful. 
      Keep responses concise but informative. If you're analyzing images, describe what you see clearly and provide relevant insights.
      
      When users ask to send emails, you can help them by sending emails through Gmail integration.
      Format for email sending: "send email to [email] with subject [subject] and body [body]"
      
      When users ask to read emails, you can help them access their Gmail. Examples:
      - "show me my unread emails" or "check unread emails"
      - "show me recent emails" or "get my latest emails"
      - "search emails for [query]" or "find emails about [topic]"
      - "show emails from [label]" (like Important, Promotions, etc.)`;
      // Apply business-specific tone if provided
      if (businessTone && businessTone.tone_instructions) {
        systemContent += `\n\n${businessTone.tone_instructions}`;
      }

      const systemMessage = {
        role: 'system',
        content: systemContent
      };

      const allMessages = [systemMessage, ...conversationHistory, ...messages];

      const response = await openai.chat.completions.create({
        model: this.model,
        messages: allMessages,
        max_tokens: 1000,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI chat completion error:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  async analyzeImage(imagePath, userMessage = '', businessTone = null) {
    try {
      console.log(`OpenAI: Analyzing image at path: ${imagePath}`);
      
      // Check if file exists
      if (!fs.existsSync(imagePath)) {
        console.error(`OpenAI: Image file not found: ${imagePath}`);
        throw new Error(`Image file not found: ${imagePath}`);
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      
      console.log(`OpenAI: Image file size: ${imageBuffer.length} bytes`);
      console.log(`OpenAI: Base64 length: ${base64Image.length} characters`);

      let promptText = 'Please analyze this image and describe what you see in detail. Include any text, objects, people, colors, or important details. Be specific and helpful in your description.';
      
      // If user sent a message with the image, include it in the analysis
      if (userMessage && userMessage.trim() !== '' && userMessage !== 'User sent a image message') {
        promptText += ` The user also sent this message with the image: "${userMessage}". Please consider this context in your analysis.`;
      }
      
      // Apply business-specific tone if provided
      if (businessTone && businessTone.tone_instructions) {
        promptText += `\n\n${businessTone.tone_instructions}`;
      }

      console.log(`OpenAI: Using prompt: ${promptText}`);

      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptText
            },
            {
              type: 'image_url',
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
      console.error('OpenAI image analysis error:', error);
      console.error('OpenAI error details:', error.message);
      console.error('OpenAI error stack:', error.stack);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  async transcribeAudio(audioPath) {
    try {
      // Check if file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const audioFile = fs.createReadStream(audioPath);
      
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'text',
        language: 'en',
        temperature: 0.2, // Lower temperature for more accurate transcription
      });

      return response;
    } catch (error) {
      console.error('OpenAI transcription error:', error);
      throw error;
    }
  }

  async processMessage(messageType, content, filePath = null, conversationHistory = [], businessTone = null, businessId = null, phoneNumber = null) {
    try {
      console.log(`OpenAI: Processing message type: ${messageType}`);
      console.log(`OpenAI: Content: ${content}`);
      console.log(`OpenAI: File path: ${filePath}`);
      console.log(`OpenAI: File exists: ${filePath ? fs.existsSync(filePath) : 'N/A'}`);
      
      let aiResponse = '';

      switch (messageType) {
        case 'text':
          console.log('OpenAI: Processing text message');
          aiResponse = await this.chatCompletion([
            { role: 'user', content: content }
          ], conversationHistory, businessTone, businessId, phoneNumber);
          break;

        case 'image':
          console.log('OpenAI: Processing image message');
          if (!filePath) {
            console.error('OpenAI: Image file path is required for image analysis');
            throw new Error('Image file path is required for image analysis');
          }
          if (!fs.existsSync(filePath)) {
            console.error(`OpenAI: Image file does not exist: ${filePath}`);
            throw new Error(`Image file does not exist: ${filePath}`);
          }
          // For images, analyze directly and provide a conversational response
          const imageAnalysis = await this.analyzeImage(filePath, content, businessTone);
          
          // If there's user text with the image, combine it with the analysis
          if (content && content.trim() !== '' && content !== `User sent a ${messageType} message`) {
            aiResponse = await this.chatCompletion([
              { role: 'user', content: `User sent an image with this message: "${content}". Here's what I see in the image: ${imageAnalysis}. Please respond to both the image and the user's message.` }
            ], conversationHistory, businessTone, businessId, phoneNumber);
          } else {
            // Just respond to the image analysis
            aiResponse = await this.chatCompletion([
              { role: 'user', content: `I analyzed this image and here's what I see: ${imageAnalysis}. Please provide a helpful response about what's in the image.` }
            ], conversationHistory, businessTone, businessId, phoneNumber);
          }
          break;

        case 'audio':
          console.log('OpenAI: Processing audio message');
          if (!filePath) {
            console.error('OpenAI: Audio file path is required for transcription');
            throw new Error('Audio file path is required for transcription');
          }
          if (!fs.existsSync(filePath)) {
            console.error(`OpenAI: Audio file does not exist: ${filePath}`);
            throw new Error(`Audio file does not exist: ${filePath}`);
          }
          const transcription = await this.transcribeAudio(filePath);
          aiResponse = await this.chatCompletion([
            { role: 'user', content: `Transcribed audio: "${transcription}". Please respond to this message naturally and conversationally.` }
          ], conversationHistory, businessTone, businessId, phoneNumber);
          break;

        default:
          console.error(`OpenAI: Unsupported message type: ${messageType}`);
          throw new Error(`Unsupported message type: ${messageType}`);
      }

      console.log(`OpenAI: Generated response: ${aiResponse}`);
      return aiResponse;
    } catch (error) {
      console.error('OpenAI: Error processing message:', error);
      console.error('OpenAI: Error details:', error.message);
      console.error('OpenAI: Error stack:', error.stack);
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
        body: match[3].trim()
      };
    }

    // Format 2: "send message to [email]\nSubject: [subject]\nContent: [body]"
    const lines = message.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length >= 3) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('send') && firstLine.includes('to') && firstLine.includes('@')) {
        const emailMatch = firstLine.match(/([^\s]+@[^\s]+)/);
        if (emailMatch) {
          let subject = '';
          let body = '';
          
          // Look for Subject: and Content: lines
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.toLowerCase().startsWith('subject:')) {
              subject = line.substring(8).trim();
            } else if (line.toLowerCase().startsWith('content:')) {
              body = line.substring(8).trim();
            }
          }
          
          if (subject && body) {
            return {
              to: emailMatch[1].trim(),
              subject: subject,
              body: body
            };
          }
        }
      }
    }

    // Format 3: "send message to [email]\nSubject: [subject]\nBody: [body]"
    if (lines.length >= 3) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('send') && firstLine.includes('to') && firstLine.includes('@')) {
        const emailMatch = firstLine.match(/([^\s]+@[^\s]+)/);
        if (emailMatch) {
          let subject = '';
          let body = '';
          
          // Look for Subject: and Body: lines
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.toLowerCase().startsWith('subject:')) {
              subject = line.substring(8).trim();
            } else if (line.toLowerCase().startsWith('body:')) {
              body = line.substring(5).trim();
            }
          }
          
          if (subject && body) {
            return {
              to: emailMatch[1].trim(),
              subject: subject,
              body: body
            };
          }
        }
      }
    }
    
    return null;
  }


  detectEmailReadRequest(message) {
    const lowercaseMessage = message.toLowerCase();
    
    // Check for unread emails - more flexible patterns
    if (lowercaseMessage.includes('unread') && 
        (lowercaseMessage.includes('email') || lowercaseMessage.includes('message'))) {
      return { type: 'unread', maxResults: this.extractNumber(message) || 5 };
    }
    
    // Check for recent/latest emails - more flexible patterns
    if ((lowercaseMessage.includes('recent') || lowercaseMessage.includes('latest') || lowercaseMessage.includes('new')) && 
        (lowercaseMessage.includes('email') || lowercaseMessage.includes('message'))) {
      return { type: 'recent', maxResults: this.extractNumber(message) || 5 };
    }
    
    // Check for general email reading requests
    if ((lowercaseMessage.includes('read') || lowercaseMessage.includes('show') || lowercaseMessage.includes('get')) && 
        (lowercaseMessage.includes('email') || lowercaseMessage.includes('message'))) {
      // If it mentions unread, prioritize unread
      if (lowercaseMessage.includes('unread')) {
        return { type: 'unread', maxResults: this.extractNumber(message) || 5 };
      }
      // Otherwise, get recent emails
      return { type: 'recent', maxResults: this.extractNumber(message) || 5 };
    }
    
    // Check for email search
    const searchMatch = message.match(/search\s+(?:emails?|messages?)\s+for\s+(.+)|find\s+(?:emails?|messages?)\s+about\s+(.+)|(?:emails?|messages?)\s+about\s+(.+)/i);
    if (searchMatch) {
      const query = searchMatch[1] || searchMatch[2] || searchMatch[3];
      return { 
        type: 'search', 
        query: query.trim(),
        maxResults: this.extractNumber(message) || 5 
      };
    }
    
    // Check for emails by label
    const labelMatch = message.match(/emails?\s+from\s+(\w+)|show\s+(\w+)\s+emails?/i);
    if (labelMatch) {
      const label = labelMatch[1] || labelMatch[2];
      return { 
        type: 'label', 
        label: label.trim(),
        maxResults: this.extractNumber(message) || 5 
      };
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
    if (lowercaseMessage.includes('upcoming') && 
        (lowercaseMessage.includes('event') || lowercaseMessage.includes('meeting') || lowercaseMessage.includes('schedule'))) {
      return { type: 'upcoming', maxResults: this.extractNumber(message) || 5 };
    }
    
    // Check for today's events
    if (lowercaseMessage.includes('today') && 
        (lowercaseMessage.includes('event') || lowercaseMessage.includes('meeting') || lowercaseMessage.includes('schedule'))) {
      return { type: 'today', maxResults: this.extractNumber(message) || 10 };
    }
    
    // Check for general schedule/calendar requests
    if ((lowercaseMessage.includes('schedule') || lowercaseMessage.includes('calendar') || lowercaseMessage.includes('agenda')) &&
        (lowercaseMessage.includes('show') || lowercaseMessage.includes('check') || lowercaseMessage.includes('what'))) {
      return { type: 'upcoming', maxResults: this.extractNumber(message) || 5 };
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
      'book', 'schedule', 'appointment', 'meeting', 'reserve', 'set up',
      'arrange', 'plan', 'organize', 'fix', 'make an appointment'
    ];
    
    // Time indicators
    const timeKeywords = [
      'tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
      'am', 'pm', 'morning', 'afternoon', 'evening', 'night', 'at', 'on', 'for'
    ];
    
    // Check if message contains booking intent
    const hasBookingIntent = bookingKeywords.some(keyword => lowercaseMessage.includes(keyword));
    const hasTimeIntent = timeKeywords.some(keyword => lowercaseMessage.includes(keyword));
    
    if (hasBookingIntent && hasTimeIntent) {
      return {
        intent: 'book_appointment',
        confidence: 0.8,
        extractedData: this.extractBookingData(message)
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
      'available', 'free', 'busy', 'open', 'check', 'are you free',
      'do you have time', 'when are you available', 'what time'
    ];
    
    const hasAvailabilityIntent = availabilityKeywords.some(keyword => 
      lowercaseMessage.includes(keyword)
    );
    
    if (hasAvailabilityIntent) {
      return {
        intent: 'check_availability',
        confidence: 0.7,
        extractedData: this.extractTimeData(message)
      };
    }
    
    return null;
  }

  /**
   * Detect reminder intent
   */
  detectReminderIntent(message) {
    const lowercaseMessage = message.toLowerCase();
    
    const reminderKeywords = [
      'remind', 'reminder', 'remember', 'don\'t forget', 'call me',
      'notify', 'alert', 'ping'
    ];
    
    const hasReminderIntent = reminderKeywords.some(keyword => 
      lowercaseMessage.includes(keyword)
    );
    
    if (hasReminderIntent) {
      return {
        intent: 'create_reminder',
        confidence: 0.8,
        extractedData: this.extractReminderData(message)
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
      'meeting', 'call', 'conference', 'video call', 'zoom', 'teams',
      'discuss', 'talk', 'chat', 'conversation'
    ];
    
    const participantKeywords = [
      'with', 'and', 'include', 'invite', 'add'
    ];
    
    const hasMeetingIntent = meetingKeywords.some(keyword => 
      lowercaseMessage.includes(keyword)
    );
    const hasParticipants = participantKeywords.some(keyword => 
      lowercaseMessage.includes(keyword)
    );
    
    if (hasMeetingIntent) {
      return {
        intent: 'schedule_meeting',
        confidence: 0.8,
        extractedData: this.extractMeetingData(message)
      };
    }
    
    return null;
  }

  /**
   * Extract booking data from message
   */
  extractBookingData(message) {
    const data = {
      title: '',
      time: null,
      date: null,
      duration: 60, // default 1 hour
      description: ''
    };
    
    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      data.time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Extract date - FIXED VERSION
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);
    
    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split('T')[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split('T')[0];
    } else {
      // Check for day names
      const dayMatch = message.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (dayMatch) {
        data.date = this.getNextDayOfWeek(dayMatch[1].toLowerCase());
      }
    }
    
    // Extract title/description - IMPROVED VERSION
    const titleMatch = message.match(/(?:book|schedule|appointment)\s+(?:for\s+)?(.+?)(?:\s+tomorrow|\s+today|\s+at|\s+on|\s+next|\s+monday|\s+tuesday|\s+wednesday|\s+thursday|\s+friday|\s+saturday|\s+sunday|$)/i);
    if (titleMatch) {
      data.title = titleMatch[1].trim();
    }
    
    console.log('Extracted booking data:', data); // Debug log
    
    return data;
  }

  /**
   * Extract time data from message
   */
  extractTimeData(message) {
    const data = {
      date: null,
      time: null
    };
    
    // Extract date
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);
    const fridayMatch = message.match(/friday/i);
    
    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split('T')[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split('T')[0];
    } else if (fridayMatch) {
      data.date = this.getNextDayOfWeek('friday');
    }
    
    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      data.time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    return data;
  }

  /**
   * Extract reminder data from message
   */
  extractReminderData(message) {
    const data = {
      title: '',
      time: null,
      date: null,
      description: ''
    };
    
    // Extract reminder text
    const reminderMatch = message.match(/(?:remind|reminder)\s+(?:me\s+to\s+)?(.+?)(?:\s+at|\s+on|\s+tomorrow|\s+today|$)/i);
    if (reminderMatch) {
      data.title = reminderMatch[1].trim();
    }
    
    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      data.time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Extract date
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);
    
    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split('T')[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split('T')[0];
    }
    
    return data;
  }

  /**
   * Extract meeting data from message
   */
  extractMeetingData(message) {
    const data = {
      title: '',
      time: null,
      date: null,
      participants: [],
      duration: 60
    };
    
    // Extract participants
    const withMatch = message.match(/with\s+([^at]+?)(?:\s+at|\s+on|\s+tomorrow|\s+today|$)/i);
    if (withMatch) {
      const participants = withMatch[1].split(/[,\s]+/).filter(p => p.trim());
      data.participants = participants.map(p => p.trim());
    }
    
    // Extract time
    const timeMatch = message.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm|AM|PM)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
      
      if (period === 'pm' && hours !== 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      data.time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // Extract date
    const tomorrowMatch = message.match(/tomorrow/i);
    const todayMatch = message.match(/today/i);
    const mondayMatch = message.match(/monday/i);
    
    if (tomorrowMatch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      data.date = tomorrow.toISOString().split('T')[0];
    } else if (todayMatch) {
      data.date = new Date().toISOString().split('T')[0];
    } else if (mondayMatch) {
      data.date = this.getNextDayOfWeek('monday');
    }
    
    return data;
  }

  /**
   * Get next occurrence of a day of the week
   */
  getNextDayOfWeek(dayName) {
    const days = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
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
    
    return targetDate.toISOString().split('T')[0];
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

  // Odoo intent detection methods
  detectOdooOrderRequest(message) {
    const orderKeywords = ['order', 'buy', 'purchase', 'pizza', 'food', 'delivery', 'quantity'];
    const quantityRegex = /(\d+)\s+(pizzas?|items?|products?)/i;
    const orderRegex = /(?:i\s+want\s+to\s+)?(?:order|buy|purchase)\s+(\d+)\s+(.+)/i;
    
    const hasOrderIntent = orderKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    if (hasOrderIntent) {
      const quantityMatch = message.match(quantityRegex);
      const orderMatch = message.match(orderRegex);
      
      if (quantityMatch) {
        return {
          type: 'order',
          quantity: parseInt(quantityMatch[1]),
          product: quantityMatch[2],
          originalMessage: message
        };
      } else if (orderMatch) {
        return {
          type: 'order',
          quantity: parseInt(orderMatch[1]),
          product: orderMatch[2],
          originalMessage: message
        };
      }
    }
    
    return null;
  }

  detectOdooInvoiceRequest(message) {
    const invoiceKeywords = ['invoice', 'payment', 'bill', 'amount due', 'status'];
    const invoiceRegex = /(?:invoice|bill)\s*#?([A-Z0-9]+)/i;
    
    const hasInvoiceIntent = invoiceKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    if (hasInvoiceIntent) {
      const invoiceMatch = message.match(invoiceRegex);
      return {
        type: 'invoice',
        invoiceNumber: invoiceMatch ? invoiceMatch[1] : null,
        originalMessage: message
      };
    }
    
    return null;
  }

  detectOdooLeadRequest(message) {
    const leadKeywords = ['lead', 'inquiry', 'interested', 'quote', 'information'];
    const hasLeadIntent = leadKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    if (hasLeadIntent) {
      return {
        type: 'lead',
        description: message,
        originalMessage: message
      };
    }
    
    return null;
  }

  detectOdooTicketRequest(message) {
    const ticketKeywords = ['support', 'help', 'issue', 'problem', 'ticket'];
    const hasTicketIntent = ticketKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    if (hasTicketIntent) {
      return {
        type: 'ticket',
        subject: message.substring(0, 100),
        description: message,
        originalMessage: message
      };
    }
    
    return null;
  }

  // Odoo operation handlers
  async handleOdooOrder(businessId, orderRequest, phoneNumber) {
    try {
      // First, search for or create customer
      let customer = await OdooService.searchCustomer(businessId, phoneNumber);
      
      if (!customer) {
        // Create new customer
        const customerData = {
          name: `Customer ${phoneNumber}`,
          phone: phoneNumber,
          email: null
        };
        const customerResult = await OdooService.createCustomer(businessId, customerData);
        customer = { id: customerResult.id };
      }

      // Get products to find the right product
      const products = await OdooService.getProducts(businessId);
      const product = products.find(p => 
        p.name.toLowerCase().includes(orderRequest.product.toLowerCase())
      );

      if (!product) {
        return `❌ Sorry, I couldn't find "${orderRequest.product}" in our system. Available products: ${products.map(p => p.name).join(', ')}`;
      }

      // Create sale order
      const orderData = {
        partner_id: customer.id,
        order_lines: [{
          product_id: product.id,
          quantity: orderRequest.quantity,
          price_unit: product.list_price
        }]
      };

      const orderResult = await OdooService.createSaleOrder(businessId, orderData);
      const total = orderRequest.quantity * product.list_price;

      return `✅ Order created successfully!\n\n📋 Order Details:\n• Product: ${product.name}\n• Quantity: ${orderRequest.quantity}\n• Unit Price: $${product.list_price}\n• Total: $${total}\n• Order ID: ${orderResult.id}\n\n🚚 Your order will be processed shortly. Thank you for your business!`;
    } catch (error) {
      console.error('Error handling Odoo order:', error);
      throw error;
    }
  }

  async handleOdooInvoice(businessId, invoiceRequest) {
    try {
      if (invoiceRequest.invoiceNumber) {
        const invoice = await OdooService.getInvoice(businessId, invoiceRequest.invoiceNumber);
        
        if (invoice) {
          return `📄 Invoice ${invoice.name}\n\n💰 Amount: $${invoice.amount_total}\n📊 Status: ${invoice.payment_state}\n State: ${invoice.state}\n\n${invoice.payment_state === 'paid' ? '✅ This invoice has been paid.' : '⏳ This invoice is still pending payment.'}`;
        } else {
          return `❌ Invoice ${invoiceRequest.invoiceNumber} not found. Please check the invoice number and try again.`;
        }
      } else {
        return `❌ Please provide an invoice number to check the status. For example: "What's the status of invoice INV123?"`;
      }
    } catch (error) {
      console.error('Error handling Odoo invoice:', error);
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
          email: null
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
        description: leadRequest.description
      };

      const leadResult = await OdooService.createLead(businessId, leadData);

      return `✅ Lead created successfully!\n\n📋 Lead Details:\n• Name: ${leadData.name}\n• Contact: ${phoneNumber}\n• Description: ${leadRequest.description}\n• Lead ID: ${leadResult.id}\n\nOur sales team will follow up with you shortly. Thank you for your interest!`;
    } catch (error) {
      console.error('Error handling Odoo lead:', error);
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
          email: null
        };
        const customerResult = await OdooService.createCustomer(businessId, customerData);
        customer = { id: customerResult.id };
      }

      // Create support ticket
      const ticketData = {
        subject: ticketRequest.subject,
        description: ticketRequest.description,
        partner_id: customer.id,
        priority: '1' // Normal priority
      };

      const ticketResult = await OdooService.createTicket(businessId, ticketData);

      return `✅ Support ticket created successfully!\n\n🎫 Ticket Details:\n• Subject: ${ticketRequest.subject}\n• Description: ${ticketRequest.description}\n• Ticket ID: ${ticketResult.id}\n• Priority: Normal\n\nOur support team will review your ticket and get back to you as soon as possible. Thank you for contacting us!`;
    } catch (error) {
      console.error('Error handling Odoo ticket:', error);
      throw error;
    }
  }
}

module.exports = new OpenAIService();
