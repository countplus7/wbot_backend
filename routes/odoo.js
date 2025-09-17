const express = require("express");
const router = express.Router();
const odooService = require("../services/odoo");

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
        error: "Missing required fields: instance_url, db, username, api_key"
      });
    }

    const configData = {
      business_id: parseInt(businessId),
      url: instance_url.trim(),           // Map instance_url to url
      database: db.trim(),                // Map db to database
      username: username.trim(),
      password: api_key.trim(),           // Map api_key to password
    };

    // Test connection before saving
    await odooService.saveIntegration(configData);
    await odooService.testConnection(parseInt(businessId));

    res.json({
      success: true,
      message: "Odoo integration configured successfully"
    });
  } catch (error) {
    console.error("Error configuring Odoo integration:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to configure Odoo integration"
    });
  }
});

router.get("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;

    if (!businessId || isNaN(businessId)) {
      return res.status(400).json({
        success: false,
        error: "Valid business ID is required",
      });
    }

    const config = await odooService.getIntegration(parseInt(businessId));
    
    if (config) {
      res.json({
        success: true,
        data: {
          isIntegrated: true,
          instance_url: config.url,        // Map url to instance_url for frontend
          db: config.database,             // Map database to db for frontend
          username: config.username,
          lastUpdated: config.updated_at
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          isIntegrated: false
        }
      });
    }
  } catch (error) {
    console.error("Error getting Odoo integration:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get Odoo integration"
    });
  }
});

router.delete("/config/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    await odooService.removeIntegration(parseInt(businessId));
    
    res.json({
      success: true,
      message: "Odoo integration removed successfully"
    });
  } catch (error) {
    console.error("Error removing Odoo config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove Odoo configuration"
    });
  }
});

// Test connection
router.post("/test/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const result = await odooService.testConnection(parseInt(businessId));
    
    res.json({
      success: true,
      message: "Connection successful",
      userId: result.userId
    });
  } catch (error) {
    console.error("Error testing Odoo connection:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Connection test failed"
    });
  }
});

// CRM Operations
router.post("/leads/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const result = await odooService.createLead(parseInt(businessId), req.body);
    
    res.json({
      success: true,
      leadId: result.id,
      message: "Lead created successfully"
    });
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create lead"
    });
  }
});

router.get("/leads/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const leads = await odooService.getLeads(parseInt(businessId));
    
    res.json({
      success: true,
      leads: leads
    });
  } catch (error) {
    console.error("Error getting leads:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get leads"
    });
  }
});

// Sales Orders
router.post("/sales/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const result = await odooService.createSaleOrder(parseInt(businessId), req.body);
    
    res.json({
      success: true,
      orderId: result.id,
      message: "Sale order created successfully"
    });
  } catch (error) {
    console.error("Error creating sale order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create sale order"
    });
  }
});

// Invoices
router.get("/invoices/:businessId/:invoiceRef", async (req, res) => {
  try {
    const { businessId, invoiceRef } = req.params;
    const invoice = await odooService.getInvoice(parseInt(businessId), invoiceRef);
    
    if (invoice) {
      res.json({
        success: true,
        invoice: invoice
      });
    } else {
      res.status(404).json({
        success: false,
        error: "Invoice not found"
      });
    }
  } catch (error) {
    console.error("Error getting invoice:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get invoice"
    });
  }
});

// Helpdesk Tickets
router.post("/tickets/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const result = await odooService.createTicket(parseInt(businessId), req.body);
    
    res.json({
      success: true,
      ticketId: result.id,
      message: "Support ticket created successfully"
    });
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create ticket"
    });
  }
});

// Products
router.get("/products/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const products = await odooService.getProducts(parseInt(businessId));
    
    res.json({
      success: true,
      products: products
    });
  } catch (error) {
    console.error("Error getting products:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get products"
    });
  }
});

// Customers
router.get("/customers/:businessId/search/:phone", async (req, res) => {
  try {
    const { businessId, phone } = req.params;
    const customer = await odooService.searchCustomer(parseInt(businessId), phone);
    
    res.json({
      success: true,
      customer: customer
    });
  } catch (error) {
    console.error("Error searching customer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search customer"
    });
  }
});

router.post("/customers/:businessId", async (req, res) => {
  try {
    const { businessId } = req.params;
    const result = await odooService.createCustomer(parseInt(businessId), req.body);
    
    res.json({
      success: true,
      customerId: result.id,
      message: "Customer created successfully"
    });
  } catch (error) {
    console.error("Error creating customer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create customer"
    });
  }
});

module.exports = router;
