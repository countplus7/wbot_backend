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
      "salesforce_integrations",
      "odoo_integrations", // Add this line
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
    console.log("Creating fresh database tables...");

    // Create users table for admin authentication
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
    console.log("Created table: users");

    // Create businesses table
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

    // Create WhatsApp configurations table
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

    // Create business tones table (one tone per business)
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

    // Create conversations table (updated to include business_id)
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

    // Create messages table (updated to include business_id)
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
        direction VARCHAR(10) NOT NULL,
        status VARCHAR(20) DEFAULT 'received',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);
    console.log("Created table: messages");

    // Create media files table (updated to include business_id)
    await pool.query(`
      CREATE TABLE media_files (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL,
        message_id INTEGER,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_size INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      )
    `);
    console.log("Created table: media_files");

    // Create Google Workspace integrations table
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
    console.log("Created table: google_workspace_integrations");
    console.log("Created table: google_workspace_integrations");

    // Create Salesforce integrations table
    await pool.query(`
      CREATE TABLE salesforce_integrations (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL,
        provider VARCHAR(20) NOT NULL DEFAULT 'salesforce',
        instance_url VARCHAR(500) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        expiry_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
        UNIQUE(business_id, provider, user_id)
      )
    `);
    console.log("Created table: salesforce_integrations");

    // Create Odoo integrations table
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
    console.log("Created table: odoo_integrations");

    console.log("Database tables created successfully");

    console.log("Database tables created successfully");
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
