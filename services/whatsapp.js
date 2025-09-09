require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class WhatsAppService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v18.0';
  }

  // Set configuration for a specific business
  setBusinessConfig(config) {
    this.phoneNumberId = config.phone_number_id;
    this.accessToken = config.access_token;
    this.verifyToken = config.verify_token;
  }

  // Check if error is due to expired token
  isTokenExpiredError(error) {
    const errorData = error.response?.data?.error;
    return errorData && (
      errorData.code === 190 || 
      errorData.type === 'OAuthException' ||
      (errorData.message && errorData.message.includes('Session has expired'))
    );
  }

  async sendTextMessage(to, text) {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        throw new Error('WhatsApp configuration not set. Please set business config first.');
      }

      const response = await axios.post(
        `${this.baseURL}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: text
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error sending text message:', error.response?.data || error.message);
      
      if (this.isTokenExpiredError(error)) {
        console.error(' WHATSAPP ACCESS TOKEN HAS EXPIRED! ');
        console.error('Please update the access token in your WhatsApp configuration.');
        console.error('You can get a new token from: https://developers.facebook.com/apps/');
        throw new Error('WhatsApp access token has expired. Please update the token in your business configuration.');
      }
      
      throw new Error('Failed to send WhatsApp message');
    }
  }

  async sendImageMessage(to, imageUrl, caption = '') {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        throw new Error('WhatsApp configuration not set. Please set business config first.');
      }

      const response = await axios.post(
        `${this.baseURL}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'image',
          image: {
            link: imageUrl,
            caption: caption
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error sending image message:', error.response?.data || error.message);
      
      if (this.isTokenExpiredError(error)) {
        console.error(' WHATSAPP ACCESS TOKEN HAS EXPIRED! ');
        console.error('Please update the access token in your WhatsApp configuration.');
        throw new Error('WhatsApp access token has expired. Please update the token in your business configuration.');
      }
      
      throw new Error('Failed to send WhatsApp image message');
    }
  }

  async sendAudioMessage(to, audioUrl) {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        throw new Error('WhatsApp configuration not set. Please set business config first.');
      }

      const response = await axios.post(
        `${this.baseURL}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'audio',
          audio: {
            link: audioUrl
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error sending audio message:', error.response?.data || error.message);
      
      if (this.isTokenExpiredError(error)) {
        console.error(' WHATSAPP ACCESS TOKEN HAS EXPIRED! ');
        console.error('Please update the access token in your WhatsApp configuration.');
        throw new Error('WhatsApp access token has expired. Please update the token in your business configuration.');
      }
      
      throw new Error('Failed to send WhatsApp audio message');
    }
  }

  async downloadMedia(mediaId) {
    try {
      if (!this.accessToken) {
        throw new Error('WhatsApp configuration not set. Please set business config first.');
      }

      const response = await axios.get(
        `${this.baseURL}/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      const mediaUrl = response.data.url;
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        responseType: 'stream'
      });

      return mediaResponse.data;
    } catch (error) {
      console.error('Error downloading media:', error.response?.data || error.message);
      
      if (this.isTokenExpiredError(error)) {
        console.error(' WHATSAPP ACCESS TOKEN HAS EXPIRED! ');
        console.error('Please update the access token in your WhatsApp configuration.');
        throw new Error('WhatsApp access token has expired. Please update the token in your business configuration.');
      }
      
      throw new Error('Failed to download media from WhatsApp');
    }
  }

  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.verifyToken) {
      console.log('Webhook verified successfully');
      return challenge;
    } else {
      console.log('Webhook verification failed');
      return null;
    }
  }

  async processIncomingMessage(body) {
    try {
      console.log('Processing webhook body:', JSON.stringify(body, null, 2));
      
      // Check if this is a valid WhatsApp Business Account webhook
      if (body.object !== 'whatsapp_business_account') {
        throw new Error('Invalid webhook structure: not a WhatsApp Business Account webhook');
      }

      const entry = body.entry?.[0];
      if (!entry) {
        throw new Error('No entry found in webhook body');
      }

      const changes = entry.changes?.[0];
      if (!changes || !changes.value) {
        throw new Error('Invalid webhook structure: no changes or value found');
      }

      // Extract phone number ID from webhook metadata
      const phoneNumberId = changes.value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        throw new Error('No phone number ID found in webhook metadata');
      }

      const messages = changes.value.messages;
      if (!messages || messages.length === 0) {
        console.log('No messages found in webhook, this might be a status update');
        return null; // No messages to process
      }

      const message = messages[0];
      const from = message.from;
      const timestamp = message.timestamp;
      const messageId = message.id;

      let messageType = 'text';
      let content = '';
      let mediaUrl = null;
      let mediaId = null;

      // Determine message type and extract content
      if (message.text) {
        messageType = 'text';
        content = message.text.body;
      } else if (message.image) {
        messageType = 'image';
        content = message.image.caption || '';
        mediaId = message.image.id;
        // For images, we don't get a direct URL - we need to download using the media ID
        mediaUrl = null;
      } else if (message.audio) {
        messageType = 'audio';
        mediaId = message.audio.id;
        mediaUrl = message.audio.url;
      } else if (message.document) {
        messageType = 'document';
        content = message.document.caption || '';
        mediaId = message.document.id;
        mediaUrl = message.document.url;
      } else {
        messageType = 'unknown';
        content = 'Unsupported message type';
      }

      return {
        from,
        to: phoneNumberId, // Use the phone number ID from webhook metadata
        messageId,
        messageType,
        content,
        mediaId,
        mediaUrl,
        timestamp
      };
    } catch (error) {
      console.error('Error processing incoming message:', error);
      throw error;
    }
  }
}

module.exports = new WhatsAppService(); 