// Update the path to the .env file to correctly find it from the server directory
require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const aiRoutes = require('./routes/aiRoutes');
const requestLogger = require('./middleware/loggerMiddleware');

// Log environment variables for debugging (redact sensitive info)
console.log('Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY ? 'Set (value hidden)' : 'Not set',
  REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID ? 'Set' : 'Not set'
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Firebase Admin with production-ready error handling
try {
  let serviceAccount;
  try {
    serviceAccount = require('../serviceAccountKey.json');
  } catch (err) {
    console.error('Error loading serviceAccountKey.json:', err.message);
    throw new Error('Service account key file is missing or invalid');
  }
  
  // Validate service account has required fields
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Invalid service account configuration");
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET
  });
  
  console.log('Firebase Admin initialized successfully');
} catch (error) {
  console.error('Fatal: Firebase admin initialization failed:', error.message);
  process.exit(1);
}

// Get Firebase services
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger); // Add request logging middleware

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    environment: process.env.NODE_ENV || 'development',
    genaiApiKeyConfigured: !!process.env.GOOGLE_GENAI_API_KEY
  });
});

// AI routes
app.use('/api/ai', aiRoutes);

// Process API endpoint
app.post('/api/process', upload.single('file'), async (req, res) => {
  try {
    const { userId, text, fileUrl, fileName, fileType } = req.body;
    let inputContent = '';
    let inputType = '';
    
    if (req.file) {
      // Check if bucket is initialized
      if (!bucket) {
        return res.status(500).json({ error: 'Storage bucket not configured' });
      }
      
      // Handle uploaded file
      const file = req.file;
      inputType = file.mimetype;
      
      // Upload file to Firebase Storage
      const fileBuffer = file.buffer;
      const filePath = `uploads/${userId}/${Date.now()}_${file.originalname}`;
      const fileRef = bucket.file(filePath);
      
      await fileRef.save(fileBuffer, {
        metadata: { contentType: file.mimetype }
      });
      
      // Get public URL
      const [url] = await fileRef.getSignedUrl({
        action: 'read',
        expires: '03-01-2500' // Far future expiry
      });
      
      inputContent = url;
    } else if (fileUrl) {
      // Handle file URL from client
      inputContent = fileUrl;
      inputType = fileType || 'unknown';
    } else if (text) {
      // Handle text input
      inputContent = text;
      inputType = 'text/plain';
    } else {
      return res.status(400).json({ error: 'No input provided' });
    }
    
    // Store in Firestore with proper error handling
    const noteRef = await db.collection('processedNotes').add({
      userId,
      inputType,
      inputContent,
      status: 'processing',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Process asynchronously
    processInput(noteRef.id, inputType, inputContent)
      .catch(err => console.error(`Error processing note ${noteRef.id}:`, err));
    
    res.status(200).json({
      message: 'Processing started',
      noteId: noteRef.id,
      noteUrl: `${process.env.APP_URL || 'https://noteflow-dcb74.web.app'}/notes/${noteRef.id}.pdf`
    });
    
  } catch (error) {
    console.error('Error processing input:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mock processing function - in production, implement actual processing logic
async function processInput(noteId, type, content) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Update the document with completed status
  return await db.collection('processedNotes').doc(noteId).update({
    status: 'completed',
    noteUrl: `${process.env.APP_URL || 'https://noteflow-dcb74.web.app'}/notes/${noteId}.pdf`,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

// Error handling middleware with logging
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = req.requestId || 'unknown';
  
  console.error(`[${timestamp}] [${requestId}] ERROR:`, err);
  
  res.status(500).json({ 
    error: 'Server error', 
    message: err.message || 'An unexpected error occurred',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
