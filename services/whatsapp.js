require("dotenv").config();
const axios = require("axios");
const fs = require("fs");

class WhatsAppService {
  constructor() {
    this.baseURL = "https://graph.facebook.com/v18.0";
  }

  /**
   * Sanitize and validate access token
   * @param {string} token - The access token to sanitize
   * @returns {string} Sanitized token
   */
  sanitizeAccessToken(token) {
    if (!token) {
      throw new Error("Access token is required");
    }
    
    // Remove any whitespace, newlines, or control characters
    const sanitized = token.toString().trim().replace(/[\r\n\t\f\v]/g, '');
    
    // Validate token format (should be alphanumeric with some special chars)
    if (!/^[A-Za-z0-9\-_\.]+$/.test(sanitized)) {
      console.warn("Access token contains unexpected characters, attempting to clean...");
      // Remove any non-printable characters except valid token characters
      return sanitized.replace(/[^\x20-\x7E]/g, '');
    }
    
    return sanitized;
  }

  /**
   * Set configuration for a specific business
   * @param {Object} config - Business WhatsApp configuration
   * @param {string} config.phone_number_id - WhatsApp phone number ID
   * @param {string} config.access_token - WhatsApp access token
   * @param {string} config.verify_token - Webhook verification token
   */
  setBusinessConfig(config) {
    this.phoneNumberId = config.phone_number_id;
    this.accessToken = this.sanitizeAccessToken(config.access_token);
    this.verifyToken = config.verify_token;
    
    // Log token info for debugging (without exposing the actual token)
    console.log(`WhatsApp config set - Phone ID: ${this.phoneNumberId}, Token length: ${this.accessToken.length}`);
  }

  /**
   * Check if error is due to expired token
   * @param {Error} error - The error to check
   * @returns {boolean} True if token is expired
   */
  isTokenExpiredError(error) {
    const errorData = error.response?.data?.error;
    return (
      errorData &&
      (errorData.code === 190 ||
        errorData.type === "OAuthException" ||
        (errorData.message && errorData.message.includes("Session has expired")))
    );
  }

  /**
   * Send a text message via WhatsApp
   * @param {string} to - Recipient phone number
   * @param {string} text - Message text
   * @returns {Promise<Object>} WhatsApp API response
   */
  async sendTextMessage(to, text) {
    try {
      if (!this.phoneNumberId || !this.accessToken) {
        throw new Error("WhatsApp configuration not set. Please set business config first.");
      }

      // Ensure token is still sanitized
      const cleanToken = this.sanitizeAccessToken(this.accessToken);

      const response = await axios.post(
        `${this.baseURL}/${this.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: {
            body: text,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Error sending text message:", error.response?.data || error.message);

      if (this.isTokenExpiredError(error)) {
        console.error(" WHATSAPP ACCESS TOKEN HAS EXPIRED! ");
        console.error("Please update the access token in your WhatsApp configuration.");
        console.error("You can get a new token from: https://developers.facebook.com/apps/");
        throw new Error("WhatsApp access token has expired. Please update the token in your business configuration.");
      }

      throw new Error("Failed to send WhatsApp message");
    }
  }

  /**
   * Send a message (alias for sendTextMessage for backward compatibility)
   * @param {string} to - Recipient phone number
   * @param {string} text - Message text
   * @returns {Promise<Object>} WhatsApp API response
   */
  async sendMessage(to, text) {
    return this.sendTextMessage(to, text);
  }

  /**
   * Download media from WhatsApp using media ID
   * @param {string} mediaId - WhatsApp media ID
   * @param {number} retries - Number of retry attempts
   * @returns {Promise<Object>} Media data with buffer and metadata
   */

  async downloadMedia(mediaId, retries = 3) {
    try {
      console.log(`[DEBUG] Starting media download for ID: ${mediaId}`);

      if (!this.accessToken) {
        console.error("[DEBUG] No access token available");
        throw new Error("WhatsApp configuration not set. Please set business config first.");
      }

      console.log(`[DEBUG] Getting media URL from: ${this.baseURL}/${mediaId}`);

      // Get media URL from WhatsApp
      const mediaResponse = await axios.get(`${this.baseURL}/${mediaId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      console.log(`[DEBUG] Media URL response:`, JSON.stringify(mediaResponse.data, null, 2));

      const mediaUrl = mediaResponse.data.url;
      if (!mediaUrl) {
        console.error("[DEBUG] No media URL found in response");
        throw new Error("No media URL found in response");
      }

      console.log(`[DEBUG] Downloading media from URL: ${mediaUrl}`);

      // Download the actual media file as a stream
      const downloadResponse = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        responseType: "stream",
      });

      // Extract content type from response headers
      const contentType = downloadResponse.headers["content-type"];
      const contentLength = downloadResponse.headers["content-length"];

      console.log(`[DEBUG] Downloaded media - Content Type: ${contentType}, Size: ${contentLength}`);

      const result = {
        stream: downloadResponse.data,
        mimeType: contentType,
        fileSize: contentLength ? parseInt(contentLength) : undefined,
        contentType: contentType,
        size: contentLength ? parseInt(contentLength) : undefined,
      };

      console.log(`[DEBUG] Returning media data - Type: ${contentType}, Size: ${contentLength}`);
      return result;
    } catch (error) {
      console.error("[DEBUG] Error downloading media:", error.response?.data || error.message);
      console.error("[DEBUG] Full error:", error);

      if (retries > 0) {
        console.log(`[DEBUG] Retrying media download... ${retries} attempts left`);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
        return this.downloadMedia(mediaId, retries - 1);
      }

      throw new Error("Failed to download media from WhatsApp");
    }
  }

  /**
   * Process incoming webhook message from WhatsApp
   * @param {Object} body - Webhook request body
   * @returns {Promise<Object|null>} Processed message data or null if no message
   */
  async processIncomingMessage(body) {
    try {
      console.log("Processing webhook body:", JSON.stringify(body, null, 2));

      // Check if this is a valid WhatsApp Business Account webhook
      if (body.object !== "whatsapp_business_account") {
        throw new Error("Invalid webhook structure: not a WhatsApp Business Account webhook");
      }

      const entry = body.entry?.[0];
      if (!entry) {
        throw new Error("No entry found in webhook body");
      }

      const changes = entry.changes?.[0];
      if (!changes || !changes.value) {
        throw new Error("Invalid webhook structure: no changes or value found");
      }

      // Extract phone number ID from webhook metadata
      const phoneNumberId = changes.value.metadata?.phone_number_id;
      if (!phoneNumberId) {
        throw new Error("No phone number ID found in webhook metadata");
      }

      const messages = changes.value.messages;
      if (!messages || messages.length === 0) {
        console.log("No messages found in webhook, this might be a status update");
        return null; // No messages to process
      }

      const message = messages[0];
      const from = message.from;
      const timestamp = message.timestamp;
      const messageId = message.id;

      let messageType = "text";
      let content = "";
      let mediaUrl = null;
      let mediaId = null;

      // Determine message type and extract content
      if (message.text) {
        messageType = "text";
        content = message.text.body;
      } else if (message.image) {
        messageType = "image";
        content = message.image.caption || "";
        mediaId = message.image.id;
        // For images, we don't get a direct URL - we need to download using the media ID
        mediaUrl = null;
      } else if (message.audio) {
        messageType = "audio";
        mediaId = message.audio.id;
        mediaUrl = message.audio.url;
      } else if (message.document) {
        messageType = "document";
        content = message.document.caption || "";
        mediaId = message.document.id;
        mediaUrl = message.document.url;
      } else {
        messageType = "unknown";
        content = "Unsupported message type";
      }

      return {
        from,
        to: phoneNumberId, // Use the phone number ID from webhook metadata
        messageId,
        messageType,
        content,
        mediaId,
        mediaUrl,
        timestamp,
      };
    } catch (error) {
      console.error("Error processing incoming message:", error);
      throw error;
    }
  }
}

module.exports = new WhatsAppService();
