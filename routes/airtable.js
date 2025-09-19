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
 * Get Airtable records
 * GET /api/airtable/records/:businessId
 */
router.get(
  "/records/:businessId",
  authMiddleware,
  validate([commonValidations.businessId, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const records = await AirtableService.getRecords(parseInt(businessId), {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json(createResponse(true, records));
  })
);

/**
 * Create Airtable record
 * POST /api/airtable/records/:businessId
 */
router.post(
  "/records/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const record = await AirtableService.createRecord(parseInt(businessId), req.body);

    res.status(201).json(createResponse(true, record, "Airtable record created successfully"));
  })
);

/**
 * Update Airtable record
 * PUT /api/airtable/records/:businessId/:recordId
 */
router.put(
  "/records/:businessId/:recordId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, recordId } = req.params;
    const record = await AirtableService.updateRecord(parseInt(businessId), recordId, req.body);

    if (!record) {
      return res.status(404).json(createResponse(false, null, "Airtable record not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, record, "Airtable record updated successfully"));
  })
);

/**
 * Delete Airtable record
 * DELETE /api/airtable/records/:businessId/:recordId
 */
router.delete(
  "/records/:businessId/:recordId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, recordId } = req.params;
    const success = await AirtableService.deleteRecord(parseInt(businessId), recordId);

    if (!success) {
      return res.status(404).json(createResponse(false, null, "Airtable record not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, null, "Airtable record deleted successfully"));
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

module.exports = router;
