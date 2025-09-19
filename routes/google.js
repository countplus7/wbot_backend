const express = require("express");
const router = express.Router();
const googleService = require("../services/google");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, commonValidations, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

/**
 * Generate Google OAuth authorization URL
 * GET /api/google/auth/:businessId
 */
router.get(
  "/auth/:businessId",
  // authMiddleware,
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const authUrl = googleService.getAuthUrl(parseInt(businessId));
    res.json(createResponse(true, { authUrl }));
  })
);

/**
 * Handle Google OAuth callback
 * GET /api/google/callback
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("OAuth error:", error);
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Error</title>
        </head>
        <body>
          <script>
            // Notify parent window of error
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <p>Authentication error! This window will close automatically.</p>
        </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Error</title>
        </head>
        <body>
          <script>
            // Notify parent window of error
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <p>Missing parameters! This window will close automatically.</p>
        </body>
        </html>
      `);
    }

    const { businessId } = JSON.parse(state);

    if (!businessId) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Error</title>
        </head>
        <body>
          <script>
            // Notify parent window of error
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <p>Invalid state! This window will close automatically.</p>
        </body>
        </html>
      `);
    }

    const result = await googleService.exchangeCodeForTokens(code, businessId);

    if (result.success) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Success</title>
        </head>
        <body>
          <script>
            // Notify parent window of success
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', email: '${result.email}' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <p>Authentication successful! This window will close automatically.</p>
        </body>
        </html>
      `);
    } else {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Failed</title>
        </head>
        <body>
          <script>
            // Notify parent window of error
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <p>Authentication failed! This window will close automatically.</p>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("Error in OAuth callback:", error);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Authentication Error</title>
      </head>
      <body>
        <script>
          // Notify parent window of error
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR' }, '*');
          }
          // Close the popup window
          window.close();
        </script>
        <p>Authentication failed! This window will close automatically.</p>
      </body>
      </html>
    `);
  }
});

/**
 * Get Google Workspace integration status
 * GET /api/google/status/:businessId
 */
router.get(
  "/status/:businessId",
  // authMiddleware,
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const isIntegrated = await googleService.isIntegrated(parseInt(businessId));
    const config = await googleService.getConfig(parseInt(businessId));

    // Match frontend expected format
    res.json(
      createResponse(true, {
        success: true,
        isIntegrated,
        email: config?.email || "",
        lastUpdated: config?.last_sync || new Date().toISOString(),
        config: config || null,
      })
    );
  })
);

/**
 * Create Google Workspace configuration
 * POST /api/google/config/:businessId
 */
router.post(
  "/config/:businessId",
  // authMiddleware,
  adminMiddleware,
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await googleService.saveIntegration(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, config, "Google Workspace configuration saved successfully"));
  })
);

/**
 * Update Google Workspace configuration
 * PUT /api/google/config/:businessId
 */
router.put(
  "/config/:businessId",
  // authMiddleware,
  adminMiddleware,
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await googleService.updateIntegration(parseInt(businessId), req.body);
    res.json(createResponse(true, config, "Google Workspace configuration updated successfully"));
  })
);

/**
 * Get Google Workspace configuration
 * GET /api/google/config/:businessId
 */
router.get("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const integration = await googleService.getIntegration(parseInt(businessId));

    if (integration) {
      // Get user email from Google API if we have valid tokens
      let email = null;
      try {
        const userInfo = await googleService.getUserInfo(parseInt(businessId));
        email = userInfo?.email || null;
      } catch (error) {
        console.log("Could not get user email:", error.message);
        // Integration exists but tokens might be expired
      }

      res.json({
        success: true,
        isIntegrated: true,
        email: email,
        lastUpdated: integration.updated_at,
      });
    } else {
      res.json({
        success: true,
        isIntegrated: false,
        email: null,
        lastUpdated: null,
      });
    }
  } catch (error) {
    console.error("Error getting integration status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get integration status",
    });
  }
});

/**
 * Remove Google Workspace integration
 * DELETE /api/google/config/:businessId
 */
router.delete(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    await googleService.removeIntegration(parseInt(businessId));
    res.json(createResponse(true, null, "Google Workspace integration removed successfully"));
  })
);

/**
 * Create calendar event
 * POST /api/google/calendar/:businessId/events
 */
router.post(
  "/calendar/:businessId/events",
  authMiddleware,
  validate(validationSets.createCalendarEvent),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const event = await googleService.createCalendarEvent(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, event, "Calendar event created successfully"));
  })
);

/**
 * Update calendar event
 * PUT /api/google/calendar/:businessId/events/:eventId
 */
router.put(
  "/calendar/:businessId/events/:eventId",
  authMiddleware,
  validate(validationSets.updateCalendarEvent),
  asyncHandler(async (req, res) => {
    const { businessId, eventId } = req.params;
    const event = await googleService.updateCalendarEvent(parseInt(businessId), eventId, req.body);

    if (!event) {
      return res.status(404).json(createResponse(false, null, "Calendar event not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, event, "Calendar event updated successfully"));
  })
);

/**
 * Delete calendar event
 * DELETE /api/google/calendar/:businessId/events/:eventId
 */
router.delete(
  "/calendar/:businessId/events/:eventId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, eventId } = req.params;
    const success = await googleService.deleteCalendarEvent(parseInt(businessId), eventId);

    if (!success) {
      return res.status(404).json(createResponse(false, null, "Calendar event not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, null, "Calendar event deleted successfully"));
  })
);

/**
 * Send email
 * POST /api/google/email/:businessId/send
 */
router.post(
  "/email/:businessId/send",
  authMiddleware,
  validate(validationSets.sendEmail),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const result = await googleService.sendEmail(parseInt(businessId), req.body);
    res.json(createResponse(true, result, "Email sent successfully"));
  })
);

/**
 * Get calendar events
 * GET /api/google/calendar/:businessId/events
 */
router.get(
  "/calendar/:businessId/events",
  authMiddleware,
  validate([commonValidations.businessId, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const events = await googleService.getCalendarEvents(parseInt(businessId), {
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json(createResponse(true, events));
  })
);

/**
 * Get upcoming calendar events
 * GET /api/google/calendar/:businessId/events/upcoming
 */
router.get(
  "/calendar/:businessId/events/upcoming",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { maxResults = 10 } = req.query;
    const events = await googleService.getUpcomingEvents(parseInt(businessId), parseInt(maxResults));
    res.json(createResponse(true, events));
  })
);

/**
 * Get calendar event by ID
 * GET /api/google/calendar/:businessId/events/:eventId
 */
router.get(
  "/calendar/:businessId/events/:eventId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, eventId } = req.params;
    const event = await googleService.getEventById(parseInt(businessId), eventId);

    if (!event) {
      return res.status(404).json(createResponse(false, null, "Calendar event not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, event));
  })
);

/**
 * Search calendar events
 * GET /api/google/calendar/:businessId/events/search
 */
router.get(
  "/calendar/:businessId/events/search",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { query, maxResults = 10 } = req.query;

    if (!query) {
      return res.status(400).json(createResponse(false, null, "Search query is required", null, "VALIDATION_ERROR"));
    }

    const events = await googleService.searchCalendarEvents(parseInt(businessId), query, parseInt(maxResults));
    res.json(createResponse(true, events));
  })
);

/**
 * Check availability
 * GET /api/google/calendar/:businessId/availability
 */
router.get(
  "/calendar/:businessId/availability",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { startTime, endTime } = req.query;

    if (!startTime || !endTime) {
      return res
        .status(400)
        .json(createResponse(false, null, "Start time and end time are required", null, "VALIDATION_ERROR"));
    }

    const availability = await googleService.checkAvailability(parseInt(businessId), startTime, endTime);
    res.json(createResponse(true, availability));
  })
);

/**
 * Get available time slots
 * GET /api/google/calendar/:businessId/slots
 */
router.get(
  "/calendar/:businessId/slots",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { date, duration = 60, options = {} } = req.query;

    if (!date) {
      return res.status(400).json(createResponse(false, null, "Date is required", null, "VALIDATION_ERROR"));
    }

    const slots = await googleService.findAvailableSlots(parseInt(businessId), date, parseInt(duration), options);
    res.json(createResponse(true, slots));
  })
);

/**
 * Get day schedule
 * GET /api/google/calendar/:businessId/schedule/:date
 */
router.get(
  "/calendar/:businessId/schedule/:date",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId, date } = req.params;
    const schedule = await googleService.getDaySchedule(parseInt(businessId), date);
    res.json(createResponse(true, schedule));
  })
);

/**
 * Create meeting event
 * POST /api/google/calendar/:businessId/meetings
 */
router.post(
  "/calendar/:businessId/meetings",
  authMiddleware,
  validate(validationSets.createCalendarEvent),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const event = await googleService.createMeetingEvent(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, event, "Meeting event created successfully"));
  })
);

/**
 * Create reminder
 * POST /api/google/calendar/:businessId/reminders
 */
router.post(
  "/calendar/:businessId/reminders",
  authMiddleware,
  validate(validationSets.createCalendarEvent),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const reminder = await googleService.createReminder(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, reminder, "Reminder created successfully"));
  })
);

/**
 * Bulk create calendar events
 * POST /api/google/calendar/:businessId/events/bulk
 */
router.post(
  "/calendar/:businessId/events/bulk",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json(createResponse(false, null, "Events array is required", null, "VALIDATION_ERROR"));
    }

    const result = await googleService.bulkCreateCalendarEvents(parseInt(businessId), events);
    res.status(201).json(createResponse(true, result, "Bulk calendar events created successfully"));
  })
);

/**
 * Bulk delete calendar events
 * DELETE /api/google/calendar/:businessId/events/bulk
 */
router.delete(
  "/calendar/:businessId/events/bulk",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { eventIds } = req.body;

    if (!eventIds || !Array.isArray(eventIds)) {
      return res.status(400).json(createResponse(false, null, "Event IDs array is required", null, "VALIDATION_ERROR"));
    }

    const result = await googleService.bulkDeleteCalendarEvents(parseInt(businessId), eventIds);
    res.json(createResponse(true, result, "Bulk calendar events deleted successfully"));
  })
);

/**
 * Get Google Sheets data
 * GET /api/google/sheets/:businessId/:spreadsheetId
 */
router.get(
  "/sheets/:businessId/:spreadsheetId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId, spreadsheetId } = req.params;
    const { range = "Sheet1!A:Z" } = req.query;

    const data = await googleService.readSheet(parseInt(businessId), spreadsheetId, range);
    res.json(createResponse(true, data));
  })
);

/**
 * Write to Google Sheets
 * POST /api/google/sheets/:businessId/:spreadsheetId
 */
router.post(
  "/sheets/:businessId/:spreadsheetId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId, spreadsheetId } = req.params;
    const { range, values } = req.body;

    if (!range || !values) {
      return res
        .status(400)
        .json(createResponse(false, null, "Range and values are required", null, "VALIDATION_ERROR"));
    }

    const result = await googleService.writeSheet(parseInt(businessId), spreadsheetId, range, values);
    res.json(createResponse(true, result, "Data written to sheet successfully"));
  })
);

/**
 * Get Google Drive files
 * GET /api/google/drive/:businessId/files
 */
router.get(
  "/drive/:businessId/files",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { query = "", maxResults = 10 } = req.query;

    const files = await googleService.listFiles(parseInt(businessId), query, parseInt(maxResults));
    res.json(createResponse(true, files));
  })
);

/**
 * Download Google Drive file
 * GET /api/google/drive/:businessId/files/:fileId/download
 */
router.get(
  "/drive/:businessId/files/:fileId/download",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId, fileId } = req.params;

    const fileData = await googleService.downloadFile(parseInt(businessId), fileId);
    res.json(createResponse(true, fileData));
  })
);

/**
 * Get FAQs from Google Sheets
 * GET /api/google/faqs/:businessId/:spreadsheetId
 */
router.get(
  "/faqs/:businessId/:spreadsheetId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId, spreadsheetId } = req.params;
    const { range = "Sheet1!A:B" } = req.query;

    const faqs = await googleService.getFAQs(parseInt(businessId), spreadsheetId, range);
    res.json(createResponse(true, faqs));
  })
);

/**
 * Search FAQs
 * GET /api/google/faqs/:businessId/:spreadsheetId/search
 */
router.get(
  "/faqs/:businessId/:spreadsheetId/search",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId, spreadsheetId } = req.params;
    const { question, range = "Sheet1!A:B" } = req.query;

    if (!question) {
      return res.status(400).json(createResponse(false, null, "Question is required", null, "VALIDATION_ERROR"));
    }

    const results = await googleService.searchFAQs(parseInt(businessId), spreadsheetId, question, range);
    res.json(createResponse(true, results));
  })
);

/**
 * Get FAQs
 * GET /api/airtable/faqs/:businessId
 */
router.get(
  "/faqs/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    try {
      const faqs = await AirtableService.getFAQs(parseInt(businessId));
      res.json(createResponse(true, faqs));
    } catch (error) {
      console.error("Error fetching FAQs:", error);
      res.status(500).json(createResponse(false, null, "Failed to fetch FAQs", null, "EXTERNAL_SERVICE_ERROR"));
    }
  })
);

/**
 * Search FAQs
 * POST /api/airtable/search/:businessId
 */
router.post(
  "/search/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json(createResponse(false, null, "Question is required", null, "VALIDATION_ERROR"));
    }

    try {
      const result = await AirtableService.searchFAQs(parseInt(businessId), question);
      res.json(createResponse(true, result));
    } catch (error) {
      console.error("Error searching FAQs:", error);
      res.status(500).json(createResponse(false, null, "Failed to search FAQs", null, "EXTERNAL_SERVICE_ERROR"));
    }
  })
);

/**
 * Create Contact
 * POST /api/hubspot/contacts/:businessId
 */
router.post(
  "/contacts/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const contact = await HubSpotService.createContact(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, contact, "Contact created successfully"));
  })
);

/**
 * Search Contacts
 * POST /api/hubspot/contacts/search/:businessId
 */
router.post(
  "/contacts/search/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { searchTerm } = req.body;

    if (!searchTerm) {
      return res.status(400).json(createResponse(false, null, "Search term is required", null, "VALIDATION_ERROR"));
    }

    const contacts = await HubSpotService.searchContacts(parseInt(businessId), searchTerm);
    res.json(createResponse(true, contacts));
  })
);

/**
 * Create Company
 * POST /api/hubspot/companies/:businessId
 */
router.post(
  "/companies/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const company = await HubSpotService.createCompany(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, company, "Company created successfully"));
  })
);

/**
 * Create Deal
 * POST /api/hubspot/deals/:businessId
 */
router.post(
  "/deals/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const deal = await HubSpotService.createDeal(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, deal, "Deal created successfully"));
  })
);

module.exports = router;
