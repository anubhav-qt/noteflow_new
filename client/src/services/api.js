import axios from 'axios';
import logger from '../utils/apiLogger';

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api'
});

// Add request interceptor for logging
api.interceptors.request.use(
  config => {
    config.metadata = { startTime: new Date() };
    config.requestId = logger.logApiRequest(config.url, config.method, config.data);
    return config;
  },
  error => {
    logger.error('API', 'Request error interceptor', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
api.interceptors.response.use(
  response => {
    const { config } = response;
    const endTime = new Date();
    const duration = endTime - config.metadata.startTime;
    
    logger.logApiResponse(
      config.requestId,
      config.url,
      config.method,
      response,
      duration
    );
    
    return response;
  },
  error => {
    if (error.config) {
      const { config } = error;
      const endTime = new Date();
      const duration = endTime - (config.metadata?.startTime || new Date());
      
      logger.logApiError(
        config.requestId || 'unknown',
        config.url,
        config.method,
        error
      );
    } else {
      logger.error('API', 'Response error interceptor', error);
    }
    
    return Promise.reject(error);
  }
);

// API service methods
const apiService = {
  health: async () => {
    return api.get('/health');
  },
  
  chat: async (message) => {
    return api.post('/ai/chat', { message });
  },
  
  beautify: async (text, inputType = 'text/plain') => {
    return api.post('/ai/beautify', { text, inputType });
  },
  
  beautifyWithFile: async (file, inputType = null) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add file metadata
    formData.append('fileName', file.name);
    formData.append('fileType', file.type);
    
    // If we have additional text input
    if (inputType) {
      formData.append('inputType', inputType);
    }
    
    logger.debug('API', 'Uploading file', { 
      fileName: file.name, 
      fileSize: file.size, 
      fileType: file.type 
    });
    
    return api.post('/ai/beautify', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  processFile: async (userId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId);
    
    return api.post('/process', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  processText: async (userId, text) => {
    return api.post('/process', { userId, text });
  }
};

export default apiService;
