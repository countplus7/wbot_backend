const pool = require("../config/database");

class AirtableService {
  constructor() {
    this.baseURL = 'https://api.airtable.com/v0';
  }

  /**
   * Get Airtable configuration for a business
   */
  async getConfig(businessId) {
    try {
      const result = await pool.query(
        "SELECT * FROM airtable_integrations WHERE business_id = $1",
        [businessId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error getting Airtable config:', error);
      throw new Error('Failed to get Airtable configuration');
    }
  }

  /**
   * Create or update Airtable configuration
   */
  async saveConfig(businessId, configData) {
    try {
      const { access_token, base_id, table_name } = configData;

      // Check if config already exists
      const existingConfig = await this.getConfig(businessId);

      if (existingConfig) {
        // Update existing config
        const result = await pool.query(
          `UPDATE airtable_integrations 
           SET access_token = $1, base_id = $2, table_name = $3, updated_at = CURRENT_TIMESTAMP 
           WHERE business_id = $4 
           RETURNING *`,
          [access_token, base_id, table_name, businessId]
        );
        return result.rows[0];
      } else {
        // Create new config
        const result = await pool.query(
          `INSERT INTO airtable_integrations (business_id, access_token, base_id, table_name) 
           VALUES ($1, $2, $3, $4) 
           RETURNING *`,
          [businessId, access_token, base_id, table_name]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error('Error saving Airtable config:', error);
      throw new Error('Failed to save Airtable configuration');
    }
  }

  /**
   * Delete Airtable configuration
   */
  async deleteConfig(businessId) {
    try {
      const result = await pool.query(
        "DELETE FROM airtable_integrations WHERE business_id = $1 RETURNING *",
        [businessId]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error deleting Airtable config:', error);
      throw new Error('Failed to delete Airtable configuration');
    }
  }

  /**
   * Test Airtable connection
   */
  async testConnection(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error('No Airtable configuration found');
      }

      const response = await fetch(`${this.baseURL}/${config.base_id}/${config.table_name}?maxRecords=1`, {
        headers: {
          'Authorization': `Bearer ${config.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      return { success: true, message: 'Connection successful' };
    } catch (error) {
      console.error('Error testing Airtable connection:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all FAQs from Airtable
   */
  async getFAQs(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error('No Airtable configuration found');
      }

      console.log(`Getting FAQs from Airtable base: ${config.base_id}, table: ${config.table_name}`);

      const response = await fetch(`${this.baseURL}/${config.base_id}/${config.table_name}`, {
        headers: {
          'Authorization': `Bearer ${config.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const records = data.records || [];

      // Convert Airtable records to FAQ format
      const faqs = records.map(record => {
        const fields = record.fields;
        return {
          id: record.id,
          question: fields.Question || fields.question || '',
          answer: fields.Answer || fields.answer || '',
          // Include any additional fields that might be useful
          ...fields
        };
      }).filter(faq => faq.question && faq.answer); // Only include FAQs with both question and answer

      console.log(`Found ${faqs.length} FAQs in Airtable`);
      return faqs;
    } catch (error) {
      console.error('Error getting FAQs from Airtable:', error);
      throw new Error('Failed to get FAQs from Airtable');
    }
  }

  /**
   * Search FAQs for a matching question
   */
  async searchFAQs(businessId, userQuestion) {
    try {
      const faqs = await this.getFAQs(businessId);
      
      if (faqs.length === 0) {
        return null;
      }

      // Simple keyword matching for FAQ search
      const userQuestionLower = userQuestion.toLowerCase();
      let bestMatch = null;
      let highestScore = 0;

      for (const faq of faqs) {
        const questionLower = faq.question.toLowerCase();
        
        // Calculate similarity score based on common words
        const userWords = userQuestionLower.split(/\s+/).filter(word => word.length > 2);
        const faqWords = questionLower.split(/\s+/).filter(word => word.length > 2);
        
        let commonWords = 0;
        for (const userWord of userWords) {
          if (faqWords.some(faqWord => faqWord.includes(userWord) || userWord.includes(faqWord))) {
            commonWords++;
          }
        }
        
        const score = commonWords / Math.max(userWords.length, faqWords.length);
        
        if (score > highestScore && score > 0.2) { // Minimum threshold
          highestScore = score;
          bestMatch = faq;
        }
      }

      if (bestMatch) {
        console.log(`Found FAQ match with score ${highestScore}:`, bestMatch.question);
        return {
          ...bestMatch,
          matchScore: highestScore
        };
      }

      return null;
    } catch (error) {
      console.error('Error searching FAQs:', error);
      throw new Error('Failed to search FAQs in Airtable');
    }
  }

  /**
   * Get FAQ by ID
   */
  async getFAQById(businessId, faqId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error('No Airtable configuration found');
      }

      const response = await fetch(`${this.baseURL}/${config.base_id}/${config.table_name}/${faqId}`, {
        headers: {
          'Authorization': `Bearer ${config.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const fields = data.fields;

      return {
        id: data.id,
        question: fields.Question || fields.question || '',
        answer: fields.Answer || fields.answer || '',
        ...fields
      };
    } catch (error) {
      console.error('Error getting FAQ by ID:', error);
      throw new Error('Failed to get FAQ from Airtable');
    }
  }
}

module.exports = new AirtableService();
