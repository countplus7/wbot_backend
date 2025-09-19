const express = require("express");
const router = express.Router();
const HubSpotService = require("../services/hubspot");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

// OAuth Integration
router.get(
  "/auth/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const authUrl = HubSpotService.getAuthUrl(parseInt(businessId));
    res.json(createResponse(true, { authUrl }));
  })
);

router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
      return res
        .status(400)
        .json(createResponse(false, null, "Missing authorization code or state", null, "VALIDATION_ERROR"));
    }

    const { businessId } = JSON.parse(state);
    const result = await HubSpotService.exchangeCodeForTokens(code, businessId);

    res.json(createResponse(true, result, "HubSpot integration successful"));
  })
);

// Configuration Management
router.get(
  "/config/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const integration = await HubSpotService.getIntegration(parseInt(businessId));

    const response = integration
      ? {
          isIntegrated: true,
          email: integration.email || "Unknown",
          user_id: integration.user_id || "Unknown",
          lastUpdated: integration.updated_at,
        }
      : {
          isIntegrated: false,
          message: "No HubSpot integration found",
        };

    res.json(createResponse(true, response));
  })
);

router.delete(
  "/config/:businessId",
  authMiddleware,
  adminMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    await HubSpotService.deleteIntegration(parseInt(businessId));
    res.json(createResponse(true, null, "HubSpot integration removed successfully"));
  })
);

// CRM Operations
router.post(
  "/contacts/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const contactData = req.body;
    const result = await HubSpotService.createContact(parseInt(businessId), contactData);
    res.status(201).json(createResponse(true, result, "Contact created successfully"));
  })
);

router.post(
  "/companies/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const companyData = req.body;
    const result = await HubSpotService.createCompany(parseInt(businessId), companyData);
    res.status(201).json(createResponse(true, result, "Company created successfully"));
  })
);

router.post(
  "/deals/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const dealData = req.body;
    const result = await HubSpotService.createDeal(parseInt(businessId), dealData);
    res.status(201).json(createResponse(true, result, "Deal created successfully"));
  })
);

router.post(
  "/contacts/search/:businessId",
  authMiddleware,
  validate([validationSets.commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { searchTerm } = req.body;

    if (!searchTerm) {
      return res.status(400).json(createResponse(false, null, "Search term is required", null, "VALIDATION_ERROR"));
    }

    const result = await HubSpotService.searchContacts(parseInt(businessId), searchTerm);
    res.json(createResponse(true, result));
  })
);

module.exports = router;
