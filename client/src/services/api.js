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
  
  beautify: async (text, inputType = 'text/plain', generatePdf = true) => {
    // Always generate PDF, keep the generatePdf parameter for backward compatibility
    console.log('API client - beautify - Always generating PDF');
    
    try {
      const response = await api.post('/ai/beautify', { 
        text, 
        inputType, 
        generatePdf: 'true' // Always true
      });
      
      // Log if PDF was received
      console.log('API client - beautify response - PDF included:', { 
        hasPdf: !!response.data.pdf,
        pdfDataLength: response.data.pdf ? response.data.pdf.length : 0
      });
      
      return response;
    } catch (error) {
      console.error('API client - beautify error:', error);
      throw error;
    }
  },
  
  beautifyWithFile: async (file, inputType = null, additionalText = '', generatePdf = true) => {
    // Always generate PDF, keep the generatePdf parameter for backward compatibility
    const formData = new FormData();
    formData.append('file', file);
    
    // Add file metadata
    formData.append('fileName', file.name);
    formData.append('fileType', file.type);
    
    // Add the additional text if provided
    if (additionalText && additionalText.trim()) {
      formData.append('text', additionalText);
    }
    
    // If we have input type
    if (inputType) {
      formData.append('inputType', inputType);
    }
    
    // Always set generatePdf to true
    console.log('API client - beautifyWithFile - Always generating PDF');
    formData.append('generatePdf', 'true');
    
    logger.debug('API', 'Uploading file with FormData', { 
      fileName: file.name, 
      fileSize: file.size, 
      fileType: file.type,
      hasAdditionalText: !!additionalText?.trim(),
      generatePdf: true
    });
    
    try {
      const response = await api.post('/ai/beautify', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Log if PDF was received
      console.log('API client - beautifyWithFile response - PDF included:', { 
        hasPdf: !!response.data.pdf,
        pdfDataLength: response.data.pdf ? response.data.pdf.length : 0
      });
      
      return response;
    } catch (error) {
      console.error('API client - beautifyWithFile error:', error);
      throw error;
    }
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
  },
  
  generateVisuals: async (diagramPrompts, flowchartPrompts, flowchartConcepts) => {
    return api.post('/ai/generate-visuals', { 
      diagramPrompts, 
      flowchartPrompts,
      flowchartConcepts 
    });
  },
  
  generatePdf: async (beautifiedOutput, diagrams, flowcharts) => {
    console.log('API client - generatePdf called with:', {
      hasDiagrams: diagrams?.length > 0,
      hasFlowcharts: flowcharts?.length > 0,
      diagramCount: diagrams?.length || 0,
      flowchartCount: flowcharts?.length || 0
    });
    
    try {
      // Consider optimizing large base64 image data to avoid payload size issues
      const optimizedDiagrams = diagrams?.map(diagram => {
        if (diagram.image && diagram.image.length > 200000) {
          console.log(`Large diagram detected (${(diagram.image.length/1024).toFixed(2)}KB), consider server-side optimization`);
        }
        return diagram;
      });
      
      const optimizedFlowcharts = flowcharts?.map(flowchart => {
        if (flowchart.image && flowchart.image.length > 200000) {
          console.log(`Large flowchart detected (${(flowchart.image.length/1024).toFixed(2)}KB), consider server-side optimization`);
        }
        return flowchart;
      });
      
      const response = await api.post('/ai/generate-pdf', {
        beautifiedOutput,
        diagrams: optimizedDiagrams || [],
        flowcharts: optimizedFlowcharts || []
      });
      
      // Log if PDF was received
      console.log('API client - generatePdf response - PDF included:', { 
        hasPdf: !!response.data.pdf,
        pdfSize: response.data.pdf ? response.data.pdf.length : 0
      });
      
      return response;
    } catch (error) {
      // Provide better feedback for payload errors
      if (error.response?.status === 413) {
        console.error('API client - generatePdf error: Payload too large', error.response?.data);
        throw new Error('The data is too large to process. Try reducing the number of visuals or their complexity.');
      }
      
      console.error('API client - generatePdf error:', error);
      throw error;
    }
  }
};

export default apiService;
