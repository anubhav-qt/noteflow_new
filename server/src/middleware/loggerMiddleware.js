/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  // Create a timestamp
  const timestamp = new Date().toISOString();
  
  // Generate a unique request ID (simple version)
  const requestId = `req-${timestamp}-${Math.random().toString(36).substring(2, 10)}`;
  
  // Store request ID for further logging
  req.requestId = requestId;
  
  // Log the request
  console.log(`[${timestamp}] [${requestId}] ${req.method} ${req.originalUrl}`);
  
  // Log request body if present (but sanitize sensitive info)
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    
    // Sanitize sensitive fields if they exist
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
    
    console.log(`[${timestamp}] [${requestId}] Request Body:`, JSON.stringify(sanitizedBody, null, 2));
  }
  
  // Log request files if present
  if (req.file) {
    console.log(`[${timestamp}] [${requestId}] File uploaded:`, {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: `${(req.file.size / 1024).toFixed(2)} KB`
    });
  }
  
  // Capture the response
  const originalSend = res.send;
  res.send = function(body) {
    const responseTimestamp = new Date().toISOString();
    
    // Log response status
    console.log(`[${responseTimestamp}] [${requestId}] Response Status: ${res.statusCode}`);
    
    // Try to log the response body if it's JSON
    if (typeof body === 'string' && body.startsWith('{')) {
      try {
        const parsedBody = JSON.parse(body);
        
        // Create a summarized version for logging
        const summarizedBody = { ...parsedBody };
        
        // Truncate large fields
        for (const key in summarizedBody) {
          if (typeof summarizedBody[key] === 'string' && summarizedBody[key].length > 500) {
            summarizedBody[key] = `${summarizedBody[key].substring(0, 500)}... [truncated]`;
          }
        }
        
        console.log(`[${responseTimestamp}] [${requestId}] Response Body:`, JSON.stringify(summarizedBody, null, 2));
      } catch (e) {
        // Not JSON or other error
        console.log(`[${responseTimestamp}] [${requestId}] Response Body: [Non-JSON or parsing error]`);
      }
    }
    
    // Calculate response time
    const requestStartTime = new Date(timestamp);
    const responseTime = new Date(responseTimestamp) - requestStartTime;
    console.log(`[${responseTimestamp}] [${requestId}] Response Time: ${responseTime}ms`);
    
    // Send the original response
    return originalSend.call(this, body);
  };
  
  next();
};

module.exports = requestLogger;
