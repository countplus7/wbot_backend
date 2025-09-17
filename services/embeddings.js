const { OpenAI } = require('openai');
const pool = require('../config/database');

class EmbeddingsService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.embeddingModel = 'text-embedding-3-large'; // Latest and most capable embedding model
    this.dimensions = 3072; // Maximum dimensions for better performance
  }

  /**
   * Generate embeddings for text using OpenAI's text-embedding-3-large model
   */
  async generateEmbedding(text) {
    try {
      console.log('Generating embedding for text:', text.substring(0, 100) + '...');
      
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: text,
        dimensions: this.dimensions,
      });

      const embedding = response.data[0].embedding;
      console.log('Generated embedding with dimensions:', embedding.length);
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddingsBatch(texts) {
    try {
      console.log(`Generating embeddings for ${texts.length} texts`);
      
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: texts,
        dimensions: this.dimensions,
      });

      const embeddings = response.data.map(item => item.embedding);
      console.log(`Generated ${embeddings.length} embeddings`);
      
      return embeddings;
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw new Error('Failed to generate batch embeddings');
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
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
      console.log(`Finding most similar text for query: "${queryText}"`);
      console.log(`Comparing against ${candidateTexts.length} candidates`);

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
            index: i
          };
        }
      }

      console.log(`Best match found with similarity: ${highestSimilarity}`);
      return bestMatch;
    } catch (error) {
      console.error('Error finding most similar text:', error);
      throw new Error('Failed to find most similar text');
    }
  }

  /**
   * Enhanced FAQ matching using semantic similarity
   */
  async findBestFAQMatch(userQuestion, faqs, threshold = 0.75) {
    try {
      console.log(`Semantic FAQ search for: "${userQuestion}"`);
      console.log(`Searching through ${faqs.length} FAQs`);

      if (faqs.length === 0) {
        return null;
      }

      // Extract questions from FAQs
      const questions = faqs.map(faq => faq.question);
      
      // Find most similar question
      const bestMatch = await this.findMostSimilar(userQuestion, questions, threshold);
      
      if (bestMatch) {
        const matchedFAQ = faqs[bestMatch.index];
        console.log(`Found semantic FAQ match: "${matchedFAQ.question}" (similarity: ${bestMatch.similarity})`);
        
        return {
          ...matchedFAQ,
          semanticSimilarity: bestMatch.similarity,
          matchType: 'semantic'
        };
      }

      console.log('No semantic FAQ match found above threshold');
      return null;
    } catch (error) {
      console.error('Error in semantic FAQ matching:', error);
      throw new Error('Failed to perform semantic FAQ matching');
    }
  }

  /**
   * Enhanced intent detection using embeddings
   */
  async detectIntentWithEmbeddings(message, intentExamples = {}) {
    try {
      console.log('Enhanced intent detection with embeddings for:', message);

      // Default intent examples if none provided
      const defaultExamples = {
        'FAQ': [
          'What are your business hours?',
          'How do I return a product?',
          'What payment methods do you accept?',
          'Do you offer delivery?',
          'What is your refund policy?',
          'How can I contact support?',
          'What are your shipping options?'
        ],
        'EMAIL': [
          'Send an email to john@example.com',
          'I need to email the client about the project',
          'Can you send a message to the team?',
          'Email the invoice to the customer'
        ],
        'CALENDAR': [
          'Schedule a meeting for tomorrow',
          'Book an appointment next week',
          'Check my availability',
          'Create a calendar event',
          'What meetings do I have today?'
        ],
        'SALESFORCE': [
          'Create a new lead',
          'Update the contact information',
          'Check the opportunity status',
          'Create a new case',
          'View my sales pipeline'
        ],
        'ODOO': [
          'Create a new order',
          'Generate an invoice',
          'Check inventory levels',
          'Update product information',
          'Process a return'
        ],
        'GENERAL': [
          'Hello, how are you?',
          'Thank you for your help',
          'I have a question',
          'Can you help me?'
        ]
      };

      const examples = { ...defaultExamples, ...intentExamples };
      const intentCategories = Object.keys(examples);
      
      // Find the most similar intent category
      let bestIntent = 'GENERAL';
      let highestSimilarity = 0;

      for (const intent of intentCategories) {
        const bestMatch = await this.findMostSimilar(message, examples[intent], 0.3);
        
        if (bestMatch && bestMatch.similarity > highestSimilarity) {
          highestSimilarity = bestMatch.similarity;
          bestIntent = intent;
        }
      }

      console.log(`Detected intent: ${bestIntent} (similarity: ${highestSimilarity})`);

      return {
        intent: bestIntent,
        confidence: highestSimilarity,
        method: 'embeddings'
      };
    } catch (error) {
      console.error('Error in enhanced intent detection:', error);
      // Fallback to general intent
      return {
        intent: 'GENERAL',
        confidence: 0.5,
        method: 'fallback'
      };
    }
  }

  /**
   * Search FAQ embeddings from database (business-specific)
   */
  async searchFAQEmbeddings(businessId, userQuestion, threshold = 0.75) {
    try {
      console.log(`Searching FAQ embeddings for business ${businessId}`);

      // Get all stored FAQ embeddings for this specific business
      const result = await pool.query(
        'SELECT faq_id, question, answer, embedding FROM faq_embeddings WHERE business_id = $1',
        [businessId]
      );

      if (result.rows.length === 0) {
        console.log(`No FAQ embeddings found in database for business ${businessId}`);
        return null;
      }

      // Generate embedding for user question
      const queryEmbedding = await this.generateEmbedding(userQuestion);

      let bestMatch = null;
      let highestSimilarity = 0;

      // Compare with stored embeddings for this business
      for (const row of result.rows) {
        const storedEmbedding = JSON.parse(row.embedding);
        const similarity = this.calculateCosineSimilarity(queryEmbedding, storedEmbedding);
        
        if (similarity > highestSimilarity && similarity >= threshold) {
          highestSimilarity = similarity;
          bestMatch = {
            faq_id: row.faq_id,
            question: row.question,
            answer: row.answer,
            businessId: businessId,
            similarity: similarity
          };
        }
      }

      if (bestMatch) {
        console.log(`Found FAQ match in database for business ${businessId}: "${bestMatch.question}" (similarity: ${bestMatch.similarity})`);
      }

      return bestMatch;
    } catch (error) {
      console.error('Error searching FAQ embeddings for business', businessId, ':', error);
      throw new Error('Failed to search FAQ embeddings');
    }
  }

  /**
   * Store FAQ embeddings in database for caching (business-specific)
   */
  async storeFAQEmbeddings(businessId, faqs) {
    try {
      console.log(`Storing embeddings for ${faqs.length} FAQs for business ${businessId}`);

      // Generate embeddings for all FAQ questions
      const questions = faqs.map(faq => faq.question);
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

      console.log(`FAQ embeddings stored successfully for business ${businessId}`);
    } catch (error) {
      console.error('Error storing FAQ embeddings for business', businessId, ':', error);
      throw new Error('Failed to store FAQ embeddings');
    }
  }

  /**
   * Analyze conversation context using embeddings
   */
  async analyzeConversationContext(conversationHistory, currentMessage) {
    try {
      console.log('Analyzing conversation context with embeddings');

      if (conversationHistory.length === 0) {
        return {
          context: 'new_conversation',
          confidence: 1.0,
          relevantHistory: []
        };
      }

      // Generate embedding for current message
      const currentEmbedding = await this.generateEmbedding(currentMessage);
      
      // Find most relevant previous messages
      const relevantHistory = [];
      const historyTexts = conversationHistory.map(msg => msg.content || msg.message);
      const historyEmbeddings = await this.generateEmbeddingsBatch(historyTexts);

      for (let i = 0; i < conversationHistory.length; i++) {
        const similarity = this.calculateCosineSimilarity(currentEmbedding, historyEmbeddings[i]);
        
        if (similarity > 0.6) { // Threshold for relevant context
          relevantHistory.push({
            ...conversationHistory[i],
            relevance: similarity
          });
        }
      }

      // Sort by relevance
      relevantHistory.sort((a, b) => b.relevance - a.relevance);

      // Determine context type
      let context = 'new_topic';
      if (relevantHistory.length > 0) {
        if (relevantHistory[0].relevance > 0.8) {
          context = 'continuation';
        } else if (relevantHistory[0].relevance > 0.6) {
          context = 'related_topic';
        }
      }

      console.log(`Conversation context: ${context} (${relevantHistory.length} relevant messages)`);

      return {
        context,
        confidence: relevantHistory.length > 0 ? relevantHistory[0].relevance : 0,
        relevantHistory: relevantHistory.slice(0, 3) // Top 3 most relevant
      };
    } catch (error) {
      console.error('Error analyzing conversation context:', error);
      return {
        context: 'unknown',
        confidence: 0,
        relevantHistory: []
      };
    }
  }

  /**
   * Store conversation embedding for context analysis
   */
  async storeConversationEmbedding(businessId, conversationId, messageId, messageContent, messageType = 'text', role = 'user') {
    try {
      console.log(`Storing conversation embedding for business ${businessId}, conversation ${conversationId}`);

      // Generate embedding for the message
      const embedding = await this.generateEmbedding(messageContent);

      // Store in database
      await pool.query(
        `INSERT INTO conversation_embeddings (business_id, conversation_id, message_id, message_content, embedding, message_type, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [businessId, conversationId, messageId, messageContent, JSON.stringify(embedding), messageType]
      );

      console.log('Conversation embedding stored successfully');
    } catch (error) {
      console.error('Error storing conversation embedding:', error);
      // Don't throw error as this is a background operation
    }
  }
}

module.exports = new EmbeddingsService();
