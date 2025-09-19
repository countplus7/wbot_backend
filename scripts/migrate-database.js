const pool = require("../config/database");

// Performance monitoring
const startTime = Date.now();
let tablesCreated = 0;
let columnsAdded = 0;
let indexesCreated = 0;

// Enhanced error handling with retry logic
const executeWithRetry = async (query, params = [], retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(query, params);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`Retry ${i + 1}/${retries} for query: ${query.substring(0, 50)}...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// Check if table exists
const tableExists = async (tableName) => {
  const result = await executeWithRetry(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = $1
    );
  `,
    [tableName]
  );
  return result.rows[0].exists;
};

// Check if column exists
const columnExists = async (tableName, columnName) => {
  const result = await executeWithRetry(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    );
  `,
    [tableName, columnName]
  );
  return result.rows[0].exists;
};

// Create table if it doesn't exist
const createTableIfNotExists = async (tableName, query) => {
  const exists = await tableExists(tableName);
  if (!exists) {
    await executeWithRetry(query);
    console.log(`✅ Created table: ${tableName}`);
    tablesCreated++;
    return true;
  } else {
    console.log(`ℹ️  Table ${tableName} already exists`);
    return false;
  }
};

// Add column if it doesn't exist
const addColumnIfNotExists = async (tableName, columnName, columnDefinition) => {
  const exists = await columnExists(tableName, columnName);
  if (!exists) {
    await executeWithRetry(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
    console.log(`✅ Added column ${columnName} to ${tableName}`);
    columnsAdded++;
    return true;
  } else {
    console.log(`ℹ️  Column ${columnName} already exists in ${tableName}`);
    return false;
  }
};

// Optimized database migration
const migrateDatabase = async () => {
  try {
    console.log("🚀 Starting optimized database migration...");
    const migrationStartTime = Date.now();

    // ===== CORE TABLES =====
    console.log("\n📋 Creating core tables...");

    await createTableIfNotExists(
      "users",
      `
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
    `
    );

    await createTableIfNotExists(
      "businesses",
      `
      CREATE TABLE businesses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    );

    // ===== INTEGRATION TABLES =====
    console.log("\n Creating integration tables...");

    await createTableIfNotExists(
      "hubspot_integrations",
      `
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
    `
    );

    await createTableIfNotExists(
      "whatsapp_configs",
      `
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
    `
    );

    await createTableIfNotExists(
      "business_tones",
      `
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
    `
    );

    await createTableIfNotExists(
      "google_workspace_integrations",
      `
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
    `
    );

    await createTableIfNotExists(
      "odoo_integrations",
      `
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
    `
    );

    await createTableIfNotExists(
      "airtable_integrations",
      `
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
    `
    );

    // ===== EMBEDDING TABLES =====
    console.log("\n Creating embedding tables...");

    await createTableIfNotExists(
      "faq_embeddings",
      `
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
    `
    );

    await createTableIfNotExists(
      "conversation_embeddings",
      `
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
    `
    );

    // ===== INTENT DETECTION TABLES =====
    console.log("\n Creating intent detection tables...");

    await createTableIfNotExists(
      "intents",
      `
      CREATE TABLE intents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        confidence_threshold DECIMAL(3,2) DEFAULT 0.75,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    );

    await createTableIfNotExists(
      "intent_examples",
      `
      CREATE TABLE intent_examples (
        id SERIAL PRIMARY KEY,
        intent_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding JSONB,
        weight DECIMAL(3,2) DEFAULT 1.0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE CASCADE
      )
    `
    );

    await createTableIfNotExists(
      "intent_cache",
      `
      CREATE TABLE intent_cache (
        id SERIAL PRIMARY KEY,
        message_hash VARCHAR(64) NOT NULL UNIQUE,
        message_text TEXT NOT NULL,
        detected_intent VARCHAR(100),
        confidence DECIMAL(5,4),
        method VARCHAR(20) DEFAULT 'embedding',
        embedding JSONB,
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    );

    // ===== TABLE MIGRATIONS =====
    console.log("\n🔄 Migrating existing tables...");

    // Migrate conversations table
    if (await tableExists("conversations")) {
      const hasBusinessId = await columnExists("conversations", "business_id");
      if (!hasBusinessId) {
        console.log("📝 Adding business_id to conversations table...");

        await executeWithRetry(`
          ALTER TABLE conversations 
          ADD COLUMN business_id INTEGER,
          ADD COLUMN temp_id SERIAL
        `);

        // Create default business if none exists
        const defaultBusiness = await executeWithRetry(`
          INSERT INTO businesses (name, description) 
          VALUES ('Default Business', 'Default business for existing conversations') 
          RETURNING id
        `);

        // Update existing conversations with default business
        await executeWithRetry(
          `
          UPDATE conversations 
          SET business_id = $1 
          WHERE business_id IS NULL
        `,
          [defaultBusiness.rows[0].id]
        );

        // Make business_id NOT NULL and add foreign key
        await executeWithRetry(`
          ALTER TABLE conversations 
          ALTER COLUMN business_id SET NOT NULL,
          ADD CONSTRAINT fk_conversations_business 
          FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
        `);

        // Remove temporary column
        await executeWithRetry(`ALTER TABLE conversations DROP COLUMN temp_id`);

        console.log("✅ Updated conversations table with business_id");
        columnsAdded++;
      }
    }

    // Migrate messages table
    if (await tableExists("messages")) {
      const hasBusinessId = await columnExists("messages", "business_id");
      if (!hasBusinessId) {
        console.log("📝 Adding business_id to messages table...");

        await executeWithRetry(`
          ALTER TABLE messages 
          ADD COLUMN business_id INTEGER,
          ADD COLUMN temp_id SERIAL
        `);

        // Get default business ID
        const defaultBusiness = await executeWithRetry(`SELECT id FROM businesses LIMIT 1`);

        if (defaultBusiness.rows.length > 0) {
          // Update existing messages with default business
          await executeWithRetry(
            `
            UPDATE messages 
            SET business_id = $1 
            WHERE business_id IS NULL
          `,
            [defaultBusiness.rows[0].id]
          );

          // Make business_id NOT NULL and add foreign key
          await executeWithRetry(`
            ALTER TABLE messages 
            ALTER COLUMN business_id SET NOT NULL,
            ADD CONSTRAINT fk_messages_business 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
          `);
        }

        // Remove temporary column
        await executeWithRetry(`ALTER TABLE messages DROP COLUMN temp_id`);

        console.log("✅ Updated messages table with business_id");
        columnsAdded++;
      }

      // Add local_file_path column if it doesn't exist
      await addColumnIfNotExists("messages", "local_file_path", "VARCHAR(500)");
    }

    // Migrate media_files table
    if (await tableExists("media_files")) {
      const hasBusinessId = await columnExists("media_files", "business_id");
      if (!hasBusinessId) {
        console.log("📝 Adding business_id to media_files table...");

        await executeWithRetry(`
          ALTER TABLE media_files 
          ADD COLUMN business_id INTEGER,
          ADD COLUMN temp_id SERIAL
        `);

        // Get default business ID
        const defaultBusiness = await executeWithRetry(`SELECT id FROM businesses LIMIT 1`);

        if (defaultBusiness.rows.length > 0) {
          // Update existing media files with default business
          await executeWithRetry(
            `
            UPDATE media_files 
            SET business_id = $1 
            WHERE business_id IS NULL
          `,
            [defaultBusiness.rows[0].id]
          );

          // Make business_id NOT NULL and add foreign key
          await executeWithRetry(`
            ALTER TABLE media_files 
            ALTER COLUMN business_id SET NOT NULL,
            ADD CONSTRAINT fk_media_files_business 
            FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
          `);
        }

        // Remove temporary column
        await executeWithRetry(`ALTER TABLE media_files DROP COLUMN temp_id`);

        console.log("✅ Updated media_files table with business_id");
        columnsAdded++;
      }
    }

    // ===== INDEX CREATION =====
    console.log("\n🔍 Creating performance indexes...");
    const indexStartTime = Date.now();

    const indexGroups = [
      {
        name: "Intent Detection Indexes",
        queries: [
          "CREATE INDEX IF NOT EXISTS idx_intent_examples_intent_id ON intent_examples(intent_id)",
          "CREATE INDEX IF NOT EXISTS idx_intent_examples_active ON intent_examples(active)",
          "CREATE INDEX IF NOT EXISTS idx_intent_cache_expires ON intent_cache(expires_at)",
          "CREATE INDEX IF NOT EXISTS idx_intent_cache_hash ON intent_cache(message_hash)",
        ],
      },
      {
        name: "Business Indexes",
        queries: [
          "CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status)",
          "CREATE INDEX IF NOT EXISTS idx_whatsapp_configs_business_id ON whatsapp_configs(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_business_tones_business_id ON business_tones(business_id)",
        ],
      },
      {
        name: "Conversation Indexes",
        queries: [
          "CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON conversations(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_conversations_phone_number ON conversations(phone_number)",
          "CREATE INDEX IF NOT EXISTS idx_messages_business_id ON messages(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)",
          "CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id)",
          "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)",
        ],
      },
      {
        name: "Integration Indexes",
        queries: [
          "CREATE INDEX IF NOT EXISTS idx_google_workspace_integrations_business_id ON google_workspace_integrations(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_hubspot_integrations_business_id ON hubspot_integrations(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_odoo_integrations_business_id ON odoo_integrations(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_airtable_integrations_business_id ON airtable_integrations(business_id)",
        ],
      },
      {
        name: "Embedding Indexes",
        queries: [
          "CREATE INDEX IF NOT EXISTS idx_faq_embeddings_business_id ON faq_embeddings(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_faq_embeddings_source ON faq_embeddings(source)",
          "CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_business_id ON conversation_embeddings(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_conversation_embeddings_conversation_id ON conversation_embeddings(conversation_id)",
        ],
      },
      {
        name: "Media Indexes",
        queries: [
          "CREATE INDEX IF NOT EXISTS idx_media_files_business_id ON media_files(business_id)",
          "CREATE INDEX IF NOT EXISTS idx_media_files_message_id ON media_files(message_id)",
          "CREATE INDEX IF NOT EXISTS idx_media_files_file_type ON media_files(file_type)",
        ],
      },
    ];

    // Create indexes in parallel within each group
    for (const group of indexGroups) {
      console.log(`📊 Creating ${group.name}...`);
      const groupPromises = group.queries.map(async (query) => {
        try {
          await executeWithRetry(query);
          indexesCreated++;
        } catch (error) {
          console.warn(`⚠️  Warning: Could not create index: ${query.substring(0, 50)}...`);
        }
      });

      await Promise.all(groupPromises);
    }

    const indexTime = Date.now() - indexStartTime;
    const totalTime = Date.now() - migrationStartTime;

    console.log("\n🎉 Database migration completed successfully!");
    console.log(` Performance Summary:`);
    console.log(`   • Tables created: ${tablesCreated}`);
    console.log(`   • Columns added: ${columnsAdded}`);
    console.log(`   • Indexes created: ${indexesCreated}`);
    console.log(`   • Total time: ${totalTime}ms`);
    console.log(`   • Index creation time: ${indexTime}ms`);
    console.log("\n✅ You can now run: npm run init-db");
  } catch (error) {
    console.error("❌ Error during migration:", error);
    throw error;
  }
};

// Main migration function
const runMigration = async () => {
  try {
    await migrateDatabase();
    console.log("✅ Migration completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrateDatabase };
