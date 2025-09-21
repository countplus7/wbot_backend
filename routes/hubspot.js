const express = require("express");
const router = express.Router();
const HubSpotService = require("../services/hubspot");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, commonValidations, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

// OAuth Integration
router.get(
  "/auth/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const authUrl = HubSpotService.getAuthUrl(parseInt(businessId));
    res.json(createResponse(true, { authUrl }));
  })
);

router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      console.error("HubSpot OAuth error:", error);
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>HubSpot Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
          </style>
        </head>
        <body>
          <script>
            // Notify parent window of error
            if (window.opener) {
              window.opener.postMessage({ type: 'HUBSPOT_AUTH_ERROR' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <h1>HubSpot Authentication Error</h1>
          <div class="error">
            <p>Authentication failed: ${error}</p>
            <p>This window will close automatically.</p>
          </div>
        </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>HubSpot Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
          </style>
        </head>
        <body>
          <script>
            // Notify parent window of error
            if (window.opener) {
              window.opener.postMessage({ type: 'HUBSPOT_AUTH_ERROR' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <h1>HubSpot Authentication Error</h1>
          <div class="error">
            <p>Missing authorization code or state parameter.</p>
            <p>This window will close automatically.</p>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const stateData = JSON.parse(state);
      const result = await HubSpotService.exchangeCodeForTokens(code, stateData.businessId);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>HubSpot Authentication Success</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: #2e7d32; background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
          </style>
        </head>
        <body>
          <script>
            // Notify parent window of success
            if (window.opener) {
              window.opener.postMessage({ type: 'HUBSPOT_AUTH_SUCCESS', email: '${result.email}' }, '*');
            }
            // Close the popup window
            window.close();
          </script>
          <h1>HubSpot Authentication Successful</h1>
          <div class="success">
            <p>HubSpot integration has been configured successfully!</p>
            <p>Connected email: ${result.email}</p>
            <p>This window will close automatically.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("Error handling HubSpot OAuth callback:", error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>HubSpot Authentication Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
          </style>
        </head>
        <body>
          <h1>HubSpot Authentication Error</h1>
          <div class="error">
            <p>Failed to complete authentication: ${error.message}</p>
            <p>Please try again or contact support.</p>
          </div>
        </body>
        </html>
      `);
    }
  })
);

// Configuration Management
router.post(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { client_id, client_secret, redirect_uri } = req.body;

    if (!client_id || !client_secret) {
      return res
        .status(400)
        .json(createResponse(false, null, "Client ID and Client Secret are required", null, "VALIDATION_ERROR"));
    }

    const config = await HubSpotService.saveIntegration(parseInt(businessId), {
      client_id,
      client_secret,
      redirect_uri,
    });

    res.status(201).json(createResponse(true, config, "HubSpot configuration saved successfully"));
  })
);

router.get(
  "/config/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await HubSpotService.getConfig(parseInt(businessId));
    res.json(createResponse(true, config));
  })
);

router.put(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await HubSpotService.updateIntegration(parseInt(businessId), req.body);
    res.json(createResponse(true, config, "HubSpot configuration updated successfully"));
  })
);

router.delete(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    await HubSpotService.removeIntegration(parseInt(businessId));
    res.json(createResponse(true, null, "HubSpot integration removed successfully"));
  })
);

// Integration Status
router.get(
  "/status/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const isIntegrated = await HubSpotService.isIntegrated(parseInt(businessId));
    const config = await HubSpotService.getConfig(parseInt(businessId));

    res.json(
      createResponse(true, {
        isIntegrated,
        config: config || null,
      })
    );
  })
);

module.exports = router;
