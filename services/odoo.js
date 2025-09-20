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
        (business_id, url, database, username, password, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (business_id)
      DO UPDATE SET
        url = EXCLUDED.url,
        database = EXCLUDED.database,
        username = EXCLUDED.username,
        password = EXCLUDED.password,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `;
    const values = [data.business_id, data.url, data.database, data.username, data.password];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getIntegration(businessId) {
    const query = `
      SELECT * FROM odoo_integrations 
      WHERE business_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const result = await pool.query(query, [businessId]);
    return result.rows[0] || null;
  }

  async removeIntegration(businessId) {
    const query = `
      DELETE FROM odoo_integrations 
      WHERE business_id = $1
    `;
    await pool.query(query, [businessId]);
    return { success: true };
  }

  // ---------- ODOO API CLIENT ----------
  async getAuthenticatedClient(businessId) {
    const integration = await this.getIntegration(businessId);
    if (!integration) throw new Error("No Odoo integration found");

    return {
      instance_url: integration.url, // Map url to instance_url for API calls
      db: integration.database, // Map database to db for API calls
      username: integration.username,
      api_key: integration.password, // Map password to api_key for API calls
    };
  }

  // ---------- JSON-RPC HELPER ----------
  async makeJsonRpcCall(businessId, method, model, args = [], kwargs = {}) {
    const auth = await this.getAuthenticatedClient(businessId);

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

    const authResponse = await axios.post(`${auth.instance_url}/jsonrpc`, authPayload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (authResponse.data.error) {
      console.error("Odoo authentication failed:", authResponse.data.error);
      throw new Error(
        `Odoo Authentication Error: ${authResponse.data.error.message || JSON.stringify(authResponse.data.error)}`
      );
    }

    const userId = authResponse.data.result;

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

    const response = await axios.post(`${auth.instance_url}/jsonrpc`, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.data.error) {
      console.error("Odoo API error details:", response.data.error);
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

      const response = await axios.post(`${auth.instance_url}/jsonrpc`, payload, {
        headers: {
          "Content-Type": "application/json",
        },
      });

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

      const response = await axios.post(`${auth.instance_url}/jsonrpc`, payload, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.data.error) {
        console.error("Test connection failed:", response.data.error);
        throw new Error(`Authentication failed: ${response.data.error.message || JSON.stringify(response.data.error)}`);
      }

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
        order_line: orderData.order_lines.map((line) => [
          0,
          0,
          {
            product_id: line.product_id,
            product_uom_qty: line.quantity,
            price_unit: line.price_unit,
          },
        ]),
      };

      const result = await this.makeJsonRpcCall(businessId, "create", "sale.order", [values]);

      return { id: result, success: true };
    } catch (error) {
      if (error.message.includes("Object sale.order doesn't exist")) {
        throw new Error(
          "Sales module is not installed in this Odoo instance. Please install the Sales module to enable order management."
        );
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
          products = products.map((product) => ({
            ...product,
            list_price: 0, // Default price if list_price field is not available
          }));
        } else {
          throw fieldError;
        }
      }

      return products || [];
    } catch (error) {
      if (error.message.includes("Object product.product doesn't exist")) {
        throw new Error(
          "Sales module is not installed in this Odoo instance. Please install the Sales module to enable product management."
        );
      }

      if (error.message.includes("Invalid field")) {
        throw new Error(
          "Product fields are not accessible. This might indicate missing modules or insufficient permissions in Odoo."
        );
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
      availableModels: [],
    };

    // Test each model individually with a simple search
    const modelsToTest = [
      { model: "product.product", key: "hasProducts" },
      { model: "sale.order", key: "hasSales" },
      { model: "crm.lead", key: "hasCRM" },
      { model: "helpdesk.ticket", key: "hasHelpdesk" },
      { model: "res.partner", key: "hasPartners" },
    ];

    for (const { model, key } of modelsToTest) {
      try {
        // Just try to search with an empty domain to test if model exists
        await this.makeJsonRpcCall(businessId, "search", model, [[]]);
        moduleStatus[key] = true;
        moduleStatus.availableModels.push(model);
      } catch (error) {
        moduleStatus[key] = false;
      }
    }

    return moduleStatus;
  }

  // Additional Odoo methods for intent handlers
  async searchCustomers(businessId, searchTerm) {
    try {
      const domain = searchTerm === "all" 
        ? [] 
        : [
            "|", "|",
            ["name", "ilike", searchTerm],
            ["email", "ilike", searchTerm],
            ["phone", "ilike", searchTerm]
          ];

      const customers = await this.makeJsonRpcCall(
        businessId,
        "search_read",
        "res.partner",
        [domain, ["name", "email", "phone"]],
        { limit: 10 }
      );

      return {
        success: true,
        customers: customers || [],
      };
    } catch (error) {
      console.error("Error searching customers:", error.message);
      return {
        success: false,
        error: error.message,
        customers: [],
      };
    }
  }

  async createProduct(businessId, productData) {
    try {
      const values = {
        name: productData.name,
        type: productData.type || "consu",
        list_price: productData.list_price || 0,
        standard_price: productData.standard_price || 0,
        description: productData.description || "",
      };

      const result = await this.makeJsonRpcCall(businessId, "create", "product.product", [values]);

      return {
        success: true,
        productId: result,
      };
    } catch (error) {
      console.error("Error creating product:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createInvoice(businessId, invoiceData) {
    try {
      const values = {
        partner_id: invoiceData.partner_id,
        invoice_line_ids: invoiceData.invoice_line_ids || [],
        note: invoiceData.note || "",
      };

      const result = await this.makeJsonRpcCall(businessId, "create", "account.move", [values]);

      return {
        success: true,
        invoiceId: result,
      };
    } catch (error) {
      console.error("Error creating invoice:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getInventory(businessId) {
    try {
      const products = await this.makeJsonRpcCall(
        businessId,
        "search_read",
        "product.product",
        [[], ["name", "qty_available", "list_price"]],
        { limit: 50 }
      );

      return {
        success: true,
        products: products || [],
      };
    } catch (error) {
      console.error("Error getting inventory:", error.message);
      return {
        success: false,
        error: error.message,
        products: [],
      };
    }
  }
}

module.exports = new OdooService();
