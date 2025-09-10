require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whatsapp_bot',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  acquireTimeoutMillis: 10000, // Add acquire timeout
  keepAlive: true, // Keep connections alive
  keepAliveInitialDelayMillis: 0, // Start keep-alive immediately
});

// Test the connection
pool.on('connect', (client) => {
  console.log('Connected to PostgreSQL database');
  // Set statement timeout for individual queries
  client.query('SET statement_timeout = 30000'); // 30 seconds
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Closing database pool...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Closing database pool...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});

module.exports = pool; 