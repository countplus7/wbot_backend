const axios = require("axios");
const pool = require("../config/database");

class OdooService {
  constructor() {
    // Odoo uses JSON-RPC 2.0 for API calls
  }

  // ---------- DATABASE ----------
  async saveIntegration(data) {
    const query = `
      INSERT INTO odoo_integrations
        (business_id, instance_url, db, username, api_key, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (business_id)
      DO UPDATE SET
        instance_url = EXCLUDED.instance_url,
        db = EXCLUDED.db,
        username = EXCLUDED.username,
        api_key = EXCLUDED.api_key,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `;
    const values = [data.business_id, data.instance_url, data.db, data.username, data.api_key];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getIntegration(businessId) {
    const query = `
      SELECT * FROM odoo_integrations
      WHERE business_id = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `;
    const result = await pool.query(query, [businessId]);
    return result.rows[0] || null;
  }

  async removeIntegration(businessId) {
    const query = `
      DELETE FROM odoo_integrations
      WHERE business_id = $1;
    `;
    await pool.query(query, [businessId]);
    return { success: true };
  }

  // ---------- ODOO API CLIENT ----------
  async getAuthenticatedClient(businessId) {
    const integration = await this.getIntegration(businessId);
    if (!integration) throw new Error("No Odoo integration found");

    return {
      instance_url: integration.instance_url,
      db: integration.db,
      username: integration.username,
      api_key: integration.api_key,
    };
  }

  // ---------- JSON-RPC HELPER ----------
  async makeJsonRpcCall(businessId, method, model, args = [], kwargs = {}) {
    const auth = await this.getAuthenticatedClient(businessId);

    console.log('Odoo makeJsonRpcCall - businessId:', businessId);
    console.log('Odoo makeJsonRpcCall - method:', method);
    console.log('Odoo makeJsonRpcCall - model:', model);
    console.log('Odoo makeJsonRpcCall - args:', args);
    console.log('Odoo makeJsonRpcCall - auth:', {
      instance_url: auth.instance_url,
      db: auth.db,
      username: auth.username,
      api_key: auth.api_key ? '***' : 'null'
    });

    // First, authenticate to get the user ID
    const authPayload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [auth.db, auth.username, auth.api_key, {}],
      },
      id: 1,
    };

    console.log('Odoo auth payload:', JSON.stringify(authPayload, null, 2));

    const authResponse = await axios.post(`${auth.instance_url}/jsonrpc`, authPayload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log('Odoo auth response:', JSON.stringify(authResponse.data, null, 2));

    if (authResponse.data.error) {
      console.error('Odoo authentication failed:', authResponse.data.error);
      throw new Error(`Odoo Authentication Error: ${authResponse.data.error.message || JSON.stringify(authResponse.data.error)}`);
    }

    const userId = authResponse.data.result;
    console.log('Odoo authentication successful, userId:', userId);

    // Now make the actual API call
    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute",
        args: [auth.db, userId, auth.api_key, model, method, ...args],
        kwargs: kwargs,
      },
      id: Math.floor(Math.random() * 1000000),
    };

    console.log('Odoo API payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(`${auth.instance_url}/jsonrpc`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log('Odoo API response:', JSON.stringify(response.data, null, 2));

    if (response.data.error) {
      console.error('Odoo API error details:', response.data.error);
      throw new Error(`Odoo API Error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
    }

    return response.data.result;
  }

  // ---------- SIMPLE TEST ----------
  async simpleTest(businessId) {
    try {
      const auth = await this.getAuthenticatedClient(businessId);
      
      // Just try to authenticate first
      const payload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [auth.db, auth.username, auth.api_key, {}],
        },
        id: 1,
      };

      console.log('Simple test payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(`${auth.instance_url}/jsonrpc`, payload, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log('Simple test response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        throw new Error(`Simple test failed: ${response.data.error.message || JSON.stringify(response.data.error)}`);
      }

      return { success: true, userId: response.data.result };
    } catch (error) {
      console.error("Simple test failed:", error);
      throw error;
    }
  }

  // ---------- TEST CONNECTION ----------
  async testConnection(businessId) {
    try {
      // Test by getting current user info
      const auth = await this.getAuthenticatedClient(businessId);
      
      console.log('Testing Odoo connection for businessId:', businessId);
      console.log('Auth details:', {
        instance_url: auth.instance_url,
        db: auth.db,
        username: auth.username,
        api_key: auth.api_key ? '***' : 'null'
      });

      const payload = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "common",
          method: "authenticate",
          args: [auth.db, auth.username, auth.api_key, {}],
        },
        id: 1,
      };

      console.log('Test connection payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${auth.instance_url}/jsonrpc`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log('Test connection response:', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        console.error('Test connection failed:', response.data.error);
        throw new Error(`Authentication failed: ${response.data.error.message || JSON.stringify(response.data.error)}`);
      }

      console.log('Test connection successful, userId:', response.data.result);
      return { success: true, userId: response.data.result };
    } catch (error) {
      console.error("Odoo connection test failed:", error);
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  // ---------- CRM LEADS ----------
  async createLead(businessId, leadData) {
    const values = {
      name: leadData.name,
      partner_name: leadData.partner_name,
      email_from: leadData.email,
      phone: leadData.phone,
      description: leadData.description,
      source_id: 1, // Default source - could be "WhatsApp Bot"
    };

    const result = await this.makeJsonRpcCall(businessId, "create", "crm.lead", [values]);

    return { id: result, success: true };
  }

  async getLeads(businessId, limit = 50) {
    const leads = await this.makeJsonRpcCall(
      businessId,
      "search_read",
      "crm.lead",
      [
        [], // domain (empty = all records)
        ["id", "name", "partner_name", "email_from", "phone", "stage_id", "create_date"], // fields
      ],
      { limit }
    );

    return leads || [];
  }

  // ---------- SALES ORDERS ----------
  async createSaleOrder(businessId, orderData) {
    try {
      const values = {
        partner_id: orderData.partner_id, // Customer ID
        order_line: orderData.order_lines.map(line => [0, 0, {
          product_id: line.product_id,
          product_uom_qty: line.quantity,
          price_unit: line.price_unit,
        }]),
      };

      const result = await this.makeJsonRpcCall(
        businessId,
        "create",
        "sale.order",
        [values]
      );

      return { id: result, success: true };
    } catch (error) {
      if (error.message.includes("Object sale.order doesn't exist")) {
        throw new Error("Sales module is not installed in this Odoo instance. Please install the Sales module to enable order management.");
      }
      throw error;
    }
  }

  // ---------- INVOICES ----------
  async getInvoice(businessId, invoiceRef) {
    const invoices = await this.makeJsonRpcCall(businessId, "search_read", "account.move", [
      [
        ["name", "=", invoiceRef],
        ["move_type", "=", "out_invoice"],
      ],
      ["id", "name", "partner_id", "amount_total", "payment_state", "state"],
    ]);

    return invoices && invoices.length > 0 ? invoices[0] : null;
  }

  // ---------- HELPDESK TICKETS ----------
  async createTicket(businessId, ticketData) {
    const values = {
      name: ticketData.subject,
      description: ticketData.description,
      partner_id: ticketData.partner_id,
      priority: ticketData.priority || "1",
    };

    const result = await this.makeJsonRpcCall(businessId, "create", "helpdesk.ticket", [values]);

    return { id: result, success: true };
  }

  // ---------- PRODUCTS ----------
  async getProducts(businessId, limit = 100) {
    try {
      // First try with basic fields only
      let products;
      try {
        products = await this.makeJsonRpcCall(
          businessId,
          "search_read",
          "product.product",
          [
            [["sale_ok", "=", true]], // Only products that can be sold
            ["id", "name", "list_price"], // Basic fields that should always exist
          ],
          { limit }
        );
      } catch (fieldError) {
        if (fieldError.message.includes("Invalid field")) {
          // If even basic fields fail, try with minimal fields
          products = await this.makeJsonRpcCall(
            businessId,
            "search_read",
            "product.product",
            [
              [["sale_ok", "=", true]],
              ["id", "name"], // Absolute minimum fields
            ],
            { limit }
          );
          
          // Add default price for products without price field
          products = products.map(product => ({
            ...product,
            list_price: 0 // Default price if list_price field is not available
          }));
        } else {
          throw fieldError;
        }
      }

      return products || [];
    } catch (error) {
      if (error.message.includes("Object product.product doesn't exist")) {
        throw new Error("Sales module is not installed in this Odoo instance. Please install the Sales module to enable product management.");
      }
      
      if (error.message.includes("Invalid field")) {
        throw new Error("Product fields are not accessible. This might indicate missing modules or insufficient permissions in Odoo.");
      }
      
      throw error;
    }
  }

  // ---------- CUSTOMERS ----------
  async searchCustomer(businessId, phone) {
    const customers = await this.makeJsonRpcCall(businessId, "search_read", "res.partner", [
      [["phone", "=", phone]],
      ["id", "name", "email", "phone"],
    ]);

    return customers && customers.length > 0 ? customers[0] : null;
  }

  async createCustomer(businessId, customerData) {
    const values = {
      name: customerData.name,
      phone: customerData.phone,
      email: customerData.email,
      is_company: false,
    };

    const result = await this.makeJsonRpcCall(businessId, "create", "res.partner", [values]);

    return { id: result, success: true };
  }

  // ---------- CHECK MODULES ----------
  async checkAvailableModules(businessId) {
    const moduleStatus = {
      hasProducts: false,
      hasSales: false,
      hasCRM: false,
      hasHelpdesk: false,
      hasPartners: false,
      availableModels: []
    };

    // Test each model individually with a simple search
    const modelsToTest = [
      { model: "product.product", key: "hasProducts" },
      { model: "sale.order", key: "hasSales" },
      { model: "crm.lead", key: "hasCRM" },
      { model: "helpdesk.ticket", key: "hasHelpdesk" },
      { model: "res.partner", key: "hasPartners" }
    ];

    for (const { model, key } of modelsToTest) {
      try {
        // Just try to search with an empty domain to test if model exists
        await this.makeJsonRpcCall(businessId, "search", model, [[]]);
        moduleStatus[key] = true;
        moduleStatus.availableModels.push(model);
        console.log(`✅ ${model} is available`);
      } catch (error) {
        console.log(`❌ ${model} is not available: ${error.message}`);
        moduleStatus[key] = false;
      }
    }

    return moduleStatus;
  }
}

module.exports = new OdooService();
