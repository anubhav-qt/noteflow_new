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
    
    // Embed standard fonts - use only Helvetica fonts which are guaranteed to work
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    
    // Define fallback fonts - don't embed Times fonts which might be causing issues
    const bodyFont = helveticaFont;
    const boldFont = helveticaBold;
    const italicFont = helveticaOblique;
    
    // Set up page and content parameters
    const pageWidth = 612; // Letter size in points (8.5 x 11 inches)
    const pageHeight = 792;
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);
    
    // Add the first page
    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    
    // Helper for adding text
    const addText = (text, font, size, color, indent = 0, maxWidth = contentWidth - indent) => {
      if (!text) return; // Skip if text is empty
      
      // Use fallback font if the provided font is undefined
      const safeFont = font || bodyFont;
      
      // Ensure text is a string
      const safeText = String(text || '');
      
      // Sanitize text to handle problematic characters and ensure newlines are processed correctly
      // Replace any standalone \n with space+newline for better detection
      let sanitizedText = safeText.replace(/([^\r])\n/g, '$1 \n');
      
      // Replace any other characters that might cause encoding issues
      // This replacement uses standard ASCII characters that should be safe in any encoding
      sanitizedText = sanitizedText.replace(/[\u0080-\uFFFF]/g, (ch) => {
        // Replace non-ASCII characters with a standard ASCII equivalent if possible
        // or a question mark if no equivalent is available
        return ' ';
      });
      
      // Process text line by line - pre-split by newlines before word processing
      const paragraphs = sanitizedText.split('\n');
      
      for (let p = 0; p < paragraphs.length; p++) {
        const paragraph = paragraphs[p];
        
        // Skip empty paragraphs but still adding some spacing
        if (!paragraph.trim()) {
          y -= size * 0.5;
          continue;
        }
        
        // Split paragraph into words
        const words = paragraph.split(' ');
        let line = '';
        
        for (let i = 0; i < words.length; i++) {
          // Skip empty/whitespace-only words
          if (!words[i].trim()) continue;
          
          try {
            // Try to measure the width - if this fails due to encoding issues, replace problem chars
            const testLine = line + words[i] + ' ';
            
            // IMPORTANT FIX: Remove all problematic characters before measuring width
            const sanitizedTestLine = testLine.replace(/[\r\n\u0080-\uFFFF]/g, ' ');
            
            let lineWidth;
            try {
              lineWidth = safeFont.widthOfTextAtSize(sanitizedTestLine, size);
            } catch (measureError) {
              // If measurement still fails, use a very simple character-based approximation
              lineWidth = sanitizedTestLine.length * (size * 0.6);
              console.warn('Using character approximation for width measurement');
            }
            
            if (lineWidth > maxWidth) {
              // Add current line and start a new one
              try {
                currentPage.drawText(line, {
                  x: margin + indent,
                  y,
                  size,
                  font: safeFont,
                  color
                });
              } catch (drawError) {
                console.warn('Error drawing text, attempting to sanitize:', drawError.message);
                // If drawing fails, retry with heavily sanitized version
                const safeLine = line.replace(/[^\x20-\x7E]/g, '');
                currentPage.drawText(safeLine, {
                  x: margin + indent,
                  y,
                  size,
                  font: safeFont,
                  color
                });
              }
              
              // Move to next line
              y -= size * 1.2;
              
              // Check if we need a new page
              if (y < margin) {
                currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
                y = pageHeight - margin;
              }
              
              // Start new line
              line = words[i] + ' ';
            } else {
              line = testLine;
            }
          } catch (measureError) {
            console.warn('Error measuring text width, skipping problematic word:', words[i]);
            // If measuring fails, skip this word and continue
            continue;
          }
        }
        
        // Draw any remaining text in the last line
        if (line.trim().length > 0) {
          try {
            currentPage.drawText(line, {
              x: margin + indent,
              y,
              size,
              font: safeFont,
              color
            });
          } catch (drawError) {
            console.warn('Error drawing final line, attempting to sanitize:', drawError.message);
            // If drawing fails, retry with heavily sanitized version
            const safeLine = line.replace(/[^\x20-\x7E]/g, '');
            currentPage.drawText(safeLine, {
              x: margin + indent,
              y,
              size,
              font: safeFont,
              color
            });
          }
          
          y -= size * 1.2;
        }
        
        // Add paragraph spacing after each paragraph except the last one
        if (p < paragraphs.length - 1) {
          y -= size * 0.8; // Additional space between paragraphs
        }
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
    const addImage = async (imageBuffer, width = contentWidth, caption = null, isFlowchart = false) => {
      try {
        if (!imageBuffer) {
          console.warn('Skipping image - buffer is null or undefined');
          return null;
        }
        
        console.log(`Adding image: isFlowchart=${isFlowchart}, buffer size=${imageBuffer.length} bytes`);
        
        // Embed the image in the PDF
        let image;
        try {
          // Try PNG first
          image = await pdfDoc.embedPng(imageBuffer);
          console.log(`Successfully embedded PNG image: ${image.width}x${image.height}`);
        } catch (pngError) {
          console.error('Error embedding as PNG:', pngError.message);
          
          try {
            // Try JPEG if PNG fails
            image = await pdfDoc.embedJpg(imageBuffer);
            console.log(`Successfully embedded JPG image: ${image.width}x${image.height}`);
          } catch (jpgError) {
            console.error('Error embedding as JPG:', jpgError.message);
            return null;
          }
        }
        
        // Calculate dimensions based on image type
        let dimensions;
        if (isFlowchart) {
          // Flowcharts - standardize to max 80% width and 50% height of the page (reduced from 65%)
          const maxFlowchartWidth = contentWidth * 0.8;
          const maxFlowchartHeight = pageHeight * 0.5; // Changed from 0.65 to 0.5
          
          // Calculate scale factors for width and height
          const widthScale = maxFlowchartWidth / image.width;
          const heightScale = maxFlowchartHeight / image.height;
          
          // Use the smaller scale factor to ensure both constraints are met
          const scale = Math.min(widthScale, heightScale);
          
          // Only scale down, not up (if image is already smaller than limits)
          if (scale < 1) {
            dimensions = image.scale(scale);
            console.log(`Scaled down flowchart to ${dimensions.width.toFixed(1)}x${dimensions.height.toFixed(1)} (${(scale*100).toFixed(1)}% of original)`);
          } else {
            // If image is smaller than our limits, keep original size
            dimensions = { width: image.width, height: image.height };
            console.log(`Keeping original flowchart size: ${dimensions.width}x${dimensions.height} (already within limits)`);
          }
        } else {
          // Regular diagrams take 50% of content width (square aspect ratio)
          const diagramWidth = contentWidth * 0.5;
          // First scale to fit width
          let scaledWidth = diagramWidth;
          let scaledHeight = (image.height / image.width) * diagramWidth;
          
          // If resulting height is too large, scale to height instead
          const maxHeight = pageHeight * 0.4; // Maximum 40% of page height
          if (scaledHeight > maxHeight) {
            scaledHeight = maxHeight;
            scaledWidth = (image.width / image.height) * maxHeight;
          }
          
          dimensions = { width: scaledWidth, height: scaledHeight };
        }
        
        // Check if image fits on current page - use more space for caption
        const totalHeight = dimensions.height + (caption ? 45 : 20);
        if (y - totalHeight < margin) {
          // Add a new page if it doesn't fit
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        
        // Calculate x position based on image type
        let x;
        if (isFlowchart) {
          // Center flowcharts
          x = margin + (contentWidth - dimensions.width) / 2;
        } else {
          // Left-align diagrams
          x = margin;
        }
        
        // The top of the image should be at current y position
        const imageY = y;
        
        // Draw the image
        currentPage.drawImage(image, {
          x,
          y: imageY - dimensions.height,
          width: dimensions.width,
          height: dimensions.height
        });
        
        // Store the bottom position of the image for later use
        const imageBottom = imageY - dimensions.height;
        
        // Add caption if provided
        if (caption) {
          const captionY = imageBottom - 25; // More space before caption
          const captionWidth = dimensions.width;
          const captionX = x;
          
          currentPage.drawText('Figure: ' + caption, {
            x: captionX,
            y: captionY,
            size: 10,
            font: italicFont,
            color: rgb(0.3, 0.3, 0.3),
            maxWidth: captionWidth,
            lineHeight: 12
          });
          
          // Update y position after caption - add more space (especially for flowcharts)
          y = captionY - (isFlowchart ? 50 : 35); // Increased space after flowchart captions
        } else {
          // Update y position without caption
          y = imageBottom - 25; // Increased space after image
        }
        
        // Check if we need a new page after image
        if (y < margin) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        
        // Return information about the image placement
        return { 
          width: dimensions.width, 
          height: dimensions.height, 
          x, 
          y: imageY, // Return the top position where image started
          bottom: y  // Return the current bottom position after accounting for the caption
        };
      } catch (error) {
        console.error('Error embedding image in PDF:', error);
        return null;
      }
    };
    
    // Start with a title
    if (content.title) {
      addText(content.title, boldFont, 24, rgb(0, 0, 0));
      y -= 30; // Add extra space after title
    }
    
    // Process content sections
    for (const section of content.sections) {
      // Add section heading
      if (section.heading) {
        addText(section.heading, boldFont, 18, rgb(0, 0, 0));
        y -= 10; // Reduced space after heading
      }
      
      // Handle based on layout type
      if (section.layout === 'text-with-image' && section.imageBuffer) {
        if (section.isFlowchart) {
          // For flowcharts: Text first, then flowchart, then caption
          console.log(`Rendering flowchart section: "${section.heading}"`);
          
          // Add text above the flowchart
          if (section.text) {
            addText(section.text, bodyFont, 12, rgb(0, 0, 0));
            y -= 20; // More space between text and flowchart
          }
          
          // Add flowchart
          if (section.imageBuffer && section.imageBuffer.length > 0) {
            console.log(`Adding flowchart image with buffer size: ${section.imageBuffer.length} bytes`);
            await addImage(section.imageBuffer, contentWidth * 0.85, section.imageCaption, true);
            // Add extra space after flowcharts to prevent overlap with next heading
            y -= 15; // Additional spacing specifically after flowcharts
          } else {
            console.warn(`Missing image buffer for flowchart section: "${section.heading}"`);
            // Add placeholder text indicating the flowchart couldn't be rendered
            addText("(Flowchart visualization unavailable)", italicFont, 12, rgb(0.6, 0, 0));
            y -= 20;
          }
          
        } else {
          // For regular diagrams: Side-by-side layout
          if (section.text) {
            // Get remaining height on current page
            const remainingHeight = y - margin;
            
            // If not enough space, start a new page
            if (remainingHeight < 250) { // Increased minimum space needed for side-by-side layout
              currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
              y = pageHeight - margin;
            }
            
            // Add image to left side (will return position and dimensions)
            const imageResult = await addImage(section.imageBuffer, contentWidth * 0.45, section.imageCaption, false); // Slightly smaller image
            
            if (imageResult) {
              // Calculate text width for side-by-side portion (right side of page)
              const textWidth = contentWidth - imageResult.width - 30; // More spacing between image and text (30pt)
              const textX = imageResult.x + imageResult.width + 30;
              
              // Store the bottom position of the image for layout decisions
              const imageBottom = imageResult.bottom;
              
              // *** IMPORTANT: Use the image's top position (not the page top) for text alignment ***
              let textY = imageResult.y; // Start text at the same level as the top of the image
              
              // Split text for wrapping
              const words = section.text.split(' ');
              let line = '';
              let i = 0;
              let isTextLongerThanImage = false;
              
              // First phase: Render text beside the image until we reach image bottom
              while (i < words.length) {
                // IMPORTANT FIX: Remove potential problematic characters before text measurement
                const safeWord = words[i].replace(/[\r\n\u0080-\uFFFF]/g, ' ');
                const testLine = (line + safeWord + ' ').replace(/[\r\n\u0080-\uFFFF]/g, ' ');
                
                let lineWidth;
                try {
                  lineWidth = bodyFont.widthOfTextAtSize(testLine, 12);
                } catch (measureError) {
                  // Fallback to character-based approximation
                  lineWidth = testLine.length * 7; // Rough approximation
                }
                
                if (lineWidth > textWidth || words[i].includes('\n')) {
                  // Add current line
                  currentPage.drawText(line, {
                    x: textX,
                    y: textY,
                    size: 12,
                    font: bodyFont,
                    color: rgb(0, 0, 0)
                  });
                  
                  // Move down for next line
                  textY -= 18; // Slightly increased line spacing
                  
                  // Check if we've reached the bottom of the image
                  if (textY < imageBottom) {
                    isTextLongerThanImage = true;
                    break; // Exit the loop to switch to full-width rendering
                  }
                  
                  // Start new line (ignoring leading spaces)
                  line = words[i].endsWith('\n') ? '' : words[i] + ' ';
                  
                  // Handle explicit newlines
                  if (words[i].includes('\n')) {
                    const parts = words[i].split('\n');
                    let partIndex = 0;
                    
                    while (partIndex < parts.length) {
                      if (partIndex > 0) {
                        // For each new line after the first part
                        textY -= 18; // Consistent line spacing
                        
                        // Check if we've reached the bottom of the image
                        if (textY < imageBottom) {
                          isTextLongerThanImage = true;
                          break; // Exit the loop to switch to full-width rendering
                        }
                      }
                      
                      if (parts[partIndex]) {
                        currentPage.drawText(parts[partIndex], {
                          x: textX,
                          y: textY,
                          size: 12,
                          font: bodyFont,
                          color: rgb(0, 0, 0)
                        });
                        textY -= 18;
                        
                        // Check if we've reached the bottom of the image
                        if (textY < imageBottom) {
                          isTextLongerThanImage = true;
                          break; // Exit the loop to switch to full-width rendering
                        }
                      }
                      
                      partIndex++;
                    }
                    
                    // If we exited the inner loop due to reaching image bottom, also exit the outer loop
                    if (isTextLongerThanImage) break;
                    
                    line = '';
                  }
                  
                  i++;
                } else {
                  line = testLine;
                  i++;
                }
              }
              
              // Draw any remaining text from the first phase
              if (line.trim().length > 0 && !isTextLongerThanImage) {
                currentPage.drawText(line, {
                  x: textX,
                  y: textY,
                  size: 12,
                  font: bodyFont,
                  color: rgb(0, 0, 0)
                });
                textY -= 18;
              }
              
              // Second phase: If text extends beyond image height, continue with full width
              if (isTextLongerThanImage) {
                // Add some space after image before continuing with full-width text
                y = imageBottom - 25;
                
                // Draw any remaining text from the previous phase first
                if (line.trim().length > 0) {
                  // Use the full content width for this line (not margin to margin)
                  // This fixes the blank space issue by ensuring consistent text width
                  currentPage.drawText(line, {
                    x: margin, // Full width now, starting from left margin
                    y: y,
                    size: 12,
                    font: bodyFont,
                    color: rgb(0, 0, 0)
                  });
                  y -= 18;
                }
                
                // Continue with the remaining words, now at full width
                line = '';
                while (i < words.length) {
                  const testLine = line + words[i] + ' ';
                  const lineWidth = bodyFont.widthOfTextAtSize(testLine, 12);
                  
                  if (lineWidth > contentWidth || words[i].includes('\n')) {
                    // Add current line
                    try {
                      currentPage.drawText(line, {
                        x: margin,
                        y,
                        size: 12,
                        font: bodyFont,
                        color: rgb(0, 0, 0)
                      });
                    } catch (drawError) {
                      console.warn('Error drawing text, attempting to sanitize:', drawError.message);
                      const safeLine = line.replace(/[^\x20-\x7E]/g, '');
                      currentPage.drawText(safeLine, {
                        x: margin,
                        y,
                        size: 12,
                        font: bodyFont,
                        color: rgb(0, 0, 0)
                      });
                    }
                    
                    // Move down for next line
                    y -= 18;
                    
                    // Check if we need a new page
                    if (y < margin) {
                      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
                      y = pageHeight - margin;
                    }
                    
                    // Handle explicit newlines and new line setup
                    if (words[i].includes('\n')) {
                      const parts = words[i].split('\n');
                      for (let j = 0; j < parts.length; j++) {
                        if (j > 0) {
                          y -= 18;
                          if (y < margin) {
                            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
                            y = pageHeight - margin;
                          }
                        }
                        
                        if (parts[j]) {
                          try {
                            currentPage.drawText(parts[j], {
                              x: margin,
                              y,
                              size: 12,
                              font: bodyFont,
                              color: rgb(0, 0, 0)
                            });
                          } catch (drawError) {
                            console.warn('Error drawing text, attempting to sanitize:', drawError.message);
                            const safePart = parts[j].replace(/[^\x20-\x7E]/g, '');
                            currentPage.drawText(safePart, {
                              x: margin,
                              y,
                              size: 12,
                              font: bodyFont,
                              color: rgb(0, 0, 0)
                            });
                          }
                          y -= 18;
                          
                          if (y < margin) {
                            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
                            y = pageHeight - margin;
                          }
                        }
                      }
                      line = '';
                    } else {
                      line = words[i].endsWith('\n') ? '' : words[i] + ' ';
                    }
                    
                    i++;
                  } else {
                    line = testLine;
                    i++;
                  }
                }
                
                // Draw any remaining text in the last line
                if (line.trim().length > 0) {
                  try {
                    currentPage.drawText(line, {
                      x: margin,
                      y,
                      size: 12,
                      font: bodyFont,
                      color: rgb(0, 0, 0)
                    });
                  } catch (drawError) {
                    console.warn('Error drawing final line, attempting to sanitize:', drawError.message);
                    const safeLine = line.replace(/[^\x20-\x7E]/g, '');
                    currentPage.drawText(safeLine, {
                      x: margin,
                      y,
                      size: 12,
                      font: bodyFont,
                      color: rgb(0, 0, 0)
                    });
                  }
                  y -= 18;
                }
              } else {
                // If text was shorter than image, use the lower of the two positions
                y = Math.min(textY, imageBottom);
              }
            }
          } else {
            // No text, just add the image centered
            await addImage(section.imageBuffer, contentWidth * 0.7, section.imageCaption, false);
          }
        }
      } else {
        // Standard text-only section
        if (section.text) {
          addText(section.text, bodyFont, 12, rgb(0, 0, 0));
        }
      }
      
      // Add increased space between sections
      // Add extra space if the previous section was a flowchart
      y -= section.isFlowchart ? 45 : 35; // More space after flowchart sections
      
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
      hasDiagrams: diagrams?.length > 0,
      hasFlowcharts: flowcharts?.length > 0,
      hasDocStructure: !!docStructure,
      diagramCount: diagrams?.length || 0,
      flowchartCount: flowcharts?.length || 0
    });
    
    // Simple deep copy to prevent reference issues - don't need all the tracking complexity
    const diagramsCopy = diagrams.map(d => ({
      ...d,
      buffer: d.buffer ? Buffer.from(d.buffer) : null
    }));
    
    const flowchartsCopy = flowcharts.map(f => ({
      ...f,
      buffer: f.buffer ? Buffer.from(f.buffer) : null
    }));
    
    // Basic logging of available visuals
    console.log(`Available visuals: ${diagramsCopy.filter(d => d.buffer).length} diagrams, ${flowchartsCopy.filter(f => f.buffer).length} flowcharts`);
    
    // Access the actual data from fullOutput if available
    const fullOutput = noteData?.fullOutput || noteData || {};
    
    // If we have a document structure, use it for better formatting
    if (docStructure && docStructure.title && docStructure.sections) {
      console.log('Using AI-generated document structure for PDF');
      
      const content = {
        title: docStructure.title,
        sections: []
      };
      
      // Keep track of which visuals we've used
      const usedVisuals = new Set();
      
      // Process each section in the document structure
      for (const section of docStructure.sections) {
        const newSection = {
          heading: section.heading || '',
          text: section.content || '',
          layout: section.includeImage ? 'text-with-image' : 'text-only',
          imageCaption: section.imageCaption || '',
          imageBuffer: null,
          isFlowchart: false
        };
        
        // If section should include an image/diagram/flowchart
        if (section.includeImage) {
          let visualAssigned = false;
          console.log(`Looking for visual for section: "${section.heading}"`);
          
          // Log available flowcharts for debugging
          if (Array.isArray(flowchartsCopy) && flowchartsCopy.length > 0) {
            console.log('Available flowcharts:');
            flowchartsCopy.forEach((f, idx) => {
              if (!usedVisuals.has(`flow-${idx}`)) {
                console.log(`  - Flowchart #${idx}: "${f.name}" (${f.buffer ? 'has buffer' : 'no buffer'})`);
              }
            });
          }
          
          // First, check if there's a matching flowchart based on name/caption
          if (Array.isArray(flowchartsCopy) && flowchartsCopy.length > 0) {
            // First try exact matches, then partial matches
            const sectionName = (section.heading || '').toLowerCase();
            const sectionCaption = (section.imageCaption || '').toLowerCase();
            
            // Try matching with different strategies, in order of precision
            const matchStrategies = [
              // Direct name match (most precise)
              (flowchartName) => sectionName === flowchartName,
              // Section name contains flowchart name
              (flowchartName) => sectionName.includes(flowchartName) && flowchartName.length > 3,
              // Flowchart name contains section name
              (flowchartName) => flowchartName.includes(sectionName) && sectionName.length > 3,
              // Caption contains flowchart name
              (flowchartName) => sectionCaption.includes(flowchartName) && flowchartName.length > 3,
              // Keywords match (least precise)
              (flowchartName) => {
                const keywords = ['process', 'flow', 'algorithm', 'procedure', 'workflow', 'sequence', 'steps'];
                return keywords.some(kw => sectionName.includes(kw) && flowchartName.includes(kw));
              }
            ];
            
            // Try each strategy until we find a match
            for (const matchFn of matchStrategies) {
              if (visualAssigned) break;
              
              for (let i = 0; i < flowchartsCopy.length; i++) {
                if (!flowchartsCopy[i]?.buffer || usedVisuals.has(`flow-${i}`)) continue;
                
                const flowchartName = (flowchartsCopy[i].name || '').toLowerCase();
                
                if (matchFn(flowchartName)) {
                  // Make a copy of the buffer to prevent reference issues
                  newSection.imageBuffer = Buffer.from(flowchartsCopy[i].buffer);
                  newSection.imageCaption = section.imageCaption || flowchartsCopy[i].name;
                  newSection.isFlowchart = true;
                  usedVisuals.add(`flow-${i}`);
                  visualAssigned = true;
                  console.log(`Assigned flowchart "${flowchartsCopy[i].name}" to section "${section.heading}"`);
                  break;
                }
              }
            }
          }
          
          // If no flowchart assigned, check for a matching diagram
          if (!visualAssigned && Array.isArray(diagramsCopy) && diagramsCopy.length > 0) {
            for (let d = 0; d < diagramsCopy.length; d++) {
              if (!diagramsCopy[d]?.buffer || usedVisuals.has(`diagram-${d}`)) continue;
              
              // Get concept name for matching
              let conceptName = '';
              try {
                // Fix: use d instead of undefined i
                conceptName = ((fullOutput.concepts_diagram || [])[d] || '').toLowerCase();
              } catch (err) {
                conceptName = `concept-${d}`;
              }
              
              const sectionName = (section.heading || '').toLowerCase();
              
              // Look for clear matches between section heading and concept name
              if (conceptName && (
                  sectionName.includes(conceptName) || 
                  conceptName.includes(sectionName) ||
                  (section.imageCaption && section.imageCaption.toLowerCase().includes(conceptName))
              )) {
                newSection.imageBuffer = Buffer.from(diagramsCopy[d].buffer);
                newSection.imageCaption = section.imageCaption || conceptName;
                newSection.isFlowchart = false;
                usedVisuals.add(`diagram-${d}`);
                visualAssigned = true;
                console.log(`Assigned diagram "${conceptName}" to section "${section.heading}"`);
                break;
              }
            }
          }
          
          // If still no visual assigned, assign ANY available flowchart or diagram
          if (!visualAssigned) {
            // First try ANY unassigned flowchart
            if (Array.isArray(flowchartsCopy)) {
              for (let i = 0; i < flowchartsCopy.length; i++) {
                if (flowchartsCopy[i]?.buffer && !usedVisuals.has(`flow-${i}`)) {
                  newSection.imageBuffer = Buffer.from(flowchartsCopy[i].buffer);
                  newSection.imageCaption = section.imageCaption || flowchartsCopy[i].name || 'Flowchart';
                  newSection.isFlowchart = true;
                  usedVisuals.add(`flow-${i}`);
                  console.log(`Assigned unused flowchart "${flowchartsCopy[i].name}" to section "${section.heading}"`);
                  visualAssigned = true;
                  break;
                }
              }
            }
            
            // Then try ANY unassigned diagram
            if (!visualAssigned && Array.isArray(diagramsCopy)) {
              for (let i = 0; i < diagramsCopy.length; i++) {
                if (diagramsCopy[i]?.buffer && !usedVisuals.has(`diagram-${i}`)) {
                  let conceptName = '';
                  try {
                    conceptName = fullOutput.concepts_diagram?.[i] || `Diagram ${i+1}`;
                  } catch (err) {
                    conceptName = `Diagram ${i+1}`;
                  }
                  
                  newSection.imageBuffer = Buffer.from(diagramsCopy[i].buffer);
                  newSection.imageCaption = section.imageCaption || conceptName;
                  newSection.isFlowchart = false;
                  usedVisuals.add(`diagram-${i}`);
                  console.log(`Using available diagram for section "${section.heading}"`);
                  visualAssigned = true;
                  break;
                }
              }
            }
          }
          
          // Log if no image was assigned despite being requested
          if (!visualAssigned) {
            console.log(`Section "${section.heading}" requested an image but none was available`);
          }
        }
        
        content.sections.push(newSection);
      }
      
      // After processing all sections, add any remaining unassigned flowcharts as new sections
      if (Array.isArray(flowchartsCopy)) {
        let unassignedCount = 0;
        for (let i = 0; i < flowchartsCopy.length; i++) {
          if (flowchartsCopy[i]?.buffer && !usedVisuals.has(`flow-${i}`)) {
            unassignedCount++;
            console.log(`Adding unassigned flowchart #${i} "${flowchartsCopy[i].name}" as a new section`);
            content.sections.push({
              heading: `${flowchartsCopy[i].name || 'Process Workflow'} ${unassignedCount}`,
              text: `This flowchart illustrates ${flowchartsCopy[i].name || 'a process workflow'}.`,
              layout: 'text-with-image',
              imageCaption: flowchartsCopy[i].name || `Flowchart ${i+1}`,
              imageBuffer: Buffer.from(flowchartsCopy[i].buffer),
              isFlowchart: true
            });
            usedVisuals.add(`flow-${i}`);
          }
        }
        
        if (unassignedCount > 0) {
          console.log(`Added ${unassignedCount} unassigned flowcharts as new sections`);
        }
      }
      
      // No need for the "Additional Flowcharts" section - the AI should generate prompts only for needed flowcharts
      
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
            text: fullOutput.summary || noteData.summary || 'No summary available'
          }
        ]
      };
      
      // Add diagram sections if available
      if (diagrams && diagrams.length > 0) {
        console.log(`Adding ${diagrams.filter(d => d.buffer).length} diagrams to PDF`);
        for (let i = 0; i < diagrams.length; i++) {
          if (diagrams[i].buffer) {
            // Get the corresponding concept name safely
            const conceptName = fullOutput.concepts_diagram?.[i] || `Concept ${i+1}`;
            
            content.sections.push({
              heading: conceptName,
              imageBuffer: diagrams[i].buffer,
              imageCaption: conceptName,
              layout: 'text-with-image',
              isFlowchart: false
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
              imageCaption: flowcharts[i].name,
              layout: 'text-with-image',
              isFlowchart: true
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
    
    // If we get a specific encoding issue with newlines, attempt recovery
    if (error.message && (
        error.message.includes("WinAnsi cannot encode") || 
        error.message.includes("0x000a")
    )) {
      console.log("Detected text encoding issue, attempting recovery with simplified content");
      
      try {
        // Create simplified content that avoids complex text handling
        const simplifiedContent = {
          title: "PDF Document (Simplified Version)",
          sections: [
            {
              heading: "Note Summary",
              text: "The original note content contained characters that couldn't be properly encoded. This is a simplified version.",
              layout: "text-only"
            }
          ]
        };
        
        // Add a basic summary if available
        const summary = noteData?.fullOutput?.summary || noteData?.summary;
        if (summary) {
          const safeSummary = String(summary)
            .replace(/[\r\n]+/g, ' ')  // Replace all newlines with spaces
            .replace(/[^\x20-\x7E]/g, ' '); // Replace all non-ASCII chars
            
          simplifiedContent.sections.push({
            heading: "Content Summary",
            text: safeSummary,
            layout: "text-only"
          });
        }
        
        // Try to include diagrams and flowcharts without text
        if (diagrams && diagrams.length > 0) {
          for (let i = 0; i < diagrams.length; i++) {
            if (diagrams[i].buffer) {
              simplifiedContent.sections.push({
                heading: `Diagram ${i+1}`,
                text: "",
                imageBuffer: diagrams[i].buffer,
                layout: "text-with-image",
                imageCaption: `Diagram ${i+1}`,
                isFlowchart: false
              });
            }
          }
        }
        
        if (flowcharts && flowcharts.length > 0) {
          for (let i = 0; i < flowcharts.length; i++) {
            if (flowcharts[i].buffer) {
              simplifiedContent.sections.push({
                heading: `Flowchart ${i+1}`,
                text: "",
                imageBuffer: flowcharts[i].buffer,
                layout: "text-with-image",
                imageCaption: flowcharts[i].name || `Flowchart ${i+1}`,
                isFlowchart: true
              });
            }
          }
        }
        
        return await generatePDF(simplifiedContent);
      } catch (recoveryError) {
        console.error("Recovery attempt failed:", recoveryError);
        // Fall through to basic error PDF
      }
    }
    
    // Return a simple error PDF instead of failing completely
    try {
      // Sanitize error message to avoid encoding issues
      const safeErrorMessage = error.message ? 
        error.message.replace(/[\u0080-\uFFFF\n\r]/g, ' ') : 
        'Unknown error';
        
      const summaryText = noteData?.fullOutput?.summary || noteData?.summary || 'No summary available';
      // Sanitize summary text to avoid encoding issues
      const safeSummaryText = summaryText.replace(/[\u0080-\uFFFF\n\r]/g, ' ');
      
      const errorContent = {
        title: 'Error Generating PDF',
        sections: [
          {
            heading: 'Error Information',
            text: `An error occurred while generating this PDF: ${safeErrorMessage}`
          },
          {
            heading: 'Content Summary',
            text: safeSummaryText
          }
        ]
      };
      return await generatePDF(errorContent);
    } catch (secondaryError) {
      console.error('Failed to create error PDF:', secondaryError);
      
      // Last resort: create an extremely basic PDF with no custom fonts or images
      try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        
        // Use the default font which is guaranteed to work
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        page.drawText('Error Generating PDF', {
          x: 50,
          y: height - 100,
          size: 24,
          font
        });
        
        page.drawText(`Error: ${error.message}`, {
          x: 50,
          y: height - 150,
          size: 12,
          font
        });
        
        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);
      } catch (lastError) {
        console.error('Critical PDF generation failure:', lastError);
        throw error; // If even this fails, throw the original error
      }
    }
  }
}

module.exports = {
  generatePDF,
  generateDocumentFromContent
};
