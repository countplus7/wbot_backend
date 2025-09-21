const pool = require("../config/database");

// Performance monitoring
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

// Check if database has any tables
const isDatabaseEmpty = async () => {
  try {
    const result = await executeWithRetry(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    return parseInt(result.rows[0].table_count) === 0;
  } catch (error) {
    console.warn("Could not check database status, assuming empty");
    return true;
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

// Drop all tables (for init mode)
const dropAllTables = async () => {
  console.log("🗑️  Dropping all existing tables...");
  const dropStartTime = Date.now();

  const tables = [
    "intent_cache",
    "intent_examples",
    "intents",
    "conversation_embeddings",
    "faq_embeddings",
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

  const dropPromises = tables.map(async (table) => {
    try {
      await executeWithRetry(`DROP TABLE IF EXISTS ${table} CASCADE`);
      console.log(`✅ Dropped table: ${table}`);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not drop table ${table}:`, error.message);
    }
  });

  await Promise.all(dropPromises);
  const dropTime = Date.now() - dropStartTime;
  console.log(`✅ All tables dropped successfully in ${dropTime}ms`);
};

// Complete table definitions
const getTableDefinitions = () => [
  {
    name: "users",
    query: `CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'admin',
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "businesses",
    query: `CREATE TABLE businesses (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "whatsapp_configs",
    query: `CREATE TABLE whatsapp_configs (
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
    )`,
  },
  {
    name: "business_tones",
    query: `CREATE TABLE business_tones (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      tone_instructions TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )`,
  },
  {
    name: "conversations",
    query: `CREATE TABLE conversations (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )`,
  },
  {
    name: "messages",
    query: `CREATE TABLE messages (
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
    )`,
  },
  {
    name: "media_files",
    query: `CREATE TABLE media_files (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      message_id INTEGER,
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_type VARCHAR(50),
      file_size INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )`,
  },
  {
    name: "google_workspace_integrations",
    query: `CREATE TABLE google_workspace_integrations (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      UNIQUE(business_id)
    )`,
  },
  {
    name: "hubspot_integrations",
    query: `CREATE TABLE hubspot_integrations (
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
    )`,
  },
  {
    name: "odoo_integrations",
    query: `CREATE TABLE odoo_integrations (
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
    )`,
  },
  {
    name: "airtable_integrations",
    query: `CREATE TABLE airtable_integrations (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      access_token TEXT NOT NULL,
      base_id VARCHAR(255) NOT NULL,
      table_name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      UNIQUE(business_id)
    )`,
  },
  {
    name: "faq_embeddings",
    query: `CREATE TABLE faq_embeddings (
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
    )`,
  },
  {
    name: "conversation_embeddings",
    query: `CREATE TABLE conversation_embeddings (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL,
      conversation_id VARCHAR(255) NOT NULL,
      message_id VARCHAR(255) NOT NULL,
      message_content TEXT NOT NULL,
      embedding JSONB NOT NULL,
      message_type VARCHAR(50) DEFAULT 'text',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
    )`,
  },
  {
    name: "intents",
    query: `CREATE TABLE intents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      confidence_threshold DECIMAL(3,2) DEFAULT 0.75,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: "intent_examples",
    query: `CREATE TABLE intent_examples (
      id SERIAL PRIMARY KEY,
      intent_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding JSONB,
      weight DECIMAL(3,2) DEFAULT 1.0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (intent_id) REFERENCES intents(id) ON DELETE CASCADE
    )`,
  },
  {
    name: "intent_cache",
    query: `CREATE TABLE intent_cache (
      id SERIAL PRIMARY KEY,
      message_hash VARCHAR(64) NOT NULL UNIQUE,
      message_text TEXT NOT NULL,
      detected_intent VARCHAR(100),
      confidence DECIMAL(5,4),
      method VARCHAR(20) DEFAULT 'embedding',
      embedding JSONB,
      expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '24 hours'),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

// Create table if it doesn't exist (for migrate mode)
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

// Create all tables
const createTables = async (isInitMode) => {
  console.log("📋 Creating database tables...");
  const createStartTime = Date.now();

  const tableDefinitions = getTableDefinitions();

  for (const table of tableDefinitions) {
    try {
      if (isInitMode) {
        // Init mode: create tables directly
        await executeWithRetry(table.query);
        console.log(`✅ Created table: ${table.name}`);
        tablesCreated++;
      } else {
        // Migrate mode: create only if not exists
        await createTableIfNotExists(table.name, table.query);
      }
    } catch (error) {
      console.error(`❌ Error creating table ${table.name}:`, error.message);
      throw error;
    }
  }

  const createTime = Date.now() - createStartTime;
  console.log(`✅ All ${tablesCreated} tables processed successfully in ${createTime}ms`);
};

// Handle migrations for existing tables
const handleMigrations = async () => {
  console.log("🔄 Running database migrations...");

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
      await executeWithRetry(`UPDATE conversations SET business_id = $1 WHERE business_id IS NULL`, [
        defaultBusiness.rows[0].id,
      ]);

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
        await executeWithRetry(`UPDATE messages SET business_id = $1 WHERE business_id IS NULL`, [
          defaultBusiness.rows[0].id,
        ]);

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
        await executeWithRetry(`UPDATE media_files SET business_id = $1 WHERE business_id IS NULL`, [
          defaultBusiness.rows[0].id,
        ]);

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

  console.log("✅ Migrations completed");
};

// Create indexes (identical for both modes)
const createIndexes = async () => {
  console.log("🔍 Creating performance indexes...");
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
    console.log(`📋 Creating ${group.name}...`);
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
  console.log(`✅ All ${indexesCreated} indexes created successfully in ${indexTime}ms`);
};

// Main database setup function
const setupDatabase = async (mode = "auto") => {
  try {
    const totalStartTime = Date.now();

    // Determine mode
    let isInitMode;
    if (mode === "auto") {
      isInitMode = await isDatabaseEmpty();
      console.log(`🔍 Detected ${isInitMode ? "empty" : "existing"} database`);
    } else {
      isInitMode = mode === "init";
    }

    if (isInitMode) {
      console.log("🚀 Running in INIT mode - will delete all existing data!");
      console.log("⚠️  WARNING: This will completely delete all existing data!");
      await dropAllTables();
    } else {
      console.log("🔄 Running in MIGRATE mode - preserving existing data");
    }

    await createTables(isInitMode);

    if (!isInitMode) {
      await handleMigrations();
    }

    await createIndexes();

    const totalTime = Date.now() - totalStartTime;
    console.log(`\n🎉 Database setup completed successfully!`);
    console.log(`📊 Performance Summary:`);
    console.log(`   • Mode: ${isInitMode ? "INIT" : "MIGRATE"}`);
    console.log(`   • Tables created: ${tablesCreated}`);
    console.log(`   • Columns added: ${columnsAdded}`);
    console.log(`   • Indexes created: ${indexesCreated}`);
    console.log(`   • Total time: ${totalTime}ms`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    process.exit(1);
  }
};

// Command line interface
if (require.main === module) {
  const mode = process.argv[2] || "init";
  setupDatabase(mode);
}

module.exports = { setupDatabase, createTables, dropAllTables, createIndexes };
