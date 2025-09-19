const isDev = process.env.NODE_ENV !== 'production';

// Performance monitoring utility
class PerformanceMonitor {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.metrics = new Map();
  }

  // High-performance logger that only logs in development or critical errors
  log(level, message, data = null) {
    const shouldLog = isDev || level === 'error' || level === 'warn';
    
    if (shouldLog) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${this.serviceName}] ${message}`;
      
      switch (level) {
        case 'error':
          console.error(logMessage, data);
          break;
        case 'warn':
          console.warn(logMessage, data);
          break;
        case 'info':
          console.info(logMessage, data);
          break;
        case 'debug':
          if (isDev) console.debug(logMessage, data);
          break;
        default:
          if (isDev) console.log(logMessage, data);
      }
    }
  }

  // Start timing an operation
  startTimer(operationName) {
    this.metrics.set(operationName, Date.now());
  }

  // End timing and log if it took too long
  endTimer(operationName, threshold = 1000) {
    const startTime = this.metrics.get(operationName);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.metrics.delete(operationName);
      
      if (duration > threshold) {
        this.log('warn', `Slow operation detected: ${operationName} took ${duration}ms`);
      } else if (isDev) {
        this.log('debug', `${operationName} completed in ${duration}ms`);
      }
      
      return duration;
    }
    return 0;
  }

  // Memory usage checker
  checkMemory() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    if (heapUsedMB > 300) { // Alert if over 300MB
      this.log('warn', `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    }
    
    return { heapUsed: heapUsedMB, heapTotal: heapTotalMB };
  }
}

// Cache for frequently accessed data
class SimpleCache {
  constructor(ttl = 300000) { // 5 minutes default TTL
    this.cache = new Map();
    this.ttl = ttl;
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Async operation queue to prevent overwhelming external APIs
class AsyncQueue {
  constructor(concurrency = 5, delay = 100) {
    this.concurrency = concurrency;
    this.delay = delay;
    this.queue = [];
    this.running = 0;
  }

  async add(asyncFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: asyncFn,
        resolve,
        reject
      });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      
      // Add small delay between operations
      if (this.delay > 0) {
        setTimeout(() => this.process(), this.delay);
      } else {
        this.process();
      }
    }
  }
}

// Optimized retry mechanism
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Debounce function for high-frequency operations
function debounce(func, wait) {
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

// Throttle function for rate limiting
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

module.exports = {
  PerformanceMonitor,
  SimpleCache,
  AsyncQueue,
  retryWithBackoff,
  debounce,
  throttle,
  isDev
}; 