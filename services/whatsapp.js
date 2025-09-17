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

  async downloadMedia(mediaId, retries = 3) {
    try {
      if (!this.accessToken) {
        throw new Error('WhatsApp configuration not set. Please set business config first.');
      }

      console.log(`Downloading media with ID: ${mediaId} (attempt ${4 - retries}/3)`);

      // First, get media metadata
      const response = await axios.get(
        `${this.baseURL}/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          },
          timeout: 10000 // 10 second timeout
        }
      );

      const mediaUrl = response.data.url;
      const mimeType = response.data.mime_type;
      const fileSize = response.data.file_size;
      
      console.log(`Media metadata - URL: ${mediaUrl}, MIME: ${mimeType}, Size: ${fileSize} bytes`);

      if (!mediaUrl) {
        throw new Error('No media URL returned from WhatsApp');
      }

      // Download the actual media file
      const mediaResponse = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        },
        responseType: 'stream',
        timeout: 30000, // 30 second timeout for media download
        maxContentLength: 50 * 1024 * 1024, // 50MB max file size
        maxBodyLength: 50 * 1024 * 1024
      });

      console.log(`Media download successful for ID: ${mediaId}`);

      return {
        stream: mediaResponse.data,
        mimeType: mimeType,
        url: mediaUrl,
        fileSize: fileSize
      };
    } catch (error) {
      console.error(`Error downloading media (attempt ${4 - retries}/3):`, error.response?.data || error.message);
      
      if (this.isTokenExpiredError(error)) {
        console.error(' WHATSAPP ACCESS TOKEN HAS EXPIRED! ');
        console.error('Please update the access token in your WhatsApp configuration.');
        throw new Error('WhatsApp access token has expired. Please update the token in your business configuration.');
      }
      
      // Check for specific WhatsApp error codes
      if (error.response?.data?.error) {
        const errorCode = error.response.data.error.code;
        const errorMessage = error.response.data.error.message;
        
        if (errorCode === 131052) {
          console.error('WhatsApp media download error (131052): Failed to download incoming media due to internal error');
          if (retries > 0) {
            console.log(`Retrying media download in 2 seconds... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return this.downloadMedia(mediaId, retries - 1);
          } else {
            throw new Error('WhatsApp media download failed after 3 attempts. This may be a temporary WhatsApp server issue.');
          }
        } else if (errorCode === 131026) {
          throw new Error('Media file not found or expired on WhatsApp servers');
        } else if (errorCode === 131000) {
          throw new Error('Invalid media ID provided');
        }
      }
      
      // Handle timeout errors
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error('Media download timeout');
        if (retries > 0) {
          console.log(`Retrying media download due to timeout... (${retries} attempts remaining)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.downloadMedia(mediaId, retries - 1);
        } else {
          throw new Error('Media download timeout after 3 attempts');
        }
      }
      
      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('Network error during media download');
        if (retries > 0) {
          console.log(`Retrying media download due to network error... (${retries} attempts remaining)`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          return this.downloadMedia(mediaId, retries - 1);
        } else {
          throw new Error('Network error during media download after 3 attempts');
        }
      }
      
      throw new Error(`Failed to download media from WhatsApp: ${error.message}`);
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

  // Calendar Integration Response Methods

  /**
   * Send calendar availability response
   */
  async sendAvailabilityResponse(to, availability, timeSlot) {
    try {
      let message;
      
      if (availability.isAvailable) {
        message = `✅ Great! I'm available ${timeSlot}.\n\nWould you like to book this appointment? Reply "YES" to confirm or "NO" to cancel.`;
      } else {
        const conflicts = availability.conflictingEvents.length;
        message = `❌ Sorry, I'm not available ${timeSlot}.\n\nI have ${conflicts} conflicting appointment${conflicts > 1 ? 's' : ''} at that time.\n\nWould you like me to suggest alternative times? Reply "YES" for suggestions.`;
      }

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending availability response:', error);
      throw error;
    }
  }

  /**
   * Send available time slots
   */
  async sendAvailableSlots(to, date, availableSlots) {
    try {
      if (availableSlots.length === 0) {
        return await this.sendTextMessage(to, `❌ No available slots found for ${date}.\n\nWould you like me to check another date?`);
      }

      let message = `📅 Available time slots for ${date}:\n\n`;
      
      availableSlots.slice(0, 5).forEach((slot, index) => {
        const startTime = new Date(slot.start).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        const endTime = new Date(slot.end).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        
        message += `${index + 1}. ${startTime} - ${endTime}\n`;
      });

      if (availableSlots.length > 5) {
        message += `\n... and ${availableSlots.length - 5} more slots available.\n`;
      }

      message += `\nReply with the number (1-${Math.min(availableSlots.length, 5)}) to book that slot, or "MORE" to see additional times.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending available slots:', error);
      throw error;
    }
  }

  /**
   * Send appointment confirmation
   */
  async sendAppointmentConfirmation(to, event, meetingLink = null) {
    try {
      const startTime = new Date(event.start.dateTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let message = `✅ Appointment Confirmed!\n\n`;
      message += ` Date & Time: ${startTime}\n`;
      message += `📝 Title: ${event.summary}\n`;
      
      if (event.description) {
        message += `📋 Description: ${event.description}\n`;
      }
      
      if (event.location) {
        message += `📍 Location: ${event.location}\n`;
      }

      if (meetingLink) {
        message += ` Meeting Link: ${meetingLink}\n`;
      }

      message += `\n⏰ You'll receive a reminder 30 minutes before your appointment.`;
      message += `\n\nReply "CANCEL" if you need to reschedule or cancel.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending appointment confirmation:', error);
      throw error;
    }
  }

  /**
   * Send reminder notification
   */
  async sendReminder(to, reminder) {
    try {
      const reminderTime = new Date(reminder.start.dateTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let message = `⏰ Reminder: ${reminder.summary}\n\n`;
      message += ` Scheduled for: ${reminderTime}\n`;
      
      if (reminder.description) {
        message += `📋 Details: ${reminder.description}\n`;
      }

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending reminder:', error);
      throw error;
    }
  }

  /**
   * Send day schedule summary
   */
  async sendDaySchedule(to, schedule) {
    try {
      const { date, events, summary } = schedule;
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      let message = ` Your schedule for ${formattedDate}:\n\n`;
      message += `📊 Summary:\n`;
      message += `• Total appointments: ${summary.totalEvents}\n`;
      message += `• Busy time: ${summary.totalBusyMinutes} minutes\n`;
      message += `• Free time: ${summary.totalFreeMinutes} minutes\n`;
      message += `• Busy percentage: ${summary.busyPercentage}%\n\n`;

      if (events.length > 0) {
        message += ` Appointments:\n`;
        events.slice(0, 5).forEach((event, index) => {
          const startTime = new Date(event.start.dateTime).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          message += `${index + 1}. ${startTime} - ${event.summary}\n`;
        });

        if (events.length > 5) {
          message += `\n... and ${events.length - 5} more appointments.`;
        }
      } else {
        message += `🎉 No appointments scheduled for this day!`;
      }

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending day schedule:', error);
      throw error;
    }
  }

  /**
   * Send next available slot information
   */
  async sendNextAvailableSlot(to, nextSlot) {
    try {
      if (!nextSlot.nextSlot) {
        return await this.sendTextMessage(to, `❌ ${nextSlot.message || 'No available slots found in the next 30 days.'}`);
      }

      const { date, nextSlot: slot } = nextSlot;
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const startTime = new Date(slot.start).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const endTime = new Date(slot.end).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const message = ` Next Available Appointment:\n\n`;
      message += ` Date: ${formattedDate}\n`;
      message += `⏰ Time: ${startTime} - ${endTime}\n`;
      message += `⏱️ Duration: ${slot.duration} minutes\n\n`;
      message += `Would you like to book this slot? Reply "YES" to confirm.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending next available slot:', error);
      throw error;
    }
  }

  /**
   * Send appointment cancellation confirmation
   */
  async sendCancellationConfirmation(to, eventTitle, eventTime) {
    try {
      const formattedTime = new Date(eventTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const message = `✅ Appointment Cancelled\n\n`;
      message += `📝 Title: ${eventTitle}\n`;
      message += `📅 Time: ${formattedTime}\n\n`;
      message += `Your appointment has been successfully cancelled.`;
      message += `\n\nReply "BOOK" if you'd like to schedule a new appointment.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending cancellation confirmation:', error);
      throw error;
    }
  }

  /**
   * Send error message for calendar operations
   */
  async sendCalendarError(to, errorMessage) {
    try {
      const message = `❌ Calendar Error\n\n`;
      message += `${errorMessage}\n\n`;
      message += `Please try again or contact support if the issue persists.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending calendar error message:', error);
      throw error;
    }
  }

  /**
   * Send meeting confirmation with Google Meet link
   */
  async sendMeetingConfirmation(to, event, meetingLink) {
    try {
      const startTime = new Date(event.start.dateTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let message = `✅ Meeting Scheduled!\n\n`;
      message += ` Date & Time: ${startTime}\n`;
      message += `📝 Title: ${event.summary}\n`;
      
      if (event.description) {
        message += `📋 Description: ${event.description}\n`;
      }

      if (meetingLink) {
        message += `🔗 Google Meet Link: ${meetingLink}\n`;
      }

      if (event.attendees && event.attendees.length > 0) {
        message += ` Attendees: ${event.attendees.map(a => a.email).join(', ')}\n`;
      }

      message += `\n⏰ You'll receive a reminder 10 minutes before the meeting.`;
      message += `\n\nReply "CANCEL" if you need to reschedule or cancel.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending meeting confirmation:', error);
      throw error;
    }
  }

  /**
   * Send reminder confirmation
   */
  async sendReminderConfirmation(to, reminder) {
    try {
      const reminderTime = new Date(reminder.start.dateTime).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      let message = `✅ Reminder Set!\n\n`;
      message += `📝 Title: ${reminder.summary}\n`;
      message += `⏰ Time: ${reminderTime}\n`;
      
      if (reminder.description) {
        message += `📋 Details: ${reminder.description}\n`;
      }

      message += `\nYou'll receive a notification at the scheduled time.`;
      message += `\n\nReply "CANCEL" if you need to remove this reminder.`;

      return await this.sendTextMessage(to, message);
    } catch (error) {
      console.error('Error sending reminder confirmation:', error);
      throw error;
    }
  }
}

module.exports = new WhatsAppService(); 