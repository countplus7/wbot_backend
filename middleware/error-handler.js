const { ValidationError: ExpressValidationError } = require("express-validator");

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

class AuthenticationError extends AppError {
  constructor(message = "Authentication failed") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

class AuthorizationError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND_ERROR");
  }
}

class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(message, 409, "CONFLICT_ERROR");
  }
}

class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "RATE_LIMIT_ERROR");
  }
}

class ExternalServiceError extends AppError {
  constructor(message = "External service error", service) {
    super(message, 502, "EXTERNAL_SERVICE_ERROR");
    this.service = service;
  }
}

// Standard API response format
const createResponse = (success, data = null, error = null, message = null, code = null) => {
  const response = {
    success,
    timestamp: new Date().toISOString(),
  };

  if (data !== null) response.data = data;
  if (error !== null) response.error = error;
  if (message !== null) response.message = message;
  if (code !== null) response.code = code;

  return response;
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = "Resource not found";
    error = new NotFoundError(message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
    const message = `Duplicate field value: ${value}. Please use another value`;
    error = new ConflictError(message);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
      value: val.value,
    }));
    error = new ValidationError("Validation failed", errors);
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error = new AuthenticationError("Invalid token");
  }

  if (err.name === "TokenExpiredError") {
    error = new AuthenticationError("Token expired");
  }

  // Database connection errors
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    error = new AppError("Database connection failed", 503, "DATABASE_ERROR");
  }

  // Express-validator errors
  if (err.array && typeof err.array === "function") {
    const errors = err.array().map((e) => ({
      field: e.param,
      message: e.msg,
      value: e.value,
    }));
    error = new ValidationError("Validation failed", errors);
  }

  // Determine status code
  const statusCode = error.statusCode || 500;
  const code = error.code || "INTERNAL_SERVER_ERROR";

  // Send error response
  const response = createResponse(false, null, error.message || "Internal server error", null, code);

  // Add additional error details in development
  if (process.env.NODE_ENV === "development") {
    response.stack = error.stack;
    if (error.errors) {
      response.details = error.errors;
    }
  }

  res.status(statusCode).json(response);
};

// 404 handler
const notFoundHandler = (req, res) => {
  const response = createResponse(false, null, `Route ${req.originalUrl} not found`, null, "NOT_FOUND_ERROR");

  res.status(404).json(response);
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  createResponse,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
