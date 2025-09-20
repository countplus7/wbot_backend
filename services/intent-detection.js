const { OpenAI } = require("openai");
const pool = require("../config/database");
const crypto = require("crypto");

class IntentDetectionService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.embeddingModel = "text-embedding-3-small"; // Fast embedding model
    this.dimensions = 1536; // Optimized dimensions for speed
    this.chatModel = "gpt-3.5-turbo"; // Fast model for fallback
    this.cache = new Map(); // In-memory cache for ultra-fast lookups
    this.cacheTimeout = 1000 * 60 * 60; // 1 hour cache

    // Initialize cache cleanup
    this.initCacheCleanup();
  }

  /**
   * Initialize periodic cache cleanup
   */
  initCacheCleanup() {
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 5 * 60 * 1000); // Clean every 5 minutes
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expires) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Generate fast embeddings using text-embedding-3-small
   */
  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
        dimensions: this.dimensions,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Create message hash for caching
   */
  createMessageHash(message) {
    return crypto.createHash("sha256").update(message.toLowerCase().trim()).digest("hex");
  }

  /**
   * Check cache for existing intent detection result
   */
  async checkCache(messageHash) {
    // Check in-memory cache first
    const memCached = this.cache.get(messageHash);
    if (memCached && Date.now() < memCached.expires) {
      return memCached.result;
    }

    // Check database cache
    try {
      const result = await pool.query(
        "SELECT detected_intent, confidence, method FROM intent_cache WHERE message_hash = $1 AND expires_at > NOW()",
        [messageHash]
      );

      if (result.rows.length > 0) {
        const cached = result.rows[0];
        // Store in memory cache for faster access
        this.cache.set(messageHash, {
          result: {
            intent: cached.detected_intent,
            confidence: parseFloat(cached.confidence),
            method: cached.method,
            cached: true,
          },
          expires: Date.now() + this.cacheTimeout,
        });
        return {
          intent: cached.detected_intent,
          confidence: parseFloat(cached.confidence),
          method: cached.method,
          cached: true,
        };
      }
    } catch (error) {
      console.error("Error checking cache:", error);
    }

    return null;
  }

  /**
   * Store result in cache
   */
  async storeInCache(messageHash, message, result) {
    try {
      // Store in memory cache
      this.cache.set(messageHash, {
        result: { ...result, cached: false },
        expires: Date.now() + this.cacheTimeout,
      });

      // Store in database cache
      await pool.query(
        `INSERT INTO intent_cache (message_hash, message_text, detected_intent, confidence, method, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
         ON CONFLICT (message_hash) 
         DO UPDATE SET 
           detected_intent = EXCLUDED.detected_intent,
           confidence = EXCLUDED.confidence,
           method = EXCLUDED.method,
           expires_at = EXCLUDED.expires_at`,
        [messageHash, message, result.intent, result.confidence, result.method]
      );
    } catch (error) {
      console.error("Error storing in cache:", error);
    }
  }

  /**
   * Get all intent examples with embeddings
   */
  async getIntentExamples() {
    try {
      const result = await pool.query(`
        SELECT i.name as intent_name, i.confidence_threshold, ie.text, ie.embedding, ie.weight
        FROM intents i
        JOIN intent_examples ie ON i.id = ie.intent_id
        WHERE i.active = true AND ie.active = true
        ORDER BY i.name, ie.weight DESC
      `);

      const intentMap = {};
      for (const row of result.rows) {
        if (!intentMap[row.intent_name]) {
          intentMap[row.intent_name] = {
            threshold: parseFloat(row.confidence_threshold),
            examples: [],
          };
        }
        intentMap[row.intent_name].examples.push({
          text: row.text,
          embedding: row.embedding,
          weight: parseFloat(row.weight),
        });
      }

      return intentMap;
    } catch (error) {
      console.error("Error getting intent examples:", error);
      return {};
    }
  }

  /**
   * Main intent detection method
   */
  async detectIntent(message, businessId = null) {
    try {
      const startTime = Date.now();
      const messageHash = this.createMessageHash(message);

      // Check cache first
      const cached = await this.checkCache(messageHash);
      if (cached) {
        console.log(`Intent detection (cached): ${cached.intent} (${Date.now() - startTime}ms)`);
        return cached;
      }

      // Generate embedding for the message
      const messageEmbedding = await this.generateEmbedding(message);

      // Get all intent examples
      const intentExamples = await this.getIntentExamples();

      if (Object.keys(intentExamples).length === 0) {
        console.log("No intent examples found, falling back to GPT");
        return await this.detectIntentWithGPT(message, messageHash);
      }

      // Find best matching intent using embeddings
      let bestIntent = null;
      let highestSimilarity = 0;

      for (const [intentName, intentData] of Object.entries(intentExamples)) {
        for (const example of intentData.examples) {
          if (!example.embedding) continue;

          const similarity = this.calculateCosineSimilarity(messageEmbedding, example.embedding) * example.weight; // Apply weight

          if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            bestIntent = {
              intent: intentName,
              confidence: similarity,
              threshold: intentData.threshold,
            };
          }
        }
      }

      const detectionTime = Date.now() - startTime;

      // Check if confidence meets threshold
      if (bestIntent && bestIntent.confidence >= bestIntent.threshold) {
        const result = {
          intent: bestIntent.intent,
          confidence: bestIntent.confidence,
          method: "embedding",
          detectionTime,
        };

        await this.storeInCache(messageHash, message, result);
        console.log(
          `Intent detection (embedding): ${result.intent} - ${result.confidence.toFixed(3)} (${detectionTime}ms)`
        );
        return result;
      }

      // If confidence is low, fall back to GPT
      console.log(`Low confidence (${bestIntent?.confidence.toFixed(3) || 0}), falling back to GPT`);
      return await this.detectIntentWithGPT(message, messageHash, detectionTime);
    } catch (error) {
      console.error("Error in intent detection:", error);
      return {
        intent: "general",
        confidence: 0.5,
        method: "fallback",
        error: error.message,
      };
    }
  }

  /**
   * Fallback intent detection using GPT (few-shot)
   */
  async detectIntentWithGPT(message, messageHash, previousTime = 0) {
    try {
      const startTime = Date.now();

      // Get available intents from database for dynamic prompt
      const intentsResult = await pool.query(`
        SELECT name, description FROM intents WHERE active = true ORDER BY name
      `);

      const availableIntents = intentsResult.rows
        .map((row) => `- ${row.name.toUpperCase()}: ${row.description || "General intent"}`)
        .join("\n");

      const systemPrompt = `You are an intent classifier for a WhatsApp business bot. Classify the user's message into one of these intents:

INTENTS:
${availableIntents}

Return only JSON: {"intent": "intent_name", "confidence": 0.9}

Examples:
"Send an email to john@example.com" -> {"intent": "gmail_send", "confidence": 0.9}
"Schedule a meeting for tomorrow" -> {"intent": "calendar_create", "confidence": 0.9}
"Check my availability" -> {"intent": "calendar_check", "confidence": 0.9}
"Reschedule my meeting" -> {"intent": "calendar_update", "confidence": 0.9}
"Cancel my meeting" -> {"intent": "calendar_delete", "confidence": 0.9}
"Create a new contact" -> {"intent": "hubspot_contact_create", "confidence": 0.9}
"Search for contacts" -> {"intent": "hubspot_contact_search", "confidence": 0.9}
"Update contact information" -> {"intent": "hubspot_contact_update", "confidence": 0.9}
"Create a new deal" -> {"intent": "hubspot_deal_create", "confidence": 0.9}
"Update deal information" -> {"intent": "hubspot_deal_update", "confidence": 0.9}
"Create a new company" -> {"intent": "hubspot_company_create", "confidence": 0.9}
"View my sales pipeline" -> {"intent": "hubspot_pipeline_view", "confidence": 0.9}
"Create a new customer" -> {"intent": "odoo_customer_create", "confidence": 0.9}
"Search for customers" -> {"intent": "odoo_customer_search", "confidence": 0.9}
"Create a new product" -> {"intent": "odoo_product_create", "confidence": 0.9}
"Create a new sale order" -> {"intent": "odoo_sale_order_create", "confidence": 0.9}
"Create a new invoice" -> {"intent": "odoo_invoice_create", "confidence": 0.9}
"Check inventory" -> {"intent": "odoo_inventory_check", "confidence": 0.9}
"Create a new lead" -> {"intent": "odoo_lead_create", "confidence": 0.9}`;

      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Classify: "${message}"` },
        ],
        temperature: 0.1,
        max_tokens: 50,
      });

      const gptTime = Date.now() - startTime;
      const totalTime = previousTime + gptTime;

      try {
        const result = JSON.parse(response.choices[0].message.content);
        const finalResult = {
          intent: result.intent || "general",
          confidence: result.confidence || 0.7,
          method: "gpt-fallback",
          detectionTime: totalTime,
        };

        await this.storeInCache(messageHash, message, finalResult);
        console.log(
          `Intent detection (GPT): ${finalResult.intent} - ${finalResult.confidence.toFixed(3)} (${totalTime}ms)`
        );
        return finalResult;
      } catch (parseError) {
        console.error("Error parsing GPT response:", parseError);
        return {
          intent: "general",
          confidence: 0.5,
          method: "gpt-fallback-error",
          detectionTime: totalTime,
        };
      }
    } catch (error) {
      console.error("Error in GPT fallback:", error);
      return {
        intent: "general",
        confidence: 0.5,
        method: "gpt-error",
        error: error.message,
      };
    }
  }

  /**
   * Add new intent example to database
   */
  async addIntentExample(intentName, exampleText, weight = 1.0) {
    try {
      // Ensure intent exists
      const intentResult = await pool.query(
        "INSERT INTO intents (name, description, confidence_threshold, active) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING RETURNING id",
        [intentName, `Intent for ${intentName}`, 0.75, true]
      );

      let intentId;
      if (intentResult.rows.length > 0) {
        intentId = intentResult.rows[0].id;
      } else {
        const existingIntent = await pool.query("SELECT id FROM intents WHERE name = $1", [intentName]);
        intentId = existingIntent.rows[0].id;
      }

      // Generate embedding
      const embedding = await this.generateEmbedding(exampleText);

      // Add example
      await pool.query(
        "INSERT INTO intent_examples (intent_id, text, embedding, weight, active) VALUES ($1, $2, $3, $4, $5)",
        [intentId, exampleText, JSON.stringify(embedding), weight, true]
      );

      console.log(`Added intent example: ${intentName} -> "${exampleText}"`);
      return true;
    } catch (error) {
      console.error("Error adding intent example:", error);
      return false;
    }
  }

  /**
   * Bulk add intent examples
   */
  async bulkAddIntentExamples(examples) {
    const results = [];
    for (const example of examples) {
      const result = await this.addIntentExample(example.intent, example.text, example.weight || 1.0);
      results.push(result);
    }
    return results;
  }

  /**
   * Get all intents with their examples
   */
  async getAllIntents() {
    try {
      const result = await pool.query(`
        SELECT 
          i.id,
          i.name,
          i.description,
          i.confidence_threshold,
          i.active,
          COUNT(ie.id) as example_count
        FROM intents i
        LEFT JOIN intent_examples ie ON i.id = ie.intent_id AND ie.active = true
        GROUP BY i.id, i.name, i.description, i.confidence_threshold, i.active
        ORDER BY i.name
      `);
      return result.rows;
    } catch (error) {
      console.error("Error getting all intents:", error);
      return [];
    }
  }

  /**
   * Get intent examples for a specific intent
   */
  async getIntentExamplesByName(intentName) {
    try {
      const result = await pool.query(
        `
        SELECT ie.id, ie.text, ie.weight, ie.active
        FROM intent_examples ie
        JOIN intents i ON ie.intent_id = i.id
        WHERE i.name = $1 AND ie.active = true
        ORDER BY ie.weight DESC, ie.text
      `,
        [intentName]
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting intent examples:", error);
      return [];
    }
  }

  /**
   * Update intent confidence threshold
   */
  async updateIntentThreshold(intentName, threshold) {
    try {
      await pool.query("UPDATE intents SET confidence_threshold = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2", [
        threshold,
        intentName,
      ]);
      console.log(`Updated threshold for intent ${intentName} to ${threshold}`);
      return true;
    } catch (error) {
      console.error("Error updating intent threshold:", error);
      return false;
    }
  }

  /**
   * Toggle intent active status
   */
  async toggleIntentStatus(intentName, active) {
    try {
      await pool.query("UPDATE intents SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE name = $2", [
        active,
        intentName,
      ]);
      console.log(`Set intent ${intentName} active status to ${active}`);
      return true;
    } catch (error) {
      console.error("Error toggling intent status:", error);
      return false;
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      cacheSize: this.cache.size,
      model: this.embeddingModel,
      dimensions: this.dimensions,
      chatModel: this.chatModel,
    };
  }

  /**
   * Clear all caches
   */
  async clearAllCaches() {
    try {
      // Clear in-memory cache
      this.cache.clear();

      // Clear database cache
      await pool.query("DELETE FROM intent_cache");

      console.log("All intent detection caches cleared");
      return true;
    } catch (error) {
      console.error("Error clearing caches:", error);
      return false;
    }
  }
}

module.exports = new IntentDetectionService();
