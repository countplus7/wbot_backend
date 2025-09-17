const express = require("express");
const router = express.Router();
const AirtableService = require("../services/airtable");

/**
 * Get Airtable configuration for a business
 * GET /api/airtable/config/:businessId
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

    const config = await AirtableService.getConfig(parseInt(businessId));

    res.json({
      success: true,
      data: config,
      message: config ? "Airtable configuration found" : "No Airtable configuration found",
    });
  } catch (error) {
    console.error("Error getting Airtable config:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get Airtable configuration",
    });
  }
});

/**
 * Create or update Airtable configuration
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
 * Delete Airtable configuration
 * DELETE /api/airtable/config/:businessId
 */
router.delete("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const deleted = await AirtableService.deleteConfig(parseInt(businessId));

    res.json({
      success: true,
      deleted,
      message: deleted ? "Airtable configuration deleted successfully" : "No Airtable configuration found to delete",
    });
  } catch (error) {
    console.error("Error deleting Airtable config:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to delete Airtable configuration",
    });
  }
});

/**
 * Test Airtable connection
 * POST /api/airtable/test/:businessId
 */
router.post("/test/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const result = await AirtableService.testConnection(parseInt(businessId));

    res.json({
      success: result.success,
      message: result.message,
      error: result.error,
    });
  } catch (error) {
    console.error("Error testing Airtable connection:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to test Airtable connection",
    });
  }
});

/**
 * Get all FAQs from Airtable
 * GET /api/airtable/faqs/:businessId
 */
router.get("/faqs/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const faqs = await AirtableService.getFAQs(parseInt(businessId));

    res.json({
      success: true,
      data: faqs,
      count: faqs.length,
      message: `Found ${faqs.length} FAQs`,
    });
  } catch (error) {
    console.error("Error getting FAQs:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get FAQs from Airtable",
    });
  }
});

module.exports = router;
