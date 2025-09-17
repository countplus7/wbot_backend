const EmbeddingsService = require('./embeddings');
const pool = require('../config/database');

class EmbeddingCacheService {
  constructor() {
    this.embeddingsService = EmbeddingsService;
    this.cache = new Map(); // In-memory cache for frequently accessed embeddings
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    this.maxCacheSize = 1000; // Maximum number of cached items
  }

  /**
   * Get cached embedding or generate new one
   */
  async getEmbedding(text, useCache = true) {
    try {
      const cacheKey = this.generateCacheKey(text);
      
      if (useCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          console.log('Using cached embedding for:', text.substring(0, 50) + '...');
          return cached.embedding;
        } else {
          this.cache.delete(cacheKey);
        }
      }

      // Generate new embedding
      console.log('Generating new embedding for:', text.substring(0, 50) + '...');
      const embedding = await this.embeddingsService.generateEmbedding(text);
      
      // Cache the result
      if (useCache) {
        this.cacheEmbedding(cacheKey, embedding);
      }
      
      return embedding;
    } catch (error) {
      console.error('Error getting embedding:', error);
      throw error;
    }
  }

  /**
   * Get cached embeddings or generate new ones in batch
   */
  async getEmbeddingsBatch(texts, useCache = true) {
    try {
      const results = [];
      const textsToGenerate = [];
      const indicesToGenerate = [];

      // Check cache first
      for (let i = 0; i < texts.length; i++) {
        const cacheKey = this.generateCacheKey(texts[i]);
        
        if (useCache && this.cache.has(cacheKey)) {
          const cached = this.cache.get(cacheKey);
          if (Date.now() - cached.timestamp < this.cacheExpiry) {
            results[i] = cached.embedding;
            continue;
          } else {
            this.cache.delete(cacheKey);
          }
        }
        
        textsToGenerate.push(texts[i]);
        indicesToGenerate.push(i);
      }

      // Generate embeddings for uncached texts
      if (textsToGenerate.length > 0) {
        console.log(`Generating ${textsToGenerate.length} new embeddings, using ${results.filter(r => r).length} cached`);
        const newEmbeddings = await this.embeddingsService.generateEmbeddingsBatch(textsToGenerate);
        
        // Store results and cache new embeddings
        for (let i = 0; i < newEmbeddings.length; i++) {
          const originalIndex = indicesToGenerate[i];
          const embedding = newEmbeddings[i];
          results[originalIndex] = embedding;
          
          if (useCache) {
            this.cacheEmbedding(this.generateCacheKey(textsToGenerate[i]), embedding);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error getting batch embeddings:', error);
      throw error;
    }
  }

  /**
   * Cache an embedding
   */
  cacheEmbedding(cacheKey, embedding) {
    // Implement LRU cache eviction if needed
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, {
      embedding: embedding,
      timestamp: Date.now()
    });
  }

  /**
   * Generate cache key for text
   */
  generateCacheKey(text) {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Preload FAQ embeddings for a business
   */
  async preloadFAQEmbeddings(businessId) {
    try {
      console.log(`Preloading FAQ embeddings for business ${businessId}`);
      
      const result = await pool.query(
        'SELECT faq_id, question, embedding FROM faq_embeddings WHERE business_id = $1',
        [businessId]
      );

      for (const row of result.rows) {
        const cacheKey = this.generateCacheKey(row.question);
        this.cacheEmbedding(cacheKey, JSON.parse(row.embedding));
      }

      console.log(`Preloaded ${result.rows.length} FAQ embeddings for business ${businessId}`);
    } catch (error) {
      console.error('Error preloading FAQ embeddings:', error);
    }
  }

  /**
   * Clear cache for a specific business
   */
  clearBusinessCache(businessId) {
    // This is a simplified implementation
    // In a production system, you might want to track which cache entries belong to which business
    console.log(`Clearing cache for business ${businessId}`);
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      expiry: this.cacheExpiry
    };
  }

  /**
   * Optimized FAQ search with caching
   */
  async searchFAQsWithCache(businessId, userQuestion, threshold = 0.75) {
    try {
      console.log(`Optimized FAQ search for business ${businessId}: "${userQuestion}"`);

      // Get all FAQ embeddings from database
      const result = await pool.query(
        'SELECT faq_id, question, answer, embedding FROM faq_embeddings WHERE business_id = $1',
        [businessId]
      );

      if (result.rows.length === 0) {
        console.log('No FAQ embeddings found in database');
        return null;
      }

      // Get or generate embedding for user question
      const queryEmbedding = await this.getEmbedding(userQuestion);

      let bestMatch = null;
      let highestSimilarity = 0;

      // Compare with stored embeddings
      for (const row of result.rows) {
        const storedEmbedding = JSON.parse(row.embedding);
        const similarity = this.embeddingsService.calculateCosineSimilarity(queryEmbedding, storedEmbedding);
        
        if (similarity > highestSimilarity && similarity >= threshold) {
          highestSimilarity = similarity;
          bestMatch = {
            id: row.faq_id,
            question: row.question,
            answer: row.answer,
            semanticSimilarity: similarity,
            matchType: 'semantic_cached'
          };
        }
      }

      if (bestMatch) {
        console.log(`Found optimized FAQ match: "${bestMatch.question}" (similarity: ${bestMatch.semanticSimilarity})`);
      }

      return bestMatch;
    } catch (error) {
      console.error('Error in optimized FAQ search:', error);
      throw new Error('Failed to perform optimized FAQ search');
    }
  }

  /**
   * Batch preload embeddings for multiple businesses
   */
  async batchPreloadEmbeddings(businessIds) {
    try {
      console.log(`Batch preloading embeddings for ${businessIds.length} businesses`);
      
      for (const businessId of businessIds) {
        await this.preloadFAQEmbeddings(businessId);
      }
      
      console.log('Batch preloading completed');
    } catch (error) {
      console.error('Error in batch preloading:', error);
    }
  }
}

module.exports = new EmbeddingCacheService();
