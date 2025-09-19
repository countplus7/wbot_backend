const { body, param, query, validationResult } = require("express-validator");
const { ValidationError, createResponse } = require("./error-handler");

// Validation middleware
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    for (let validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map((error) => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location,
      }));

      return res
        .status(400)
        .json(createResponse(false, null, "Validation failed", formattedErrors, "VALIDATION_ERROR"));
    }

    next();
  };
};

// Common validation rules
const commonValidations = {
  // ID validations
  id: param("id").isInt({ min: 1 }).withMessage("ID must be a positive integer"),
  businessId: param("businessId").isInt({ min: 1 }).withMessage("Business ID must be a positive integer"),

  // Pagination validations
  page: query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  limit: query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),

  // String validations
  name: body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Name must be between 1 and 100 characters"),
  description: body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must not exceed 500 characters"),

  // Email validation
  email: body("email").isEmail().normalizeEmail().withMessage("Must be a valid email address"),

  // URL validation
  url: (fieldName) => body(fieldName).isURL().withMessage(`${fieldName} must be a valid URL`),

  // Status validation
  status: body("status").optional().isIn(["active", "inactive"]).withMessage("Status must be active or inactive"),

  // Phone number validation
  phoneNumberId: body("phone_number_id").matches(/^\d+$/).withMessage("Phone number ID must contain only digits"),
  accessToken: body("access_token").isLength({ min: 20 }).withMessage("Access token must be at least 20 characters"),
  verifyToken: body("verify_token").isLength({ min: 10 }).withMessage("Verify token must be at least 10 characters"),

  // Google Workspace validations
  clientId: body("client_id").isLength({ min: 10 }).withMessage("Client ID must be at least 10 characters"),
  clientSecret: body("client_secret").isLength({ min: 10 }).withMessage("Client secret must be at least 10 characters"),
  refreshToken: body("refresh_token")
    .optional()
    .isLength({ min: 10 })
    .withMessage("Refresh token must be at least 10 characters"),

  // HubSpot validations
  hubspotClientId: body("client_id")
    .isLength({ min: 10 })
    .withMessage("HubSpot client ID must be at least 10 characters"),
  hubspotClientSecret: body("client_secret")
    .isLength({ min: 10 })
    .withMessage("HubSpot client secret must be at least 10 characters"),

  // Search validation
  searchTerm: query("query")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters"),

  // Business tone validations
  toneName: body("tone_name")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Tone name must be between 1 and 50 characters"),
  toneInstructions: body("tone_instructions")
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Tone instructions must be between 10 and 1000 characters"),
};

// Validation sets for common operations
const validationSets = {
  // Business validations
  createBusiness: [commonValidations.name, commonValidations.description, commonValidations.status],

  updateBusiness: [
    commonValidations.id,
    body("name")
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Name must be between 1 and 100 characters"),
    commonValidations.description,
    body("status").optional().isIn(["active", "inactive"]).withMessage("Status must be active or inactive"),
  ],

  // WhatsApp config validations
  createWhatsAppConfig: [
    commonValidations.businessId,
    commonValidations.phoneNumberId,
    commonValidations.accessToken,
    commonValidations.verifyToken,
    commonValidations.url("webhook_url"),
    commonValidations.status,
  ],

  updateWhatsAppConfig: [
    commonValidations.businessId,
    body("phone_number_id").optional().matches(/^\d+$/).withMessage("Phone number ID must contain only digits"),
    body("access_token").optional().isLength({ min: 20 }).withMessage("Access token must be at least 20 characters"),
    body("verify_token").optional().isLength({ min: 10 }).withMessage("Verify token must be at least 10 characters"),
    commonValidations.url("webhook_url"),
    body("status").optional().isIn(["active", "inactive"]).withMessage("Status must be active or inactive"),
  ],

  // Google Workspace validations
  createGoogleConfig: [
    commonValidations.businessId,
    commonValidations.clientId,
    commonValidations.clientSecret,
    commonValidations.refreshToken,
    body("scopes").isArray().withMessage("Scopes must be an array"),
    commonValidations.status,
  ],

  // HubSpot validations
  createHubSpotConfig: [
    commonValidations.businessId,
    commonValidations.hubspotClientId,
    commonValidations.hubspotClientSecret,
    commonValidations.status,
  ],

  // Odoo validations
  createOdooConfig: [
    commonValidations.businessId,
    body("instance_url").isURL().withMessage("Instance URL must be a valid URL"),
    body("db").trim().isLength({ min: 1 }).withMessage("Database name is required"),
    body("username").trim().isLength({ min: 1 }).withMessage("Username is required"),
    body("api_key").trim().isLength({ min: 1 }).withMessage("API key is required"),
    commonValidations.status,
  ],

  // Airtable validations
  createAirtableConfig: [
    commonValidations.businessId,
    body("api_key").trim().isLength({ min: 10 }).withMessage("API key must be at least 10 characters"),
    body("base_id").trim().isLength({ min: 10 }).withMessage("Base ID must be at least 10 characters"),
    body("table_name").trim().isLength({ min: 1 }).withMessage("Table name is required"),
    body("fields").optional().isObject().withMessage("Fields must be an object"),
    commonValidations.status,
  ],

  // Calendar event validations
  createCalendarEvent: [
    commonValidations.businessId,
    body("summary")
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Event summary must be between 1 and 200 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    body("start").isISO8601().withMessage("Start time must be a valid ISO 8601 date"),
    body("end").isISO8601().withMessage("End time must be a valid ISO 8601 date"),
    body("attendees").optional().isArray().withMessage("Attendees must be an array"),
  ],

  updateCalendarEvent: [
    commonValidations.businessId,
    commonValidations.id,
    body("summary")
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Event summary must be between 1 and 200 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    body("start").optional().isISO8601().withMessage("Start time must be a valid ISO 8601 date"),
    body("end").optional().isISO8601().withMessage("End time must be a valid ISO 8601 date"),
    body("attendees").optional().isArray().withMessage("Attendees must be an array"),
  ],

  // Email validations
  sendEmail: [
    commonValidations.businessId,
    body("to").isEmail().withMessage("Recipient email must be valid"),
    body("subject").trim().isLength({ min: 1, max: 200 }).withMessage("Subject must be between 1 and 200 characters"),
    body("text")
      .optional()
      .trim()
      .isLength({ max: 10000 })
      .withMessage("Text content must not exceed 10000 characters"),
    body("html")
      .optional()
      .trim()
      .isLength({ max: 50000 })
      .withMessage("HTML content must not exceed 50000 characters"),
  ],

  // Business tone validations
  createBusinessTone: [
    commonValidations.businessId,
    body("name")
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage("Tone name must be between 1 and 50 characters"),
    body("tone_instructions")
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage("Tone instructions must be between 10 and 1000 characters"),
  ],

  updateBusinessTone: [
    commonValidations.businessId,
    commonValidations.id,
    body("name")
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage("Tone name must be between 1 and 50 characters"),
    body("tone_instructions")
      .optional()
      .trim()
      .isLength({ min: 10, max: 1000 })
      .withMessage("Tone instructions must be between 10 and 1000 characters"),
  ],

  // Auth validations
  login: [
    body("username").trim().isLength({ min: 3, max: 50 }).withMessage("Username must be between 3 and 50 characters"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],

  signup: [
    body("username")
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("Username must be between 3 and 50 characters")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage("Username can only contain letters, numbers, and underscores"),
    commonValidations.email,
  ],

  // Generic validations
  pagination: [commonValidations.page, commonValidations.limit],

  bulkIds: [
    body("ids")
      .isArray({ min: 1 })
      .withMessage("IDs must be a non-empty array")
      .custom((ids) => {
        if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
          throw new Error("All IDs must be positive integers");
        }
        return true;
      }),
  ],

  // Search validations
  search: [commonValidations.searchTerm],
};

module.exports = {
  validate,
  commonValidations,
  validationSets,
};
