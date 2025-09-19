const authService = require("../services/auth");
const { createResponse, AuthenticationError } = require("./error-handler");

/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request
 */
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json(createResponse(false, null, "Access token required", null, "AUTHENTICATION_ERROR"));
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    try {
      const decoded = authService.verifyToken(token);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json(createResponse(false, null, "Invalid or expired token", null, "AUTHENTICATION_ERROR"));
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json(createResponse(false, null, "Authentication error", null, "INTERNAL_SERVER_ERROR"));
  }
};

/**
 * Admin role middleware
 * Ensures user has admin role
 */
const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json(createResponse(false, null, "Admin access required", null, "AUTHORIZATION_ERROR"));
  }
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware
}; 