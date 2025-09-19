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
  // validate([commonValidations.id]),
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
  // validate(validationSets.createBusiness),
  asyncHandler(async (req, res) => {
    const business = await businessService.createBusiness(req.body);
    res.status(201).json(createResponse(true, business, "Business created successfully"));
  })
);

router.put(
  "/businesses/:id",
  authMiddleware,
  adminMiddleware,
  // validate(validationSets.updateBusiness),
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
  // validate([commonValidations.id]),
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
  // validate([commonValidations.businessId]),
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
  // validate(validationSets.createWhatsAppConfig),
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
  // validate(validationSets.updateWhatsAppConfig),
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
  // validate([commonValidations.id]),
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
  "/businesses/:businessId/tone",
  authMiddleware,
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const tone = await businessService.getBusinessTone(businessId);

    // Return single object, not array
    res.json(createResponse(true, tone));
  })
);

router.post(
  "/businesses/:businessId/tone",
  authMiddleware,
  adminMiddleware,
  // validate(validationSets.createBusinessTone),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const tone = await businessService.createBusinessTone(businessId, req.body);
    res.status(201).json(createResponse(true, tone, "Business tone created successfully"));
  })
);

router.put(
  "/businesses/:businessId/tone/:toneId",
  authMiddleware,
  adminMiddleware,
  // validate(validationSets.updateBusinessTone),
  asyncHandler(async (req, res) => {
    const { businessId, toneId } = req.params;
    const tone = await businessService.updateBusinessTone(businessId, toneId, req.body);

    if (!tone) {
      return res.status(404).json(createResponse(false, null, "Business tone not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, tone, "Business tone updated successfully"));
  })
);

router.delete(
  "/businesses/:businessId/tone/:toneId",
  authMiddleware,
  adminMiddleware,
  // validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, toneId } = req.params;
    const tone = await businessService.deleteBusinessTone(businessId, toneId);

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
  // validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    const conversations = await DatabaseService.getBusinessConversations(businessId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });

    // Match frontend expected format
    res.json(
      createResponse(true, {
        conversations: conversations.data || conversations,
        total: conversations.total || conversations.length,
        page: parseInt(page),
        limit: parseInt(limit),
      })
    );
  })
);

router.get(
  "/businesses/:businessId/conversations/:conversationId",
  authMiddleware,
  // validate([commonValidations.businessId, commonValidations.id]),
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
  // validate([commonValidations.businessId, commonValidations.id, ...validationSets.pagination]),
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
  // validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const conversation = await DatabaseService.deleteConversation(conversationId);

    if (!conversation) {
      return res.status(404).json(createResponse(false, null, "Conversation not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, conversation, "Conversation deleted successfully"));
  })
);

/**
 * Get conversation messages (direct endpoint for frontend)
 * GET /api/basic/conversations/:conversationId/messages
 */
router.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  // validate([commonValidations.id, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const messages = await DatabaseService.getConversationMessages(conversationId, limit, offset);

    res.json(
      createResponse(true, {
        messages: Array.isArray(messages) ? messages : messages.data || [],
        total: messages.total || messages.length || 0,
        page: parseInt(page),
        limit: parseInt(limit),
      })
    );
  })
);

/**
 * Archive conversation
 * PATCH /api/basic/conversations/:conversationId
 */
router.patch(
  "/conversations/:conversationId",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { status, action } = req.body;

    // Handle different request formats
    let targetStatus = null;
    
    if (action === "delete") {
      // Handle delete action
      const conversation = await DatabaseService.deleteConversation(conversationId);
      if (!conversation) {
        return res.status(404).json(createResponse(false, null, "Conversation not found", null, "NOT_FOUND_ERROR"));
      }
      return res.json(createResponse(true, conversation, "Conversation deleted successfully"));
    } else if (action === "update_status" && status) {
      targetStatus = status;
    } else if (status && !action) {
      // Handle direct status update (current frontend format)
      targetStatus = status;
    } else {
      return res.status(400).json(createResponse(false, null, "Invalid action. Use 'delete' or 'update_status' with status field", null, "VALIDATION_ERROR"));
    }

    if (targetStatus && !["active", "archived"].includes(targetStatus)) {
      return res.status(400).json(createResponse(false, null, "Valid status is required", null, "VALIDATION_ERROR"));
    }

    const conversation = await DatabaseService.updateConversationStatus(conversationId, targetStatus);

    if (!conversation) {
      return res.status(404).json(createResponse(false, null, "Conversation not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, conversation, "Conversation status updated successfully"));
  })
);

module.exports = router;
