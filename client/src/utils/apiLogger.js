/**
 * API Logger utility for tracking API requests and responses
 */

// Log levels
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR'
};

// Main logger function
const logger = {
  /**
   * Log API request details
   */
  logApiRequest: (endpoint, method, data) => {
    const timestamp = new Date().toISOString();
    const requestId = `req-${timestamp}-${Math.random().toString(36).substring(2, 10)}`;
    
    console.group(`🚀 API Request [${timestamp}] - ${method} ${endpoint}`);
    console.log('Request ID:', requestId);
    console.log('Payload:', data);
    console.groupEnd();
    
    return requestId;
  },
  
  /**
   * Log API response details
   */
  logApiResponse: (requestId, endpoint, method, response, timeMs) => {
    const timestamp = new Date().toISOString();
    
    console.group(`✅ API Response [${timestamp}] - ${method} ${endpoint}`);
    console.log('Request ID:', requestId);
    console.log('Time:', `${timeMs}ms`);
    console.log('Status:', response.status);
    console.log('Response:', response.data);
    console.groupEnd();
  },
  
  /**
   * Log API error details
   */
  logApiError: (requestId, endpoint, method, error) => {
    const timestamp = new Date().toISOString();
    
    console.group(`❌ API Error [${timestamp}] - ${method} ${endpoint}`);
    console.log('Request ID:', requestId);
    console.log('Status:', error.response?.status || 'No status');
    console.log('Error:', error.message);
    console.log('Details:', error.response?.data || 'No details');
    console.error('Error object:', error);
    console.groupEnd();
  },
  
  /**
   * Log a general message
   */
  log: (level, component, message, data = null) => {
    const timestamp = new Date().toISOString();
    let icon = '📄';
    
    switch (level) {
      case LOG_LEVELS.DEBUG:
        icon = '🔍';
        break;
      case LOG_LEVELS.INFO:
        icon = 'ℹ️';
        break;
      case LOG_LEVELS.WARNING:
        icon = '⚠️';
        break;
      case LOG_LEVELS.ERROR:
        icon = '❌';
        break;
    }
    
    console.group(`${icon} ${level} [${timestamp}] - ${component}`);
    console.log(message);
    if (data) console.log(data);
    console.groupEnd();
  }
};

// Convenience methods
logger.debug = (component, message, data) => logger.log(LOG_LEVELS.DEBUG, component, message, data);
logger.info = (component, message, data) => logger.log(LOG_LEVELS.INFO, component, message, data);
logger.warning = (component, message, data) => logger.log(LOG_LEVELS.WARNING, component, message, data);
logger.error = (component, message, data) => logger.log(LOG_LEVELS.ERROR, component, message, data);

export default logger;
