require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const path = require("path");
const fs = require("fs-extra");

// Import middleware
const { errorHandler, notFoundHandler, createResponse } = require("./middleware/error-handler");

// Import routes
const authRoutes = require("./routes/auth");
const whatsappRoutes = require("./routes/whatsapp");
const businessRoutes = require("./routes/business");
const googleRoutes = require("./routes/google");

const app = express();
const PORT = process.env.PORT || 8000;

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// Create media directories for WhatsApp messages
const uploadsDir = path.join(__dirname, "uploads");
const imagesDir = path.join(uploadsDir, "images");
const audioDir = path.join(uploadsDir, "audio");

fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(imagesDir);
fs.ensureDirSync(audioDir);

// Compression middleware (should be early in the stack)
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 6, // Compression level (1-9, 6 is good balance)
}));

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for API server
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With",
    "X-Request-ID",
    "X-Client-Version"
  ],
  exposedHeaders: [
    "X-Total-Count",
    "X-Page-Count",
    "X-Current-Page",
    "X-Per-Page"
  ],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Enhanced rate limiting with different limits for different endpoints
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: createResponse(false, null, message, null, 'RATE_LIMIT_ERROR'),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json(createResponse(
      false,
      null,
      'Too many requests, please try again later',
      null,
      'RATE_LIMIT_ERROR'
    ));
  },
});

// General rate limiter
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again later'
);

// Auth rate limiter (stricter)
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // limit each IP to 10 auth requests per windowMs
  'Too many authentication attempts, please try again later'
);

// Webhook rate limiter (more lenient)
const webhookLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  1000, // allow up to 1000 webhook requests per minute
  'Too many webhook requests'
);

// Apply rate limiters
app.use('/api/auth', authLimiter);
app.use('/api/webhook', webhookLimiter);
app.use('/webhook', webhookLimiter);
app.use(generalLimiter); // Apply to all other routes

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
  });
  
  next();
});

// Body parsing middleware
app.use(express.json({ 
  limit: "10mb",
  verify: (req, res, buf) => {
    // Store raw body for webhook signature verification if needed
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static file serving for media files
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true,
}));

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Enhanced health check endpoint
app.get("/health", (req, res) => {
  const healthStatus = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
    directories: {
      uploads: fs.existsSync(uploadsDir),
      images: fs.existsSync(imagesDir),
      audio: fs.existsSync(audioDir),
    },
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0",
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  res.status(200).json(createResponse(true, healthStatus));
});

// Detailed health check endpoint
app.get("/health/detailed", async (req, res) => {
  const checks = {
    database: false,
    filesystem: false,
    memory: false,
    diskSpace: false,
  };

  try {
    // Check database connection (implement based on your database)
    // checks.database = await checkDatabaseConnection();
    checks.database = true; // Placeholder

    // Check filesystem
    checks.filesystem = fs.existsSync(uploadsDir) && 
                       fs.existsSync(imagesDir) && 
                       fs.existsSync(audioDir);

    // Check memory usage
    const memUsage = process.memoryUsage();
    checks.memory = (memUsage.heapUsed / memUsage.heapTotal) < 0.9; // Less than 90%

    // Check disk space (simplified)
    const stats = fs.statSync(__dirname);
    checks.diskSpace = stats.size > 0; // Placeholder check

    const allHealthy = Object.values(checks).every(check => check === true);
    const status = allHealthy ? 'healthy' : 'degraded';
    const httpStatus = allHealthy ? 200 : 503;

    res.status(httpStatus).json(createResponse(
      allHealthy,
      { status, checks, timestamp: new Date().toISOString() }
    ));
  } catch (error) {
    res.status(503).json(createResponse(
      false,
      null,
      'Health check failed',
      error.message,
      'HEALTH_CHECK_ERROR'
    ));
  }
});

// API routes with proper prefixes
app.use("/api/", whatsappRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/basic", businessRoutes);
app.use("/api/google", googleRoutes);

// Catch-all for API routes (404 handler for API)
app.use('/api/*', notFoundHandler);

// 404 handler for non-API routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('HTTP server closed.');
    
    // Close database connections, clean up resources, etc.
    // Example: database.close();
    
    console.log('Graceful shutdown completed.');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle process signals for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
