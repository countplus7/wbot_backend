const { google } = require('googleapis');
const pool = require('../config/database');

class GoogleService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Define the scopes we need for Google Workspace integration
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];
  }

  /**
   * Generate OAuth2 authorization URL
   * @param {number} businessId - The business ID to associate with the integration
   * @returns {string} Authorization URL
   */
  getAuthUrl(businessId) {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
      state: JSON.stringify({ businessId })
    });
    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   * @param {string} code - Authorization code from OAuth callback
   * @param {number} businessId - Business ID from state parameter
   * @returns {Object} Token information
   */
  async exchangeCodeForTokens(code, businessId) {
    try {
      const { tokens } = await this.oauth2Client.getAccessToken(code);
      
      // Set credentials to get user info
      this.oauth2Client.setCredentials(tokens);
      
      // Get user info to store email
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      const integrationData = {
        business_id: businessId,
        provider: 'google',
        email: userInfo.data.email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null
      };

      // Store integration in database
      await this.saveIntegration(integrationData);
      
      return {
        success: true,
        email: userInfo.data.email,
        tokens
      };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  /**
   * Save Google Workspace integration to database
   * @param {Object} integrationData - Integration data to save
   */
  async saveIntegration(integrationData) {
    try {
      const query = `
        INSERT INTO google_workspace_integrations 
        (business_id, provider, email, refresh_token, access_token, expiry_date, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (business_id, provider, email) 
        DO UPDATE SET 
          refresh_token = EXCLUDED.refresh_token,
          access_token = EXCLUDED.access_token,
          expiry_date = EXCLUDED.expiry_date,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;
      
      const values = [
        integrationData.business_id,
        integrationData.provider,
        integrationData.email,
        integrationData.refresh_token,
        integrationData.access_token,
        integrationData.expiry_date
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error saving Google integration:', error);
      throw new Error('Failed to save Google integration');
    }
  }

  /**
   * Get Google Workspace integration for a business
   * @param {number} businessId - Business ID
   * @returns {Object|null} Integration data or null if not found
   */
  async getIntegration(businessId) {
    try {
      const query = `
        SELECT * FROM google_workspace_integrations 
        WHERE business_id = $1 AND provider = 'google'
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      
      const result = await pool.query(query, [businessId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting Google integration:', error);
      throw new Error('Failed to get Google integration');
    }
  }

  /**
   * Get authenticated OAuth2 client for a business
   * @param {number} businessId - Business ID
   * @returns {Object} Authenticated OAuth2 client
   */
  async getAuthenticatedClient(businessId) {
    const integration = await this.getIntegration(businessId);
    if (!integration) {
      throw new Error('No Google integration found for this business');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      expiry_date: integration.expiry_date
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        integration.refresh_token = tokens.refresh_token;
      }
      if (tokens.access_token) {
        integration.access_token = tokens.access_token;
      }
      if (tokens.expiry_date) {
        integration.expiry_date = new Date(tokens.expiry_date);
      }
      
      // Update tokens in database
      await this.saveIntegration(integration);
    });

    return oauth2Client;
  }

  /**
   * Remove Google Workspace integration
   * @param {number} businessId - Business ID
   */
  async removeIntegration(businessId) {
    try {
      const query = `
        DELETE FROM google_workspace_integrations 
        WHERE business_id = $1 AND provider = 'google'
      `;
      
      await pool.query(query, [businessId]);
      return { success: true };
    } catch (error) {
      console.error('Error removing Google integration:', error);
      throw new Error('Failed to remove Google integration');
    }
  }

  /**
   * Check if business has Google Workspace integration
   * @param {number} businessId - Business ID
   * @returns {boolean} True if integrated, false otherwise
   */
  async isIntegrated(businessId) {
    const integration = await this.getIntegration(businessId);
    return !!integration;
  }

  // Gmail integration methods
  async getGmailService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.gmail({ version: 'v1', auth });
  }

  async sendEmail(businessId, { to, subject, body, isHtml = false }) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
        '',
        body
      ].join('\n');

      const encodedEmail = Buffer.from(email).toString('base64url');
      
      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      return result.data;
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email via Gmail');
    }
  }

  // Calendar integration methods
  async getCalendarService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.calendar({ version: 'v3', auth });
  }

  async createCalendarEvent(businessId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const event = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        attendees: eventData.attendees?.map(email => ({ email })) || []
      };

      const result = await calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });

      return result.data;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw new Error('Failed to create calendar event');
    }
  }

  // Sheets integration methods
  async getSheetsService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.sheets({ version: 'v4', auth });
  }

  async readSheet(businessId, spreadsheetId, range) {
    try {
      const sheets = await this.getSheetsService(businessId);
      
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      return result.data.values || [];
    } catch (error) {
      console.error('Error reading sheet:', error);
      throw new Error('Failed to read Google Sheet');
    }
  }

  async writeSheet(businessId, spreadsheetId, range, values) {
    try {
      const sheets = await this.getSheetsService(businessId);
      
      const result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values
        }
      });

      return result.data;
    } catch (error) {
      console.error('Error writing to sheet:', error);
      throw new Error('Failed to write to Google Sheet');
    }
  }

  // Drive integration methods
  async getDriveService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.drive({ version: 'v3', auth });
  }

  async listFiles(businessId, query = '', maxResults = 10) {
    try {
      const drive = await this.getDriveService(businessId);
      
      const result = await drive.files.list({
        q: query,
        pageSize: maxResults,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)'
      });

      return result.data.files || [];
    } catch (error) {
      console.error('Error listing files:', error);
      throw new Error('Failed to list Google Drive files');
    }
  }

  async downloadFile(businessId, fileId) {
    try {
      const drive = await this.getDriveService(businessId);
      
      const result = await drive.files.get({
        fileId,
        alt: 'media'
      });

      return result.data;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw new Error('Failed to download Google Drive file');
    }
  }
}

module.exports = new GoogleService(); 