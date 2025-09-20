const express = require("express");
const router = express.Router();
const AirtableService = require("../services/airtable");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, commonValidations, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

/**
 * Get Airtable configuration for a business
 * GET /api/airtable/config/:businessId
 */
router.get(
  "/config/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await AirtableService.getConfig(parseInt(businessId));

    res.json(createResponse(true, config, config ? "Airtable configuration found" : "No Airtable configuration found"));
  })
);

/**
 * Create or update Airtable configuration for a business
 * POST /api/airtable/config/:businessId
 */
router.post("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const { access_token, base_id, table_name } = req.body;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    if (!access_token || !base_id || !table_name) {
      return res.status(400).json({
        success: false,
        error: "access_token, base_id, and table_name are required",
      });
    }

    const config = await AirtableService.saveConfig(parseInt(businessId), {
      access_token,
      base_id,
      table_name,
    });

    res.json({
      success: true,
      data: config,
      message: "Airtable configuration saved successfully",
    });
  } catch (error) {
    console.error("Error saving Airtable config:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to save Airtable configuration",
    });
  }
});

/**
 * Update Airtable configuration for a business
 * PUT /api/airtable/config/:businessId
 */
router.put(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await AirtableService.updateIntegration(parseInt(businessId), req.body);

    res.json(createResponse(true, config, "Airtable configuration updated successfully"));
  })
);

/**
 * Delete Airtable configuration for a business
 * DELETE /api/airtable/config/:businessId
 */
router.delete(
  "/config/:businessId",
  // authMiddleware,
  // adminMiddleware,
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    await AirtableService.removeConfig(parseInt(businessId));

    res.json(createResponse(true, null, "Airtable configuration deleted successfully"));
  })
);

/**
 * Test Airtable connection
 * POST /api/airtable/test/:businessId
 */
router.post(
  "/test/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const result = await AirtableService.testConnection(parseInt(businessId));

    res.json(createResponse(true, result, "Airtable connection test completed"));
  })
);

/**
 * Get Airtable integration status
 * GET /api/airtable/status/:businessId
 */
router.get(
  "/status/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const isIntegrated = await AirtableService.isIntegrated(parseInt(businessId));
    const config = await AirtableService.getConfig(parseInt(businessId));

    res.json(
      createResponse(true, {
        isIntegrated,
        config: config || null,
      })
    );
  })
);

module.exports = router;
