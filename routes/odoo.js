const express = require("express");
const router = express.Router();
const odooService = require("../services/odoo");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, commonValidations, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

// Configuration Management
router.post("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { instance_url, db, username, api_key } = req.body;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!instance_url || !db || !username || !api_key) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: instance_url, db, username, api_key",
      });
    }

    const configData = {
      business_id: parseInt(businessId),
      url: instance_url.trim(),
      database: db.trim(),
      username: username.trim(), // This was missing!
      password: api_key.trim(),
    };

    // Test connection before saving
    await odooService.saveIntegration(configData);

    res.json({
      success: true,
      message: "Odoo integration configured successfully",
    });
  } catch (error) {
    console.error("Error configuring Odoo integration:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to configure Odoo integration",
    });
  }
});

router.get("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    const config = await odooService.getIntegration(parseInt(businessId));

    if (config) {
      res.json({
        success: true,
        data: {
          isIntegrated: true,
          instance_url: config.url,
          db: config.database,
          username: config.username,
          lastUpdated: config.updated_at,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          isIntegrated: false,
        },
      });
    }
  } catch (error) {
    console.error("Error getting Odoo integration:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get Odoo integration",
    });
  }
});

router.put(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await odooService.updateIntegration(parseInt(businessId), req.body);
    res.json(createResponse(true, config, "Odoo configuration updated successfully"));
  })
);

router.delete(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    await odooService.removeIntegration(parseInt(businessId));
    res.json(createResponse(true, null, "Odoo integration removed successfully"));
  })
);

// Integration Status
router.get(
  "/status/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const isIntegrated = await odooService.isIntegrated(parseInt(businessId));
    const config = await odooService.getConfig(parseInt(businessId));

    res.json(
      createResponse(true, {
        isIntegrated,
        config: config || null,
      })
    );
  })
);

// Test Connection
router.post(
  "/test/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const result = await odooService.testConnection(parseInt(businessId));
    res.json(createResponse(true, result, "Odoo connection test completed"));
  })
);

module.exports = router;
