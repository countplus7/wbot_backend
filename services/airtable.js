const pool = require("../config/database");
const EmbeddingsService = require("./embeddings");

class AirtableService {
  constructor() {
    this.baseURL = "https://api.airtable.com/v0";
    this.embeddingsService = EmbeddingsService;
  }

  /**
   * Get Airtable configuration for a business
   */
  async getConfig(businessId) {
    try {
      const result = await pool.query("SELECT * FROM airtable_integrations WHERE business_id = $1", [businessId]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Error getting Airtable config:", error);
      throw new Error("Failed to get Airtable configuration");
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
      console.error("Error saving Airtable config:", error);
      throw new Error("Failed to save Airtable configuration");
    }
  }

  /**
   * Remove Airtable configuration
   */
  async removeConfig(businessId) {
    try {
      await pool.query("DELETE FROM airtable_integrations WHERE business_id = $1", [businessId]);

      // Also remove stored FAQ embeddings for this business
      await pool.query("DELETE FROM faq_embeddings WHERE business_id = $1", [businessId]);

      return true;
    } catch (error) {
      console.error("Error removing Airtable config:", error);
      throw new Error("Failed to remove Airtable configuration");
    }
  }

  /**
   * Delete Airtable configuration (alias for removeConfig)
   */
  async deleteConfig(businessId) {
    return this.removeConfig(businessId);
  }

  /**
   * Test Airtable connection for a specific business
   */
  async testConnection(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error("Airtable configuration not found for this business");
      }

      console.log(
        `Testing Airtable connection for business ${businessId} (Base: ${config.base_id}, Table: ${config.table_name})`
      );

      const response = await fetch(`${this.baseURL}/${config.base_id}/${config.table_name}?maxRecords=1`, {
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      return { success: true, message: "Connection successful" };
    } catch (error) {
      console.error("Error testing Airtable connection:", error);
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Get FAQs from business-specific Airtable with 2-field structure (Question, Answer)
   */
  async getFAQs(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error("Airtable configuration not found for this business");
      }

      console.log(
        `Fetching FAQs from business ${businessId} Airtable (Base: ${config.base_id}, Table: ${config.table_name})`
      );

      const response = await fetch(`${this.baseURL}/${config.base_id}/${config.table_name}`, {
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Handle 2-field structure: Question and Answer
      const faqs = data.records
        .map((record) => ({
          id: record.id,
          question: record.fields.Question || "", // Exact field name from Airtable
          answer: record.fields.Answer || "", // Exact field name from Airtable
          businessId: businessId, // Track which business this FAQ belongs to
          source: "airtable",
        }))
        .filter((faq) => faq.question && faq.answer); // Only include FAQs with both fields

      console.log(`Retrieved ${faqs.length} FAQs from business ${businessId} Airtable`);

      // Store embeddings for semantic search (async, don't wait)
      if (faqs.length > 0) {
        this.storeFAQEmbeddings(businessId, faqs).catch((error) => {
          console.error("Error storing FAQ embeddings:", error);
        });
      }

      return faqs;
    } catch (error) {
      console.error("Error getting FAQs from Airtable:", error);
      throw new Error("Failed to get FAQs from Airtable");
    }
  }

  /**
   * Enhanced FAQ search using semantic similarity with embeddings for business-specific Airtable
   */
  async searchFAQs(businessId, userQuestion) {
    try {
      console.log(`Enhanced FAQ search for business ${businessId}: "${userQuestion}"`);

      // First try to find from cached embeddings for this specific business
      const cachedMatch = await this.embeddingsService.searchFAQEmbeddings(businessId, userQuestion, 0.75);

      if (cachedMatch) {
        console.log("Found FAQ match from cached embeddings for business", businessId);
        return {
          id: cachedMatch.faq_id,
          question: cachedMatch.question,
          answer: cachedMatch.answer,
          businessId: businessId,
          semanticSimilarity: cachedMatch.similarity,
          matchType: "semantic_cached",
        };
      }

      // Fallback to live Airtable search with semantic matching for this business
      console.log("No cached match found, searching live Airtable data for business", businessId);
      const faqs = await this.getFAQs(businessId);

      console.log(`Retrieved ${faqs.length} FAQs from Airtable for business ${businessId}:`);
      faqs.forEach((faq, index) => {
        console.log(`  FAQ ${index + 1}: Q="${faq.question}" A="${faq.answer ? faq.answer.substring(0, 100) : "No answer"}..."`);
      });

      if (faqs.length === 0) {
        console.log(`No FAQs found in Airtable for business ${businessId}`);
        return null;
      }

      // Use semantic search with embeddings
      const semanticMatch = await this.embeddingsService.findBestFAQMatch(userQuestion, faqs, 0.75);

      console.log(`Semantic search completed. Match found: ${semanticMatch ? "YES" : "NO"}`);
      console.log(`Semantic search completed. Match found: ${semanticMatch ? "YES" : "NO"}`);
      if (semanticMatch && semanticMatch.semanticSimilarity) {
        console.log(`  Match details: similarity=${semanticMatch.semanticSimilarity}, question="${semanticMatch.question}"`);
      }

      if (semanticMatch) {
        console.log(`  Match details: similarity=${semanticMatch.semanticSimilarity}, question="${semanticMatch.question}"`);
      }

      console.log(`Semantic search completed. Match found: ${semanticMatch ? "YES" : "NO"}`);
      if (semanticMatch && semanticMatch.semanticSimilarity) {
        console.log(`  Match details: similarity=${semanticMatch.semanticSimilarity}, question="${semanticMatch.question}"`);
      }

      if (semanticMatch) {
        console.log("Found semantic FAQ match from live data for business", businessId);
        return {
          ...semanticMatch,
          businessId: businessId,
          matchType: "semantic_live",
        };
      }

      // Final fallback to keyword matching for very low confidence cases
      console.log("No semantic match found, trying keyword matching for business", businessId);
      const keywordMatch = this.keywordSearchFAQs(userQuestion, faqs);

      if (keywordMatch) {
        console.log("Found keyword FAQ match for business", businessId);
        return {
          ...keywordMatch,
          businessId: businessId,
          matchType: "keyword_fallback",
        };
      }

      console.log(`No FAQ match found for business ${businessId}`);
      return null;
    } catch (error) {
      console.error("Error in enhanced FAQ search for business", businessId, ":", error);
      throw new Error("Failed to search FAQs in Airtable");
    }
  }

  /**
   * Fallback keyword search method for business-specific FAQs
   */
  keywordSearchFAQs(userQuestion, faqs) {
    const userQuestionLower = userQuestion.toLowerCase();
    let bestMatch = null;
    let highestScore = 0;

    for (const faq of faqs) {
      const questionLower = faq.question.toLowerCase();

      // Calculate similarity score based on common words
      const userWords = userQuestionLower.split(/\s+/).filter((word) => word.length > 2);
      const faqWords = questionLower.split(/\s+/).filter((word) => word.length > 2);

      let commonWords = 0;
      for (const userWord of userWords) {
        if (faqWords.some((faqWord) => faqWord.includes(userWord) || userWord.includes(faqWord))) {
          commonWords++;
        }
      }

      const score = commonWords / Math.max(userWords.length, faqWords.length);

      if (score > highestScore && score > 0.3) {
        // Higher threshold for keyword matching
        highestScore = score;
        bestMatch = faq;
      }
    }

    if (bestMatch) {
      console.log(`Found keyword FAQ match with score ${highestScore}:`, bestMatch.question);
      return {
        ...bestMatch,
        keywordScore: highestScore,
      };
    }

    return null;
  }

  /**
   * Store FAQ embeddings for semantic search (business-specific)
   */
  async storeFAQEmbeddings(businessId, faqs) {
    try {
      console.log(`Storing embeddings for ${faqs.length} FAQs for business ${businessId}`);

      // Generate embeddings for all FAQ questions
      const questions = faqs.map((faq) => faq.question);
      const embeddings = await this.embeddingsService.generateEmbeddingsBatch(questions);

      // Store in database with business-specific tracking
      for (let i = 0; i < faqs.length; i++) {
        await pool.query(
          `INSERT INTO faq_embeddings (business_id, faq_id, question, answer, embedding, source, created_at) 
           VALUES ($1, $2, $3, $4, $5, 'airtable', NOW()) 
           ON CONFLICT (business_id, faq_id) 
           DO UPDATE SET question = $3, answer = $4, embedding = $5, updated_at = NOW()`,
          [businessId, faqs[i].id, questions[i], faqs[i].answer, JSON.stringify(embeddings[i])]
        );
      }

      console.log(`FAQ embeddings stored successfully for business ${businessId}`);
    } catch (error) {
      console.error("Error storing FAQ embeddings for business", businessId, ":", error);
      // Don't throw error as this is a background operation
    }
  }

  /**
   * Get FAQ by ID from business-specific Airtable
   */
  async getFAQById(businessId, faqId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        throw new Error("Airtable configuration not found for this business");
      }

      const response = await fetch(`${this.baseURL}/${config.base_id}/${config.table_name}/${faqId}`, {
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        question: data.fields.Question || "", // Exact field name
        answer: data.fields.Answer || "", // Exact field name
        businessId: businessId,
        source: "airtable",
      };
    } catch (error) {
      console.error("Error getting FAQ by ID for business", businessId, ":", error);
      throw new Error("Failed to get FAQ from Airtable");
    }
  }

  /**
   * Refresh FAQ embeddings for a specific business
   */
  async refreshFAQEmbeddings(businessId) {
    try {
      console.log(`Refreshing FAQ embeddings for business ${businessId}`);

      // Clear existing embeddings for this business
      await pool.query("DELETE FROM faq_embeddings WHERE business_id = $1", [businessId]);

      // Fetch fresh FAQs and store new embeddings
      const faqs = await this.getFAQs(businessId);

      if (faqs.length > 0) {
        await this.storeFAQEmbeddings(businessId, faqs);
        console.log(`Refreshed ${faqs.length} FAQ embeddings for business ${businessId}`);
      } else {
        console.log(`No FAQs found to refresh for business ${businessId}`);
      }

      return { success: true, count: faqs.length };
    } catch (error) {
      console.error("Error refreshing FAQ embeddings for business", businessId, ":", error);
      throw new Error("Failed to refresh FAQ embeddings");
    }
  }

  /**
   * Get FAQ statistics for a business
   */
  async getFAQStats(businessId) {
    try {
      const config = await this.getConfig(businessId);
      if (!config) {
        return { connected: false, faqCount: 0, embeddingCount: 0 };
      }

      // Get FAQ count from Airtable
      const faqs = await this.getFAQs(businessId);

      // Get embedding count from database
      const embeddingResult = await pool.query("SELECT COUNT(*) as count FROM faq_embeddings WHERE business_id = $1", [
        businessId,
      ]);

      return {
        connected: true,
        baseId: config.base_id,
        tableName: config.table_name,
        faqCount: faqs.length,
        embeddingCount: parseInt(embeddingResult.rows[0].count),
      };
    } catch (error) {
      console.error("Error getting FAQ stats for business", businessId, ":", error);
      return { connected: false, faqCount: 0, embeddingCount: 0, error: error.message };
    }
  }
}

module.exports = new AirtableService();


