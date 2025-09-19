const logger = require('./logger');

/**
 * Performance Monitoring Utility
 * Provides performance tracking and monitoring capabilities
 */
class Performance {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
  }

  /**
   * Start a performance timer
   * @param {string} name - Timer name
   */
  startTimer(name) {
    this.timers.set(name, process.hrtime.bigint());
  }

  /**
   * End a performance timer and log the result
   * @param {string} name - Timer name
   * @param {Object} meta - Additional metadata
   * @returns {number} Duration in milliseconds
   */
  endTimer(name, meta = {}) {
    const start = this.timers.get(name);
    if (!start) {
      logger.warn("Timer " + name + " was not started");
      return 0;
    }

    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
    
    this.timers.delete(name);
    logger.performance(name, duration, meta);
    
    // Store metric for analysis
    this.recordMetric(name, duration);
    
    return duration;
  }

  /**
   * Record a metric value
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   */
  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity,
        average: 0
      });
    }

    const metric = this.metrics.get(name);
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    metric.average = metric.total / metric.count;
  }

  /**
   * Get performance metrics summary
   * @returns {Object} Metrics summary
   */
  getMetrics() {
    const summary = {};
    for (const [name, metric] of this.metrics) {
      summary[name] = {
        ...metric,
        min: metric.min === Infinity ? 0 : metric.min,
        max: metric.max === -Infinity ? 0 : metric.max
      };
    }
    return summary;
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics.clear();
    this.timers.clear();
  }

  /**
   * Create a performance decorator for functions
   * @param {string} name - Performance metric name
   * @returns {Function} Decorator function
   */
  measure(name) {
    return (target, propertyKey, descriptor) => {
      const originalMethod = descriptor.value;

      descriptor.value = async function(...args) {
        performance.startTimer(name);
        try {
          const result = await originalMethod.apply(this, args);
          performance.endTimer(name);
          return result;
        } catch (error) {
          performance.endTimer(name, { error: true });
          throw error;
        }
      };

      return descriptor;
    };
  }

  /**
   * Monitor system resources
   * @returns {Object} System resource usage
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        heapUtilization: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: Math.round(process.uptime()),
      eventLoopDelay: this.getEventLoopDelay()
    };
  }

  /**
   * Get event loop delay (simplified)
   * @returns {number} Event loop delay approximation
   */
  getEventLoopDelay() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1_000_000;
      this.recordMetric('eventLoopDelay', delay);
    });
    return this.metrics.get('eventLoopDelay')?.average || 0;
  }
}

const performance = new Performance();
module.exports = performance;
