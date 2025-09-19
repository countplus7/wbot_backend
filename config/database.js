require('dotenv').config();
const { Pool } = require('pg');

const isDev = process.env.NODE_ENV !== 'production';

// Optimized PostgreSQL pool configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'whatsapp_bot',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  
  // Performance optimizations
  max: parseInt(process.env.DB_POOL_MAX) || 50, // Increased pool size for high concurrency
  min: parseInt(process.env.DB_POOL_MIN) || 5,  // Minimum connections to maintain
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000, // Faster timeout for better responsiveness
  acquireTimeoutMillis: 3000,    // Faster acquisition timeout
  
  // Connection optimizations
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false,
  
  // Query optimizations
  query_timeout: 30000,
  statement_timeout: 30000,
  
  // SSL configuration for production
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false,
  
  // Additional performance settings
  application_name: 'whatsapp_bot',
  
  // Connection string format (if needed)
  // connectionString: process.env.DATABASE_URL,
});

// Enhanced connection event handlers
pool.on('connect', (client) => {
  if (isDev) {
    console.log('New database connection established');
  }
  
  // Optimize connection settings for performance
  const optimizationQueries = [
    'SET statement_timeout = 30000',
    'SET idle_in_transaction_session_timeout = 60000',
    'SET tcp_keepalives_idle = 600',
    'SET tcp_keepalives_interval = 30',
    'SET tcp_keepalives_count = 3',
  ];
  
  // Execute optimization queries
  optimizationQueries.forEach(query => {
    client.query(query).catch(err => {
      if (isDev) {
        console.warn(`Failed to set optimization: ${query}`, err.message);
      }
    });
  });
});

pool.on('acquire', (client) => {
  if (isDev) {
    console.log('Connection acquired from pool');
  }
});

pool.on('release', (client) => {
  if (isDev) {
    console.log('Connection released back to pool');
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client:', err.message);
  
  // In production, attempt to recreate the pool if needed
  if (!isDev && err.code === 'ECONNRESET') {
    console.log('Attempting to reconnect to database...');
    // The pool will automatically attempt to reconnect
  }
});

pool.on('remove', (client) => {
  if (isDev) {
    console.log('Connection removed from pool');
  }
});

// Health check function
pool.healthCheck = async () => {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW() as time, version() as version');
    const duration = Date.now() - start;
    
    return {
      healthy: true,
      responseTime: duration,
      connections: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
      serverInfo: result.rows[0],
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      connections: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  }
};

// Enhanced graceful shutdown
const gracefulShutdown = async () => {
  console.log('Closing database pool...');
  
  try {
    await pool.end();
    console.log('Database pool closed successfully');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
  }
  
  process.exit(0);
};

// Handle process termination gracefully
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Monitor pool performance in development
if (isDev) {
  setInterval(() => {
    const stats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
    
    if (stats.waiting > 5) {
      console.warn('High database connection wait queue:', stats);
    }
  }, 30000); // Check every 30 seconds
}

// Export pool instance
module.exports = pool; 