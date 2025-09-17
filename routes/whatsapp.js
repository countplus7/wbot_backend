const express = require('express');
const router = express.Router();
const WhatsAppService = require('../services/whatsapp');
const OpenAIService = require('../services/openai');
const DatabaseService = require('../services/database');
const BusinessService = require('../services/business');
const CalendarHandler = require('../services/calendar-handler');
const AirtableService = require('../services/airtable');
const EmbeddingsService = require('../services/embeddings');
const pool = require('../config/database');
const path = require('path');
const fs = require('fs-extra');

// Webhook verification endpoint
router.get('/webhook', async (req, res) => {
  try {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

    console.log('Webhook verification request:', { mode, token: token ? token.substring(0, 10) + '...' : 'undefined', challenge });

    if (!mode || !token) {
      console.log('Webhook verification failed: Missing required parameters');
      return res.status(403).send('Forbidden');
    }

    // Check if the verify token matches any business configuration
    const configs = await BusinessService.getAllWhatsAppConfigs();
    
    const matchingConfig = configs.find(config => config.verify_token === token);
    
    if (mode === 'subscribe' && matchingConfig) {
      console.log('Webhook verification successful:', { mode, token: token.substring(0, 10) + '...', businessId: matchingConfig.business_id });
      res.status(200).send(challenge);
    } else {
      console.log('Webhook verification failed: Invalid token or mode');
      res.status(403).send('Forbidden');
    }
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(403).send('Forbidden');
  }
});

// Webhook endpoint for receiving messages
router.post('/webhook', async (req, res) => {
  try {
    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('========================');

    // Process the incoming message
    const messageData = await WhatsAppService.processIncomingMessage(req.body);
    
    if (!messageData) {
      console.log('No message data to process');
      return res.status(200).send('OK');
    }

    console.log('Processed message data:', {
      messageId: messageData.messageId,
      from: messageData.from,
      to: messageData.to,
      type: messageData.messageType,
      hasContent: !!messageData.content,
      hasMedia: !!messageData.mediaId
    });

    // Check if we've already processed this message
    try {
      const existingMessage = await pool.query(
        "SELECT id, created_at FROM messages WHERE message_id = $1",
        [messageData.messageId]
      );
      
      if (existingMessage.rows.length > 0) {
        console.log(`Message ${messageData.messageId} already processed at ${existingMessage.rows[0].created_at}. Skipping duplicate.`);
        return res.status(200).send('OK');
      }
    } catch (checkError) {
      console.error('Error checking for duplicate message:', checkError);
      // Continue processing even if check fails
    }

    // Identify the business from the phone number ID
    const whatsappConfig = await BusinessService.getWhatsAppConfigByPhoneNumber(messageData.to);
    if (!whatsappConfig) {
      console.error('No WhatsApp configuration found for phone number:', messageData.to);
      return res.status(200).send('OK');
    }

    const businessId = whatsappConfig.business_id;
    console.log(`Processing message for business ID: ${businessId}`);

    // Check if business is active before processing
    const business = await BusinessService.getBusinessById(businessId);
    if (!business) {
      console.error(`Business not found for ID: ${businessId}`);
      return res.status(200).send('OK');
    }

    if (business.status === 'inactive') {
      console.log(`Business ${businessId} (${business.name}) is inactive. Skipping response.`);
      return res.status(200).send('OK');
    }

    // Set WhatsApp service configuration for this business
    WhatsAppService.setBusinessConfig(whatsappConfig);

    // Get business tone for AI responses
    const businessTone = await BusinessService.getBusinessTone(businessId);
    console.log(`Using business tone: ${businessTone ? businessTone.name : 'default'}`);

    // Create or get conversation
    const conversation = await DatabaseService.createOrGetConversation(businessId, messageData.from);
    console.log('Conversation created/found:', { id: conversation.id, business_id: conversation.business_id, phone_number: conversation.phone_number });

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
      isFromUser: true
    });

    // Handle media files if present (existing code)
    let localFilePath = null;
    let aiResponse = '';

    // Handle different message types (existing media processing code)
    if (messageData.messageType === 'image' || messageData.messageType === 'audio') {
      try {
        console.log(`Processing ${messageData.messageType} message...`);
        console.log(`Media ID: ${messageData.mediaId}`);
        
        // Download media file
        const mediaStream = await WhatsAppService.downloadMedia(messageData.mediaId);
        
        // Determine file extension and path
        const timestamp = Date.now();
        const fileExtension = messageData.messageType === 'image' ? '.jpg' : '.ogg';
        const fileName = `${businessId}_${messageData.messageId}_${timestamp}${fileExtension}`;
        const uploadDir = messageData.messageType === 'image' ? 'uploads/images' : 'uploads/audio';
        
        // Use absolute path for AI processing
        localFilePath = path.resolve(__dirname, '..', uploadDir, fileName);
        
        console.log(`Saving media to: ${localFilePath}`);
        console.log(`Current working directory: ${process.cwd()}`);
        console.log(`__dirname: ${__dirname}`);

        // Ensure directory exists before saving file
        await fs.ensureDir(path.dirname(localFilePath));

        // Save file with proper error handling
        const writeStream = fs.createWriteStream(localFilePath);
        mediaStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', (error) => {
            console.error('Error writing file:', error);
            reject(error);
          });
          mediaStream.on('error', (error) => {
            console.error('Error reading media stream:', error);
            reject(error);
          });
        });

        // Verify file was saved
        if (fs.existsSync(localFilePath)) {
          const fileStats = fs.statSync(localFilePath);
          console.log(`Media file saved successfully: ${localFilePath} (${fileStats.size} bytes)`);
        } else {
          console.error(`Media file was not saved: ${localFilePath}`);
          throw new Error('Media file was not saved');
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
          fileSize: fileStats.size
        });

        // Update message with local file path (this will update the media_files table)
        await DatabaseService.updateMessageLocalFilePath(messageData.messageId, relativePath);

        console.log(`Media file info saved to database with path: ${relativePath}`);
      } catch (mediaError) {
        console.error('Error processing media:', mediaError);
        console.error('Media processing failed, continuing with text-only response');
        // Continue with text processing even if media fails
      }
    }

    // Check for calendar intent first (before general AI processing)
    if (messageData.messageType === 'text' && messageData.content) {
      try {
        console.log('Checking for calendar intent...');
        const calendarResult = await CalendarHandler.processMessage(
          businessId, 
          messageData.content, 
          messageData.from
        );
        
        if (calendarResult) {
          console.log('Calendar response generated:', calendarResult);
          
          // Save the calendar response to database
          await DatabaseService.saveMessage({
            businessId: businessId,
            conversationId: conversation.id,
            messageId: `calendar_${Date.now()}`,
            fromNumber: messageData.to, // From business
            toNumber: messageData.from, // To user
            messageType: 'text',
            content: calendarResult.message,
            mediaUrl: null,
            localFilePath: null,
            isFromUser: false
          });

          // Send the calendar response via WhatsApp
          try {
            const response = await WhatsAppService.sendTextMessage(messageData.from, calendarResult.message);
            console.log('Calendar response sent successfully:', response);
          } catch (whatsappError) {
            console.error('Error sending calendar response:', whatsappError);
          }
          
          return res.status(200).send('OK');
        }
      } catch (calendarError) {
        console.error('Error processing calendar message:', calendarError);
        // Continue with regular AI processing if calendar processing fails
      }
    }

    // Odoo integration detection and processing (PRIORITY - before FAQ detection)
    if (messageData.messageType === 'text' && messageData.content) {
      try {
        console.log('Checking for Odoo integration requests...');
        
        // Check for Odoo operations
        const odooOrderRequest = OpenAIService.detectOdooOrderRequest(messageData.content);
        const odooInvoiceRequest = OpenAIService.detectOdooInvoiceRequest(messageData.content);
        const odooLeadRequest = OpenAIService.detectOdooLeadRequest(messageData.content);
        const odooTicketRequest = OpenAIService.detectOdooTicketRequest(messageData.content);
        
        console.log('Odoo detection results:', {
          orderRequest: !!odooOrderRequest,
          invoiceRequest: !!odooInvoiceRequest,
          leadRequest: !!odooLeadRequest,
          ticketRequest: !!odooTicketRequest,
          message: messageData.content
        });
        
        // Handle Odoo order request
        if (odooOrderRequest && businessId && messageData.from) {
          try {
            console.log('Processing Odoo order request:', odooOrderRequest);
            const result = await OpenAIService.handleOdooOrder(businessId, odooOrderRequest, messageData.from);
            
            // Save the Odoo response to database
            await DatabaseService.saveMessage({
              businessId: businessId,
              conversationId: conversation.id,
              messageId: `odoo_${Date.now()}`,
              fromNumber: messageData.to, // From business
              toNumber: messageData.from, // To user
              messageType: 'text',
              content: result,
              mediaUrl: null,
              localFilePath: null,
              isFromUser: false
            });

            // Send the Odoo response via WhatsApp
            const response = await WhatsAppService.sendTextMessage(messageData.from, result);
            console.log('Odoo order response sent successfully:', response);
            
            return res.status(200).send('OK');
          } catch (error) {
            console.error('Error processing Odoo order:', error);
            const errorMessage = `❌ Sorry, I couldn't process your order. Please make sure Odoo integration is properly configured. Error: ${error.message}`;
            
            // Save error response to database
            await DatabaseService.saveMessage({
              businessId: businessId,
              conversationId: conversation.id,
              messageId: `odoo_error_${Date.now()}`,
              fromNumber: messageData.to,
              toNumber: messageData.from,
              messageType: 'text',
              content: errorMessage,
              mediaUrl: null,
              localFilePath: null,
              isFromUser: false
            });

            // Send error response via WhatsApp
            await WhatsAppService.sendTextMessage(messageData.from, errorMessage);
            return res.status(200).send('OK');
          }
        }
        
      } catch (odooError) {
        console.error('Error in Odoo processing:', odooError);
        // Continue with FAQ processing if Odoo processing fails
      }
    }

    // Enhanced FAQ intent detection and processing with embeddings (now happens after Odoo)
    if (messageData.messageType === 'text' && messageData.content) {
      try {
        console.log('Enhanced FAQ intent detection with embeddings...');
        
        // Use enhanced FAQ intent detection with embeddings
        const faqIntent = await OpenAIService.detectFAQIntentWithEmbeddings(messageData.content);
        
        if (faqIntent && faqIntent.isFAQ) {
          console.log('Enhanced FAQ intent detected:', faqIntent);
          
          // Search FAQs in Airtable with semantic search
          const faqMatch = await AirtableService.searchFAQs(businessId, messageData.content);
          
          if (faqMatch && (faqMatch.semanticSimilarity > 0.75 || faqMatch.matchScore > 0.3)) {
            console.log('Enhanced FAQ answer found:', faqMatch);
            
            // Store conversation embedding for context
            try {
              await EmbeddingsService.storeConversationEmbedding(
                businessId, 
                conversation.id, 
                `msg_${Date.now()}`, 
                messageData.content, 
                'user'
              );
            } catch (embeddingError) {
              console.error('Error storing conversation embedding:', embeddingError);
            }
            
            // Save the FAQ response to database
            await DatabaseService.saveMessage({
              businessId: businessId,
              conversationId: conversation.id,
              messageId: `faq_${Date.now()}`,
              fromNumber: messageData.to, // From business
              toNumber: messageData.from, // To user
              messageType: 'text',
              content: faqMatch.answer,
              mediaUrl: null,
              localFilePath: null,
              isFromUser: false
            });

            // Store FAQ response embedding
            try {
              await EmbeddingsService.storeConversationEmbedding(
                businessId, 
                conversation.id, 
                `faq_resp_${Date.now()}`, 
                faqMatch.answer, 
                'assistant'
              );
            } catch (embeddingError) {
              console.error('Error storing FAQ response embedding:', embeddingError);
            }

            // Send the FAQ response via WhatsApp
            try {
              const response = await WhatsAppService.sendTextMessage(messageData.from, faqMatch.answer);
              console.log('Enhanced FAQ response sent successfully:', response);
            } catch (whatsappError) {
              console.error('Error sending FAQ response:', whatsappError);
            }
            
            return res.status(200).send('OK');
          } else {
            console.log('No suitable FAQ match found with enhanced search, continuing with AI processing');
          }
        }
      } catch (faqError) {
        console.error('Error in enhanced FAQ processing:', faqError);
        // Continue with regular AI processing if FAQ processing fails
      }
    }

    // Enhanced AI response generation with embeddings
    try {
      console.log('Enhanced AI response generation with embeddings...');
      
      // Get conversation history for context
      const conversationHistory = await DatabaseService.getConversationHistory(conversation.id);
      
      // Use enhanced message processing with embeddings
      const enhancedResult = await OpenAIService.processMessageWithEmbeddings(
        messageData.messageType,
        messageData.content,
        messageData.localFilePath,
        conversationHistory,
        businessTone,
        businessId
      );

      let aiResponse;
      if (typeof enhancedResult === 'string') {
        aiResponse = enhancedResult;
      } else if (enhancedResult.response) {
        aiResponse = enhancedResult.response;
      } else {
        aiResponse = enhancedResult;
      }

      console.log('Enhanced AI response generated:', aiResponse.substring(0, 100) + '...');
    } catch (aiError) {
      console.error('Error generating AI response:', aiError);
      aiResponse = 'Sorry, I encountered an error processing your message. Please try again.';
    }

    // Only proceed with sending response if we have a valid AI response
    if (!aiResponse || aiResponse.trim() === '') {
      console.log('No AI response generated, skipping WhatsApp response');
      return res.status(200).send('OK');
    }

    // Save AI response to database
    await DatabaseService.saveMessage({
      businessId: businessId,
      conversationId: conversation.id,
      messageId: `ai_${Date.now()}`,
      fromNumber: messageData.to, // From business
      toNumber: messageData.from, // To user
      messageType: 'text',
      content: aiResponse,
      mediaUrl: null,
      localFilePath: null,
      isFromUser: false
    });

    // Send WhatsApp response
    try {
      const response = await WhatsAppService.sendTextMessage(messageData.from, aiResponse);
      console.log('WhatsApp response sent successfully:', response);
    } catch (whatsappError) {
      console.error('Error sending WhatsApp response:', whatsappError);
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).send('Internal Server Error');
  }
});

module.exports = router;