const express = require('express');
const { noteBeautifierFlow, conversationFlow } = require('../genkit/noteBeautifier');
const multer = require('multer');
const router = express.Router();

// Configure multer for file uploads with explicit mime type filtering
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  // Allow these mime types
  const allowedMimeTypes = [
    // Text
    'text/plain', 
    'text/markdown',
    'text/csv',
    // Documents
    'application/pdf',
    'application/json',
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
    // Video
    'video/mp4', 'video/webm', 'video/quicktime'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not supported`), false);
  }
};

const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter
});

// Helper function for detailed logging
const logOperation = (reqId, operation, data) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${reqId}] [${operation}]`, JSON.stringify(data, null, 2));
};

// Endpoint for normal conversations
router.post('/chat', async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    const { message } = req.body;
    
    if (!message) {
      logOperation(requestId, 'CHAT_VALIDATION_ERROR', { error: 'Message is required' });
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Check if this is just a normal conversation or a note beautification request
    const isBeautificationRequest = message.toLowerCase().includes('beautify') || 
                                    message.toLowerCase().includes('structure') ||
                                    message.toLowerCase().includes('format');
    
    if (isBeautificationRequest) {
      logOperation(requestId, 'CHAT_REDIRECT_BEAUTIFY', { 
        message: message.substring(0, 100) + (message.length > 100 ? '...' : '')
      });
      return res.status(400).json({ 
        error: 'For note beautification, use the /beautify endpoint instead',
        isBeautificationRequest: true
      });
    }
    
    logOperation(requestId, 'CHAT_PROCESSING_START', { 
      messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : '')
    });
    
    const startTime = Date.now();
    const response = await conversationFlow(message);
    const processingTime = Date.now() - startTime;
    
    logOperation(requestId, 'CHAT_PROCESSING_COMPLETE', { 
      processingTimeMs: processingTime,
      responsePreview: response.substring(0, 100) + (response.length > 100 ? '...' : '')
    });
    
    res.json({ response });
  } catch (error) {
    logOperation(requestId, 'CHAT_ERROR', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to process chat request', details: error.message });
  }
});

// Endpoint for note beautification
router.post('/beautify', upload.single('file'), async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    logOperation(requestId, 'BEAUTIFY_REQUEST_RECEIVED', { 
      body: req.body,
      file: req.file ? {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });
    
    // Get text from request body or file
    let text = req.body.text || '';
    let inputType = req.body.inputType || 'text';
    let fileBuffer = null;
    
    // If file was uploaded
    if (req.file) {
      const file = req.file;
      inputType = file.mimetype;
      fileBuffer = file.buffer;
      
      logOperation(requestId, 'BEAUTIFY_FILE_RECEIVED', {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });
      
      // Handle different file types
      if (file.mimetype.startsWith('text/')) {
        // For text files, convert buffer to string
        text = file.buffer.toString('utf8');
      }
    }
    
    if (!text && !fileBuffer) {
      logOperation(requestId, 'BEAUTIFY_VALIDATION_ERROR', { error: 'No content provided' });
      return res.status(400).json({ error: 'No content provided for beautification' });
    }
    
    // For text-only inputs with very short content, use a simple fallback
    if (!fileBuffer && text.length < 10) {
      logOperation(requestId, 'BEAUTIFY_TEXT_TOO_SHORT', { text });
      return res.json({ 
        summary: `Your input "${text}" is too short for detailed analysis.`,
        hasDiagrams: false,
        hasFlowcharts: false,
        fullOutput: {
          summary: `Your input "${text}" is too short for detailed analysis.`,
          concepts_diagram: [],
          diagram_prompts: [],
          concepts_flowcharts: [],
          flowcharts_prompt: []
        }
      });
    }
    
    logOperation(requestId, 'BEAUTIFY_PROCESSING_START', { 
      inputType,
      hasText: !!text,
      textLength: text?.length,
      hasFile: !!fileBuffer,
      fileSize: fileBuffer?.length
    });
    
    const startTime = Date.now();
    
    // Call the beautifier flow with the appropriate input
    const output = await noteBeautifierFlow({ 
      text, 
      inputType,
      fileBuffer: fileBuffer ? Buffer.from(fileBuffer).toString('base64') : null
    });
    
    const processingTime = Date.now() - startTime;
    
    logOperation(requestId, 'BEAUTIFY_PROCESSING_COMPLETE', {
      processingTimeMs: processingTime,
      summaryPreview: output.summary.substring(0, 100) + (output.summary.length > 100 ? '...' : ''),
      diagramCount: output.concepts_diagram.length,
      flowchartCount: output.concepts_flowcharts.length
    });
    
    res.json({ 
      summary: output.summary,
      hasDiagrams: output.concepts_diagram && output.concepts_diagram.length > 0,
      hasFlowcharts: output.concepts_flowcharts && output.concepts_flowcharts.length > 0,
      fullOutput: output
    });
  } catch (error) {
    logOperation(requestId, 'BEAUTIFY_ERROR', { 
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to process beautification request', 
      details: error.message 
    });
  }
});

module.exports = router;
