const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

/**
 * Enhanced Utility Helpers for WhatsApp Bot
 * Provides common utility functions used across the application
 */
class Helpers {
  
  /**
   * Generate a secure random string
   * @param {number} length - Length of the random string
   * @returns {string} Random string
   */
  static generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a unique ID with timestamp
   * @returns {string} Unique ID
   */
  static generateUniqueId() {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}_${random}`;
  }

  /**
   * Sanitize filename for safe file operations
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename
   */
  static sanitizeFilename(filename) {
    return filename
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .substring(0, 100);
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid email
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number format
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid phone
   */
  static isValidPhone(phone) {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  /**
   * Clean and format phone number
   * @param {string} phone - Phone number to clean
   * @returns {string} Cleaned phone number
   */
  static cleanPhoneNumber(phone) {
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Calculate time difference in human readable format
   * @param {Date} date - Date to compare with now
   * @returns {string} Human readable time difference
   */
  static timeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Deep clone an object
   * @param {any} obj - Object to clone
   * @returns {any} Cloned object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = this.deepClone(obj[key]);
      });
      return cloned;
    }
  }

  /**
   * Safely parse JSON with fallback
   * @param {string} jsonString - JSON string to parse
   * @param {any} fallback - Fallback value if parsing fails
   * @returns {any} Parsed object or fallback
   */
  static safeJsonParse(jsonString, fallback = null) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return fallback;
    }
  }

  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} length - Maximum length
   * @returns {string} Truncated text
   */
  static truncateText(text, length = 100) {
    if (!text || text.length <= length) return text;
    return text.substring(0, length).trim() + '...';
  }

  /**
   * Remove HTML tags from text
   * @param {string} html - HTML string
   * @returns {string} Clean text
   */
  static stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Escape special characters for regex
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   */
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get file extension from filename
   * @param {string} filename - Filename
   * @returns {string} File extension
   */
  static getFileExtension(filename) {
    return path.extname(filename).toLowerCase().substring(1);
  }

  /**
   * Check if file exists asynchronously
   * @param {string} filePath - Path to file
   * @returns {Promise<boolean>} True if file exists
   */
  static async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create directory if it doesn't exist
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   */
  static async ensureDir(dirPath) {
    await fs.ensureDir(dirPath);
  }

  /**
   * Get memory usage in MB
   * @returns {Object} Memory usage statistics
   */
  static getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024)
    };
  }

  /**
   * Sleep/wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  static async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry an async function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxAttempts - Maximum number of attempts
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise<any>} Function result
   */
  static async retry(fn, maxAttempts = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Create a debounced function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Validate and normalize URL
   * @param {string} url - URL to validate
   * @returns {string|null} Normalized URL or null if invalid
   */
  static normalizeUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.toString();
    } catch {
      return null;
    }
  }

  /**
   * Generate a hash for a string
   * @param {string} str - String to hash
   * @param {string} algorithm - Hash algorithm (default: sha256)
   * @returns {string} Hash
   */
  static hash(str, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(str).digest('hex');
  }

  /**
   * Check if string is JSON
   * @param {string} str - String to check
   * @returns {boolean} True if valid JSON
   */
  static isJson(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Helpers;
