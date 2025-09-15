const axios = require("axios");
const pool = require("../config/database");

class SalesforceService {
  constructor() {
    this.clientId = process.env.SALESFORCE_CLIENT_ID;
    this.clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    this.redirectUri = process.env.SALESFORCE_REDIRECT_URI;
    this.loginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
    this.scopes = ["api", "refresh_token", "full"];
  }

  // ---------- AUTH ----------
  getAuthUrl(businessId) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(" "),
      state: JSON.stringify({ businessId }),
    });
    return `${this.loginUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code, businessId) {
    try {
      const tokenUrl = `${this.loginUrl}/services/oauth2/token`;

      const response = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          code,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const tokens = response.data;

      const userInfo = await this.getUserInfo(tokens.access_token, tokens.instance_url);

      const integrationData = {
        business_id: businessId,
        provider: "salesforce",
        instance_url: tokens.instance_url,
        user_id: userInfo.user_id || userInfo.id,
        username: userInfo.preferred_username || userInfo.username,
        email: userInfo.email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: new Date(Date.now() + tokens.expires_in * 1000),
      };

      await this.saveIntegration(integrationData);

      return {
        success: true,
        email: integrationData.email,
        username: integrationData.username,
        instance_url: integrationData.instance_url,
      };
    } catch (err) {
      console.error("Error exchanging code for tokens:", err.response?.data || err.message);
      throw new Error("Failed to authenticate with Salesforce");
    }
  }

  async getUserInfo(accessToken, instanceUrl) {
    const response = await axios.get(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  }

  // ---------- DATABASE ----------
  async saveIntegration(data) {
    const query = `
      INSERT INTO salesforce_integrations
        (business_id, provider, instance_url, user_id, username, email, refresh_token, access_token, expiry_date, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
      ON CONFLICT (business_id, provider, user_id)
      DO UPDATE SET
        instance_url = EXCLUDED.instance_url,
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        refresh_token = EXCLUDED.refresh_token,
        access_token = EXCLUDED.access_token,
        expiry_date = EXCLUDED.expiry_date,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `;
    const values = [
      data.business_id,
      data.provider,
      data.instance_url,
      data.user_id,
      data.username,
      data.email,
      data.refresh_token,
      data.access_token,
      data.expiry_date,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getIntegration(businessId) {
    const query = `
      SELECT * FROM salesforce_integrations
      WHERE business_id = $1 AND provider = 'salesforce'
      ORDER BY updated_at DESC
      LIMIT 1;
    `;
    const result = await pool.query(query, [businessId]);
    return result.rows[0] || null;
  }

  async removeIntegration(businessId) {
    const query = `
      DELETE FROM salesforce_integrations
      WHERE business_id = $1 AND provider = 'salesforce';
    `;
    await pool.query(query, [businessId]);
    return { success: true };
  }

  // ---------- AUTH CLIENT ----------
  async getAuthenticatedClient(businessId) {
    let integration = await this.getIntegration(businessId);
    if (!integration) throw new Error("No Salesforce integration found");

    if (integration.expiry_date && new Date() >= new Date(integration.expiry_date)) {
      await this.refreshAccessToken(businessId);
      integration = await this.getIntegration(businessId);
    }

    return axios.create({
      baseURL: integration.instance_url,
      headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" },
    });
  }

  async refreshAccessToken(businessId) {
    const integration = await this.getIntegration(businessId);
    if (!integration?.refresh_token) throw new Error("No refresh token available");

    const tokenUrl = `${this.loginUrl}/services/oauth2/token`;
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: integration.refresh_token,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const tokens = response.data;
    const updateQuery = `
      UPDATE salesforce_integrations
      SET access_token = $1, expiry_date = $2, updated_at = CURRENT_TIMESTAMP
      WHERE business_id = $3 AND provider = 'salesforce';
    `;
    await pool.query(updateQuery, [
      tokens.access_token,
      new Date(Date.now() + tokens.expires_in * 1000),
      businessId,
    ]);

    return tokens;
  }

  // ---------- GENERIC QUERY ----------
  async executeQuery(businessId, soql) {
    const client = await this.getAuthenticatedClient(businessId);
    const response = await client.get(`/services/data/v58.0/query?q=${encodeURIComponent(soql)}`);
    return response.data;
  }

  // ---------- LEADS ----------
  async createLead(businessId, leadData) {
    const client = await this.getAuthenticatedClient(businessId);
    const response = await client.post("/services/data/v58.0/sobjects/Lead", {
      FirstName: leadData.firstName,
      LastName: leadData.lastName,
      Company: leadData.company,
      Email: leadData.email,
      Phone: leadData.phone,
      LeadSource: leadData.leadSource || "WhatsApp Bot",
      Status: leadData.status || "New",
      Description: leadData.description,
    });
    return response.data;
  }

  async getLeads(businessId, limit = 50) {
    const soql = `
      SELECT Id, FirstName, LastName, Company, Email, Phone, LeadSource, Status, CreatedDate
      FROM Lead
      ORDER BY LastModifiedDate DESC
      LIMIT ${limit}
    `;
    const data = await this.executeQuery(businessId, soql);
    return data.records || [];
  }
}

module.exports = new SalesforceService();