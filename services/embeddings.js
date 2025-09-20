const { OpenAI } = require("openai");
const pool = require("../config/database");

class EmbeddingsService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.embeddingModel = "text-embedding-3-small"; // Faster model for better performance
    this.dimensions = 1536; // Optimized dimensions for speed
  }

  /**
   * Generate embeddings for text using OpenAI's text-embedding-3-large model
   */
  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
        dimensions: this.dimensions,
      });

      const embedding = response.data[0].embedding;

      return embedding;
    } catch (error) {
      console.error("Error generating embedding:", error);
      throw new Error("Failed to generate embedding");
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddingsBatch(texts) {
    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: texts,
        dimensions: this.dimensions,
      });

      const embeddings = response.data.map((item) => item.embedding);

      return embeddings;
    } catch (error) {
      console.error("Error generating batch embeddings:", error);
      throw new Error("Failed to generate batch embeddings");
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2) {
      // Change from console.warn to console.debug to reduce noise
      console.debug("One or both embeddings are undefined, returning 0 similarity");
      return 0;
    }
    if (embedding1.length !== embedding2.length) {
      throw new Error("Embeddings must have the same dimensions");
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
   * Find the most similar text from a list of texts using embeddings
   */
  async findMostSimilar(queryText, candidateTexts, threshold = 0.7) {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.generateEmbedding(queryText);

      // Generate embeddings for all candidates
      const candidateEmbeddings = await this.generateEmbeddingsBatch(candidateTexts);

      let bestMatch = null;
      let highestSimilarity = 0;

      for (let i = 0; i < candidateTexts.length; i++) {
        const similarity = this.calculateCosineSimilarity(queryEmbedding, candidateEmbeddings[i]);

        if (similarity > highestSimilarity && similarity >= threshold) {
          highestSimilarity = similarity;
          bestMatch = {
            text: candidateTexts[i],
            similarity: similarity,
            index: i,
          };
        }
      }

      return bestMatch;
    } catch (error) {
      console.error("Error finding most similar text:", error);
      throw new Error("Failed to find most similar text");
    }
  }

  /**
   * Enhanced FAQ matching using semantic similarity
   */
  async findBestFAQMatch(userQuestion, faqs, threshold = 0.75) {
    try {
      if (faqs.length === 0) {
        return null;
      }

      // Extract questions from FAQs
      const questions = faqs.map((faq) => faq.question);

      // Find most similar question
      const bestMatch = await this.findMostSimilar(userQuestion, questions, threshold);

      if (bestMatch) {
        const matchedFAQ = faqs[bestMatch.index];

        return {
          ...matchedFAQ,
          semanticSimilarity: bestMatch.similarity,
          matchType: "semantic",
        };
      }

      return null;
    } catch (error) {
      console.error("Error in semantic FAQ matching:", error);
      throw new Error("Failed to perform semantic FAQ matching");
    }
  }

  /**
   * Enhanced intent detection using embeddings
   */
  async detectIntentWithEmbeddings(message, intentExamples = {}) {
    try {
      // Use the provided intentExamples (from database)
      const examples = intentExamples;
      const intentCategories = Object.keys(examples);

      if (intentCategories.length === 0) {
        // Fallback to general intent if no examples provided
        return {
          intent: "general",
          confidence: 0.5,
          method: "fallback",
        };
      }

      // Find the most similar intent category
      let bestIntent = "general";
      let highestSimilarity = 0;

      for (const intent of intentCategories) {
        const bestMatch = await this.findMostSimilar(message, examples[intent], 0.3);

        if (bestMatch && bestMatch.similarity > highestSimilarity) {
          highestSimilarity = bestMatch.similarity;
          bestIntent = intent;
        }
      }

      return {
        intent: bestIntent,
        confidence: highestSimilarity,
        method: "embeddings",
      };
    } catch (error) {
      console.error("Error in enhanced intent detection:", error);
      // Fallback to general intent
      return {
        intent: "general",
        confidence: 0.5,
        method: "fallback",
      };
    }
  }

  /**
   * Search FAQ embeddings from database (business-specific)
   */
  async searchFAQEmbeddings(businessId, userQuestion, threshold = 0.75) {
    try {
      // Get all stored FAQ embeddings for this specific business
      const result = await pool.query(
        "SELECT faq_id, question, answer, embedding FROM faq_embeddings WHERE business_id = $1",
        [businessId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      // Generate embedding for user question
      const queryEmbedding = await this.generateEmbedding(userQuestion);

      let bestMatch = null;
      let highestSimilarity = 0;

      // Compare with stored embeddings for this business
      for (const row of result.rows) {
        try {
          let storedEmbedding;

          // Handle different embedding storage formats
          if (typeof row.embedding === "string") {
            storedEmbedding = JSON.parse(row.embedding);
          } else if (Array.isArray(row.embedding)) {
            storedEmbedding = row.embedding;
          } else if (row.embedding && typeof row.embedding === "object") {
            storedEmbedding = row.embedding;
          } else {
            console.warn(`Invalid embedding format for FAQ ${row.faq_id}:`, typeof row.embedding);
            continue;
          }

          // Validate that the embedding is an array of numbers
          if (!Array.isArray(storedEmbedding) || storedEmbedding.length === 0) {
            console.warn(`Invalid embedding array for FAQ ${row.faq_id}`);
            continue;
          }

          const similarity = this.calculateCosineSimilarity(queryEmbedding, storedEmbedding);

          if (similarity > highestSimilarity && similarity >= threshold) {
            highestSimilarity = similarity;
            bestMatch = {
              faq_id: row.faq_id,
              question: row.question,
              answer: row.answer,
              businessId: businessId,
              similarity: similarity,
            };
          }
        } catch (parseError) {
          console.error(`Error parsing embedding for FAQ ${row.faq_id}:`, parseError);
          console.error(`Raw embedding data:`, row.embedding);
          continue;
        }
      }

      return bestMatch;
    } catch (error) {
      console.error("Error searching FAQ embeddings for business", businessId, ":", error);
      throw new Error("Failed to search FAQ embeddings");
    }
  }

  /**
   * Store FAQ embeddings in database for caching (business-specific)
   */
  async storeFAQEmbeddings(businessId, faqs) {
    try {
      // Generate embeddings for all FAQ questions
      const questions = faqs.map((faq) => faq.question);
      const embeddings = await this.generateEmbeddingsBatch(questions);

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
    } catch (error) {
      console.error("Error storing FAQ embeddings for business", businessId, ":", error);
      throw new Error("Failed to store FAQ embeddings");
    }
  }

  /**
   * Analyze conversation context using embeddings
   */
  async analyzeConversationContext(conversationHistory, currentMessage) {
    try {
      if (conversationHistory.length === 0) {
        return {
          context: "new_conversation",
          confidence: 1.0,
          relevantHistory: [],
        };
      }

      // Generate embedding for current message
      const currentEmbedding = await this.generateEmbedding(currentMessage);

      // Find most relevant previous messages
      const relevantHistory = [];
      const historyTexts = conversationHistory
        .map((msg) => msg.content || msg.message)
        .filter((text) => text && text.trim().length > 0 && text !== "undefined" && text !== "null");
      const historyEmbeddings = await this.generateEmbeddingsBatch(historyTexts);

      for (let i = 0; i < conversationHistory.length && i < historyEmbeddings.length; i++) {
        if (historyEmbeddings[i]) {
          // Additional safety check
          const similarity = this.calculateCosineSimilarity(currentEmbedding, historyEmbeddings[i]);
          if (similarity > 0.6) {
            relevantHistory.push({
              ...conversationHistory[i],
              relevance: similarity,
            });
          }
        }
      }

      // Sort by relevance
      relevantHistory.sort((a, b) => b.relevance - a.relevance);

      // Determine context type
      let context = "new_topic";
      if (relevantHistory.length > 0) {
        if (relevantHistory[0].relevance > 0.8) {
          context = "continuation";
        } else if (relevantHistory[0].relevance > 0.6) {
          context = "related_topic";
        }
      }

      return {
        context,
        confidence: relevantHistory.length > 0 ? relevantHistory[0].relevance : 0,
        relevantHistory: relevantHistory.slice(0, 3), // Top 3 most relevant
      };
    } catch (error) {
      console.error("Error analyzing conversation context:", error);
      return {
        context: "unknown",
        confidence: 0,
        relevantHistory: [],
      };
    }
  }

  /**
   * Store conversation embedding for context analysis
   */
  async storeConversationEmbedding(
    businessId,
    conversationId,
    messageId,
    messageContent,
    messageType = "text",
    role = "user"
  ) {
    try {
      // Generate embedding for the message
      const embedding = await this.generateEmbedding(messageContent);

      // Store in database
      await pool.query(
        `INSERT INTO conversation_embeddings (business_id, conversation_id, message_id, message_content, embedding, message_type, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [businessId, conversationId, messageId, messageContent, JSON.stringify(embedding), messageType]
      );
    } catch (error) {
      console.error("Error storing conversation embedding:", error);
      // Don't throw error as this is a background operation
    }
  }

  /**
   * Clean up malformed embeddings in the database
   */
  async cleanupMalformedEmbeddings(businessId = null) {
    try {
      let query = "SELECT id, business_id, faq_id, embedding FROM faq_embeddings";
      let params = [];

      if (businessId) {
        query += " WHERE business_id = $1";
        params = [businessId];
      }

      const result = await pool.query(query, params);

      for (const row of result.rows) {
        try {
          // Try to parse the embedding
          let embedding;
          if (typeof row.embedding === "string") {
            embedding = JSON.parse(row.embedding);
          } else {
            embedding = row.embedding;
          }

          // Validate the embedding
          if (!Array.isArray(embedding) || embedding.length === 0) {
            await pool.query("DELETE FROM faq_embeddings WHERE id = $1", [row.id]);
          }
        } catch (error) {
          await pool.query("DELETE FROM faq_embeddings WHERE id = $1", [row.id]);
        }
      }
    } catch (error) {
      console.error("Error cleaning up malformed embeddings:", error);
      throw error;
    }
  }
}

module.exports = new EmbeddingsService();
