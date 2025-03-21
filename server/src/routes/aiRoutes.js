const express = require('express');
const { noteBeautifierFlow, conversationFlow, documentGenerationFlow } = require('../genkit/noteBeautifier');
const multer = require('multer');
const router = express.Router();
const { generateDocumentFromContent } = require('../utils/pdfGenerator');

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

// Endpoint for normal conversations
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Check if this is just a normal conversation or a note beautification request
    const isBeautificationRequest = message.toLowerCase().includes('beautify') || 
                                    message.toLowerCase().includes('structure') ||
                                    message.toLowerCase().includes('format');
    
    if (isBeautificationRequest) {
      return res.status(400).json({ 
        error: 'For note beautification, use the /beautify endpoint instead',
        isBeautificationRequest: true
      });
    }
    
    const response = await conversationFlow(message);
    
    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: 'Failed to process chat request', details: error.message });
  }
});

// Updated endpoint for note beautification with PDF generation
router.post('/beautify', upload.single('file'), async (req, res) => {
  try {
    // Get text from request body or file
    let text = req.body.text || '';
    let inputType = req.body.inputType || 'text';
    let fileBuffer = null;
    
    // If file was uploaded
    if (req.file) {
      const file = req.file;
      inputType = file.mimetype;
      fileBuffer = file.buffer;
      
      // Handle different file types
      if (file.mimetype.startsWith('text/') && !text) {
        // For text files, convert buffer to string only if no text was provided
        text = file.buffer.toString('utf8');
      }
    }
    
    // If we have neither usable text nor file content
    if (!text && !fileBuffer) {
      return res.status(400).json({ error: 'No content provided for beautification' });
    }
    
    // For text-only inputs with very short content, use a simple fallback
    if (!fileBuffer && text.length < 10) {
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
    
    // Call the beautifier flow with the appropriate input
    const output = await noteBeautifierFlow({ 
      text, 
      inputType,
      // Ensure fileBuffer is always a string, even if null
      fileBuffer: fileBuffer ? Buffer.from(fileBuffer).toString('base64') : ''
    });
    
    // Check if output summary suggests the content couldn't be properly analyzed
    const potentialProcessingIssue = 
      output.summary.toLowerCase().includes('blank') ||
      output.summary.toLowerCase().includes('empty') ||
      output.summary.toLowerCase().includes('cannot process') ||
      output.summary.toLowerCase().includes('unable to');
    
    // Fixed logic for checking generatePdf - always true
    // We're keeping the parameter for backward compatibility but always setting it to true
    const generatePdf = true;
    
    console.log('PDF Generation Decision: Always generating PDF');
    
    // Create the response without PDF initially
    const response = { 
      summary: output.summary,
      hasDiagrams: output.concepts_diagram && output.concepts_diagram.length > 0,
      hasFlowcharts: output.concepts_flowcharts && output.concepts_flowcharts.length > 0,
      fullOutput: output,
      potentialProcessingIssue,
      // Don't include PDF yet - just flag that it was requested
      pdfRequested: generatePdf
    };
    
    // Return the response without waiting for PDF generation
    res.json(response);
    
  } catch (error) {
    console.error('Beautification error:', error.message);
    res.status(500).json({ 
      error: 'Failed to process beautification request', 
      details: error.message 
    });
  }
});

// Add a new endpoint for generating PDF after visuals
router.post('/generate-pdf', async (req, res) => {
  try {
    const { beautifiedOutput, diagrams, flowcharts } = req.body;
    
    if (!beautifiedOutput) {
      return res.status(400).json({ error: 'No content provided for PDF generation' });
    }
    
    // Validate input objects to prevent undefined errors
    const validatedBeautifiedOutput = beautifiedOutput || {};
    const validatedDiagrams = Array.isArray(diagrams) ? diagrams : [];
    const validatedFlowcharts = Array.isArray(flowcharts) ? flowcharts : [];
    
    const diagramCount = validatedDiagrams.length;
    const flowchartCount = validatedFlowcharts.length;
    
    console.log('PDF Generation Request:', {
      hasDiagrams: diagramCount > 0,
      hasFlowcharts: flowchartCount > 0,
      diagramCount,
      flowchartCount,
      totalVisuals: diagramCount + flowchartCount
    });
    
    // Calculate approximate payload size for debugging
    const payloadSize = JSON.stringify(req.body).length;
    console.log(`Payload size: ${(payloadSize/1024/1024).toFixed(2)}MB`);
    
    console.log('PDF Generation Request:', {
      hasDiagrams: Array.isArray(diagrams) && diagrams.length > 0,
      hasFlowcharts: Array.isArray(flowcharts) && flowcharts.length > 0
    });
    
    try {
      // Import visualUtils
      const visualUtils = require('../utils/visualUtils');
      
      // Process diagrams and flowcharts with more robust error handling
      const processedDiagrams = [];
      const processedFlowcharts = [];
      
      // Process diagrams - convert base64 to buffers with validation
      if (Array.isArray(validatedDiagrams) && validatedDiagrams.length > 0) {
        console.log(`Processing ${validatedDiagrams.length} diagrams:`);
        for (let i = 0; i < validatedDiagrams.length; i++) {
          if (validatedDiagrams[i] && validatedDiagrams[i].image) {
            try {
              const imageBuffer = Buffer.from(validatedDiagrams[i].image, 'base64');
              console.log(`Diagram #${i+1}: Successfully created buffer (${imageBuffer.length} bytes)`);
              
              processedDiagrams.push({
                index: validatedDiagrams[i].index || 0,
                buffer: imageBuffer,
                prompt: validatedDiagrams[i].prompt || '',
                error: null
              });
            } catch (bufferError) {
              console.error(`Error processing diagram #${i+1} buffer:`, bufferError);
              processedDiagrams.push({
                index: validatedDiagrams[i].index || 0,
                buffer: null,
                error: `Invalid image data: ${bufferError.message}`
              });
            }
          } else if (validatedDiagrams[i] && validatedDiagrams[i].error) {
            console.log(`Diagram #${i+1}: Has error, no image data`);
            processedDiagrams.push({
              index: validatedDiagrams[i].index || 0,
              buffer: null,
              error: validatedDiagrams[i].error
            });
          }
        }
      }
      
      // Process flowcharts - convert base64 to buffers with validation
      if (Array.isArray(validatedFlowcharts) && validatedFlowcharts.length > 0) {
        console.log(`Processing ${validatedFlowcharts.length} flowcharts:`);
        for (let i = 0; i < validatedFlowcharts.length; i++) {
          if (validatedFlowcharts[i] && validatedFlowcharts[i].image) {
            try {
              // Ensure we're working with a clean base64 string
              let base64Data = validatedFlowcharts[i].image;
              
              // Handle potential prefix in base64 data
              if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
              }
              
              // Create buffer from base64
              const imageBuffer = Buffer.from(base64Data, 'base64');
              console.log(`Flowchart #${i+1} "${validatedFlowcharts[i].name}": Successfully created buffer (${imageBuffer.length} bytes)`);
              
              // Verify buffer has actual content
              if (imageBuffer.length > 100) {  // Arbitrary minimum size for a valid image
                processedFlowcharts.push({
                  index: validatedFlowcharts[i].index || 0,
                  name: validatedFlowcharts[i].name || `Flowchart ${i+1}`,
                  buffer: imageBuffer,
                  error: null
                });
              } else {
                console.warn(`Flowchart #${i+1} buffer too small (${imageBuffer.length} bytes), may be invalid`);
                processedFlowcharts.push({
                  index: validatedFlowcharts[i].index || 0,
                  name: validatedFlowcharts[i].name || `Flowchart ${i+1}`,
                  buffer: null,
                  error: "Buffer too small to be a valid image"
                });
              }
            } catch (bufferError) {
              console.error(`Error processing flowchart #${i+1} buffer:`, bufferError);
              processedFlowcharts.push({
                index: validatedFlowcharts[i].index || 0,
                name: validatedFlowcharts[i].name || 'Flowchart',
                buffer: null,
                error: `Invalid image data: ${bufferError.message}`
              });
            }
          } else if (validatedFlowcharts[i] && validatedFlowcharts[i].error) {
            console.log(`Flowchart #${i+1}: Has error, no image data`);
            processedFlowcharts.push({
              index: validatedFlowcharts[i].index || 0,
              name: validatedFlowcharts[i].name || 'Flowchart',
              buffer: null,
              error: validatedFlowcharts[i].error
            });
          }
        }
      }
      
      // Log processed visuals
      console.log(`Successfully processed ${processedDiagrams.filter(d => d.buffer).length}/${processedDiagrams.length} diagrams`);
      console.log(`Successfully processed ${processedFlowcharts.filter(f => f.buffer).length}/${processedFlowcharts.length} flowcharts`);
      
      // Create arrays with diagrams/prompts and flowcharts/code mapping
      const diagramsWithPrompts = [];
      if (Array.isArray(validatedDiagrams) && validatedDiagrams.length > 0) {
        for (let i = 0; i < validatedDiagrams.length; i++) {
          if (validatedDiagrams[i] && validatedDiagrams[i].image) {
            const conceptIndex = validatedDiagrams[i].index || 0;
            
            // Access safely with null checks
            const conceptsDiagram = validatedBeautifiedOutput.fullOutput?.concepts_diagram || [];
            const diagramPrompts = validatedBeautifiedOutput.fullOutput?.diagram_prompts || [];
            
            diagramsWithPrompts.push({
              index: i,
              concept: conceptsDiagram[conceptIndex] || `Concept ${i+1}`,
              prompt: diagramPrompts[conceptIndex] || ''
            });
          }
        }
      }
      
      const flowchartsWithCode = [];
      if (Array.isArray(validatedFlowcharts) && validatedFlowcharts.length > 0) {
        for (let i = 0; i < validatedFlowcharts.length; i++) {
          if (validatedFlowcharts[i] && validatedFlowcharts[i].image) {
            const conceptIndex = validatedFlowcharts[i].index || 0;
            
            // Access safely with null checks
            const flowchartsPrompt = validatedBeautifiedOutput.fullOutput?.flowcharts_prompt || [];
            
            flowchartsWithCode.push({
              index: i,
              name: validatedFlowcharts[i].name || `Flowchart ${i+1}`,
              code: flowchartsPrompt[conceptIndex] || ''
            });
          }
        }
      }
      
      // Generate document structure for better PDF formatting with error handling
      try {
        var docStructure = await documentGenerationFlow({
          userInput: validatedBeautifiedOutput.userInput || 'User input',
          beautifiedOutput: validatedBeautifiedOutput.fullOutput || validatedBeautifiedOutput,
          diagramCount: processedDiagrams.filter(d => d && !d.error && d.buffer).length,
          flowchartCount: processedFlowcharts.filter(f => f && !f.error && f.buffer).length,
          diagramsWithPrompts: diagramsWithPrompts,
          flowchartsWithCode: flowchartsWithCode
        });
        
        // Sanitize docStructure content to prevent encoding issues
        if (docStructure && docStructure.sections) {
          docStructure.sections = docStructure.sections.map(section => {
            // Safely handle content string - replace problematic newlines
            if (section.content) {
              section.content = section.content
                .replace(/\r\n/g, '\n')  // Normalize all newlines
                .replace(/\n{3,}/g, '\n\n');  // Remove excessive newlines
            }
            
            // Safely handle captions
            if (section.imageCaption) {
              section.imageCaption = section.imageCaption.replace(/[\r\n]+/g, ' ');
            }
            
            return section;
          });
        }
      } catch (structureError) {
        console.error("Error generating document structure:", structureError);
        docStructure = null;
      }
      
      // Generate PDF using the document structure and visual elements
      const pdfBuffer = await generateDocumentFromContent(
        validatedBeautifiedOutput, 
        processedDiagrams, 
        processedFlowcharts,
        docStructure
      );
      
      // Make sure to log success or failure
      if (pdfBuffer) {
        console.log(`PDF generated successfully: ${pdfBuffer.length} bytes`);
        
        // Return the PDF data along with the document title from docStructure
        res.json({
          pdf: pdfBuffer.toString('base64'),
          // Include the document title from docStructure if available
          documentTitle: docStructure?.title || validatedBeautifiedOutput?.fullOutput?.title || 'NoteFlow Document'
        });
      } else {
        console.error("PDF generation failed - no buffer returned");
        res.status(500).json({ error: 'Failed to generate PDF' });
      }
    } catch (pdfError) {
      console.error("Error generating PDF:", pdfError);
      res.status(500).json({ error: 'Error generating PDF', details: pdfError.message });
    }
  } catch (error) {
    console.error('Error in generate-pdf endpoint:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Generate visuals endpoint - simplified
router.post('/generate-visuals', async (req, res) => {
  try {
    const { diagramPrompts, flowchartPrompts, flowchartConcepts } = req.body;
    
    if ((!diagramPrompts || !diagramPrompts.length) && 
        (!flowchartPrompts || !flowchartPrompts.length)) {
      return res.status(400).json({ error: 'No prompts provided for visual generation' });
    }
    
    try {
      // Dynamic import to handle module not found gracefully
      const visualUtils = require('../utils/visualUtils');
      
      // Process diagrams and flowcharts in parallel
      const [diagramResults, flowchartResults] = await Promise.all([
        diagramPrompts?.length > 0 
          ? visualUtils.generateAllDiagrams(diagramPrompts).catch(err => {
              console.error("Error generating diagrams:", err);
              return diagramPrompts.map((_, idx) => ({
                index: idx,
                buffer: null,
                error: "Failed to generate diagram: " + err.message
              }));
            })
          : [],
        flowchartPrompts?.length > 0 
          ? visualUtils.generateAllFlowcharts(flowchartPrompts, flowchartConcepts || []).catch(err => {
              console.error("Error generating flowcharts:", err);
              return (flowchartPrompts || []).map((_, idx) => ({
                index: idx,
                name: (flowchartConcepts || [])[idx] || `Flowchart ${idx+1}`,
                buffer: null,
                error: "Failed to generate flowchart: " + err.message
              }));
            })
          : []
      ]);
      
      // Return the results as base64 encoded images
      const response = {
        diagrams: diagramResults.map(r => ({
          index: r.index,
          image: r.buffer ? r.buffer.toString('base64') : null,
          error: r.error
        })),
        flowcharts: flowchartResults.map(r => ({
          index: r.index,
          name: r.name,
          image: r.buffer ? r.buffer.toString('base64') : null,
          error: r.error
        }))
      };
      
      res.json(response);
    } catch (moduleError) {
      // Handle module loading errors gracefully
      console.error("Visual generation module error:", moduleError.message);
      
      // Send response with error info but don't fail the request
      res.json({
        diagrams: diagramPrompts?.map((_, idx) => ({
          index: idx,
          image: null,
          error: "Visualization module failed to load: " + moduleError.message
        })) || [],
        flowcharts: flowchartConcepts?.map((name, idx) => ({
          index: idx,
          name,
          image: null,
          error: "Visualization module failed to load: " + moduleError.message
        })) || []
      });
    }
  } catch (error) {
    console.error('Visual generation error:', error.message);
    res.status(500).json({
      error: 'Failed to generate visual elements',
      details: error.message
    });
  }
});

module.exports = router;
