const { google } = require("googleapis");
const pool = require("../config/database");

class GoogleService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Define the scopes we need for Google Workspace integration
    this.scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];
  }

  /**
   * Generate OAuth2 authorization URL
   * @param {number} businessId - The business ID to associate with the integration
   * @returns {string} Authorization URL
   */
  getAuthUrl(businessId) {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: this.scopes,
      prompt: "consent",
      state: JSON.stringify({ businessId }),
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
      const { tokens } = await this.oauth2Client.getToken(code);

      // Set the credentials for the OAuth2 client
      this.oauth2Client.setCredentials(tokens);

      // Get user info to get email
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const integrationData = {
        business_id: businessId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      };

      // Store integration in database
      await this.saveIntegration(integrationData);

      return {
        success: true,
        email: userInfo.data.email,
        tokens,
      };
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      throw new Error("Failed to exchange authorization code for tokens");
    }
  }

  /**
   * Save Google Workspace integration to database
   * @param {Object} integrationData - Integration data to save
   * @returns {Promise<Object>} Saved integration data
   */
  async saveIntegration(integrationData) {
    try {
      const query = `
        INSERT INTO google_workspace_integrations 
        (business_id, access_token, refresh_token, token_expires_at, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (business_id) 
        DO UPDATE SET 
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          token_expires_at = EXCLUDED.token_expires_at,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;

      const values = [
        integrationData.business_id,
        integrationData.access_token,
        integrationData.refresh_token,
        integrationData.token_expires_at,
      ];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving Google integration:", error);
      throw new Error("Failed to save Google integration");
    }
  }

  /**
   * Get Google Workspace integration for a business
   * @param {number} businessId - Business ID
   * @returns {Promise<Object|null>} Integration data or null if not found
   */
  async getIntegration(businessId) {
    try {
      const query = `
        SELECT * FROM google_workspace_integrations 
        WHERE business_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [businessId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting Google integration:", error);
      throw new Error("Failed to get Google integration");
    }
  }

  /**
   * Get user info from Google API
   * @param {number} businessId - Business ID
   * @returns {Object} User info
   */
  async getUserInfo(businessId) {
    try {
      const integration = await this.getIntegration(businessId);
      if (!integration) {
        throw new Error("No Google integration found");
      }

      // Set credentials from stored tokens
      this.oauth2Client.setCredentials({
        access_token: integration.access_token,
        refresh_token: integration.refresh_token,
      });

      // Get user info
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      return userInfo.data;
    } catch (error) {
      console.error("Error getting user info:", error);
      throw new Error("Failed to get user info");
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
      throw new Error("No Google integration found for this business");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.refresh_token) {
        integration.refresh_token = tokens.refresh_token;
      }
      integration.access_token = tokens.access_token;
      integration.expiry_date = tokens.expiry_date;

      await this.saveIntegration(integration);
    });

    return oauth2Client;
  }

  /**
   * Remove Google Workspace integration for a business
   * @param {number} businessId - Business ID
   * @returns {Promise<boolean>} Success status
   */
  async removeIntegration(businessId) {
    try {
      const result = await pool.query("DELETE FROM google_workspace_integrations WHERE business_id = $1", [businessId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error removing integration:", error);
      throw new Error("Failed to remove Google Workspace integration");
    }
  }

  /**
   * Check if business has Google Workspace integration
   * @param {number} businessId - Business ID
   * @returns {Promise<boolean>} Integration status
   */
  async isIntegrated(businessId) {
    const integration = await this.getIntegration(businessId);
    return integration !== null;
  }

  /**
   * Get Gmail service instance
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Gmail service instance
   */
  async getGmailService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.gmail({ version: "v1", auth });
  }

  /**
   * Send email via Gmail
   * @param {number} businessId - Business ID
   * @param {Object} emailData - Email data
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.body - Email body
   * @param {boolean} emailData.isHtml - Whether body is HTML
   * @returns {Promise<Object>} Email send result
   */
  async sendEmail(businessId, { to, subject, body, isHtml = false }) {
    try {
      const gmail = await this.getGmailService(businessId);

      const message = {
        to: to,
        subject: subject,
        body: body,
        isHtml: isHtml,
      };

      const raw = this.createEmailMessage(message);
      const result = await gmail.users.messages.send({
        userId: "me",
        resource: {
          raw: raw,
        },
      });

      return result.data;
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email via Gmail");
    }
  }

  /**
   * Create email message in Gmail format
   * @param {Object} message - Message data
   * @returns {string} Base64 encoded email message
   */
  createEmailMessage(message) {
    const { to, subject, body, isHtml } = message;

    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
      `MIME-Version: 1.0`,
    ].join("\r\n");

    const email = `${headers}\r\n\r\n${body}`;
    return Buffer.from(email).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /**
   * Get Calendar service instance
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Calendar service instance
   */
  async getCalendarService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.calendar({ version: "v3", auth });
  }

  /**
   * Create calendar event
   * @param {number} businessId - Business ID
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Created event
   */
  async createCalendarEvent(businessId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const event = {
        summary: eventData.title || eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime || eventData.start?.dateTime,
          timeZone: eventData.timeZone || "UTC",
        },
        end: {
          dateTime: eventData.endTime || eventData.end?.dateTime,
          timeZone: eventData.timeZone || "UTC",
        },
        attendees: eventData.attendees || [],
        location: eventData.location,
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 10 },
          ],
        },
      };

      const result = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });

      return result.data;
    } catch (error) {
      console.error("Error creating calendar event:", error);
      throw new Error("Failed to create calendar event");
    }
  }

  /**
   * Get calendar events
   * @param {number} businessId - Business ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Calendar events
   */
  async getCalendarEvents(businessId, options = {}) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const params = {
        calendarId: "primary",
        timeMin: options.startDate || new Date().toISOString(),
        timeMax: options.endDate,
        maxResults: options.limit || 10,
        singleEvents: true,
        orderBy: "startTime",
      };

      const result = await calendar.events.list(params);
      return result.data.items || [];
    } catch (error) {
      console.error("Error getting calendar events:", error);
      throw new Error("Failed to get calendar events");
    }
  }

  /**
   * Get upcoming events
   * @param {number} businessId - Business ID
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array>} Upcoming events
   */
  async getUpcomingEvents(businessId, maxResults = 10) {
    return this.getCalendarEvents(businessId, { limit: maxResults });
  }

  /**
   * Get event by ID
   * @param {number} businessId - Business ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Event data
   */
  async getEventById(businessId, eventId) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const result = await calendar.events.get({
        calendarId: "primary",
        eventId: eventId,
      });

      return result.data;
    } catch (error) {
      console.error("Error getting event by ID:", error);
      throw new Error("Failed to get event by ID");
    }
  }

  /**
   * Update calendar event
   * @param {number} businessId - Business ID
   * @param {string} eventId - Event ID
   * @param {Object} eventData - Updated event data
   * @returns {Promise<Object>} Updated event
   */
  async updateCalendarEvent(businessId, eventId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const event = {
        summary: eventData.title || eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime || eventData.start?.dateTime,
          timeZone: eventData.timeZone || "UTC",
        },
        end: {
          dateTime: eventData.endTime || eventData.end?.dateTime,
          timeZone: eventData.timeZone || "UTC",
        },
        attendees: eventData.attendees || [],
        location: eventData.location,
      };

      const result = await calendar.events.update({
        calendarId: "primary",
        eventId: eventId,
        resource: event,
      });

      return result.data;
    } catch (error) {
      console.error("Error updating calendar event:", error);
      throw new Error("Failed to update calendar event");
    }
  }

  /**
   * Delete calendar event
   * @param {number} businessId - Business ID
   * @param {string} eventId - Event ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteCalendarEvent(businessId, eventId) {
    try {
      const calendar = await this.getCalendarService(businessId);

      await calendar.events.delete({
        calendarId: "primary",
        eventId: eventId,
      });

      return true;
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      throw new Error("Failed to delete calendar event");
    }
  }

  /**
   * Search calendar events
   * @param {number} businessId - Business ID
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array>} Search results
   */
  async searchCalendarEvents(businessId, query, maxResults = 10) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const result = await calendar.events.list({
        calendarId: "primary",
        q: query,
        maxResults: maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      return result.data.items || [];
    } catch (error) {
      console.error("Error searching calendar events:", error);
      throw new Error("Failed to search calendar events");
    }
  }

  /**
   * Check availability for a time slot
   * @param {number} businessId - Business ID
   * @param {string} startTime - Start time (ISO string)
   * @param {string} endTime - End time (ISO string)
   * @returns {Promise<Object>} Availability status
   */
  async checkAvailability(businessId, startTime, endTime) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const result = await calendar.freebusy.query({
        resource: {
          timeMin: startTime,
          timeMax: endTime,
          items: [{ id: "primary" }],
        },
      });

      const busyTimes = result.data.calendars.primary.busy || [];
      const isAvailable = busyTimes.length === 0;

      return {
        isAvailable: isAvailable,
        busyTimes: busyTimes,
        startTime: startTime,
        endTime: endTime,
      };
    } catch (error) {
      console.error("Error checking availability:", error);
      throw new Error("Failed to check availability");
    }
  }

  /**
   * Find available time slots for a date
   * @param {number} businessId - Business ID
   * @param {string} date - Date to check (YYYY-MM-DD)
   * @param {number} durationMinutes - Duration in minutes
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Available time slots
   */
  async findAvailableSlots(businessId, date, durationMinutes = 60, options = {}) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59`);

      const result = await calendar.freebusy.query({
        resource: {
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
          items: [{ id: "primary" }],
        },
      });

      const busyTimes = result.data.calendars.primary.busy || [];
      const availableSlots = [];

      const workingHours = {
        start: options.startHour || 9,
        end: options.endHour || 17,
      };

      for (let hour = workingHours.start; hour < workingHours.end; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const slotStart = new Date(
            `${date}T${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00`
          );
          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

          if (slotEnd.getHours() > workingHours.end) break;

          const isSlotAvailable = !busyTimes.some((busy) => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return slotStart < busyEnd && slotEnd > busyStart;
          });

          if (isSlotAvailable) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              duration: durationMinutes,
            });
          }
        }
      }

      return availableSlots;
    } catch (error) {
      console.error("Error finding available slots:", error);
      throw new Error("Failed to find available slots");
    }
  }

  /**
   * Create meeting event with Google Meet link
   * @param {number} businessId - Business ID
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Created event with meeting link
   */
  async createMeetingEvent(businessId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const event = {
        summary: eventData.title || eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime || eventData.start?.dateTime,
          timeZone: eventData.timeZone || "UTC",
        },
        end: {
          dateTime: eventData.endTime || eventData.end?.dateTime,
          timeZone: eventData.timeZone || "UTC",
        },
        attendees: eventData.attendees || [],
        location: eventData.location,
        conferenceData: {
          createRequest: {
            requestId: `meeting-${Date.now()}`,
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 10 },
          ],
        },
      };

      const result = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
        conferenceDataVersion: 1,
      });

      return result.data;
    } catch (error) {
      console.error("Error creating meeting event:", error);
      throw new Error("Failed to create meeting event");
    }
  }

  /**
   * Create reminder event
   * @param {number} businessId - Business ID
   * @param {Object} reminderData - Reminder data
   * @returns {Promise<Object>} Created reminder event
   */
  async createReminder(businessId, reminderData) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const event = {
        summary: `Reminder: ${reminderData.title}`,
        description: reminderData.description,
        start: {
          dateTime: reminderData.reminderTime,
          timeZone: reminderData.timeZone || "UTC",
        },
        end: {
          dateTime: new Date(new Date(reminderData.reminderTime).getTime() + 15 * 60000).toISOString(),
          timeZone: reminderData.timeZone || "UTC",
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 0 },
            { method: "popup", minutes: 0 },
          ],
        },
      };

      const result = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
      });

      return result.data;
    } catch (error) {
      console.error("Error creating reminder:", error);
      throw new Error("Failed to create reminder");
    }
  }

  /**
   * Get day schedule
   * @param {number} businessId - Business ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Promise<Array>} Day schedule
   */
  async getDaySchedule(businessId, date) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59`);

      const result = await calendar.events.list({
        calendarId: "primary",
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      return result.data.items || [];
    } catch (error) {
      console.error("Error getting day schedule:", error);
      throw new Error("Failed to get day schedule");
    }
  }

  /**
   * Get next available slot
   * @param {number} businessId - Business ID
   * @param {number} durationMinutes - Duration in minutes
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Next available slot
   */
  async getNextAvailableSlot(businessId, durationMinutes = 60, options = {}) {
    try {
      const today = new Date();
      const maxDays = options.maxDays || 30;

      for (let day = 0; day < maxDays; day++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + day);
        const dateString = checkDate.toISOString().split("T")[0];

        const availableSlots = await this.findAvailableSlots(businessId, dateString, durationMinutes, options);

        if (availableSlots.length > 0) {
          return {
            date: dateString,
            slot: availableSlots[0],
            allSlots: availableSlots,
          };
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting next available slot:", error);
      throw new Error("Failed to get next available slot");
    }
  }

  /**
   * Bulk create calendar events
   * @param {number} businessId - Business ID
   * @param {Array} events - Array of event data
   * @returns {Promise<Array>} Created events
   */
  async bulkCreateCalendarEvents(businessId, events) {
    try {
      const results = [];

      for (const eventData of events) {
        try {
          const event = await this.createCalendarEvent(businessId, eventData);
          results.push({ success: true, event: event });
        } catch (error) {
          results.push({ success: false, error: error.message, eventData: eventData });
        }
      }

      return results;
    } catch (error) {
      console.error("Error bulk creating calendar events:", error);
      throw new Error("Failed to bulk create calendar events");
    }
  }

  /**
   * Bulk delete calendar events
   * @param {number} businessId - Business ID
   * @param {Array} eventIds - Array of event IDs
   * @returns {Promise<Array>} Deletion results
   */
  async bulkDeleteCalendarEvents(businessId, eventIds) {
    try {
      const results = [];

      for (const eventId of eventIds) {
        try {
          await this.deleteCalendarEvent(businessId, eventId);
          results.push({ success: true, eventId: eventId });
        } catch (error) {
          results.push({ success: false, error: error.message, eventId: eventId });
        }
      }

      return results;
    } catch (error) {
      console.error("Error bulk deleting calendar events:", error);
      throw new Error("Failed to bulk delete calendar events");
    }
  }

  /**
   * Get Sheets service instance
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Sheets service instance
   */
  async getSheetsService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.sheets({ version: "v4", auth });
  }

  /**
   * Read data from Google Sheet
   * @param {number} businessId - Business ID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} range - Range to read (e.g., "Sheet1!A1:B10")
   * @returns {Promise<Array>} Sheet data
   */
  async readSheet(businessId, spreadsheetId, range) {
    try {
      const sheets = await this.getSheetsService(businessId);

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range,
      });

      return result.data.values || [];
    } catch (error) {
      console.error("Error reading sheet:", error);
      throw new Error("Failed to read Google Sheet");
    }
  }

  /**
   * Write data to Google Sheet
   * @param {number} businessId - Business ID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} range - Range to write to
   * @param {Array} values - Values to write
   * @returns {Promise<Object>} Write result
   */
  async writeSheet(businessId, spreadsheetId, range, values) {
    try {
      const sheets = await this.getSheetsService(businessId);

      const result = await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: range,
        valueInputOption: "RAW",
        resource: {
          values: values,
        },
      });

      return result.data;
    } catch (error) {
      console.error("Error writing to sheet:", error);
      throw new Error("Failed to write to Google Sheet");
    }
  }

  /**
   * Get Drive service instance
   * @param {number} businessId - Business ID
   * @returns {Promise<Object>} Drive service instance
   */
  async getDriveService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.drive({ version: "v3", auth });
  }

  /**
   * List files in Google Drive
   * @param {number} businessId - Business ID
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum number of results
   * @returns {Promise<Array>} File list
   */
  async listFiles(businessId, query = "", maxResults = 10) {
    try {
      const drive = await this.getDriveService(businessId);

      const params = {
        pageSize: maxResults,
        fields: "nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime)",
      };

      if (query) {
        params.q = query;
      }

      const result = await drive.files.list(params);
      return result.data.files || [];
    } catch (error) {
      console.error("Error listing files:", error);
      throw new Error("Failed to list Google Drive files");
    }
  }

  /**
   * Download file from Google Drive
   * @param {number} businessId - Business ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File data
   */
  async downloadFile(businessId, fileId) {
    try {
      const drive = await this.getDriveService(businessId);

      const result = await drive.files.get(
        {
          fileId: fileId,
          alt: "media",
        },
        {
          responseType: "stream",
        }
      );

      return result.data;
    } catch (error) {
      console.error("Error downloading file:", error);
      throw new Error("Failed to download file from Google Drive");
    }
  }

  /**
   * Get FAQs from Google Sheet
   * @param {number} businessId - Business ID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} range - Range to read (default: "Sheet1!A:B")
   * @returns {Promise<Array>} FAQ data
   */
  async getFAQs(businessId, spreadsheetId, range = "Sheet1!A:B") {
    try {
      const sheets = await this.getSheetsService(businessId);

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range,
      });

      const rows = result.data.values || [];
      const faqs = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 2) {
          faqs.push({
            question: row[0],
            answer: row[1],
            row: i + 1,
          });
        }
      }

      return faqs;
    } catch (error) {
      console.error("Error getting FAQs:", error);
      throw new Error("Failed to get FAQs from Google Sheet");
    }
  }

  /**
   * Search FAQs in Google Sheet
   * @param {number} businessId - Business ID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @param {string} userQuestion - User's question
   * @param {string} range - Range to search (default: "Sheet1!A:B")
   * @returns {Promise<Array>} Search results
   */
  async searchFAQs(businessId, spreadsheetId, userQuestion, range = "Sheet1!A:B") {
    try {
      const faqs = await this.getFAQs(businessId, spreadsheetId, range);
      const results = [];

      const questionLower = userQuestion.toLowerCase();

      for (const faq of faqs) {
        const questionMatch = faq.question.toLowerCase().includes(questionLower);
        const answerMatch = faq.answer.toLowerCase().includes(questionLower);

        if (questionMatch || answerMatch) {
          results.push({
            ...faq,
            matchType: questionMatch ? "question" : "answer",
            relevanceScore: questionMatch ? 1.0 : 0.5,
          });
        }
      }

      return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (error) {
      console.error("Error searching FAQs:", error);
      throw new Error("Failed to search FAQ Google Sheet");
    }
  }

  /**
   * Get Google Workspace configuration
   * @param {number} businessId - Business ID
   * @returns {Promise<Object|null>} Configuration data
   */
  async getConfig(businessId) {
    try {
      const result = await pool.query("SELECT * FROM google_workspace_integrations WHERE business_id = $1", [
        businessId,
      ]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Error getting config:", error);
      throw new Error("Failed to get Google Workspace configuration");
    }
  }
}

module.exports = new GoogleService();
