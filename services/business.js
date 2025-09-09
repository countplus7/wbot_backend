const pool = require('../config/database');

class BusinessService {
  // Business Management
  async createBusiness(businessData) {
    try {
      const { name, description, status = 'active' } = businessData;
      const result = await pool.query(
        'INSERT INTO businesses (name, description, status) VALUES ($1, $2, $3) RETURNING *',
        [name, description, status]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating business:', error);
      throw error;
    }
  }

  async getAllBusinesses() {
    try {
      const result = await pool.query(
        'SELECT * FROM businesses ORDER BY created_at DESC'
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting businesses:', error);
      throw error;
    }
  }

  async getBusinessById(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM businesses WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting business by ID:', error);
      throw error;
    }
  }

  async updateBusiness(id, businessData) {
    try {
      const { name, description, status } = businessData;
      const result = await pool.query(
        'UPDATE businesses SET name = $1, description = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
        [name, description, status, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating business:', error);
      throw error;
    }
  }

  async deleteBusiness(id) {
    try {
      const result = await pool.query(
        'DELETE FROM businesses WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting business:', error);
      throw error;
    }
  }

  // WhatsApp Configuration Management
  async createWhatsAppConfig(configData) {
    try {
      const { business_id, phone_number_id, access_token, verify_token, webhook_url } = configData;
      const result = await pool.query(
        `INSERT INTO whatsapp_configs 
        (business_id, phone_number_id, access_token, verify_token, webhook_url) 
        VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [business_id, phone_number_id, access_token, verify_token, webhook_url]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating WhatsApp config:', error);
      throw error;
    }
  }

  async getWhatsAppConfigByBusinessId(businessId) {
    try {
      const result = await pool.query(
        'SELECT * FROM whatsapp_configs WHERE business_id = $1 AND status = $2',
        [businessId, 'active']
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting WhatsApp config:', error);
      throw error;
    }
  }

  async getWhatsAppConfigByPhoneNumber(phoneNumberId) {
    try {
      const result = await pool.query(
        'SELECT wc.*, b.name as business_name FROM whatsapp_configs wc JOIN businesses b ON wc.business_id = b.id WHERE wc.phone_number_id = $1 AND wc.status = $2',
        [phoneNumberId, 'active']
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting WhatsApp config by phone number:', error);
      throw error;
    }
  }

  async updateWhatsAppConfig(id, configData) {
    try {
      const { phone_number_id, access_token, verify_token, webhook_url } = configData;
      const result = await pool.query(
        `UPDATE whatsapp_configs 
        SET phone_number_id = $1, access_token = $2, verify_token = $3, webhook_url = $4, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $5 RETURNING *`,
        [phone_number_id, access_token, verify_token, webhook_url, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating WhatsApp config:', error);
      throw error;
    }
  }

  async deleteWhatsAppConfig(id) {
    try {
      const result = await pool.query(
        'DELETE FROM whatsapp_configs WHERE id = $1 RETURNING *',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting WhatsApp config:', error);
      throw error;
    }
  }

  // Business Tone Management
  async createBusinessTone(toneData) {
    try {
      const { business_id, name, description, tone_instructions } = toneData;
      
      // Use UPSERT to create or update the tone for this business
      const result = await pool.query(
        `INSERT INTO business_tones 
        (business_id, name, description, tone_instructions) 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT (business_id) 
        DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          tone_instructions = EXCLUDED.tone_instructions,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [business_id, name, description, tone_instructions]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating/updating business tone:', error);
      throw error;
    }
  }

  async getBusinessTones(businessId) {
    try {
      const result = await pool.query(
        'SELECT * FROM business_tones WHERE business_id = $1 ORDER BY created_at DESC',
        [businessId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting business tones:', error);
      throw error;
    }
  }

  async getBusinessTone(businessId) {
    try {
      const result = await pool.query(
        'SELECT * FROM business_tones WHERE business_id = $1',
        [businessId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting business tone:', error);
      throw error;
    }
  }

  async getDefaultTone(businessId) {
    try {
      const result = await pool.query(
        'SELECT * FROM business_tones WHERE business_id = $1',
        [businessId]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error getting default tone:', error);
      throw error;
    }
  }

  async updateBusinessTone(id, toneData) {
    try {
      const { name, description, tone_instructions, business_id } = toneData;

      const result = await pool.query(
        `UPDATE business_tones 
        SET name = $1, description = $2, tone_instructions = $3, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $4 RETURNING *`,
        [name, description, tone_instructions, id]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error updating business tone:', error);
      throw error;
    }
  }

  // Get complete business information
  async getBusinessWithConfigAndTones(businessId) {
    try {
      const business = await this.getBusinessById(businessId);
      if (!business) return null;

      const whatsappConfig = await this.getWhatsAppConfigByBusinessId(businessId);
      const tones = await this.getBusinessTones(businessId);

      return {
        ...business,
        whatsapp_config: whatsappConfig,
        tones: tones
      };
    } catch (error) {
      console.error('Error getting business with config and tones:', error);
      throw error;
    }
  }
}

module.exports = new BusinessService(); 
