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

// Import routes (lazy loading for better startup performance)
const authRoutes = require("./routes/auth");
const whatsappRoutes = require("./routes/whatsapp");
const businessRoutes = require("./routes/business");
const googleRoutes = require("./routes/google");
const hubspotRoutes = require("./routes/hubspot");
const odooRoutes = require("./routes/odoo");
const airtableRoutes = require("./routes/airtable");

const app = express();
const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== "production";

// Performance optimizations
app.set("trust proxy", 1);
app.set("x-powered-by", false); // Remove X-Powered-By header for security

// Create media directories for WhatsApp messages (sync once at startup)
const uploadsDir = path.join(__dirname, "uploads");
const imagesDir = path.join(uploadsDir, "images");
const audioDir = path.join(uploadsDir, "audio");

fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(imagesDir);
fs.ensureDirSync(audioDir);

// Cache directory status for health checks
const directoriesStatus = {
  uploads: true,
  images: true,
  audio: true,
};

// ===== MIDDLEWARE CONFIGURATION =====

// 1. Enhanced compression middleware
app.use(
  compression({
    threshold: 512, // Reduced threshold for better compression
    level: 6,
    filter: (req, res) => {
      // Don't compress already compressed files
      if (req.path.includes("/uploads/")) return false;
      return compression.filter(req, res);
    },
  })
);

// 2. Optimized security middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    dnsPrefetchControl: false,
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: ["no-referrer"] },
    xssFilter: true,
  })
);

app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

// 3. CORS configuration with caching
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Request-ID", "X-Client-Version"],
  exposedHeaders: ["X-Total-Count", "X-Page-Count", "X-Current-Page", "X-Per-Page"],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// 4. Optimized request logging middleware (only in development)
if (isDev) {
  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        // Only log slow requests in production
        console.log(`SLOW: ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      }
    });

    next();
  });
} else {
  // Production: only log errors and slow requests
  app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      if (duration > 5000 || res.statusCode >= 500) {
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      }
    });

    next();
  });
}

// 5. Optimized body parsing middleware
app.use(
  express.json({
    limit: "10mb",
    type: ["application/json", "text/plain"],
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
    parameterLimit: 1000,
  })
);

// 6. Request ID middleware (optimized)
let requestCounter = 0;
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || `req_${Date.now()}_${++requestCounter}`;
  res.setHeader("X-Request-ID", req.id);
  next();
});

// 7. Enhanced static file serving for media files
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "7d", // Longer cache for media files
    etag: true,
    lastModified: true,
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      // Set specific cache headers based on file type
      const ext = path.extname(filePath).toLowerCase();
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      } else if ([".mp3", ".wav", ".ogg", ".m4a"].includes(ext)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    },
  })
);

// ===== RATE LIMITING (OPTIMIZED) =====

// Memory store for rate limiting (consider Redis for production clusters)
const rateLimitStore = new Map();

// Create optimized rate limiter factory
const createRateLimiter = (windowMs, max, message, skipPaths = []) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => skipPaths.some((path) => req.path.startsWith(path)),
    handler: (req, res) => {
      if (isDev) {
        console.log(`Rate limit exceeded for ${req.ip} on ${req.path}`);
      }
      res.status(429).json(createResponse(false, null, message, null, "RATE_LIMIT_ERROR"));
    },
  });

// Optimized rate limiters
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  2000, // Increased for better performance
  "Too many requests from this IP, please try again later",
  ["/health", "/uploads/"]
);

const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // More reasonable auth limit
  "Too many authentication attempts, please try again later"
);

const webhookLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  2000, // Higher webhook limit
  "Too many webhook requests"
);

// Apply rate limiters more efficiently
app.use((req, res, next) => {
  // Skip rate limiting for health endpoints and static files
  if (req.path === "/health" || req.path === "/health/detailed" || req.path.startsWith("/uploads/")) {
    return next();
  }

  // Apply specific rate limiters based on path
  if (req.path.startsWith("/api/auth")) {
    return authLimiter(req, res, next);
  }

  if (req.path.includes("/webhook")) {
    return webhookLimiter(req, res, next);
  }

  // Apply general rate limiter
  return generalLimiter(req, res, next);
});

// ===== ROUTES =====

// Fast health check endpoint (cached response)
let healthCache = null;
let healthCacheTime = 0;
const HEALTH_CACHE_TTL = 5000; // 5 seconds

app.get("/health", (req, res) => {
  const now = Date.now();

  if (healthCache && now - healthCacheTime < HEALTH_CACHE_TTL) {
    return res.status(200).json(healthCache);
  }

  const healthStatus = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    directories: directoriesStatus,
    environment: process.env.NODE_ENV || "development",
  };

  healthCache = createResponse(true, healthStatus);
  healthCacheTime = now;

  res.status(200).json(healthCache);
});

// Detailed health check endpoint (no caching for accuracy)
app.get("/health/detailed", async (req, res) => {
  const checks = {
    database: false,
    filesystem: false,
    memory: false,
    diskSpace: false,
  };

  try {
    // Check database connection (placeholder - implement actual DB check)
    checks.database = true;

    // Check filesystem
    checks.filesystem = fs.existsSync(uploadsDir) && fs.existsSync(imagesDir) && fs.existsSync(audioDir);

    // Check memory usage
    const memUsage = process.memoryUsage();
    checks.memory = memUsage.heapUsed / memUsage.heapTotal < 0.9;

    // Check disk space (simplified)
    checks.diskSpace = true; // Simplified check

    const allHealthy = Object.values(checks).every((check) => check === true);
    const status = allHealthy ? "healthy" : "degraded";
    const httpStatus = allHealthy ? 200 : 503;

    res.status(httpStatus).json(
      createResponse(allHealthy, {
        status,
        checks,
        timestamp: new Date().toISOString(),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
      })
    );
  } catch (error) {
    res.status(503).json(createResponse(false, null, "Health check failed", error.message, "HEALTH_CHECK_ERROR"));
  }
});

// Simple test endpoint
app.get("/test", (req, res) => {
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
app.use("/api/hubspot", hubspotRoutes);
app.use("/api/odoo", odooRoutes);
app.use("/api/airtable", airtableRoutes);

// ===== ERROR HANDLING =====

// Catch-all for API routes (404 handler for API)
app.use("/api/*", notFoundHandler);

// 404 handler for non-API routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// ===== SERVER STARTUP =====

// Optimized graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    console.log("HTTP server closed.");

    // Clear any timers or intervals
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }

    console.log("Graceful shutdown completed.");
    process.exit(0);
  });

  // Reduced force shutdown timer
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 15000); // Reduced from 30s to 15s
};

// Start server with optimized settings
const server = app.listen(PORT, "0.0.0.0", () => {
  // Set server keep-alive timeout
  server.keepAliveTimeout = 65000; // 65 seconds
  server.headersTimeout = 66000; // 66 seconds

  console.log(`Server running on port ${PORT}`);

  // if (isDev) {
  //   console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  //   console.log(`Health check: http://localhost:${PORT}/health`);
  //   console.log(`Test endpoint: http://localhost:${PORT}/test`);
  // }
});

// Optimized error handling for server startup
server.on("error", (err) => {
  console.error("Server error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Handle process signals for graceful shutdown
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Optimized uncaught exception handling
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  if (isDev) {
    console.error(err.stack);
  }
  process.exit(1);
});

// Optimized unhandled promise rejection handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
  if (isDev) {
    console.error("At promise:", promise);
  }
  process.exit(1);
});

// Memory leak detection in development
if (isDev) {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);

    if (heapUsedMB > 500) {
      // Alert if over 500MB
      console.warn(`High memory usage detected: ${heapUsedMB}MB`);
    }
  }, 60000); // Check every minute
}

module.exports = app;
