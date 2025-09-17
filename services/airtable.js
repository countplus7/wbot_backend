const pool = require("../config/database");
const EmbeddingsService = require('./embeddings');

class AirtableService {
  constructor() {
    this.baseURL = 'https://api.airtable.com/v0';
    this.embeddingsService = EmbeddingsService;
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

      const result = await pool.query(
        `INSERT INTO airtable_integrations (business_id, access_token, base_id, table_name, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (business_id)
         DO UPDATE SET access_token = $2, base_id = $3, table_name = $4, updated_at = NOW()
         RETURNING *`,
        [businessId, access_token, base_id, table_name]
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error saving Airtable config:', error);
      throw new Error('Failed to save Airtable configuration');
    }
  }

  /**
   * Remove Airtable configuration
   */
  async removeConfig(businessId) {
    try {
      await pool.query(
        "DELETE FROM airtable_integrations WHERE business_id = $1",
        [businessId]
      );

      // Also remove stored FAQ embeddings
      await pool.query(
        "DELETE FROM faq_embeddings WHERE business_id = $1",
        [businessId]
      );

      return true;
    } catch (error) {
      console.error('Error removing Airtable config:', error);
      throw new Error('Failed to remove Airtable configuration');
    }
  }

  /**
   * Test Airtable connection
   */
  async testConnection(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error('Airtable configuration not found');
      }

      const response = await fetch(
        `${this.baseURL}/${config.base_id}/${config.table_name}?maxRecords=1`,
        {
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      return { success: true, message: 'Connection successful' };
    } catch (error) {
      console.error('Error testing Airtable connection:', error);
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Get FAQs from Airtable with enhanced caching and embeddings
   */
  async getFAQs(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error('Airtable configuration not found');
      }

      console.log(`Fetching FAQs from Airtable for business ${businessId}`);

      const response = await fetch(
        `${this.baseURL}/${config.base_id}/${config.table_name}`,
        {
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const faqs = data.records.map(record => ({
        id: record.id,
        question: record.fields.Question || record.fields.question || '',
        answer: record.fields.Answer || record.fields.answer || '',
        ...record.fields
      })).filter(faq => faq.question && faq.answer);

      console.log(`Retrieved ${faqs.length} FAQs from Airtable`);

      // Store embeddings for semantic search (async, don't wait)
      this.storeFAQEmbeddings(businessId, faqs).catch(error => {
        console.error('Error storing FAQ embeddings:', error);
      });

      return faqs;
    } catch (error) {
      console.error('Error getting FAQs from Airtable:', error);
      throw new Error('Failed to get FAQs from Airtable');
    }
  }

  /**
   * Enhanced FAQ search using semantic similarity with embeddings
   */
  async searchFAQs(businessId, userQuestion) {
    try {
      console.log(`Enhanced FAQ search for business ${businessId}: "${userQuestion}"`);

      // First try to find from cached embeddings
      const cachedMatch = await this.embeddingsService.searchFAQEmbeddings(businessId, userQuestion, 0.75);
      
      if (cachedMatch) {
        console.log('Found FAQ match from cached embeddings');
        return {
          id: cachedMatch.faq_id,
          question: cachedMatch.question,
          answer: cachedMatch.answer,
          semanticSimilarity: cachedMatch.similarity,
          matchType: 'semantic_cached'
        };
      }

      // Fallback to live Airtable search with semantic matching
      console.log('No cached match found, searching live Airtable data');
      const faqs = await this.getFAQs(businessId);
      
      if (faqs.length === 0) {
        return null;
      }

      // Use semantic search with embeddings
      const semanticMatch = await this.embeddingsService.findBestFAQMatch(userQuestion, faqs, 0.75);
      
      if (semanticMatch) {
        console.log('Found semantic FAQ match from live data');
        return semanticMatch;
      }

      // Final fallback to keyword matching for very low confidence cases
      console.log('No semantic match found, trying keyword matching');
      const keywordMatch = this.keywordSearchFAQs(userQuestion, faqs);
      
      if (keywordMatch) {
        console.log('Found keyword FAQ match');
        return {
          ...keywordMatch,
          matchType: 'keyword_fallback'
        };
      }

      console.log('No FAQ match found');
      return null;
    } catch (error) {
      console.error('Error in enhanced FAQ search:', error);
      throw new Error('Failed to search FAQs in Airtable');
    }
  }

  /**
   * Fallback keyword search method
   */
  keywordSearchFAQs(userQuestion, faqs) {
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
      
      if (score > highestScore && score > 0.3) { // Higher threshold for keyword matching
        highestScore = score;
        bestMatch = faq;
      }
    }

    if (bestMatch) {
      console.log(`Found keyword FAQ match with score ${highestScore}:`, bestMatch.question);
      return {
        ...bestMatch,
        keywordScore: highestScore
      };
    }

    return null;
  }

  /**
   * Store FAQ embeddings for semantic search
   */
  async storeFAQEmbeddings(businessId, faqs) {
    try {
      console.log(`Storing embeddings for ${faqs.length} FAQs for business ${businessId}`);

      // Generate embeddings for all FAQ questions
      const questions = faqs.map(faq => faq.question);
      const embeddings = await this.embeddingsService.generateEmbeddingsBatch(questions);

      // Store in database
      for (let i = 0; i < faqs.length; i++) {
        await pool.query(
          `INSERT INTO faq_embeddings (business_id, faq_id, question, answer, embedding, source, created_at) 
           VALUES ($1, $2, $3, $4, $5, 'airtable', NOW()) 
           ON CONFLICT (business_id, faq_id) 
           DO UPDATE SET question = $3, answer = $4, embedding = $5, updated_at = NOW()`,
          [businessId, faqs[i].id, questions[i], faqs[i].answer, JSON.stringify(embeddings[i])]
        );
      }

      console.log('FAQ embeddings stored successfully');
    } catch (error) {
      console.error('Error storing FAQ embeddings:', error);
      // Don't throw error as this is a background operation
    }
  }

  /**
   * Get FAQ by ID
   */
  async getFAQById(businessId, faqId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error('Airtable configuration not found');
      }

      const response = await fetch(
        `${this.baseURL}/${config.base_id}/${config.table_name}/${faqId}`,
        {
          headers: {
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        question: data.fields.Question || data.fields.question || '',
        answer: data.fields.Answer || data.fields.answer || '',
        ...data.fields
      };
    } catch (error) {
      console.error('Error getting FAQ by ID:', error);
      throw new Error('Failed to get FAQ from Airtable');
    }
  }
}

module.exports = new AirtableService();
