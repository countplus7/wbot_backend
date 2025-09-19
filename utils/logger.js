const fs = require("fs");
const path = require("path");

/**
 * Logger for WhatsApp Bot
 * Replaces console.log with structured logging
 */
class Logger {
  constructor() {
    this.isDev = process.env.NODE_ENV !== "production";
    this.logsDir = path.join(__dirname, "../logs");
    this.ensureLogsDir();
  }

  ensureLogsDir() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      ...meta,
      pid: process.pid,
      env: process.env.NODE_ENV || "development",
    };
  }

  writeToFile(logData) {
    if (!this.isDev) {
      const filename = `app-${new Date().toISOString().split("T")[0]}.log`;
      const filepath = path.join(this.logsDir, filename);
      fs.appendFileSync(filepath, JSON.stringify(logData) + "\n");
    }
  }

  info(message, meta = {}) {
    const logData = this.formatMessage("INFO", message, meta);
    if (this.isDev) {
      console.log(`[INFO] ${message}`, meta);
    }
    this.writeToFile(logData);
  }

  warn(message, meta = {}) {
    const logData = this.formatMessage("WARN", message, meta);
    console.warn(`[WARN] ${message}`, meta);
    this.writeToFile(logData);
  }

  error(message, error = null, meta = {}) {
    const logData = this.formatMessage("ERROR", message, {
      ...meta,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : null,
    });
    console.error(`[ERROR] ${message}`, error, meta);
    this.writeToFile(logData);
  }

  debug(message, meta = {}) {
    if (this.isDev) {
      const logData = this.formatMessage("DEBUG", message, meta);
      console.log(`[DEBUG] ${message}`, meta);
      this.writeToFile(logData);
    }
  }

  performance(operation, duration, meta = {}) {
    const message = `${operation} completed in ${duration}ms`;
    const logData = this.formatMessage("PERF", message, {
      ...meta,
      operation,
      duration,
    });

    if (duration > 1000) {
      console.warn(`[SLOW] ${message}`, meta);
    } else if (this.isDev) {
      console.log(`[PERF] ${message}`, meta);
    }

    this.writeToFile(logData);
  }

  webhook(event, data = {}) {
    const logData = this.formatMessage("WEBHOOK", event, data);
    if (this.isDev) {
      console.log(`[WEBHOOK] ${event}`, data);
    }
    this.writeToFile(logData);
  }
}

module.exports = new Logger();
