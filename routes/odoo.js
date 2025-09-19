const express = require("express");
const router = express.Router();
const odooService = require("../services/odoo");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { validate, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

// Configuration Management
router.post("/config/:businessId", authMiddleware, adminMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { instance_url, db, username, api_key } = req.body;

  if (!instance_url || !db || !username || !api_key) {
    return res.status(400).json(createResponse(false, null, "Missing required fields: instance_url, db, username, api_key", null, "VALIDATION_ERROR"));
  }

  const configData = {
    business_id: parseInt(businessId),
    url: instance_url.trim(),
    database: db.trim(),
    username: username.trim(),
    password: api_key.trim(),
  };

  await odooService.saveIntegration(configData);
  await odooService.testConnection(parseInt(businessId));

  res.json(createResponse(true, null, "Odoo integration configured successfully"));
}));

router.get("/config/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const config = await odooService.getIntegration(parseInt(businessId));
  
  const response = config ? {
    isIntegrated: true,
    instance_url: config.url,
    db: config.database,
    username: config.username,
    lastUpdated: config.updated_at
  } : {
    isIntegrated: false
  };

  res.json(createResponse(true, response));
}));

router.delete("/config/:businessId", authMiddleware, adminMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  await odooService.removeIntegration(parseInt(businessId));
  res.json(createResponse(true, null, "Odoo integration removed successfully"));
}));

// Test connection
router.post("/test/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const result = await odooService.testConnection(parseInt(businessId));
  res.json(createResponse(true, { userId: result.userId }, "Connection successful"));
}));

// CRM Operations
router.post("/leads/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const result = await odooService.createLead(parseInt(businessId), req.body);
  res.status(201).json(createResponse(true, { leadId: result.id }, "Lead created successfully"));
}));

router.get("/leads/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const leads = await odooService.getLeads(parseInt(businessId));
  res.json(createResponse(true, { leads }));
}));

// Sales Orders
router.post("/sales/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const result = await odooService.createSaleOrder(parseInt(businessId), req.body);
  res.status(201).json(createResponse(true, { orderId: result.id }, "Sale order created successfully"));
}));

// Invoices
router.get("/invoices/:businessId/:invoiceRef", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId, invoiceRef } = req.params;
  const invoice = await odooService.getInvoice(parseInt(businessId), invoiceRef);
  
  if (!invoice) {
    return res.status(404).json(createResponse(false, null, "Invoice not found", null, "NOT_FOUND_ERROR"));
  }
  
  res.json(createResponse(true, { invoice }));
}));

// Helpdesk Tickets
router.post("/tickets/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const result = await odooService.createTicket(parseInt(businessId), req.body);
  res.status(201).json(createResponse(true, { ticketId: result.id }, "Support ticket created successfully"));
}));

// Products
router.get("/products/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const products = await odooService.getProducts(parseInt(businessId));
  res.json(createResponse(true, { products }));
}));

// Customers
router.get("/customers/:businessId/search/:phone", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId, phone } = req.params;
  const customer = await odooService.searchCustomer(parseInt(businessId), phone);
  res.json(createResponse(true, { customer }));
}));

router.post("/customers/:businessId", authMiddleware, validate([validationSets.commonValidations.businessId]), asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const result = await odooService.createCustomer(parseInt(businessId), req.body);
  res.status(201).json(createResponse(true, { customerId: result.id }, "Customer created successfully"));
}));

module.exports = router;
