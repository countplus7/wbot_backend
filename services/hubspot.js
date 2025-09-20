const axios = require("axios");
const pool = require("../config/database");

class HubSpotService {
  constructor() {
    this.baseURL = "https://api.hubapi.com";
    this.authURL = "https://app.hubspot.com/oauth/authorize";
    this.tokenURL = "https://api.hubapi.com/oauth/v1/token";
    this.clientId = process.env.HUBSPOT_CLIENT_ID;
    this.clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    this.redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    this.scopes = [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
    ];
  }

  // ---------- AUTH ----------
  getAuthUrl(businessId) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(" "),
      state: JSON.stringify({ businessId }),
    });
    return `${this.authURL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code, businessId) {
    try {
      const response = await axios.post(
        this.tokenURL,
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          code: code,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const tokens = response.data;

      const userInfo = await this.getUserInfo(tokens.access_token);

      const integrationData = {
        business_id: businessId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
        user_id: userInfo.user_id,
        email: userInfo.email,
      };

      await this.saveIntegration(integrationData);

      return {
        success: true,
        email: integrationData.email,
        user_id: integrationData.user_id,
      };
    } catch (err) {
      console.error("Error exchanging code for tokens:", err.response?.data || err.message);
      throw new Error("Failed to authenticate with HubSpot");
    }
  }

  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/oauth/v1/access-tokens/${accessToken}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (err) {
      console.error("Error getting user info:", err.response?.data || err.message);
      throw new Error("Failed to get user information from HubSpot");
    }
  }

  async saveIntegration(data) {
    try {
      const result = await pool.query(
        `INSERT INTO hubspot_integrations 
        (business_id, access_token, refresh_token, token_expires_at) 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT (business_id) 
        DO UPDATE SET 
          access_token = $2,
          refresh_token = $3,
          token_expires_at = $4,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [data.business_id, data.access_token, data.refresh_token, data.token_expires_at]
      );
      return result.rows[0];
    } catch (err) {
      console.error("Error saving HubSpot integration:", err);
      throw new Error("Failed to save HubSpot integration");
    }
  }

  async getIntegration(businessId) {
    try {
      const result = await pool.query("SELECT * FROM hubspot_integrations WHERE business_id = $1", [businessId]);
      return result.rows[0] || null;
    } catch (err) {
      console.error("Error getting HubSpot integration:", err);
      throw new Error("Failed to get HubSpot integration");
    }
  }

  async refreshAccessToken(businessId) {
    try {
      const integration = await this.getIntegration(businessId);
      if (!integration || !integration.refresh_token) {
        throw new Error("No refresh token available");
      }

      const response = await axios.post(
        this.tokenURL,
        new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: integration.refresh_token,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      const tokens = response.data;

      // Update the integration with new tokens
      await pool.query(
        `UPDATE hubspot_integrations 
        SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = CURRENT_TIMESTAMP 
        WHERE business_id = $4`,
        [tokens.access_token, tokens.refresh_token, new Date(Date.now() + tokens.expires_in * 1000), businessId]
      );

      return tokens.access_token;
    } catch (err) {
      console.error("Error refreshing access token:", err.response?.data || err.message);
      throw new Error("Failed to refresh HubSpot access token");
    }
  }

  async getValidAccessToken(businessId) {
    try {
      const integration = await this.getIntegration(businessId);
      if (!integration) {
        throw new Error("No HubSpot integration found");
      }

      // Check if token is expired or expires within 5 minutes
      const now = new Date();
      const expiresAt = new Date(integration.token_expires_at);
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      if (expiresAt <= fiveMinutesFromNow) {
        console.log("HubSpot token expired or expiring soon, refreshing...");
        return await this.refreshAccessToken(businessId);
      }

      return integration.access_token;
    } catch (err) {
      console.error("Error getting valid access token:", err);
      throw new Error("Failed to get valid HubSpot access token");
    }
  }

  // ---------- CRM OPERATIONS ----------
  async createContact(businessId, contactData) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/contacts`,
        {
          properties: {
            email: contactData.email,
            firstname: contactData.firstName,
            lastname: contactData.lastName,
            phone: contactData.phone,
            company: contactData.company,
            jobtitle: contactData.jobTitle,
            lifecyclestage: "lead",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        contactId: response.data.id,
        contact: response.data,
      };
    } catch (err) {
      console.error("Error creating HubSpot contact:", err.response?.data || err.message);
      throw new Error("Failed to create contact in HubSpot");
    }
  }

  async createCompany(businessId, companyData) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/companies`,
        {
          properties: {
            name: companyData.name,
            domain: companyData.domain,
            industry: companyData.industry,
            phone: companyData.phone,
            address: companyData.address,
            city: companyData.city,
            state: companyData.state,
            country: companyData.country,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        companyId: response.data.id,
        company: response.data,
      };
    } catch (err) {
      console.error("Error creating HubSpot company:", err.response?.data || err.message);
      throw new Error("Failed to create company in HubSpot");
    }
  }

  async createDeal(businessId, dealData) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/deals`,
        {
          properties: {
            dealname: dealData.name,
            amount: dealData.amount,
            dealstage: dealData.stage || "appointmentscheduled",
            closedate: dealData.closeDate,
            description: dealData.description,
            pipeline: dealData.pipeline || "default",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        dealId: response.data.id,
        deal: response.data,
      };
    } catch (err) {
      console.error("Error creating HubSpot deal:", err.response?.data || err.message);
      throw new Error("Failed to create deal in HubSpot");
    }
  }

  async searchContacts(businessId, searchTerm) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.post(
        `${this.baseURL}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "email",
                  operator: "CONTAINS_TOKEN",
                  value: searchTerm,
                },
              ],
            },
          ],
          properties: ["email", "firstname", "lastname", "phone", "company"],
          limit: 10,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        contacts: response.data.results,
        total: response.data.total,
      };
    } catch (err) {
      console.error("Error searching HubSpot contacts:", err.response?.data || err.message);
      throw new Error("Failed to search contacts in HubSpot");
    }
  }

  async deleteIntegration(businessId) {
    try {
      await pool.query("DELETE FROM hubspot_integrations WHERE business_id = $1", [businessId]);
      return { success: true };
    } catch (err) {
      console.error("Error deleting HubSpot integration:", err);
      throw new Error("Failed to delete HubSpot integration");
    }
  }

  // Additional HubSpot methods for intent handlers
  async updateContact(businessId, contactId, updates) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.patch(
        `${this.baseURL}/crm/v3/objects/contacts/${contactId}`,
        {
          properties: updates,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        contact: response.data,
      };
    } catch (err) {
      console.error("Error updating HubSpot contact:", err.response?.data || err.message);
      throw new Error("Failed to update contact in HubSpot");
    }
  }

  async updateDeal(businessId, dealId, updates) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.patch(
        `${this.baseURL}/crm/v3/objects/deals/${dealId}`,
        {
          properties: updates,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        deal: response.data,
      };
    } catch (err) {
      console.error("Error updating HubSpot deal:", err.response?.data || err.message);
      throw new Error("Failed to update deal in HubSpot");
    }
  }

  async getPipeline(businessId) {
    try {
      const accessToken = await this.getValidAccessToken(businessId);

      const response = await axios.get(
        `${this.baseURL}/crm/v3/objects/deals`,
        {
          params: {
            properties: ["dealname", "amount", "dealstage", "closedate"],
            limit: 50,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const deals = response.data.results || [];
      const totalValue = deals.reduce((sum, deal) => sum + (parseFloat(deal.properties.amount) || 0), 0);

      return {
        success: true,
        pipeline: deals,
        totalValue: totalValue,
      };
    } catch (err) {
      console.error("Error getting HubSpot pipeline:", err.response?.data || err.message);
      throw new Error("Failed to get pipeline from HubSpot");
    }
  }
}

module.exports = new HubSpotService();
