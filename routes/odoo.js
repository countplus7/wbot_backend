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
      username: username.trim(),  // This was missing!
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

// CRM Operations
router.get(
  "/leads/:businessId",
  authMiddleware,
  validate([commonValidations.businessId, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const leads = await odooService.getLeads(parseInt(businessId), { page: parseInt(page), limit: parseInt(limit) });
    res.json(createResponse(true, leads));
  })
);

router.post(
  "/leads/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const lead = await odooService.createLead(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, lead, "Lead created successfully"));
  })
);

router.get(
  "/leads/:businessId/:leadId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, leadId } = req.params;
    const lead = await odooService.getLead(parseInt(businessId), parseInt(leadId));

    if (!lead) {
      return res.status(404).json(createResponse(false, null, "Lead not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, lead));
  })
);

router.put(
  "/leads/:businessId/:leadId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, leadId } = req.params;
    const lead = await odooService.updateLead(parseInt(businessId), parseInt(leadId), req.body);

    if (!lead) {
      return res.status(404).json(createResponse(false, null, "Lead not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, lead, "Lead updated successfully"));
  })
);

// Sales Operations
router.get(
  "/orders/:businessId",
  authMiddleware,
  validate([commonValidations.businessId, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const orders = await odooService.getOrders(parseInt(businessId), { page: parseInt(page), limit: parseInt(limit) });
    res.json(createResponse(true, orders));
  })
);

router.post(
  "/orders/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const order = await odooService.createOrder(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, order, "Order created successfully"));
  })
);

router.get(
  "/orders/:businessId/:orderId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, orderId } = req.params;
    const order = await odooService.getOrder(parseInt(businessId), parseInt(orderId));

    if (!order) {
      return res.status(404).json(createResponse(false, null, "Order not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, order));
  })
);

// Invoice Operations
router.get(
  "/invoices/:businessId",
  authMiddleware,
  validate([commonValidations.businessId, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const invoices = await odooService.getInvoices(parseInt(businessId), {
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json(createResponse(true, invoices));
  })
);

router.get(
  "/invoices/:businessId/:invoiceId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, invoiceId } = req.params;
    const invoice = await odooService.getInvoice(parseInt(businessId), parseInt(invoiceId));

    if (!invoice) {
      return res.status(404).json(createResponse(false, null, "Invoice not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, invoice));
  })
);

// Support Operations
router.get(
  "/tickets/:businessId",
  authMiddleware,
  validate([commonValidations.businessId, ...validationSets.pagination]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const tickets = await odooService.getTickets(parseInt(businessId), {
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json(createResponse(true, tickets));
  })
);

router.post(
  "/tickets/:businessId",
  authMiddleware,
  validate([commonValidations.businessId]),
  asyncHandler(async (req, res) => {
    const { businessId } = req.params;
    const ticket = await odooService.createTicket(parseInt(businessId), req.body);
    res.status(201).json(createResponse(true, ticket, "Ticket created successfully"));
  })
);

router.get(
  "/tickets/:businessId/:ticketId",
  authMiddleware,
  validate([commonValidations.businessId, commonValidations.id]),
  asyncHandler(async (req, res) => {
    const { businessId, ticketId } = req.params;
    const ticket = await odooService.getTicket(parseInt(businessId), parseInt(ticketId));

    if (!ticket) {
      return res.status(404).json(createResponse(false, null, "Ticket not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, ticket));
  })
);

module.exports = router;
