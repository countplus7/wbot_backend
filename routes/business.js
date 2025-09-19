const express = require("express");
const router = express.Router();
const businessService = require("../services/business");
const DatabaseService = require("../services/database");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, commonValidations, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

// Business Management Routes
router.get(
  "/businesses",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const businesses = await businessService.getAllBusinesses();
    res.json(createResponse(true, { businesses, count: businesses.length }));
  })
);

router.get(
  "/businesses/:id",
  authMiddleware,
  validate([commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const business = await businessService.getBusinessWithConfigAndTones(id);

    if (!business) {
      return res.status(404).json(createResponse(false, null, "Business not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, business));
  })
);

router.post(
  "/businesses",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.createBusiness),
  asyncHandler(async (req, res) => {
    const business = await businessService.createBusiness(req.body);
    res.status(201).json(createResponse(true, business, "Business created successfully"));
  })
);

router.put(
  "/businesses/:id",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.updateBusiness),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const business = await businessService.updateBusiness(id, req.body);

    if (!business) {
      return res.status(404).json(createResponse(false, null, "Business not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, business, "Business updated successfully"));
  })
);

router.delete(
  "/businesses/:id",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const business = await businessService.deleteBusiness(id);

    if (!business) {
      return res.status(404).json(createResponse(false, null, "Business not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, business, "Business deleted successfully"));
  })
);

// WhatsApp Configuration Routes
router.get(
  "/businesses/:businessId/whatsapp",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await businessService.getWhatsAppConfigByBusinessId(businessId);
    res.json(createResponse(true, config));
  })
);

router.post(
  "/businesses/:businessId/whatsapp",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.createWhatsAppConfig),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const configData = {
      ...req.body,
      business_id: parseInt(businessId),
    };
    const config = await businessService.createWhatsAppConfig(configData);
    res.status(201).json(createResponse(true, config, "WhatsApp configuration created successfully"));
  })
);

router.put(
  "/businesses/:businessId/whatsapp",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.updateWhatsAppConfig),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await businessService.updateWhatsAppConfig(businessId, req.body);

    if (!config) {
      return res
        .status(404)
        .json(createResponse(false, null, "WhatsApp configuration not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, config, "WhatsApp configuration updated successfully"));
  })
);

router.delete(
  "/businesses/:businessId/whatsapp",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const config = await businessService.deleteWhatsAppConfig(businessId);

    if (!config) {
      return res
        .status(404)
        .json(createResponse(false, null, "WhatsApp configuration not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, config, "WhatsApp configuration deleted successfully"));
  })
);

// Business Tone Routes
router.get(
  "/businesses/:businessId/tones",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const tones = await businessService.getBusinessTones(businessId);
    res.json(createResponse(true, { tones, count: tones.length }));
  })
);

router.get(
  "/businesses/:businessId/tones/:toneId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { toneId } = req.params;
    const tone = await businessService.getBusinessTone(toneId);

    if (!tone) {
      return res.status(404).json(createResponse(false, null, "Business tone not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, tone));
  })
);

router.post(
  "/businesses/:businessId/tones",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.createBusinessTone),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const tone = await businessService.createBusinessTone(businessId, req.body);
    res.status(201).json(createResponse(true, tone, "Business tone created successfully"));
  })
);

router.put(
  "/businesses/:businessId/tones/:toneId",
  authMiddleware,
  adminMiddleware,
  validate(validationSets.updateBusinessTone),
  asyncHandler(async (req, res) => {
    const { toneId } = req.params;
    const tone = await businessService.updateBusinessTone(toneId, req.body);

    if (!tone) {
      return res.status(404).json(createResponse(false, null, "Business tone not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, tone, "Business tone updated successfully"));
  })
);

router.delete(
  "/businesses/:businessId/tones/:toneId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { toneId } = req.params;
    const tone = await businessService.deleteBusinessTone(toneId);

    if (!tone) {
      return res.status(404).json(createResponse(false, null, "Business tone not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, tone, "Business tone deleted successfully"));
  })
);

// Conversation Management Routes
router.get(
  "/businesses/:businessId/conversations",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const conversations = await DatabaseService.getBusinessConversations(businessId);
    res.json(createResponse(true, { conversations, count: conversations.length }));
  })
);

router.get(
  "/businesses/:businessId/conversations/:conversationId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const conversation = await DatabaseService.getConversationDetails(conversationId);

    if (!conversation) {
      return res.status(404).json(createResponse(false, null, "Conversation not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, conversation));
  })
);

router.get(
  "/businesses/:businessId/conversations/:conversationId/messages",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const messages = await DatabaseService.getConversationMessages(conversationId, limit, offset);
    res.json(createResponse(true, { messages, count: messages.length, page: parseInt(page), limit: parseInt(limit) }));
  })
);

router.delete(
  "/businesses/:businessId/conversations/:conversationId",
  authMiddleware,
  adminMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const conversation = await DatabaseService.deleteConversation(conversationId);

    if (!conversation) {
      return res.status(404).json(createResponse(false, null, "Conversation not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, conversation, "Conversation deleted successfully"));
  })
);

module.exports = router;
