const pool = require("../config/database");

const dropAllTables = async () => {
  try {
    console.log("Dropping all existing tables...");

    // Drop tables in reverse order of dependencies
    const tables = [
      "media_files",
      "messages",
      "conversations",
      "business_tones",
      "whatsapp_configs",
      "google_workspace_integrations",
      "hubspot_integrations",
      "odoo_integrations",
      "airtable_integrations",
      "businesses",
      "users",
    ];

    for (const table of tables) {
      await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`Dropped table: ${table}`);
    }

    console.log("All tables dropped successfully");
  } catch (error) {
    console.error("Error dropping tables:", error);
    throw error;
  }
};

const createTables = async () => {
  try {
    console.log("Creating database tables...");

    // Check if businesses table exists
    const businessesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'businesses'
      );
    `);

    if (!businessesExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE businesses (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("Created table: businesses");
    } else {
      console.log("Businesses table already exists");
    }

    // Check if whatsapp_configs table exists
    const whatsappConfigsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'whatsapp_configs'
      );
    `);

    if (!whatsappConfigsExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE whatsapp_configs (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          phone_number_id VARCHAR(100) NOT NULL,
          access_token TEXT NOT NULL,
          verify_token VARCHAR(255),
          webhook_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id, phone_number_id)
        )
      `);
      console.log("Created table: whatsapp_configs");
    } else {
      console.log("WhatsApp configs table already exists");
    }

    // Check if business_tones table exists
    const businessTonesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'business_tones'
      );
    `);

    if (!businessTonesExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE business_tones (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          tone_instructions TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        )
      `);
      console.log("Created table: business_tones");
    } else {
      console.log("Business tones table already exists");
    }

    // Check if conversations table exists
    const conversationsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'conversations'
      );
    `);

    if (!conversationsExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE conversations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          phone_number VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        )
      `);
      console.log("Created table: conversations");
    } else {
      console.log("Conversations table already exists");
    }

    // Check if messages table exists
    const messagesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'messages'
      );
    `);

    if (!messagesExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE messages (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          conversation_id INTEGER NOT NULL,
          message_id VARCHAR(255) UNIQUE,
          from_number VARCHAR(20) NOT NULL,
          to_number VARCHAR(20) NOT NULL,
          message_type VARCHAR(20) NOT NULL,
          content TEXT,
          media_url VARCHAR(500),
          media_type VARCHAR(50),
          local_file_path VARCHAR(500),
          direction VARCHAR(10) NOT NULL,
          status VARCHAR(20) DEFAULT 'received',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `);
      console.log("Created table: messages");
    } else {
      console.log("Messages table already exists");
    }

    // Check if media_files table exists
    const mediaFilesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'media_files'
      );
    `);

    if (!mediaFilesExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE media_files (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          message_id INTEGER,
          file_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          file_type VARCHAR(50),
          file_size INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        )
      `);
      console.log("Created table: media_files");
    } else {
      console.log("Media files table already exists");
    }

    // Check if google_workspace_integrations table exists
    const googleWorkspaceExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'google_workspace_integrations'
      );
    `);

    if (!googleWorkspaceExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE google_workspace_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          token_expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id)
        )
      `);
      console.log("Created table: google_workspace_integrations");
    } else {
      console.log("Google workspace integrations table already exists");
    }

    // Check if hubspot_integrations table exists
    const hubspotExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'hubspot_integrations'
      );
    `);

    if (!hubspotExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE hubspot_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          token_expires_at TIMESTAMP,
          user_id VARCHAR(255),
          email VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id)
        )
      `);
      console.log("Created table: hubspot_integrations");
    } else {
      console.log("HubSpot integrations table already exists");
    }

    // Check if odoo_integrations table exists
    const odooExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'odoo_integrations'
      );
    `);

    if (!odooExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE odoo_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          url VARCHAR(255) NOT NULL,
          database VARCHAR(100) NOT NULL,
          username VARCHAR(100) NOT NULL,
          password TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id)
        )
      `);
      console.log("Created table: odoo_integrations");
    } else {
      console.log("Odoo integrations table already exists");
    }

    // Check if airtable_integrations table exists
    const airtableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'airtable_integrations'
      );
    `);

    if (!airtableExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE airtable_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          access_token TEXT NOT NULL,
          base_id VARCHAR(255) NOT NULL,
          table_name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id)
        )
      `);
      console.log("Created table: airtable_integrations");
    } else {
      console.log("Airtable integrations table already exists");
    }

    // Check if faq_embeddings table exists
    const faqEmbeddingsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'faq_embeddings'
      );
    `);

    if (!faqEmbeddingsExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE faq_embeddings (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          faq_id VARCHAR(255) NOT NULL,
          question TEXT NOT NULL,
          answer TEXT,
          embedding JSONB NOT NULL,
          source VARCHAR(50) DEFAULT 'airtable',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id, faq_id)
        )
      `);
      console.log("Created table: faq_embeddings");
    } else {
      console.log("FAQ embeddings table already exists");
    }

    // Check if conversation_embeddings table exists
    const conversationEmbeddingsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'conversation_embeddings'
      );
    `);

    if (!conversationEmbeddingsExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE conversation_embeddings (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          conversation_id VARCHAR(255) NOT NULL,
          message_id VARCHAR(255) NOT NULL,
          message_content TEXT NOT NULL,
          embedding JSONB NOT NULL,
          message_type VARCHAR(50) DEFAULT 'text',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        )
      `);
      console.log("Created table: conversation_embeddings");
    } else {
      console.log("Conversation embeddings table already exists");
    }

    console.log("✅ All tables created successfully!");
  } catch (error) {
    console.error("Error creating database tables:", error);
    throw error;
  }
};

const initDatabase = async () => {
  try {
    await dropAllTables();
    await createTables();
    console.log("Database initialization completed - all data cleared and tables recreated");
    process.exit(0);
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  initDatabase();
}

module.exports = { createTables, dropAllTables };
