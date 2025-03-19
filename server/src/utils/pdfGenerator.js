const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a PDF document based on content structure
 * @param {Object} content - Content structure with text and images
 * @returns {Promise<Buffer>} - PDF document as buffer
 */
async function generatePDF(content) {
  try {
    console.log('Starting PDF generation');
    
    // Create a new PDFDocument
    const pdfDoc = await PDFDocument.create();
    
    // Add metadata
    pdfDoc.setTitle(content.title || 'NoteFlow Document');
    pdfDoc.setAuthor(content.author || 'NoteFlow');
    pdfDoc.setSubject(content.subject || 'AI-Generated Notes');
    pdfDoc.setKeywords(['notes', 'noteflow', 'ai-generated']);
    
    // Embed standard fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    // Set up page and content parameters
    const pageWidth = 612; // Letter size in points (8.5 x 11 inches)
    const pageHeight = 792;
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);
    
    // Add the first page
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    
    // Helper for adding text
    const addText = (text, font, size, color, indent = 0) => {
      // Split text for wrapping
      const words = text.split(' ');
      let line = '';
      
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const lineWidth = font.widthOfTextAtSize(testLine, size);
        
        if (lineWidth > contentWidth - indent || words[i].includes('\n')) {
          // Add current line and start a new one
          currentPage.drawText(line, {
            x: margin + indent,
            y,
            size,
            font,
            color
          });
          
          // Move to next line
          y -= size * 1.2;
          
          // Check if we need a new page
          if (y < margin) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
          }
          
          // Start new line (ignoring any leading spaces)
          line = words[i].endsWith('\n') 
            ? '' 
            : words[i] + ' ';
            
          // If the word contained a newline, handle that
          if (words[i].includes('\n')) {
            const parts = words[i].split('\n');
            parts.forEach((part, idx) => {
              if (idx > 0) {
                // For each new line after the first part
                y -= size * 1.2;
                
                // Check if we need a new page
                if (y < margin) {
                  currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
                  y = pageHeight - margin;
                }
              }
              
              if (part) {
                currentPage.drawText(part, {
                  x: margin + indent,
                  y,
                  size,
                  font,
                  color
                });
                
                // Move down for next line
                y -= size * 1.2;
                
                // Check if we need a new page
                if (y < margin) {
                  currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
                  y = pageHeight - margin;
                }
              }
            });
            
            line = '';
          }
        } else {
          line = testLine;
        }
      }
      
      // Draw any remaining text
      if (line.trim().length > 0) {
        currentPage.drawText(line, {
          x: margin + indent,
          y,
          size,
          font,
          color
        });
        y -= size * 1.2;
      }
      
      // Add some extra spacing after text blocks
      y -= size * 0.5;
      
      // Check if we need a new page
      if (y < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    };
    
    // Helper for adding images
    const addImage = async (imageBuffer, width = contentWidth) => {
      try {
        // Embed the image in the PDF
        const image = await pdfDoc.embedPng(imageBuffer);
        const dimensions = image.scale(width / image.width);
        
        // Check if image fits on current page
        if (y - dimensions.height < margin) {
          // Add a new page if it doesn't fit
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        
        // Center the image horizontally
        const x = margin + (contentWidth - dimensions.width) / 2;
        
        // Draw the image
        currentPage.drawImage(image, {
          x,
          y: y - dimensions.height,
          width: dimensions.width,
          height: dimensions.height
        });
        
        // Update position
        y -= (dimensions.height + 20); // Add some extra spacing
        
        // Check if we need a new page after image
        if (y < margin) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        
        return true;
      } catch (error) {
        console.error('Error embedding image in PDF:', error);
        return false;
      }
    };
    
    // Start with a title
    if (content.title) {
      addText(content.title, helveticaBold, 24, rgb(0, 0, 0));
      y -= 20; // Add extra space after title
    }
    
    // Process content sections
    for (const section of content.sections) {
      // Add section heading
      if (section.heading) {
        addText(section.heading, helveticaBold, 18, rgb(0, 0, 0));
      }
      
      // Add section text
      if (section.text) {
        addText(section.text, helveticaFont, 12, rgb(0, 0, 0));
      }
      
      // Add section image if available
      if (section.imageBuffer) {
        await addImage(section.imageBuffer);
      }
      
      // Add some space between sections
      y -= 20;
      
      // Check if we need a new page
      if (y < margin) {
        currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    }
    
    // Serialize the PDFDocument to bytes
    const pdfBytes = await pdfDoc.save();
    
    console.log(`PDF generated successfully, size: ${pdfBytes.byteLength} bytes`);
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
}

/**
 * Generate PDF from structured content including diagrams and flowcharts
 */
async function generateDocumentFromContent(noteData, diagrams = [], flowcharts = [], docStructure = null) {
  try {
    console.log('generateDocumentFromContent called with:', {
      hasDiagrams: diagrams.length > 0,
      hasFlowcharts: flowcharts.length > 0,
      hasDocStructure: !!docStructure
    });
    
    // If we have a document structure, use it for better formatting
    if (docStructure && docStructure.title && docStructure.sections) {
      console.log('Using AI-generated document structure for PDF');
      
      const content = {
        title: docStructure.title,
        sections: []
      };
      
      // Process each section in the document structure
      for (const section of docStructure.sections) {
        const newSection = {
          heading: section.heading || '',
          text: section.content || ''
        };
        
        // If section should include an image/diagram/flowchart
        if (section.includeImage) {
          // Look for a matching diagram or flowchart by checking section heading or caption
          const conceptName = section.heading || section.imageCaption || '';
          
          // First try to find a matching diagram
          let imageFound = false;
          for (let i = 0; i < diagrams.length; i++) {
            if (diagrams[i].buffer && noteData.concepts_diagram[i] && 
                conceptName.toLowerCase().includes(noteData.concepts_diagram[i].toLowerCase())) {
              newSection.imageBuffer = diagrams[i].buffer;
              newSection.imageCaption = section.imageCaption || noteData.concepts_diagram[i];
              imageFound = true;
              break;
            }
          }
          
          // If no diagram found, try flowcharts
          if (!imageFound) {
            for (let i = 0; i < flowcharts.length; i++) {
              if (flowcharts[i].buffer && flowcharts[i].name && 
                  conceptName.toLowerCase().includes(flowcharts[i].name.toLowerCase())) {
                newSection.imageBuffer = flowcharts[i].buffer;
                newSection.imageCaption = section.imageCaption || flowcharts[i].name;
                break;
              }
            }
          }
        }
        
        content.sections.push(newSection);
      }
      
      // Generate the PDF using the structured content
      return await generatePDF(content);
    } else {
      // Fall back to basic structure if AI document structure is not available
      console.log('Using basic document structure for PDF');
      
      // Prepare content structure for the PDF
      const content = {
        title: 'NoteFlow: AI-Generated Notes',
        sections: [
          {
            heading: 'Summary',
            text: noteData.summary
          }
        ]
      };
      
      // Add diagram sections if available
      if (diagrams && diagrams.length > 0) {
        console.log(`Adding ${diagrams.filter(d => d.buffer).length} diagrams to PDF`);
        for (let i = 0; i < diagrams.length; i++) {
          if (diagrams[i].buffer) {
            // Get the corresponding concept name
            const conceptName = noteData.concepts_diagram[i] || `Concept ${i+1}`;
            
            content.sections.push({
              heading: conceptName,
              imageBuffer: diagrams[i].buffer,
              imageCaption: conceptName
            });
          }
        }
      }
      
      // Add flowchart sections if available
      if (flowcharts && flowcharts.length > 0) {
        console.log(`Adding ${flowcharts.filter(f => f.buffer).length} flowcharts to PDF`);
        for (let i = 0; i < flowcharts.length; i++) {
          if (flowcharts[i].buffer) {
            content.sections.push({
              heading: flowcharts[i].name,
              imageBuffer: flowcharts[i].buffer,
              imageCaption: flowcharts[i].name
            });
          }
        }
      }
      
      // Get current timestamp for logging
      const timestamp = new Date().toISOString();
      
      // Generate the PDF
      const pdfBuffer = await generatePDF(content);
      
      // Verify buffer and log details
      if (!pdfBuffer || pdfBuffer.length === 0) {
        console.error(`[${timestamp}] PDF generation failed - buffer is empty or null`);
      } else {
        console.log(`[${timestamp}] PDF generated successfully: ${pdfBuffer.length} bytes, Buffer type: ${pdfBuffer.constructor.name}`);
        
        // Try to save a debug copy to verify the PDF is valid
        try {
          const tempFile = path.join(os.tmpdir(), `noteflow-debug-${Date.now()}.pdf`);
          await fs.writeFile(tempFile, pdfBuffer);
          console.log(`[${timestamp}] Debug PDF saved to: ${tempFile}`);
        } catch (debugError) {
          console.error(`[${timestamp}] Failed to save debug PDF:`, debugError);
        }
      }
      
      return pdfBuffer;
    }
  } catch (error) {
    console.error('Error generating document from content:', error);
    // Return a simple error PDF instead of failing completely
    try {
      const errorContent = {
        title: 'Error Generating PDF',
        sections: [
          {
            heading: 'Error Information',
            text: `An error occurred while generating this PDF: ${error.message}`
          },
          {
            heading: 'Content Summary',
            text: noteData.summary || 'No summary available'
          }
        ]
      };
      return await generatePDF(errorContent);
    } catch (secondaryError) {
      console.error('Failed to create error PDF:', secondaryError);
      throw error; // Throw the original error
    }
  }
}

module.exports = {
  generatePDF,
  generateDocumentFromContent
};
