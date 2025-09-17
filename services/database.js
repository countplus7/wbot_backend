const pool = require("../config/database");

class DatabaseService {
  // Export the pool for use in other services
  static get pool() {
    return pool;
  }

  async createOrGetConversation(businessId, whatsappNumber) {
    try {
      // Check if conversation exists
      const existingConversation = await pool.query(
        "SELECT * FROM conversations WHERE business_id = $1 AND phone_number = $2 ORDER BY updated_at DESC LIMIT 1",
        [businessId, whatsappNumber]
      );

      if (existingConversation.rows.length > 0) {
        // Update the existing conversation
        await pool.query("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [
          existingConversation.rows[0].id,
        ]);
        return existingConversation.rows[0];
      } else {
        // Create new conversation
        const newConversation = await pool.query(
          "INSERT INTO conversations (business_id, phone_number) VALUES ($1, $2) RETURNING *",
          [businessId, whatsappNumber]
        );
        return newConversation.rows[0];
      }
    } catch (error) {
      console.error("Error creating/getting conversation:", error);
      throw error;
    }
  }

  async saveMessage(messageData) {
    try {
      const result = await pool.query(
        `INSERT INTO messages (
          business_id, conversation_id, message_id, from_number, to_number, 
          message_type, content, media_url, direction, status, local_file_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
        ON CONFLICT (message_id) 
        DO UPDATE SET 
          content = EXCLUDED.content,
          media_url = EXCLUDED.media_url,
          local_file_path = EXCLUDED.local_file_path,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING *`,
        [
          messageData.businessId,
          messageData.conversationId,
          messageData.messageId,
          messageData.fromNumber,
          messageData.toNumber,
          messageData.messageType,
          messageData.content,
          messageData.mediaUrl,
          messageData.isFromUser ? "inbound" : "outbound",
          "received",
          messageData.localFilePath || null
        ]
      );
      
      console.log(`Message saved successfully: ${messageData.messageId}`);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving message:", error);
      
      // If it's a column doesn't exist error, try without local_file_path
      if (error.code === '42703' && error.message.includes('local_file_path')) {
        console.log("local_file_path column doesn't exist, saving without it");
        try {
          const result = await pool.query(
            `INSERT INTO messages (
              business_id, conversation_id, message_id, from_number, to_number, 
              message_type, content, media_url, direction, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            ON CONFLICT (message_id) 
            DO UPDATE SET 
              content = EXCLUDED.content,
              media_url = EXCLUDED.media_url,
              status = EXCLUDED.status,
              updated_at = NOW()
            RETURNING *`,
            [
              messageData.businessId,
              messageData.conversationId,
              messageData.messageId,
              messageData.fromNumber,
              messageData.toNumber,
              messageData.messageType,
              messageData.content,
              messageData.mediaUrl,
              messageData.isFromUser ? "inbound" : "outbound",
              "received"
            ]
          );
          
          console.log(`Message saved successfully (without local_file_path): ${messageData.messageId}`);
          return result.rows[0];
        } catch (fallbackError) {
          console.error("Error saving message (fallback):", fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  async saveMediaFile(mediaData) {
    try {
      const result = await pool.query(
        `INSERT INTO media_files (
          business_id, message_id, file_name, file_path, file_type, file_size
        ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          mediaData.businessId,
          mediaData.messageId,
          mediaData.fileName,
          mediaData.filePath,
          mediaData.fileType,
          mediaData.fileSize,
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error("Error saving media file:", error);
      throw error;
    }
  }

  async getConversationHistoryForAI(businessId, whatsappNumber, limit = 10) {
    try {
      const result = await pool.query(
        `SELECT 
          CASE 
            WHEN m.direction = 'inbound' THEN 'user'
            ELSE 'assistant'
          END as role,
          CASE 
            WHEN m.message_type = 'audio' THEN CONCAT('Audio message: ', COALESCE(m.content, 'Transcribed audio'))
            WHEN m.message_type = 'image' THEN CONCAT('Image: ', COALESCE(m.content, ''), ' - Image analyzed')
            ELSE m.content
          END as content
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.business_id = $1 AND c.phone_number = $2
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [businessId, whatsappNumber, limit]
      );

      return result.rows.reverse().map((row) => ({
        role: row.role,
        content: row.content,
      }));
    } catch (error) {
      console.error("Error getting conversation history for AI:", error);
      throw error;
    }
  }

  async updateMessageLocalFilePath(messageId, localFilePath) {
    try {
      // Since messages table doesn't have local_file_path, we'll update the media_files table instead
      const result = await pool.query(
        "UPDATE media_files SET file_path = $1 WHERE message_id = (SELECT id FROM messages WHERE message_id = $2) RETURNING *",
        [localFilePath, messageId]
      );

      if (result.rows.length === 0) {
        console.warn(`No media file found for message ID ${messageId} to update`);
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error("Error updating message local file path:", error);
      throw error;
    }
  }

  // Get all conversations for a business
  async getBusinessConversations(businessId) {
    try {
      const result = await pool.query(
        `SELECT 
          c.id,
          c.phone_number,
          c.status,
          c.created_at,
          c.updated_at,
          COUNT(m.id) as message_count,
          MAX(m.created_at) as last_message_at
         FROM conversations c
         LEFT JOIN messages m ON c.id = m.conversation_id
         WHERE c.business_id = $1
         GROUP BY c.id, c.phone_number, c.status, c.created_at, c.updated_at
         ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting business conversations:", error);
      throw error;
    }
  }

  // Get messages for a specific conversation
  async getConversationMessages(conversationId, limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT 
          m.id,
          m.message_id,
          m.from_number,
          m.to_number,
          m.message_type,
          m.content,
          m.media_url,
          m.direction,
          m.status,
          m.created_at,
          mf.file_name,
          mf.file_path,
          mf.file_type
         FROM messages m
         LEFT JOIN media_files mf ON m.id = mf.message_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at ASC
         LIMIT $2 OFFSET $3`,
        [conversationId, limit, offset]
      );

      // Process the results to construct full media URLs
      const processedRows = result.rows.map((row) => {
        if (row.file_path) {
          // Construct the full URL for media files
          const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
          row.media_url = `${baseUrl}/media/${row.file_path}`;
        }
        return row;
      });

      return processedRows;
    } catch (error) {
      console.error("Error getting conversation messages:", error);
      throw error;
    }
  }

  // Get conversation details
  async getConversationDetails(conversationId) {
    try {
      const result = await pool.query(
        `SELECT 
          c.id,
          c.business_id,
          c.phone_number,
          c.status,
          c.created_at,
          c.updated_at,
          b.name as business_name
         FROM conversations c
         JOIN businesses b ON c.business_id = b.id
         WHERE c.id = $1`,
        [conversationId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting conversation details:", error);
      throw error;
    }
  }

  // Get conversation history for a conversation
  async getConversationHistory(conversationId, limit = 10) {
    try {
      const result = await pool.query(
        `SELECT 
          id, message_id, from_number, to_number, message_type, 
          content, media_url, direction, status, created_at
        FROM messages 
        WHERE conversation_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2`,
        [conversationId, limit]
      );
      
      // Return messages in chronological order (oldest first)
      return result.rows.reverse();
    } catch (error) {
      console.error("Error getting conversation history:", error);
      throw error;
    }
  }

  // Delete a conversation and all associated data
  async deleteConversation(conversationId) {
    try {
      // First get the conversation details before deleting
      const conversation = await this.getConversationDetails(conversationId);

      if (!conversation) {
        return null;
      }

      // Delete the conversation (CASCADE will handle related records)
      await pool.query("DELETE FROM conversations WHERE id = $1", [conversationId]);

      return conversation;
    } catch (error) {
      console.error("Error deleting conversation:", error);
      throw error;
    }
  }

  /**
   * Clean up malformed embeddings in the database
   */
  async cleanupMalformedEmbeddings(businessId = null) {
    try {
      console.log('Cleaning up malformed embeddings...');
      
      let query = 'SELECT id, business_id, faq_id, embedding FROM faq_embeddings';
      let params = [];
      
      if (businessId) {
        query += ' WHERE business_id = $1';
        params = [businessId];
      }
      
      const result = await pool.query(query, params);
      
      for (const row of result.rows) {
        try {
          // Try to parse the embedding
          let embedding;
          if (typeof row.embedding === 'string') {
            embedding = JSON.parse(row.embedding);
          } else {
            embedding = row.embedding;
          }
          
          // Validate the embedding
          if (!Array.isArray(embedding) || embedding.length === 0) {
            console.log(`Deleting malformed embedding for FAQ ${row.faq_id} (business ${row.business_id})`);
            await pool.query(
              'DELETE FROM faq_embeddings WHERE id = $1',
              [row.id]
            );
          }
        } catch (error) {
          console.log(`Deleting malformed embedding for FAQ ${row.faq_id} (business ${row.business_id}): ${error.message}`);
          await pool.query(
            'DELETE FROM faq_embeddings WHERE id = $1',
            [row.id]
          );
        }
      }
      
      console.log('Malformed embeddings cleanup completed');
    } catch (error) {
      console.error('Error cleaning up malformed embeddings:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseService();
