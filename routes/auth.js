const express = require("express");
const router = express.Router();
const authService = require("../services/auth");
const { authMiddleware } = require("../middleware/auth");
const { validate, validationSets } = require("../middleware/validation");
const { createResponse, asyncHandler } = require("../middleware/error-handler");

/**
 * Check if admin exists
 * GET /api/auth/admin-exists
 */
router.get(
  "/admin-exists",
  asyncHandler(async (req, res) => {
    const adminExists = await authService.adminExists();
    res.json(createResponse(true, { adminExists }));
  })
);

/**
 * Create admin user (signup)
 * POST /api/auth/signup
 */
router.post(
  "/signup",
  validate(validationSets.signup),
  asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;

    // Check if admin already exists
    const adminExists = await authService.adminExists();
    if (adminExists) {
      return res.status(400).json(createResponse(false, null, "Admin user already exists", null, "CONFLICT_ERROR"));
    }

    // Create admin
    const user = await authService.createAdmin({ username, email, password });
    const token = authService.generateToken(user);

    res.status(201).json(createResponse(true, { user, token }, "Admin created successfully"));
  })
);

/**
 * Admin login
 * POST /api/auth/login
 */
router.post(
  "/login",
  validate(validationSets.login),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Authenticate user
    const { user, token } = await authService.login(username, password);

    res.json(createResponse(true, { user, token }, "Login successful"));
  })
);

/**
 * Get current user profile
 * GET /api/auth/profile
 */
router.get(
  "/profile",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await authService.getAdminProfile(req.user.id);
    if (!user) {
      return res.status(404).json(createResponse(false, null, "User not found", null, "NOT_FOUND_ERROR"));
    }

    res.json(createResponse(true, user));
  })
);

/**
 * Update admin profile
 * PUT /api/auth/profile
 */
router.put(
  "/profile",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { username, email, password, currentPassword, status } = req.body;
    const updateData = {};

    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (status) updateData.status = status;

    // If password is being updated, validate current password
    if (password) {
      if (!currentPassword) {
        return res
          .status(400)
          .json(
            createResponse(false, null, "Current password is required to change password", null, "VALIDATION_ERROR")
          );
      }

      // Verify current password
      const user = await authService.getAdminProfile(req.user.id);
      const isCurrentPasswordValid = await authService.comparePassword(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        return res
          .status(400)
          .json(createResponse(false, null, "Current password is incorrect", null, "VALIDATION_ERROR"));
      }

      updateData.password = password;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(createResponse(false, null, "No valid fields to update", null, "VALIDATION_ERROR"));
    }

    const updatedUser = await authService.updateAdmin(req.user.id, updateData);

    res.json(createResponse(true, updatedUser, "Profile updated successfully"));
  })
);

/**
 * Verify token
 * GET /api/auth/verify
 */
router.get(
  "/verify",
  authMiddleware,
  asyncHandler(async (req, res) => {
    res.json(createResponse(true, { user: req.user }));
  })
);

module.exports = router;
