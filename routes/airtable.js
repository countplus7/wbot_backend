const express = require("express");
const router = express.Router();
const AirtableService = require("../services/airtable");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

/**
 * Get Airtable configuration for a business
 * GET /api/airtable/config/:businessId
 */
router.get(
  "/config/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await AirtableService.getConfig(parseInt(businessId));

    res.json(createResponse(true, config, config ? "Airtable configuration found" : "No Airtable configuration found"));
  })
);

/**
 * Create or update Airtable configuration
 * POST /api/airtable/config/:businessId
 */
router.post(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.createAirtableConfig),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { access_token, base_id, table_name } = req.body;

    const config = await AirtableService.saveConfig(parseInt(businessId), {
      access_token,
      base_id,
      table_name,
    });

    res.status(201).json(createResponse(true, config, "Airtable configuration saved successfully"));
  })
);

/**
 * Delete Airtable configuration
 * DELETE /api/airtable/config/:businessId
 */
router.delete(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const deleted = await AirtableService.deleteConfig(parseInt(businessId));

    res.json(
      createResponse(
        true,
        { deleted },
        deleted ? "Airtable configuration deleted successfully" : "No Airtable configuration found to delete"
      )
    );
  })
);

/**
 * Test Airtable connection
 * POST /api/airtable/test/:businessId
 */
router.post(
  "/test/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const result = await AirtableService.testConnection(parseInt(businessId));

    res.json(createResponse(result.success, result, result.message));
  })
);

/**
 * Get all FAQs from Airtable
 * GET /api/airtable/faqs/:businessId
 */
router.get(
  "/faqs/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const faqs = await AirtableService.getFAQs(parseInt(businessId));

    res.json(createResponse(true, { faqs, count: faqs.length }, `Found ${faqs.length} FAQs`));
  })
);

/**
 * Search FAQs in Airtable
 * POST /api/airtable/faqs/:businessId/search
 */
router.post(
  "/faqs/:businessId/search",
  authMiddleware,
  validate([validationSets.commonValidations.businessId, ...validationSets.search]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { searchTerm } = req.body;

    const results = await AirtableService.searchFAQs(parseInt(businessId), searchTerm);

    res.json(createResponse(true, { results, count: results.length }, `Found ${results.length} matching FAQs`));
  })
);

/**
 * Get FAQ statistics
 * GET /api/airtable/faqs/:businessId/stats
 */
router.get(
  "/faqs/:businessId/stats",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const stats = await AirtableService.getFAQStats(parseInt(businessId));

    res.json(createResponse(true, stats, "FAQ statistics retrieved successfully"));
  })
);

module.exports = router;
