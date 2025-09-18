const pool = require("../config/database");

const migrateDatabase = async () => {
  try {
    console.log("Starting database migration for multi-tenant support...");

    // Check if users table exists
    const usersExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'users'
          );
        `);

    if (!usersExists.rows[0].exists) {
      console.log("Creating users table...");
      await pool.query(`
            CREATE TABLE users (
              id SERIAL PRIMARY KEY,
              username VARCHAR(100) UNIQUE NOT NULL,
              email VARCHAR(255) UNIQUE NOT NULL,
              password_hash VARCHAR(255) NOT NULL,
              role VARCHAR(20) DEFAULT 'admin',
              status VARCHAR(20) DEFAULT 'active',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
      console.log("Users table created successfully");
    } else {
      console.log("Users table already exists");
    }

    // Check if businesses table exists
    const businessesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'businesses'
      );
    `);

    if (!businessesExists.rows[0].exists) {
      console.log("Creating businesses table...");
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
    } else {
    }

    // Check if hubspot_integrations table exists
    const hubspotIntegrationsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'hubspot_integrations'
      );
    `);

    if (!hubspotIntegrationsExists.rows[0].exists) {
      console.log("Creating hubspot_integrations table...");
      await pool.query(`
        CREATE TABLE hubspot_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          client_id VARCHAR(255) NOT NULL,
          client_secret TEXT NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          redirect_uri VARCHAR(500),
          token_expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id)
        )
      `);
      console.log("HubSpot integrations table created successfully");
    } else {
      console.log("HubSpot integrations table already exists");
    }

    // Check if whatsapp_configs table exists
    const configsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'whatsapp_configs'
      );
    `);

    if (!configsExists.rows[0].exists) {
      console.log("Creating whatsapp_configs table...");
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
    } else {
      console.log("WhatsApp configs table already exists");
    }

    // Check if business_tones table exists
    const tonesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'business_tones'
      );
    `);

    if (!tonesExists.rows[0].exists) {
      console.log("Creating business_tones table...");
      await pool.query(`
        CREATE TABLE business_tones (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          tone_instructions TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        )
      `);
    } else {
      console.log("Business tones table already exists");
    }

    // Check if google_workspace_integrations table exists
    const googleIntegrationsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'google_workspace_integrations'
      );
    `);

    if (!googleIntegrationsExists.rows[0].exists) {
      console.log("Creating google_workspace_integrations table...");
      await pool.query(`
        CREATE TABLE google_workspace_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          provider VARCHAR(20) NOT NULL DEFAULT 'google',
          email VARCHAR(255) NOT NULL,
          refresh_token TEXT NOT NULL,
          access_token TEXT,
          expiry_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id, provider, email)
        )
      `);
    } else {
      console.log("Google Workspace integrations table already exists");
    }

    // Check if odoo_integrations table exists
    const odooIntegrationsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'odoo_integrations'
      );
    `);

    if (!odooIntegrationsExists.rows[0].exists) {
      console.log("Creating odoo_integrations table...");
      await pool.query(`
        CREATE TABLE odoo_integrations (
          id SERIAL PRIMARY KEY,
          business_id INTEGER NOT NULL,
          instance_url VARCHAR(500) NOT NULL,
          db VARCHAR(100) NOT NULL,
          username VARCHAR(255) NOT NULL,
          api_key TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
          UNIQUE(business_id)
        )
      `);
      console.log("Odoo integrations table created successfully");
    } else {
      console.log("Odoo integrations table already exists");
    }

    // Check if airtable_integrations table exists
    const airtableIntegrationsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'airtable_integrations'
      );
    `);

    if (!airtableIntegrationsExists.rows[0].exists) {
      console.log("Creating airtable_integrations table...");
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
      console.log("Created airtable_integrations table");
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
      console.log("Creating faq_embeddings table...");
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
      console.log("Created faq_embeddings table");
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
      console.log("Creating conversation_embeddings table...");
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
      console.log("Created conversation_embeddings table");
    } else {
      console.log("Conversation embeddings table already exists");
    }

    // Check if conversations table has business_id column
    const conversationsExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'conversations'
      );
    `);

    if (conversationsExists.rows[0].exists) {
      const hasBusinessId = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'conversations' AND column_name = 'business_id'
        );
      `);

      if (!hasBusinessId.rows[0].exists) {
        console.log("Adding business_id column to conversations table...");
        await pool.query(`
          ALTER TABLE conversations 
          ADD COLUMN business_id INTEGER,
          ADD COLUMN temp_id SERIAL
        `);

        // Create a default business if none exists
        const defaultBusiness = await pool.query(`
          INSERT INTO businesses (name, description) 
          VALUES ('Default Business', 'Default business for existing conversations') 
          RETURNING id
        `);

        // Update existing conversations with default business
        await pool.query(
          `
          UPDATE conversations 
          SET business_id = $1 
          WHERE business_id IS NULL
        `,
          [defaultBusiness.rows[0].id]
        );

        // Make business_id NOT NULL and add foreign key
        await pool.query(`
          ALTER TABLE conversations 
          ALTER COLUMN business_id SET NOT NULL,
          ADD CONSTRAINT fk_conversations_business 
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        `);

        // Remove temporary column
        await pool.query(`
          ALTER TABLE conversations DROP COLUMN temp_id
        `);

        console.log("Updated conversations table with business_id");
      } else {
        console.log("Conversations table already has business_id column");
      }
    } else {
      console.log("Conversations table does not exist, will be created by init-database.js");
    }

    // Check if messages table has business_id column
    const messagesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'messages'
      );
    `);

    if (messagesExists.rows[0].exists) {
      const hasBusinessId = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'messages' AND column_name = 'business_id'
        );
      `);

      if (!hasBusinessId.rows[0].exists) {
        console.log("Adding business_id column to messages table...");
        await pool.query(`
          ALTER TABLE messages 
          ADD COLUMN business_id INTEGER,
          ADD COLUMN temp_id SERIAL
        `);

        // Get default business ID
        const defaultBusiness = await pool.query(`
          SELECT id FROM businesses LIMIT 1
        `);

        if (defaultBusiness.rows.length > 0) {
          // Update existing messages with default business
          await pool.query(
            `
            UPDATE messages 
            SET business_id = $1 
            WHERE business_id IS NULL
          `,
            [defaultBusiness.rows[0].id]
          );

          // Make business_id NOT NULL and add foreign key
          await pool.query(`
            ALTER TABLE messages 
            ALTER COLUMN business_id SET NOT NULL,
            ADD CONSTRAINT fk_messages_business 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
          `);
        }

        // Remove temporary column
        await pool.query(`
          ALTER TABLE messages DROP COLUMN temp_id
        `);

        console.log("Updated messages table with business_id");
      } else {
        console.log("Messages table already has business_id column");
      }

      // Check if local_file_path column exists
      const hasLocalFilePath = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'messages' AND column_name = 'local_file_path'
        );
      `);

      if (!hasLocalFilePath.rows[0].exists) {
        console.log("Adding local_file_path column to messages table...");
        await pool.query(`
          ALTER TABLE messages 
          ADD COLUMN local_file_path VARCHAR(500)
        `);
        console.log("Added local_file_path column to messages table");
      } else {
        console.log("Messages table already has local_file_path column");
      }
    } else {
      console.log("Messages table does not exist, will be created by init-database.js");
    }

    // Check if media_files table has business_id column
    const mediaFilesExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'media_files'
      );
    `);

    if (mediaFilesExists.rows[0].exists) {
      const hasBusinessId = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'media_files' AND column_name = 'business_id'
        );
      `);

      if (!hasBusinessId.rows[0].exists) {
        console.log("Adding business_id column to media_files table...");
        await pool.query(`
          ALTER TABLE media_files 
          ADD COLUMN business_id INTEGER,
          ADD COLUMN temp_id SERIAL
        `);

        // Get default business ID
        const defaultBusiness = await pool.query(`
          SELECT id FROM businesses LIMIT 1
        `);

        if (defaultBusiness.rows.length > 0) {
          // Update existing media files with default business
          await pool.query(
            `
            UPDATE media_files 
            SET business_id = $1 
            WHERE business_id IS NULL
          `,
            [defaultBusiness.rows[0].id]
          );

          // Make business_id NOT NULL and add foreign key
          await pool.query(`
            ALTER TABLE media_files 
            ALTER COLUMN business_id SET NOT NULL,
            ADD CONSTRAINT fk_media_files_business 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
          `);
        }

        // Remove temporary column
        await pool.query(`
          ALTER TABLE media_files DROP COLUMN temp_id
        `);

        console.log("Updated media_files table with business_id");
      } else {
        console.log("Media files table already has business_id column");
      }
    } else {
      console.log("Media files table does not exist, will be created by init-database.js");
    }

    // Create indexes
    console.log("Creating indexes...");
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_businesses_status 
      ON businesses(status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_business_id 
      ON whatsapp_configs(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_business_tones_business_id 
      ON business_tones(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_business_id 
      ON conversations(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_business_id 
      ON messages(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_media_files_business_id 
      ON media_files(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_google_workspace_integrations_business_id 
      ON google_workspace_integrations(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_hubspot_integrations_business_id
      ON hubspot_integrations(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_odoo_integrations_business_id 
      ON odoo_integrations(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_airtable_integrations_business_id 
      ON airtable_integrations(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_faq_embeddings_business_id 
      ON faq_embeddings(business_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_business_id 
      ON conversation_embeddings(business_id)
    `);

    // Remove problematic indexes that reference non-existent columns
    // await pool.query(`
    //   CREATE INDEX IF NOT EXISTS idx_users_email
    //   ON users(email)
    // `);

    // await pool.query(`
    //   CREATE INDEX IF NOT EXISTS idx_google_workspace_integrations_email
    //   ON google_workspace_integrations(email)
    // `);

    // await pool.query(`
    //   CREATE INDEX IF NOT EXISTS idx_salesforce_integrations_email
    //   ON salesforce_integrations(email)
    // `);

    console.log("✅ Database migration completed successfully!");
    console.log("\nYou can now run: npm run init-db");
  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  }
};

const runMigration = async () => {
  try {
    await migrateDatabase();
    console.log("Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrateDatabase };
