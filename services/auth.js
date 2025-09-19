const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "your-secret-key";
    this.jwtExpiry = process.env.JWT_EXPIRY || "24h";
  }

  /**
   * Hash password using bcrypt
   * @param {string} password - Plain text password
   * @returns {string} Hashed password
   */
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {boolean} True if password matches
   */
  async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiry }
    );
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object} Decoded token payload
   */
  verifyToken(token) {
    return jwt.verify(token, this.jwtSecret);
  }

  /**
   * Check if admin exists
   * @returns {boolean} True if admin exists
   */
  async adminExists() {
    try {
      const query = "SELECT COUNT(*) FROM users WHERE role = $1";
      const result = await pool.query(query, ["admin"]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error("Error checking if admin exists:", error);
      throw new Error("Failed to check admin existence");
    }
  }

  /**
   * Create new admin user
   * @param {Object} userData - User data
   * @returns {Object} Created user (without password)
   */
  async createAdmin(userData) {
    try {
      // Check if admin already exists
      const adminExists = await this.adminExists();
      if (adminExists) {
        throw new Error("Admin user already exists");
      }

      // Check if username or email already exists
      const existingUser = await this.findUserByUsernameOrEmail(userData.username, userData.email);
      if (existingUser) {
        throw new Error("Username or email already exists");
      }

      // Hash password
      const passwordHash = await this.hashPassword(userData.password);

      // Create user
      const query = `
        INSERT INTO users (username, email, password_hash, role, status)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, email, role, status, created_at, updated_at
      `;

      const values = [userData.username, userData.email, passwordHash, "admin", "active"];

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating admin:", error);
      throw error;
    }
  }

  /**
   * Find user by username or email
   * @param {string} username - Username
   * @param {string} email - Email
   * @returns {Object|null} User object or null
   */
  async findUserByUsernameOrEmail(username, email) {
    try {
      const query = "SELECT * FROM users WHERE username = $1 OR email = $2";
      const result = await pool.query(query, [username, email]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error finding user:", error);
      throw new Error("Failed to find user");
    }
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Object|null} User object or null
   */
  async findUserByUsername(username) {
    try {
      const query = "SELECT * FROM users WHERE username = $1";
      const result = await pool.query(query, [username]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error finding user by username:", error);
      throw new Error("Failed to find user");
    }
  }

  /**
   * Authenticate user login
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object} User object and token
   */
  async login(username, password) {
    try {
      // Find user
      const user = await this.findUserByUsername(username);
      if (!user) {
        throw new Error("Invalid credentials");
      }

      // Check if user is active
      if (user.status !== "active") {
        throw new Error("Account is inactive");
      }

      // Verify password
      const isValidPassword = await this.comparePassword(password, user.password_hash);
      if (!isValidPassword) {
        throw new Error("Invalid credentials");
      }

      // Generate token
      const token = this.generateToken(user);

      // Return user without password
      const { password_hash, ...userWithoutPassword } = user;
      return {
        user: userWithoutPassword,
        token,
      };
    } catch (error) {
      console.error("Error during login:", error);
      throw error;
    }
  }

  /**
   * Update admin profile
   * @param {number} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated user
   */
  async updateAdmin(userId, updateData) {
    try {
      const updates = [];
      const values = [];
      let paramCount = 1;

      // Handle password update
      if (updateData.password) {
        const passwordHash = await this.hashPassword(updateData.password);
        updates.push(`password_hash = $${paramCount}`);
        values.push(passwordHash);
        paramCount++;
      }

      // Handle other fields
      if (updateData.username) {
        // Check if username already exists (excluding current user)
        const existingUser = await pool.query("SELECT id FROM users WHERE username = $1 AND id != $2", [
          updateData.username,
          userId,
        ]);
        if (existingUser.rows.length > 0) {
          throw new Error("Username already exists");
        }
        updates.push(`username = $${paramCount}`);
        values.push(updateData.username);
        paramCount++;
      }

      if (updateData.email) {
        // Check if email already exists (excluding current user)
        const existingUser = await pool.query("SELECT id FROM users WHERE email = $1 AND id != $2", [
          updateData.email,
          userId,
        ]);
        if (existingUser.rows.length > 0) {
          throw new Error("Email already exists");
        }
        updates.push(`email = $${paramCount}`);
        values.push(updateData.email);
        paramCount++;
      }

      if (updateData.status) {
        updates.push(`status = $${paramCount}`);
        values.push(updateData.status);
        paramCount++;
      }

      if (updates.length === 0) {
        throw new Error("No valid fields to update");
      }

      // Add updated_at
      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      // Add user ID to values
      values.push(userId);

      const query = `
        UPDATE users 
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING id, username, email, role, status, created_at, updated_at
      `;

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        throw new Error("User not found");
      }

      return result.rows[0];
    } catch (error) {
      console.error("Error updating admin:", error);
      throw error;
    }
  }

  /**
   * Get admin profile
   * @param {number} userId - User ID
   * @returns {Object} User object
   */
  async getAdminProfile(userId) {
    try {
      const query = "SELECT id, username, email, role, status, created_at, updated_at FROM users WHERE id = $1";
      const result = await pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting admin profile:", error);
      throw new Error("Failed to get admin profile");
    }
  }
}

module.exports = new AuthService();
