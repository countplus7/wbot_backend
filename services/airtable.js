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

      // Try multiple thresholds for better matching
      const thresholds = [0.65, 0.55, 0.45]; // Lower thresholds for better matching
      
      for (const threshold of thresholds) {
        console.log(`Trying cached embeddings with threshold ${threshold}...`);
        
        // First try to find from cached embeddings for this specific business
        const cachedMatch = await this.embeddingsService.searchFAQEmbeddings(businessId, userQuestion, threshold);

        if (cachedMatch) {
          console.log(`Found FAQ match from cached embeddings for business ${businessId} (similarity: ${cachedMatch.similarity})`);
          return {
            id: cachedMatch.faq_id,
            question: cachedMatch.question,
            answer: cachedMatch.answer,
            businessId: businessId,
            semanticSimilarity: cachedMatch.similarity,
            matchType: "semantic_cached",
          };
        }
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

      // Try multiple thresholds for live search too
      for (const threshold of thresholds) {
        console.log(`Trying live semantic search with threshold ${threshold}...`);
        
        // Use semantic search with embeddings
        const semanticMatch = await this.embeddingsService.findBestFAQMatch(userQuestion, faqs, threshold);

        console.log(`Semantic search completed (threshold ${threshold}). Match found: ${semanticMatch ? "YES" : "NO"}`);
        if (semanticMatch && semanticMatch.semanticSimilarity) {
          console.log(`  Match details: similarity=${semanticMatch.semanticSimilarity}, question="${semanticMatch.question}"`);
        }

        if (semanticMatch) {
          console.log(`Found semantic FAQ match from live data for business ${businessId} (similarity: ${semanticMatch.semanticSimilarity})`);
          return {
            ...semanticMatch,
            businessId: businessId,
            matchType: "semantic_live",
          };
        }
      }

      // Enhanced fallback to keyword matching for very low confidence cases
      console.log("No semantic match found, trying enhanced keyword matching for business", businessId);
      const keywordMatch = this.enhancedKeywordSearchFAQs(userQuestion, faqs);

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
   * Enhanced keyword search method for business-specific FAQs with better fuzzy matching
   */
  enhancedKeywordSearchFAQs(userQuestion, faqs) {
    const userQuestionLower = userQuestion.toLowerCase();
    let bestMatch = null;
    let highestScore = 0;

    // Normalize the user question for better matching
    const normalizedUserQuestion = this.normalizeQuestion(userQuestionLower);

    for (const faq of faqs) {
      const questionLower = faq.question.toLowerCase();
      const normalizedFaqQuestion = this.normalizeQuestion(questionLower);

      // Multiple scoring strategies
      let scores = [];

      // 1. Exact word matching (highest weight)
      const exactScore = this.calculateExactWordScore(normalizedUserQuestion, normalizedFaqQuestion);
      scores.push({ score: exactScore, weight: 1.0, type: 'exact' });

      // 2. Partial word matching
      const partialScore = this.calculatePartialWordScore(normalizedUserQuestion, normalizedFaqQuestion);
      scores.push({ score: partialScore, weight: 0.8, type: 'partial' });

      // 3. Character similarity for proper nouns (like UTRADIE, AdminOh)
      const charScore = this.calculateCharacterSimilarity(normalizedUserQuestion, normalizedFaqQuestion);
      scores.push({ score: charScore, weight: 0.6, type: 'character' });

      // 4. Question pattern matching (what, how, why, etc.)
      const patternScore = this.calculateQuestionPatternScore(normalizedUserQuestion, normalizedFaqQuestion);
      scores.push({ score: patternScore, weight: 0.7, type: 'pattern' });

      // Calculate weighted final score
      const weightedScore = scores.reduce((sum, s) => sum + (s.score * s.weight), 0) / scores.reduce((sum, s) => sum + s.weight, 0);

      console.log(`FAQ "${faq.question}" scores:`, scores.map(s => `${s.type}:${s.score.toFixed(2)}`).join(', '), `final:${weightedScore.toFixed(2)}`);

      if (weightedScore > highestScore && weightedScore > 0.2) { // Lower threshold for more lenient matching
        highestScore = weightedScore;
        bestMatch = {
          ...faq,
          matchDetails: scores,
          finalScore: weightedScore
        };
      }
    }

    if (bestMatch) {
      console.log(`Found enhanced keyword FAQ match with score ${highestScore.toFixed(3)}:`, bestMatch.question);
      return {
        ...bestMatch,
        keywordScore: highestScore,
      };
    }

    return null;
  }

  /**
   * Normalize question text for better matching
   */
  normalizeQuestion(question) {
    return question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Calculate exact word matching score
   */
  calculateExactWordScore(userQuestion, faqQuestion) {
    const userWords = userQuestion.split(/\s+/).filter(word => word.length > 2);
    const faqWords = faqQuestion.split(/\s+/).filter(word => word.length > 2);

    if (userWords.length === 0 || faqWords.length === 0) return 0;

    let matchedWords = 0;
    for (const userWord of userWords) {
      if (faqWords.includes(userWord)) {
        matchedWords++;
      }
    }

    return matchedWords / Math.max(userWords.length, faqWords.length);
  }

  /**
   * Calculate partial word matching score (includes substring matches)
   */
  calculatePartialWordScore(userQuestion, faqQuestion) {
    const userWords = userQuestion.split(/\s+/).filter(word => word.length > 2);
    const faqWords = faqQuestion.split(/\s+/).filter(word => word.length > 2);

    if (userWords.length === 0 || faqWords.length === 0) return 0;

    let matchedWords = 0;
    for (const userWord of userWords) {
      if (faqWords.some(faqWord => faqWord.includes(userWord) || userWord.includes(faqWord))) {
        matchedWords++;
      }
    }

    return matchedWords / Math.max(userWords.length, faqWords.length);
  }

  /**
   * Calculate character-level similarity for proper nouns
   */
  calculateCharacterSimilarity(userQuestion, faqQuestion) {
    // Extract potential proper nouns (words with capital letters in original)
    const userProperNouns = this.extractProperNouns(userQuestion);
    const faqProperNouns = this.extractProperNouns(faqQuestion);

    if (userProperNouns.length === 0 || faqProperNouns.length === 0) return 0;

    let bestSimilarity = 0;
    for (const userNoun of userProperNouns) {
      for (const faqNoun of faqProperNouns) {
        const similarity = this.levenshteinSimilarity(userNoun, faqNoun);
        bestSimilarity = Math.max(bestSimilarity, similarity);
      }
    }

    return bestSimilarity;
  }

  /**
   * Extract proper nouns (capitalize words, mixed case, etc.)
   */
  extractProperNouns(text) {
    // Simple heuristic: words that are all caps or have mixed case
    return text.split(/\s+/).filter(word => 
      word.length > 2 && (
        word === word.toUpperCase() || // All caps like "UTRADIE"
        /[A-Z]/.test(word) // Has capital letters like "AdminOh"
      )
    );
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  levenshteinSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate question pattern score (what, how, why, difference, etc.)
   */
  calculateQuestionPatternScore(userQuestion, faqQuestion) {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who'];
    const comparisonWords = ['difference', 'between', 'vs', 'versus', 'compare'];
    
    let patternScore = 0;
    
    // Check for question pattern matches
    for (const qWord of questionWords) {
      if (userQuestion.includes(qWord) && faqQuestion.includes(qWord)) {
        patternScore += 0.3;
      }
    }

    // Check for comparison pattern matches
    for (const cWord of comparisonWords) {
      if (userQuestion.includes(cWord) && faqQuestion.includes(cWord)) {
        patternScore += 0.4; // Higher weight for comparison patterns
      }
    }

    return Math.min(patternScore, 1.0); // Cap at 1.0
  }

  /**
   * Fallback keyword search method for business-specific FAQs (kept for compatibility)
   */
  keywordSearchFAQs(userQuestion, faqs) {
    return this.enhancedKeywordSearchFAQs(userQuestion, faqs);
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


