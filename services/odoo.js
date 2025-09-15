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

    const payload = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: method,
        args: [auth.db, auth.username, auth.api_key, model, method, ...args],
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
      throw new Error(`Odoo API Error: ${response.data.error.message}`);
    }

    return response.data.result;
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
        throw new Error(`Authentication failed: ${response.data.error.message}`);
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
    const products = await this.makeJsonRpcCall(
      businessId,
      "search_read",
      "product.product",
      [
        [["sale_ok", "=", true]], // Only products that can be sold
        ["id", "name", "list_price", "qty_available"],
      ],
      { limit }
    );

    return products || [];
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
}

module.exports = new OdooService();
