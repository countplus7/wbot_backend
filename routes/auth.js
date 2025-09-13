const express = require("express");
const router = express.Router();
const authService = require("../services/auth");
const { authMiddleware } = require("../middleware/auth");

/**
 * Check if admin exists
 * GET /api/auth/admin-exists
 */
router.get("/admin-exists", async (req, res) => {
  try {
    const adminExists = await authService.adminExists();
    res.json({
      success: true,
      data: {
        adminExists,
      },
    });
  } catch (error) {
    console.error("Error checking admin existence:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check admin existence",
    });
  }
});

/**
 * Create admin user (signup)
 * POST /api/auth/signup
 */
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Username, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long",
      });
    }

    // Check if admin already exists
    const adminExists = await authService.adminExists();
    if (adminExists) {
      return res.status(400).json({
        success: false,
        error: "Admin user already exists",
      });
    }

    // Create admin
    const user = await authService.createAdmin({ username, email, password });
    const token = authService.generateToken(user);

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Failed to create admin",
    });
  }
});

/**
 * Admin login
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required",
      });
    }

    // Authenticate user
    const { user, token } = await authService.login(username, password);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(401).json({
      success: false,
      error: error.message || "Login failed",
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/profile
 */
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await authService.getAdminProfile(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error getting profile:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get profile",
    });
  }
});

/**
 * Update admin profile
 * PUT /api/auth/profile
 */
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { username, email, password, status } = req.body;
    const updateData = {};

    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (password) updateData.password = password;
    if (status) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update",
      });
    }

    const user = await authService.updateAdmin(req.user.id, updateData);

    res.json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Failed to update profile",
    });
  }
});

/**
 * Verify token
 * GET /api/auth/verify
 */
router.get("/verify", authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
});

module.exports = router;
