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

      return res.status(400).json(createResponse(false, null, "Validation failed", null, "VALIDATION_ERROR"));
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

  // Phone validation
  phoneNumber: body("phoneNumber").isMobilePhone().withMessage("Must be a valid phone number"),

  // Date validations
  dateTime: (field) => body(field).isISO8601().withMessage(`${field} must be a valid ISO 8601 date`),

  // URL validation
  url: (field) => body(field).optional().isURL().withMessage(`${field} must be a valid URL`),

  // Token validation
  token: body("token").isLength({ min: 10 }).withMessage("Token must be at least 10 characters"),

  // Status validation
  status: body("status").isIn(["active", "inactive"]).withMessage("Status must be active or inactive"),

  // WhatsApp specific validations
  phoneNumberId: body("phone_number_id").matches(/^\d+$/).withMessage("Phone number ID must contain only digits"),
  accessToken: body("access_token").isLength({ min: 20 }).withMessage("Access token must be at least 20 characters"),
  verifyToken: body("verify_token").isLength({ min: 10 }).withMessage("Verify token must be at least 10 characters"),

  // Google Workspace validations
  clientId: body("client_id").isLength({ min: 10 }).withMessage("Client ID must be at least 10 characters"),
  clientSecret: body("client_secret").isLength({ min: 10 }).withMessage("Client secret must be at least 10 characters"),
  refreshToken: body("refresh_token").isLength({ min: 10 }).withMessage("Refresh token must be at least 10 characters"),

  // HubSpot validations
  hubspotClientId: body("client_id").isLength({ min: 10 }).withMessage("HubSpot Client ID must be at least 10 characters"),
  hubspotClientSecret: body("client_secret").isLength({ min: 10 }).withMessage("HubSpot Client secret must be at least 10 characters"),

  // Odoo validations
  odooUrl: body("instance_url").isURL().withMessage("Odoo instance URL must be a valid URL"),
  odooDatabase: body("db").isLength({ min: 1 }).withMessage("Database name is required"),
  odooUsername: body("username").isLength({ min: 1 }).withMessage("Username is required"),
  odooApiKey: body("api_key").isLength({ min: 1 }).withMessage("API key is required"),

  // Airtable validations
  airtableToken: body("access_token").isLength({ min: 10 }).withMessage("Airtable access token must be at least 10 characters"),
  airtableBaseId: body("base_id").isLength({ min: 10 }).withMessage("Airtable base ID must be at least 10 characters"),
  airtableTableName: body("table_name").isLength({ min: 1 }).withMessage("Table name is required"),

  // Calendar event validations
  title: body("title").trim().isLength({ min: 1, max: 200 }).withMessage("Title must be between 1 and 200 characters"),
  startTime: body("startTime").isISO8601().withMessage("Start time must be a valid ISO 8601 date"),
  endTime: body("endTime")
    .isISO8601()
    .withMessage("End time must be a valid ISO 8601 date")
    .custom((endTime, { req }) => {
      if (new Date(endTime) <= new Date(req.body.startTime)) {
        throw new Error("End time must be after start time");
      }
      return true;
    }),
  timeZone: body("timeZone")
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage("Time zone must be between 3 and 50 characters"),
  attendees: body("attendees")
    .optional()
    .isArray()
    .withMessage("Attendees must be an array")
    .custom((attendees) => {
      if (attendees && attendees.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        throw new Error("All attendees must be valid email addresses");
      }
      return true;
    }),

  // Email validations
  subject: body("subject")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Subject must be between 1 and 200 characters"),
  body: body("body").trim().isLength({ min: 1 }).withMessage("Body cannot be empty"),
  to: body("to").custom((to) => {
    const emails = Array.isArray(to) ? to : [to];
    if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new Error("All recipients must be valid email addresses");
    }
    return true;
  }),

  // Business tone validations
  toneName: body("tone_name")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Tone name must be between 1 and 50 characters"),
  toneInstructions: body("tone_instructions")
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Tone instructions must be between 10 and 1000 characters"),

  // Search validations
  searchTerm: body("searchTerm").trim().isLength({ min: 1 }).withMessage("Search term is required"),
};

// Specific validation sets for different operations
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
    commonValidations.odooUrl,
    commonValidations.odooDatabase,
    commonValidations.odooUsername,
    commonValidations.odooApiKey,
  ],

  // Airtable validations
  createAirtableConfig: [
    commonValidations.businessId,
    commonValidations.airtableToken,
    commonValidations.airtableBaseId,
    commonValidations.airtableTableName,
  ],

  // Calendar event validations
  createCalendarEvent: [
    commonValidations.businessId,
    commonValidations.title,
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    commonValidations.startTime,
    commonValidations.endTime,
    commonValidations.timeZone,
    commonValidations.attendees,
  ],

  updateCalendarEvent: [
    commonValidations.businessId,
    param("eventId").notEmpty().withMessage("Event ID is required"),
    body("title")
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Title must be between 1 and 200 characters"),
    body("description")
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage("Description must not exceed 1000 characters"),
    body("startTime").optional().isISO8601().withMessage("Start time must be a valid ISO 8601 date"),
    body("endTime").optional().isISO8601().withMessage("End time must be a valid ISO 8601 date"),
    commonValidations.timeZone,
    commonValidations.attendees,
  ],

  // Email validations
  sendEmail: [
    commonValidations.businessId,
    commonValidations.to,
    body("cc")
      .optional()
      .custom((cc) => {
        const emails = Array.isArray(cc) ? cc : [cc];
        if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
          throw new Error("All CC recipients must be valid email addresses");
        }
        return true;
      }),
    body("bcc")
      .optional()
      .custom((bcc) => {
        const emails = Array.isArray(bcc) ? bcc : [bcc];
        if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
          throw new Error("All BCC recipients must be valid email addresses");
        }
        return true;
      }),
    commonValidations.subject,
    commonValidations.body,
  ],

  // Business tone validations
  createBusinessTone: [commonValidations.businessId, commonValidations.toneName, commonValidations.toneInstructions],

  updateBusinessTone: [
    param("toneId").isInt({ min: 1 }).withMessage("Tone ID must be a positive integer"),
    body("tone_name")
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
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage("Password must contain at least one lowercase letter, one uppercase letter, and one number"),
    body("confirmPassword").custom((confirmPassword, { req }) => {
      if (confirmPassword !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
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
