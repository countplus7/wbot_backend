require('dotenv').config();

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

// Environment-based configuration
const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT) || 5000,
    host: process.env.HOST || '0.0.0.0',
    keepAliveTimeout: 65000,
    headersTimeout: 66000,
    requestTimeout: 30000,
  },

  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'whatsapp_bot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    poolMax: parseInt(process.env.DB_POOL_MAX) || (isProd ? 50 : 20),
    poolMin: parseInt(process.env.DB_POOL_MIN) || (isProd ? 10 : 5),
    connectionTimeout: 3000,
    idleTimeout: 30000,
    ssl: isProd ? { rejectUnauthorized: false } : false,
  },

  // API Keys and external services
  api: {
    openai: process.env.OPENAI_API_KEY,
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
    },
    hubspot: {
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
    },
    odoo: {
      baseUrl: process.env.ODOO_BASE_URL,
      database: process.env.ODOO_DATABASE,
      username: process.env.ODOO_USERNAME,
      password: process.env.ODOO_PASSWORD,
    },
    airtable: {
      apiKey: process.env.AIRTABLE_API_KEY,
      baseId: process.env.AIRTABLE_BASE_ID,
    },
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || (isProd ? 12 : 8),
    rateLimits: {
      general: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: isProd ? 2000 : 5000, // requests per window
      },
      auth: {
        windowMs: 15 * 60 * 1000,
        max: isProd ? 100 : 200,
      },
      webhook: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: isProd ? 2000 : 5000,
      },
    },
  },

  // Performance configuration
  performance: {
    compression: {
      threshold: 512,
      level: isProd ? 6 : 4,
    },
    cache: {
      healthCheckTtl: 5000, // 5 seconds
      staticFileMaxAge: isProd ? '7d' : '1d',
    },
    timeouts: {
      request: 30000,
      database: 30000,
      external: 15000,
    },
    memory: {
      maxHeapSize: isProd ? 4096 : 2048, // MB
      gcThreshold: 500, // MB
    },
  },

  // Logging configuration
  logging: {
    level: isDev ? 'debug' : isProd ? 'warn' : 'info',
    slowRequestThreshold: isProd ? 5000 : 1000, // ms
    enableRequestLogging: isDev,
    enableErrorTracking: isProd,
  },

  // Feature flags
  features: {
    enableIntentDetection: true,
    enableEmbeddings: true,
    enableHealthCheck: true,
    enableMetrics: isProd,
    enableProfiling: isDev,
  },

  // File upload configuration
  uploads: {
    maxFileSize: '10mb',
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'audio/mpeg', 'audio/wav'],
    path: './uploads',
    tempPath: './uploads/temp',
  },

  // Environment flags
  env: {
    isDev,
    isTest,
    isProd,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

// Validation function
function validateConfig() {
  const required = [
    'api.openai',
    'api.whatsapp.accessToken',
    'api.whatsapp.verifyToken',
    'security.jwtSecret',
  ];

  const missing = required.filter(path => {
    const keys = path.split('.');
    let current = config;
    for (const key of keys) {
      if (!current[key]) return true;
      current = current[key];
    }
    return false;
  });

  if (missing.length > 0 && isProd) {
    console.error('Missing required configuration:', missing);
    process.exit(1);
  }

  if (missing.length > 0 && isDev) {
    console.warn('Missing configuration (development mode):', missing);
  }
}

// Initialize configuration
validateConfig();

module.exports = config; 