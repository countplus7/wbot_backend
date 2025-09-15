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
const salesforceRoutes = require('./routes/salesforce');

const app = express();
const PORT = process.env.PORT || 5000;

console.log("Express app created");

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Create media directories for WhatsApp messages
const uploadsDir = path.join(__dirname, "uploads");
const imagesDir = path.join(uploadsDir, "images");
const audioDir = path.join(uploadsDir, "audio");

fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(imagesDir);
fs.ensureDirSync(audioDir);

// ===== MIDDLEWARE CONFIGURATION =====

// 1. Compression middleware (should be early in the stack)
app.use(
  compression({
    threshold: 1024,
    level: 6,
  })
);

// 2. Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// 3. CORS configuration - Allow all origins
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID", "X-Client-Version"],
  exposedHeaders: ["X-Total-Count", "X-Page-Count", "X-Current-Page", "X-Per-Page"],
  maxAge: 86400,
};

app.use(cors(corsOptions));

// 4. Request logging middleware (early for debugging)
app.use((req, res, next) => {
  const startTime = Date.now();

  // Debug logging for all requests
  console.log(`Incoming: ${req.method} ${req.path} from ${req.ip}`);

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(`Response: ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });

  next();
});

// 5. Body parsing middleware
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 6. Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader("X-Request-ID", req.id);
  next();
});

// 7. Static file serving for media files
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "1d",
    etag: true,
    lastModified: true,
  })
);

// ===== RATE LIMITING (OPTIMIZED) =====

// Create rate limiter factory
const createRateLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message: createResponse(false, null, message, null, "RATE_LIMIT_ERROR"),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.log(`Rate limit exceeded for ${req.ip} on ${req.path}`);
      res.status(429).json(createResponse(false, null, message, null, "RATE_LIMIT_ERROR"));
    },
  });

// Rate limiters with more reasonable limits
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  1000, // Increased from 100 to 1000 requests per 15 minutes
  "Too many requests from this IP, please try again later"
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  50, // Increased from 10 to 50 auth requests per 15 minutes
  "Too many authentication attempts, please try again later"
);

const webhookLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  1000, // 1000 webhook requests per minute
  "Too many webhook requests"
);

// Apply rate limiters with exclusions
app.use((req, res, next) => {
  // Skip rate limiting for health endpoints and static files
  if (req.path === "/health" || req.path === "/health/detailed" || req.path.startsWith("/uploads/")) {
    return next();
  }

  // Apply specific rate limiters
  if (req.path.startsWith("/api/auth")) {
    return authLimiter(req, res, next);
  }

  if (req.path.startsWith("/api/webhook") || req.path.startsWith("/webhook")) {
    return webhookLimiter(req, res, next);
  }

  // Apply general rate limiter
  return generalLimiter(req, res, next);
});

// ===== ROUTES =====

// Health check endpoints (before API routes)
app.get("/health", (req, res) => {
  console.log("HEALTH ENDPOINT HIT!");
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
  console.log("DETAILED HEALTH ENDPOINT HIT!");
  const checks = {
    database: false,
    filesystem: false,
    memory: false,
    diskSpace: false,
  };

  try {
    // Check database connection (placeholder)
    checks.database = true;

    // Check filesystem
    checks.filesystem = fs.existsSync(uploadsDir) && fs.existsSync(imagesDir) && fs.existsSync(audioDir);

    // Check memory usage
    const memUsage = process.memoryUsage();
    checks.memory = memUsage.heapUsed / memUsage.heapTotal < 0.9;

    // Check disk space (simplified)
    const stats = fs.statSync(__dirname);
    checks.diskSpace = stats.size > 0;

    const allHealthy = Object.values(checks).every((check) => check === true);
    const status = allHealthy ? "healthy" : "degraded";
    const httpStatus = allHealthy ? 200 : 503;

    res.status(httpStatus).json(
      createResponse(allHealthy, {
        status,
        checks,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    res.status(503).json(createResponse(false, null, "Health check failed", error.message, "HEALTH_CHECK_ERROR"));
  }
});

// Test endpoint
app.get("/test", (req, res) => {
  console.log("TEST ENDPOINT HIT!");
  res.json({
    message: "Test endpoint working",
    timestamp: new Date().toISOString(),
  });
});

// API routes with proper prefixes
app.use("/api/", whatsappRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/basic", businessRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/salesforce", salesforceRoutes);

// ===== ERROR HANDLING =====

// Catch-all for API routes (404 handler for API)
app.use("/api/*", notFoundHandler);

// 404 handler for non-API routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// ===== SERVER STARTUP =====

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    console.log("HTTP server closed.");
    console.log("Graceful shutdown completed.");
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 30000);
};

// Start server
console.log("About to start server on port:", PORT);
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 Server accessible at: http://localhost:${PORT}`);
  console.log(`🌐 Server accessible at: http://0.0.0.0:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
});

// Add error handling for server startup
server.on("error", (err) => {
  console.error("Server error:", err);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
  }
});

// Handle process signals for graceful shutdown
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

module.exports = app;
