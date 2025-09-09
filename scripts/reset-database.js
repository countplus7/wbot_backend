const pool = require('../config/database');

const resetDatabase = async () => {
  try {
    console.log('Resetting database - clearing all data...');
    
    // Truncate all tables in the correct order (respecting foreign key constraints)
    await pool.query('TRUNCATE TABLE media_files, messages, conversations, business_tones, whatsapp_configs, businesses RESTART IDENTITY CASCADE;');
    
    console.log('Database reset completed - all tables are now empty');
    process.exit(0);
  } catch (error) {
    console.error('Database reset failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  resetDatabase();
}

module.exports = { resetDatabase };
