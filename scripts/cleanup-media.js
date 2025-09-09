require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const pool = require('../config/database');

const cleanupMediaFiles = async () => {
  try {
    console.log('Starting media files cleanup...');

    // Get old media files (older than 30 days)
    const result = await pool.query(`
      SELECT mf.local_file_path, mf.created_at 
      FROM media_files mf 
      WHERE mf.created_at < NOW() - INTERVAL '30 days'
    `);

    console.log(`Found ${result.rows.length} old media files to clean up`);

    let deletedCount = 0;
    let errorCount = 0;

    for (const file of result.rows) {
      try {
        if (fs.existsSync(file.local_file_path)) {
          await fs.remove(file.local_file_path);
          console.log(`Deleted file: ${file.local_file_path}`);
          deletedCount++;
        }
      } catch (error) {
        console.error(`Error deleting file ${file.local_file_path}:`, error.message);
        errorCount++;
      }
    }

    // Delete database records for files that no longer exist
    const cleanupResult = await pool.query(`
      DELETE FROM media_files 
      WHERE created_at < NOW() - INTERVAL '30 days'
    `);

    console.log(`\nCleanup completed:`);
    console.log(`- Files deleted: ${deletedCount}`);
    console.log(`- Database records cleaned: ${cleanupResult.rowCount}`);
    console.log(`- Errors encountered: ${errorCount}`);

  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
};

const initCleanup = async () => {
  try {
    await cleanupMediaFiles();
    console.log('Media cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Media cleanup failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  initCleanup();
}

module.exports = { cleanupMediaFiles }; 