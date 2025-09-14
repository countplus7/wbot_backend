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

      // Set credentials to get user info
      this.oauth2Client.setCredentials(tokens);

      // Get user info to store email
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      const integrationData = {
        business_id: businessId,
        provider: "google",
        email: userInfo.data.email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
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
      throw new Error("Failed to authenticate with Google");
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
        integrationData.expiry_date,
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
      console.error("Error getting Google integration:", error);
      throw new Error("Failed to get Google integration");
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
      expiry_date: integration.expiry_date,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
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
      console.error("Error removing Google integration:", error);
      throw new Error("Failed to remove Google integration");
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
    return google.gmail({ version: "v1", auth });
  }

  async sendEmail(businessId, { to, subject, body, isHtml = false }) {
    try {
      const gmail = await this.getGmailService(businessId);

      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
        "",
        body,
      ].join("\n");

      const encodedEmail = Buffer.from(email).toString("base64url");

      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
        },
      });

      return result.data;
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email via Gmail");
    }
  }


  // Gmail reading methods
  async getEmails(businessId, options = {}) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      const {
        maxResults = 10,
        labelIds = ['INBOX'],
        query = '',
        includeSpamTrash = false
      } = options;

      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        labelIds,
        q: query,
        includeSpamTrash
      });

      if (!response.data.messages) {
        return [];
      }

      // Get detailed information for each message
      const emails = await Promise.all(
        response.data.messages.map(async (message) => {
          const details = await this.getEmailById(businessId, message.id);
          return details;
        })
      );

      return emails;
    } catch (error) {
      console.error("Error getting emails:", error);
      throw new Error("Failed to retrieve emails from Gmail");
    }
  }

  async getEmailById(businessId, messageId) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      const headers = message.payload.headers;
      
      // Extract common email properties
      const email = {
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        snippet: message.snippet,
        internalDate: new Date(parseInt(message.internalDate)),
        subject: this.getHeader(headers, 'Subject'),
        from: this.getHeader(headers, 'From'),
        to: this.getHeader(headers, 'To'),
        cc: this.getHeader(headers, 'Cc'),
        bcc: this.getHeader(headers, 'Bcc'),
        date: this.getHeader(headers, 'Date'),
        body: this.extractEmailBody(message.payload),
        attachments: await this.extractAttachments(businessId, message.payload, messageId)
      };

      return email;
    } catch (error) {
      console.error("Error getting email by ID:", error);
      throw new Error("Failed to retrieve email details");
    }
  }

  async getUnreadEmails(businessId, maxResults = 10) {
    return this.getEmails(businessId, {
      maxResults,
      query: 'is:unread',
      labelIds: ['INBOX']
    });
  }

  async getEmailsByLabel(businessId, labelName, maxResults = 10) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      // Get all labels to find the label ID
      const labelsResponse = await gmail.users.labels.list({
        userId: 'me'
      });
      
      const label = labelsResponse.data.labels.find(l => 
        l.name.toLowerCase() === labelName.toLowerCase()
      );
      
      if (!label) {
        throw new Error(`Label "${labelName}" not found`);
      }

      return this.getEmails(businessId, {
        maxResults,
        labelIds: [label.id]
      });
    } catch (error) {
      console.error("Error getting emails by label:", error);
      throw new Error(`Failed to retrieve emails with label "${labelName}"`);
    }
  }

  async searchEmails(businessId, searchQuery, maxResults = 10) {
    return this.getEmails(businessId, {
      maxResults,
      query: searchQuery
    });
  }

  async markEmailAsRead(businessId, messageId) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });

      return { success: true };
    } catch (error) {
      console.error("Error marking email as read:", error);
      throw new Error("Failed to mark email as read");
    }
  }

  async markEmailAsUnread(businessId, messageId) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: ['UNREAD']
        }
      });

      return { success: true };
    } catch (error) {
      console.error("Error marking email as unread:", error);
      throw new Error("Failed to mark email as unread");
    }
  }

  // Helper methods for email parsing
  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : null;
  }

  extractEmailBody(payload) {
    let body = '';
    
    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        } else if (part.mimeType === 'text/html' && part.body && part.body.data && !body) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          // Recursive search for nested parts
          const nestedBody = this.extractEmailBody(part);
          if (nestedBody) body = nestedBody;
        }
      }
    }
    
    return body;
  }

  async extractAttachments(businessId, payload, messageId) {
    const attachments = [];
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.body && part.body.attachmentId) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
            attachmentId: part.body.attachmentId,
            messageId: messageId
          });
        }
        
        // Check nested parts
        if (part.parts) {
          const nestedAttachments = await this.extractAttachments(businessId, part, messageId);
          attachments.push(...nestedAttachments);
        }
      }
    }
    
    return attachments;
  }

  async downloadAttachment(businessId, messageId, attachmentId) {
    try {
      const gmail = await this.getGmailService(businessId);
      
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId
      });

      return Buffer.from(response.data.data, 'base64');
    } catch (error) {
      console.error("Error downloading attachment:", error);
      throw new Error("Failed to download email attachment");
    }
  }
  // Calendar integration methods
  async getCalendarService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.calendar({ version: "v3", auth });
  }

  async createCalendarEvent(businessId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const event = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || "UTC",
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || "UTC",
        },
        attendees: eventData.attendees?.map((email) => ({ email })) || [],
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

  // Calendar reading methods
  async getCalendarEvents(businessId, options = {}) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const {
        maxResults = 10,
        timeMin = new Date().toISOString(),
        timeMax = null,
        singleEvents = true,
        orderBy = 'startTime'
      } = options;

      const params = {
        calendarId: 'primary',
        timeMin,
        maxResults,
        singleEvents,
        orderBy
      };

      if (timeMax) {
        params.timeMax = timeMax;
      }

      const response = await calendar.events.list(params);
      return response.data.items || [];
    } catch (error) {
      console.error("Error getting calendar events:", error);
      throw new Error("Failed to retrieve calendar events");
    }
  }

  async getUpcomingEvents(businessId, maxResults = 10) {
    return this.getCalendarEvents(businessId, { maxResults });
  }

  async getEventsByDateRange(businessId, startDate, endDate, maxResults = 50) {
    return this.getCalendarEvents(businessId, {
      timeMin: startDate,
      timeMax: endDate,
      maxResults
    });
  }

  async getEventById(businessId, eventId) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const response = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventId
      });

      return response.data;
    } catch (error) {
      console.error("Error getting calendar event by ID:", error);
      throw new Error("Failed to retrieve calendar event");
    }
  }

  async updateCalendarEvent(businessId, eventId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);

      const event = {
        summary: eventData.title,
        description: eventData.description,
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || "UTC",
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || "UTC",
        },
        attendees: eventData.attendees?.map((email) => ({ email })) || [],
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

  async deleteCalendarEvent(businessId, eventId) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId
      });

      return { success: true };
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      throw new Error("Failed to delete calendar event");
    }
  }

  async searchCalendarEvents(businessId, query, maxResults = 10) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const response = await calendar.events.list({
        calendarId: 'primary',
        q: query,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items || [];
    } catch (error) {
      console.error("Error searching calendar events:", error);
      throw new Error("Failed to search calendar events");
    }
  }

  // Enhanced Calendar Operations for Booking & Appointments

  /**
   * Check availability for a specific time slot
   */
  async checkAvailability(businessId, startTime, endTime) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startTime,
        timeMax: endTime,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const conflictingEvents = (response.data.items || []).map(event => ({
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        summary: event.summary || 'Busy'
      }));

      return {
        isAvailable: conflictingEvents.length === 0,
        conflictingEvents,
        startTime,
        endTime
      };
    } catch (error) {
      console.error("Error checking availability:", error);
      throw new Error("Failed to check calendar availability");
    }
  }

  /**
   * Find available time slots for a specific date
   */
  async findAvailableSlots(businessId, date, durationMinutes = 60, options = {}) {
    try {
      const { startHour = 9, endHour = 17, timeZone = 'UTC' } = options;
      const calendar = await this.getCalendarService(businessId);
      
      // Get all events for the specified date
      const startOfDay = new Date(date);
      startOfDay.setHours(startHour, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(endHour, 0, 0, 0);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];
      const availableSlots = [];
      
      // Generate time slots and check availability
      const currentTime = new Date(startOfDay);
      while (currentTime < endOfDay) {
        const slotStart = new Date(currentTime);
        const slotEnd = new Date(currentTime.getTime() + durationMinutes * 60000);
        
        if (slotEnd <= endOfDay) {
          // Check if this slot conflicts with any events
          const hasConflict = events.some(event => {
            const eventStart = new Date(event.start.dateTime || event.start.date);
            const eventEnd = new Date(event.end.dateTime || event.end.date);
            
            return (slotStart < eventEnd && slotEnd > eventStart);
          });
          
          if (!hasConflict) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              duration: durationMinutes
            });
          }
        }
        
        // Move to next hour
        currentTime.setHours(currentTime.getHours() + 1);
      }

      return {
        date,
        duration: durationMinutes,
        availableSlots,
        count: availableSlots.length
      };
    } catch (error) {
      console.error("Error finding available slots:", error);
      throw new Error("Failed to find available time slots");
    }
  }

  /**
   * Create a meeting event with Google Meet link
   */
  async createMeetingEvent(businessId, eventData) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const event = {
        summary: eventData.title,
        description: eventData.description || '',
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'UTC'
        },
        attendees: eventData.attendees ? eventData.attendees.map(email => ({ email })) : [],
        location: eventData.location || '',
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 10 }
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });

      const createdEvent = response.data;
      const meetingLink = createdEvent.conferenceData?.entryPoints?.[0]?.uri;

      return {
        ...createdEvent,
        meetingLink
      };
    } catch (error) {
      console.error("Error creating meeting event:", error);
      throw new Error("Failed to create meeting event");
    }
  }

  /**
   * Create a reminder event
   */
  async createReminder(businessId, reminderData) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const event = {
        summary: reminderData.title,
        description: reminderData.description || '',
        start: {
          dateTime: reminderData.reminderTime,
          timeZone: reminderData.timeZone || 'UTC'
        },
        end: {
          dateTime: new Date(new Date(reminderData.reminderTime).getTime() + 15 * 60000).toISOString(),
          timeZone: reminderData.timeZone || 'UTC'
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 0 },
            { method: 'popup', minutes: 0 }
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event
      });

      return response.data;
    } catch (error) {
      console.error("Error creating reminder:", error);
      throw new Error("Failed to create reminder");
    }
  }

  /**
   * Get day schedule with availability summary
   */
  async getDaySchedule(businessId, date) {
    try {
      const calendar = await this.getCalendarService(businessId);
      
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data.items || [];
      let totalBusyMinutes = 0;

      events.forEach(event => {
        const start = new Date(event.start.dateTime || event.start.date);
        const end = new Date(event.end.dateTime || event.end.date);
        const duration = (end - start) / (1000 * 60); // Convert to minutes
        totalBusyMinutes += duration;
      });

      const totalMinutes = 24 * 60; // 24 hours in minutes
      const totalFreeMinutes = totalMinutes - totalBusyMinutes;
      const busyPercentage = Math.round((totalBusyMinutes / totalMinutes) * 100);

      return {
        date,
        events,
        summary: {
          totalEvents: events.length,
          totalBusyMinutes: Math.round(totalBusyMinutes),
          totalFreeMinutes: Math.round(totalFreeMinutes),
          busyPercentage
        }
      };
    } catch (error) {
      console.error("Error getting day schedule:", error);
      throw new Error("Failed to get day schedule");
    }
  }

  /**
   * Get next available appointment slot
   */
  async getNextAvailableSlot(businessId, durationMinutes = 60, options = {}) {
    try {
      const { startDate, maxDays = 30, startHour = 9, endHour = 17, timeZone = 'UTC' } = options;
      
      let searchDate = startDate ? new Date(startDate) : new Date();
      const endSearchDate = new Date(searchDate.getTime() + maxDays * 24 * 60 * 60 * 1000);

      while (searchDate <= endSearchDate) {
        const dateStr = searchDate.toISOString().split('T')[0];
        const availableSlots = await this.findAvailableSlots(businessId, dateStr, durationMinutes, {
          startHour,
          endHour,
          timeZone
        });

        if (availableSlots.availableSlots.length > 0) {
          return {
            date: dateStr,
            availableSlots: availableSlots.availableSlots,
            nextSlot: availableSlots.availableSlots[0],
            message: `Found ${availableSlots.availableSlots.length} available slots on ${dateStr}`
          };
        }

        searchDate.setDate(searchDate.getDate() + 1);
      }

      return {
        date: null,
        availableSlots: [],
        nextSlot: null,
        message: `No available slots found in the next ${maxDays} days`
      };
    } catch (error) {
      console.error("Error getting next available slot:", error);
      throw new Error("Failed to get next available slot");
    }
  }

  /**
   * Bulk create calendar events
   */
  async bulkCreateCalendarEvents(businessId, events) {
    try {
      const results = {
        created: [],
        failed: []
      };

      for (const eventData of events) {
        try {
          const event = await this.createCalendarEvent(businessId, eventData);
          results.created.push(event);
        } catch (error) {
          results.failed.push({
            eventData,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error("Error in bulk create calendar events:", error);
      throw new Error("Failed to bulk create calendar events");
    }
  }

  /**
   * Bulk delete calendar events
   */
  async bulkDeleteCalendarEvents(businessId, eventIds) {
    try {
      const results = {
        deleted: 0,
        failed: 0,
        errors: []
      };

      for (const eventId of eventIds) {
        try {
          await this.deleteCalendarEvent(businessId, eventId);
          results.deleted++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            eventId,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error("Error in bulk delete calendar events:", error);
      throw new Error("Failed to bulk delete calendar events");
    }
  }

  // Sheets integration methods
  async getSheetsService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.sheets({ version: "v4", auth });
  }

  async readSheet(businessId, spreadsheetId, range) {
    try {
      const sheets = await this.getSheetsService(businessId);

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      return result.data.values || [];
    } catch (error) {
      console.error("Error reading sheet:", error);
      throw new Error("Failed to read Google Sheet");
    }
  }

  async writeSheet(businessId, spreadsheetId, range, values) {
    try {
      const sheets = await this.getSheetsService(businessId);

      const result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        resource: {
          values,
        },
      });

      return result.data;
    } catch (error) {
      console.error("Error writing to sheet:", error);
      throw new Error("Failed to write to Google Sheet");
    }
  }

  // Drive integration methods
  async getDriveService(businessId) {
    const auth = await this.getAuthenticatedClient(businessId);
    return google.drive({ version: "v3", auth });
  }

  async listFiles(businessId, query = "", maxResults = 10) {
    try {
      const drive = await this.getDriveService(businessId);

      const result = await drive.files.list({
        q: query,
        pageSize: maxResults,
        fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
      });

      return result.data.files || [];
    } catch (error) {
      console.error("Error listing files:", error);
      throw new Error("Failed to list Google Drive files");
    }
  }

  async downloadFile(businessId, fileId) {
    try {
      const drive = await this.getDriveService(businessId);

      const result = await drive.files.get({
        fileId,
        alt: "media",
      });

      return result.data;
    } catch (error) {
      console.error("Error downloading file:", error);
      throw new Error("Failed to download Google Drive file");
    }
  }
}

module.exports = new GoogleService();
