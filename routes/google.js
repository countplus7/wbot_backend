const express = require("express");
const router = express.Router();
const googleService = require("../services/google");

/**
 * Generate Google OAuth authorization URL
 * GET /api/google/auth/:businessId
 */
router.get("/auth/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const authUrl = googleService.getAuthUrl(parseInt(businessId));

    res.json({
      success: true,
      authUrl,
    });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate authorization URL",
    });
  }
});

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
 * Get Google integration status for a business
 * GET /api/google/status/:businessId
 */
router.get("/status/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const integration = await googleService.getIntegration(parseInt(businessId));

    res.json({
      success: true,
      isIntegrated: !!integration,
      email: integration?.email || null,
      lastUpdated: integration?.updated_at || null,
    });
  } catch (error) {
    console.error("Error getting integration status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get integration status",
    });
  }
});

/**
 * Remove Google integration
 * DELETE /api/google/integration/:businessId
 */
router.delete("/integration/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    await googleService.removeIntegration(parseInt(businessId));

    res.json({
      success: true,
      message: "Google integration removed successfully",
    });
  } catch (error) {
    console.error("Error removing integration:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove Google integration",
    });
  }
});

/**
 * Send email via Gmail
 * POST /api/google/gmail/send/:businessId
 */
router.post("/gmail/send/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { to, subject, body, isHtml } = req.body;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: "Recipient, subject, and body are required",
      });
    }

    const result = await googleService.sendEmail(parseInt(businessId), {
      to,
      subject,
      body,
      isHtml: isHtml || false,
    });

    res.json({
      success: true,
      messageId: result.id,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to send email",
    });
  }
});

/**
 * Create calendar event
 * POST /api/google/calendar/event/:businessId
 */
router.post("/calendar/event/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { title, description, startTime, endTime, timeZone, attendees } = req.body;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!title || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: "Title, start time, and end time are required",
      });
    }

    const result = await googleService.createCalendarEvent(parseInt(businessId), {
      title,
      description,
      startTime,
      endTime,
      timeZone,
      attendees,
    });

    res.json({
      success: true,
      eventId: result.id,
      eventUrl: result.htmlLink,
      message: "Calendar event created successfully",
    });
  } catch (error) {
    console.error("Error creating calendar event:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create calendar event",
    });
  }
});

/**
 * Read Google Sheet data
 * GET /api/google/sheets/:businessId/:spreadsheetId
 */
router.get("/sheets/:businessId/:spreadsheetId", async (req, res) => {
  try {
    const { businessId, spreadsheetId } = req.params;
    const { range } = req.query;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: "Spreadsheet ID is required",
      });
    }

    const data = await googleService.readSheet(parseInt(businessId), spreadsheetId, range || "A1:Z1000");

    res.json({
      success: true,
      data,
      rowCount: data.length,
    });
  } catch (error) {
    console.error("Error reading sheet:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to read Google Sheet",
    });
  }
});

/**
 * Write data to Google Sheet
 * POST /api/google/sheets/:businessId/:spreadsheetId
 */
router.post("/sheets/:businessId/:spreadsheetId", async (req, res) => {
  try {
    const { businessId, spreadsheetId } = req.params;
    const { range, values } = req.body;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: "Spreadsheet ID is required",
      });
    }

    if (!range || !values || !Array.isArray(values)) {
      return res.status(400).json({
        success: false,
        error: "Range and values array are required",
      });
    }

    const result = await googleService.writeSheet(parseInt(businessId), spreadsheetId, range, values);

    res.json({
      success: true,
      updatedCells: result.updatedCells,
      updatedRows: result.updatedRows,
      message: "Sheet updated successfully",
    });
  } catch (error) {
    console.error("Error writing to sheet:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to write to Google Sheet",
    });
  }
});

/**
 * List Google Drive files
 * GET /api/google/drive/files/:businessId
 */
router.get("/drive/files/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { query, limit } = req.query;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const files = await googleService.listFiles(parseInt(businessId), query || "", parseInt(limit) || 10);

    res.json({
      success: true,
      files,
      count: files.length,
    });
  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to list Google Drive files",
    });
  }
});

/**
 * Download Google Drive file
 * GET /api/google/drive/download/:businessId/:fileId
 */
router.get("/drive/download/:businessId/:fileId", async (req, res) => {
  try {
    const { businessId, fileId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!fileId) {
      return res.status(400).json({
        success: false,
        error: "File ID is required",
      });
    }

    const fileData = await googleService.downloadFile(parseInt(businessId), fileId);

    // Set appropriate headers for file download
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="file_${fileId}"`);

    res.send(fileData);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to download Google Drive file",
    });
  }
});


/**
 * Get emails from Gmail
 * GET /api/google/gmail/emails/:businessId
 */
router.get("/gmail/emails/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { maxResults = 10, labelIds, query, includeSpamTrash = false } = req.query;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const options = {
      maxResults: parseInt(maxResults),
      includeSpamTrash: includeSpamTrash === 'true'
    };

    if (labelIds) {
      options.labelIds = Array.isArray(labelIds) ? labelIds : [labelIds];
    }

    if (query) {
      options.query = query;
    }

    const emails = await googleService.getEmails(parseInt(businessId), options);

    res.json({
      success: true,
      emails,
      count: emails.length,
    });
  } catch (error) {
    console.error("Error getting emails:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve emails",
    });
  }
});

/**
 * Get unread emails from Gmail
 * GET /api/google/gmail/unread/:businessId
 */
router.get("/gmail/unread/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { maxResults = 10 } = req.query;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const emails = await googleService.getUnreadEmails(parseInt(businessId), parseInt(maxResults));

    res.json({
      success: true,
      emails,
      count: emails.length,
    });
  } catch (error) {
    console.error("Error getting unread emails:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve unread emails",
    });
  }
});

/**
 * Get specific email by ID
 * GET /api/google/gmail/email/:businessId/:messageId
 */
router.get("/gmail/email/:businessId/:messageId", async (req, res) => {
  try {
    const { businessId, messageId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: "Message ID is required",
      });
    }

    const email = await googleService.getEmailById(parseInt(businessId), messageId);

    res.json({
      success: true,
      email,
    });
  } catch (error) {
    console.error("Error getting email by ID:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve email",
    });
  }
});

/**
 * Search emails in Gmail
 * GET /api/google/gmail/search/:businessId
 */
router.get("/gmail/search/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { q: searchQuery, maxResults = 10 } = req.query;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const emails = await googleService.searchEmails(parseInt(businessId), searchQuery, parseInt(maxResults));

    res.json({
      success: true,
      emails,
      count: emails.length,
      query: searchQuery,
    });
  } catch (error) {
    console.error("Error searching emails:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to search emails",
    });
  }
});

/**
 * Get emails by label
 * GET /api/google/gmail/label/:businessId/:labelName
 */
router.get("/gmail/label/:businessId/:labelName", async (req, res) => {
  try {
    const { businessId, labelName } = req.params;
    const { maxResults = 10 } = req.query;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!labelName) {
      return res.status(400).json({
        success: false,
        error: "Label name is required",
      });
    }

    const emails = await googleService.getEmailsByLabel(parseInt(businessId), labelName, parseInt(maxResults));

    res.json({
      success: true,
      emails,
      count: emails.length,
      label: labelName,
    });
  } catch (error) {
    console.error("Error getting emails by label:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve emails by label",
    });
  }
});

/**
 * Mark email as read
 * POST /api/google/gmail/mark-read/:businessId/:messageId
 */
router.post("/gmail/mark-read/:businessId/:messageId", async (req, res) => {
  try {
    const { businessId, messageId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: "Message ID is required",
      });
    }

    const result = await googleService.markEmailAsRead(parseInt(businessId), messageId);

    res.json({
      success: true,
      message: "Email marked as read",
    });
  } catch (error) {
    console.error("Error marking email as read:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to mark email as read",
    });
  }
});

/**
 * Mark email as unread
 * POST /api/google/gmail/mark-unread/:businessId/:messageId
 */
router.post("/gmail/mark-unread/:businessId/:messageId", async (req, res) => {
  try {
    const { businessId, messageId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!messageId) {
      return res.status(400).json({
        success: false,
        error: "Message ID is required",
      });
    }

    const result = await googleService.markEmailAsUnread(parseInt(businessId), messageId);

    res.json({
      success: true,
      message: "Email marked as unread",
    });
  } catch (error) {
    console.error("Error marking email as unread:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to mark email as unread",
    });
  }
});

/**
 * Download email attachment
 * GET /api/google/gmail/attachment/:businessId/:messageId/:attachmentId
 */
router.get("/gmail/attachment/:businessId/:messageId/:attachmentId", async (req, res) => {
  try {
    const { businessId, messageId, attachmentId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!messageId || !attachmentId) {
      return res.status(400).json({
        success: false,
        error: "Message ID and attachment ID are required",
      });
    }

    const attachmentData = await googleService.downloadAttachment(parseInt(businessId), messageId, attachmentId);

    // Set appropriate headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
    
    res.send(attachmentData);
  } catch (error) {
    console.error("Error downloading attachment:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to download attachment",
    });
  }
});


module.exports = router;
