const express = require("express");
const router = express.Router();
const businessService = require("../services/business");
const DatabaseService = require("../services/database");

// Input validation middleware
const validateBusiness = (req, res, next) => {
  const { name, description } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      error: "Validation failed",
      details: "Business name is required and cannot be empty",
    });
  }
  if (name.length > 100) {
    return res.status(400).json({
      error: "Validation failed",
      details: "Business name cannot exceed 100 characters",
    });
  }
  next();
};

const validateWhatsAppConfig = (req, res, next) => {
  const { phone_number_id, access_token } = req.body;
  if (!phone_number_id || !access_token) {
    return res.status(400).json({
      error: "Validation failed",
      details: "Phone number ID and access token are required",
    });
  }
  next();
};

const validateBusinessTone = (req, res, next) => {
  const { name, tone_instructions } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({
      error: "Validation failed",
      details: "Tone name is required and cannot be empty",
    });
  }
  if (!tone_instructions || tone_instructions.trim().length === 0) {
    return res.status(400).json({
      error: "Validation failed",
      details: "Tone instructions are required and cannot be empty",
    });
  }
  if (name.length > 50) {
    return res.status(400).json({
      error: "Validation failed",
      details: "Tone name cannot exceed 50 characters",
    });
  }
  next();
};

// Business Management Routes
router.get("/businesses", async (req, res) => {
  try {
    const businesses = await businessService.getAllBusinesses();
    res.json({
      success: true,
      data: businesses,
      count: businesses.length,
    });
  } catch (error) {
    console.error("Error getting businesses:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve businesses",
      message: error.message,
    });
  }
});

router.get("/businesses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: "Invalid business ID",
      });
    }

    const business = await businessService.getBusinessWithConfigAndTones(id);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: "Business not found",
      });
    }

    res.json({
      success: true,
      data: business,
    });
  } catch (error) {
    console.error("Error getting business:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve business",
      message: error.message,
    });
  }
});

router.post("/businesses", validateBusiness, async (req, res) => {
  try {
    const { name, description, status = "active" } = req.body;

    const business = await businessService.createBusiness({
      name: name.trim(),
      description: description?.trim() || null,
      status,
    });

    res.status(201).json({
      success: true,
      data: business,
      message: "Business created successfully",
    });
  } catch (error) {
    console.error("Error creating business:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create business",
      message: error.message,
    });
  }
});

router.put("/businesses/:id", validateBusiness, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: "Invalid business ID",
      });
    }

    const business = await businessService.updateBusiness(id, {
      name: name.trim(),
      description: description?.trim() || null,
      status,
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "Business not found",
      });
    }

    res.json({
      success: true,
      data: business,
      message: "Business updated successfully",
    });
  } catch (error) {
    console.error("Error updating business:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update business",
      message: error.message,
    });
  }
});

router.delete("/businesses/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: "Invalid business ID",
      });
    }

    const result = await businessService.deleteBusiness(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: "Business not found",
      });
    }

    res.json({
      success: true,
      message: "Business deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting business:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete business",
      message: error.message,
    });
  }
});

// WhatsApp Configuration Routes
router.get("/businesses/:businessId/whatsapp-config", async (req, res) => {
  try {
    const { businessId } = req.params;
    const config = await businessService.getWhatsAppConfigByBusinessId(businessId);

    res.json({
      success: true,
      data: config,
      count: config ? 1 : 0,
    });
  } catch (error) {
    console.error("Error getting WhatsApp config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve WhatsApp configuration",
      message: error.message,
    });
  }
});

router.post("/businesses/:businessId/whatsapp-config", validateWhatsAppConfig, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { phone_number_id, access_token, verify_token, webhook_url } = req.body;

    const config = await businessService.createWhatsAppConfig({
      business_id: businessId,
      phone_number_id,
      access_token,
      verify_token,
      webhook_url,
    });

    res.status(201).json({
      success: true,
      data: config,
      message: "WhatsApp configuration created successfully",
    });
  } catch (error) {
    console.error("Error creating WhatsApp config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create WhatsApp configuration",
      message: error.message,
    });
  }
});

router.put("/whatsapp-config/:id", validateWhatsAppConfig, async (req, res) => {
  try {
    const { id } = req.params;
    const { phone_number_id, access_token, verify_token, webhook_url } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: "Invalid configuration ID",
      });
    }

    const config = await businessService.updateWhatsAppConfig(id, {
      phone_number_id,
      access_token,
      verify_token,
      webhook_url,
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp configuration not found",
      });
    }

    res.json({
      success: true,
      data: config,
      message: "WhatsApp configuration updated successfully",
    });
  } catch (error) {
    console.error("Error updating WhatsApp config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update WhatsApp configuration",
      message: error.message,
    });
  }
});

router.delete("/whatsapp-config/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: "Invalid configuration ID",
      });
    }

    const result = await businessService.deleteWhatsAppConfig(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp configuration not found",
      });
    }

    res.json({
      success: true,
      message: "WhatsApp configuration deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting WhatsApp config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete WhatsApp configuration",
      message: error.message,
    });
  }
});

// Business Tone Routes
router.get("/businesses/:businessId/tone", async (req, res) => {
  try {
    const { businessId } = req.params;
    const tone = await businessService.getBusinessTone(businessId);

    res.json({
      success: true,
      data: tone,
    });
  } catch (error) {
    console.error("Error getting business tone:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve business tone",
      message: error.message,
    });
  }
});

router.post("/businesses/:businessId/tone", validateBusinessTone, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { name, description, tone_instructions } = req.body;

    const tone = await businessService.createBusinessTone({
      business_id: businessId,
      name: name.trim(),
      description: description?.trim() || null,
      tone_instructions: tone_instructions.trim(),
    });

    res.status(201).json({
      success: true,
      data: tone,
      message: "Business tone created/updated successfully",
    });
  } catch (error) {
    console.error("Error creating/updating business tone:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create/update business tone",
      message: error.message,
    });
  }
});

router.put("/tones/:id", validateBusinessTone, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, tone_instructions, business_id } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        error: "Invalid tone ID",
      });
    }

    const tone = await businessService.updateBusinessTone(id, {
      name: name.trim(),
      description: description?.trim() || null,
      tone_instructions: tone_instructions.trim(),
      business_id,
    });

    if (!tone) {
      return res.status(404).json({
        success: false,
        error: "Business tone not found",
      });
    }

    res.json({
      success: true,
      data: tone,
      message: "Business tone updated successfully",
    });
  } catch (error) {
    console.error("Error updating business tone:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update business tone",
      message: error.message,
    });
  }
});

// Get all conversations for a business
router.get("/businesses/:businessId/conversations", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(parseInt(businessId))) {
      return res.status(400).json({
        success: false,
        error: "Invalid business ID",
      });
    }

    const conversations = await DatabaseService.getBusinessConversations(businessId);

    res.json({
      success: true,
      data: conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error("Error getting business conversations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get conversations",
      message: error.message,
    });
  }
});

// Get messages for a specific conversation
router.get("/conversations/:conversationId/messages", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!conversationId || isNaN(parseInt(conversationId))) {
      return res.status(400).json({
        success: false,
        error: "Invalid conversation ID",
      });
    }

    const messages = await DatabaseService.getConversationMessages(conversationId, parseInt(limit), parseInt(offset));

    const conversation = await DatabaseService.getConversationDetails(conversationId);

    res.json({
      success: true,
      data: {
        conversation,
        messages,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          count: messages.length,
        },
      },
    });
  } catch (error) {
    console.error("Error getting conversation messages:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get messages",
      message: error.message,
    });
  }
});

// Delete a conversation
router.delete("/conversations/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId || isNaN(parseInt(conversationId))) {
      return res.status(400).json({
        success: false,
        error: "Invalid conversation ID",
      });
    }

    const deletedConversation = await DatabaseService.deleteConversation(conversationId);

    if (!deletedConversation) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found",
      });
    }

    res.json({
      success: true,
      data: deletedConversation,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete conversation",
      message: error.message,
    });
  }
});

module.exports = router;
