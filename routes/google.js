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

module.exports = router;
