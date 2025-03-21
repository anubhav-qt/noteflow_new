const { genkit } = require('genkit');
const { gemini20Flash, googleAI } = require('@genkit-ai/googleai');
const { z } = require('genkit');

// Helper function for detailed logging
const logAI = (operation, data) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [GENKIT] [${operation}]`, JSON.stringify(data, null, 2));
};

// Get API key from environment variables
const apiKey = process.env.GOOGLE_GENAI_API_KEY;

if (!apiKey) {
  console.error('GOOGLE_GENAI_API_KEY environment variable is not set');
  process.exit(1);
}

// Initialize Genkit with the Google AI plugin and Gemini model
logAI('INIT', { model: 'gemini20Flash' });
const ai = genkit({
  plugins: [googleAI({
    apiKey: apiKey
  })],
  model: gemini20Flash,
});

// Schema for the structured output from note beautification
const NoteBeautifierSchema = z.object({
  summary: z.string().describe("Concise and clear summary of the entire input"),
  concepts_diagram: z.array(z.string()).describe("List of concepts that would be easier to understand with a diagram"),
  diagram_prompts: z.array(z.string()).describe("For each concept above, generate a DALLE image generation prompt"),
  concepts_flowcharts: z.array(z.string()).describe("List of concepts that are better represented using a flowchart"),
  flowcharts_prompt: z.array(z.string()).describe("For each concept above, generate valid mermaid.js code that can be directly used to create a flowchart. Always start with 'flowchart TD' or another valid mermaid diagram type. IMPORTANT: Avoid using special characters like parentheses in node text - they must be escaped. If using parentheses or special symbols in text, use double quotes around the entire label text. Example: A[\"Matrix (U, V)\"] not A[Matrix (U, V)]. All nodes must be properly defined with valid syntax.")
});

// The note beautifier flow
const noteBeautifierFlow = ai.defineFlow(
  {
    name: 'noteBeautifierFlow',
    inputSchema: z.object({
      text: z.string().optional().default(''),
      inputType: z.string(),
      fileBuffer: z.string().optional().default('')  // Change to default to empty string
    }),
    outputSchema: NoteBeautifierSchema,
  },
  async ({ text, inputType, fileBuffer }) => {
    try {
      const flowId = `flow-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      logAI('BEAUTIFIER_FLOW_START', {
        flowId,
        inputType,
        hasText: !!text,
        textLength: text?.length,
        hasFileBuffer: !!fileBuffer && fileBuffer !== '',
        fileBufferLength: fileBuffer?.length || 0
      });
      
      const startTime = Date.now();
      
      // Prepare different prompt based on input type
      let systemPrompt = `You are an advanced Note Beautification System designed to transform raw input into well-structured notes.`;
      let userPrompt = "";
      
      // Check if the file is potentially empty or blank
      const isFileBufferEmpty = !fileBuffer || fileBuffer === '' || fileBuffer.length < 100; // Arbitrary small size check
      
      // Build the prompt based on input type
      if (fileBuffer && fileBuffer !== '' && !isFileBufferEmpty) {
        // If we have a non-empty file buffer
        if (inputType.startsWith('image/')) {
          systemPrompt += `\n\nFor images: First describe what you see in the image in detail. If the image appears blank or contains no meaningful content, explicitly state this fact and do NOT make up content that isn't there. Be honest about what you can and cannot see.`;
          userPrompt = `This input is an image of type: ${inputType}. Please analyze this image carefully and provide structured notes based on what you actually see. If the image is blank, corrupted, or you cannot make out clear content, please explicitly state that.`;
        } else if (inputType.startsWith('audio/')) {
          userPrompt = `This input is an audio file of type: ${inputType}. Please analyze this audio content and provide structured notes. If you cannot process the audio data, please state this explicitly.`;
        } else if (inputType.startsWith('video/')) {
          userPrompt = `This input is a video file of type: ${inputType}. Please analyze this video content and provide structured notes. If you cannot process the video data, please state this explicitly.`;
        } else if (inputType === 'application/pdf') {
          systemPrompt += `\n\nFor PDFs: First describe what you see in the PDF in detail. If the PDF appears blank or contains no meaningful content, explicitly state this fact and do NOT make up content that isn't there. Be honest about what you can and cannot see.`;
          userPrompt = `This input is a PDF document. Please analyze the PDF content carefully and provide structured notes based on what you actually see. If the PDF is blank, corrupted, or you cannot extract clear content, please explicitly state that.`;
        } else {
          // For any other file types
          userPrompt = `This input is a file of type: ${inputType}. Please analyze its content and provide structured notes. If you cannot process this file type or if the file appears empty/corrupted, please state this explicitly.`;
        }
      } else if (text && text.trim().length > 0) {
        // For plain text input
        userPrompt = `This input is text content of type: ${inputType}. Please analyze and structure the following content:\n\n${text}`;
      } else {
        // Handle the case where both file is empty and text is empty/not provided
        userPrompt = `No meaningful content was provided. The file appears to be empty or corrupted, and no text input was given.`;
      }
      
      // Additional instructions for the system prompt
      systemPrompt += `\n\nIMPORTANT: If you cannot properly analyze the content or if the content appears to be blank/empty, respond with a clear statement about this limitation. DO NOT fabricate or hallucinate content that isn't there.`;
      
      systemPrompt += `\n\nPlease structure your output to include:
      1. A concise summary of the content (or a statement about being unable to extract meaningful content)
      2. Key concepts that would benefit from visual diagrams (leave empty if none)
      3. Image generation prompts for those diagrams (leave empty if none)
      4. Concepts that would benefit from flowcharts (leave empty if none)
      5. Mermaid.js code to create those flowcharts (leave empty if none)`;

      // Modified system prompt for flowcharts with much stricter instructions
      systemPrompt += `\n\nCRITICAL INSTRUCTIONS FOR FLOWCHARTS: You MUST generate 100% valid mermaid.js syntax code. This is NOT a prompt - this is actual code that will be rendered by a mermaid parser. Follow these strict rules:

1. ALWAYS start with 'flowchart TD' (top-down) or 'flowchart LR' (left-right)
2. EVERY node definition MUST use simple IDs like A, B, C, node1, node2 - NO spaces or special characters in IDs
3. For node text that contains ANY special characters, ALWAYS use double quotes and square brackets: A["Text with (special) characters"]
4. For decision nodes with conditions, ALWAYS use double quotes and curly braces: A{"Decision?"}
5. EVERY connection MUST end with a semicolon (;)
6. NEVER use style declarations unless you know the exact syntax
7. Use --> for arrows, --- for lines, and -.-> for dotted lines
8. NEVER use Unicode characters - only ASCII 
9. NEVER include 'mermaid' at the start or triple backticks in your code
10. Limit flowcharts to 15 nodes or fewer for readability

EXAMPLE OF PERFECT SYNTAX:
\`\`\`
flowchart TD
    Start["Begin Process"] --> A["Initialize Data"];
    A --> B{"Valid Input?"};
    B -->|Yes| C["Process Data"];
    B -->|No| D["Show Error"];
    C --> E["Save Results"];
    D --> End["Exit Process"];
    E --> End;
\`\`\`

BAD SYNTAX (DO NOT USE):
\`\`\`
flowchart TD
    Start(Begin Process) --> A(Initialize Data)
    A --> B{Valid Input?}
    B -- Yes --> C(Process Data)  // WRONG: Missing semicolons
    B -- No --> D(Show Error)     // WRONG: Missing quotations around text with spaces
    C --> E[Save Results]
    D & E --> End(Exit Process)   // WRONG: Incorrect node linkage
\`\`\`

Remember, this code will be directly executed without modification, so perfect syntax is REQUIRED. Test your code mentally node-by-node, connection-by-connection to ensure validity.

For complex concepts, it's better to create simpler, valid flowcharts than complex ones with syntax errors. When in doubt, simplify.`;

// Modified system prompt for diagram prompts to specify square sizing
systemPrompt += `\n\nFor diagram prompts: Create clear, educational diagrams with a SQUARE aspect ratio (1:1). The diagrams should be designed to fit beside text in a document, taking up approximately half of the page width. Make prompts detailed enough to generate high-quality, informative visualizations that can stand on their own with a short caption.`;
      
      logAI('BEAUTIFIER_PROMPT', {
        flowId,
        system: systemPrompt,
        user: userPrompt.substring(0, 200) + (userPrompt.length > 200 ? '...' : ''),
        hasFile: !!fileBuffer,
        mimeType: inputType
      });
      
      let parts = undefined;
      if (fileBuffer && fileBuffer !== '') {
        try {
          // Convert base64 string back to binary buffer
          const binaryBuffer = Buffer.from(fileBuffer, 'base64');
          
          // Only create parts if we have actual content
          if (binaryBuffer.length > 0) {
            parts = [{ 
              fileData: { 
                mimeType: inputType, 
                data: binaryBuffer
              } 
            }];
            
            logAI('FILE_PROCESSING', {
              flowId,
              binaryBufferLength: binaryBuffer.length,
              mimeType: inputType
            });
          } else {
            logAI('FILE_PROCESSING_SKIP', {
              flowId,
              reason: 'Empty file buffer'
            });
          }
        } catch (fileError) {
          logAI('FILE_PROCESSING_ERROR', {
            flowId,
            error: fileError.message
          });
          // Continue without the file if there's an error
          parts = undefined;
        }
      }
      
      const { output } = await ai.generate({
        model: gemini20Flash,
        system: systemPrompt,
        prompt: userPrompt,
        output: { schema: NoteBeautifierSchema },
        config: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
        parts
      });

      if (!output) {
        logAI('BEAUTIFIER_FLOW_ERROR', {
          flowId,
          error: 'No output generated',
          processingTimeMs: Date.now() - startTime
        });
        throw new Error('Failed to generate structured notes output');
      }

      logAI('BEAUTIFIER_FLOW_COMPLETE', {
        flowId,
        processingTimeMs: Date.now() - startTime,
        summaryLength: output.summary.length,
        diagramCount: output.concepts_diagram.length,
        flowchartCount: output.concepts_flowcharts.length
      });

      return output;
    } catch (error) {
      logAI('BEAUTIFIER_FLOW_ERROR', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
);

// Conversation flow for normal chat interactions
const conversationFlow = ai.defineFlow(
  {
    name: 'conversationFlow',
    inputSchema: z.string(),
    outputSchema: z.string(),
  },
  async (userMessage) => {
    try {
      const flowId = `flow-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      logAI('CONVERSATION_FLOW_START', {
        flowId,
        messageLength: userMessage.length,
        messagePreview: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : '')
      });
      
      const startTime = Date.now();
      const { text } = await ai.generate({
        model: gemini20Flash,
        prompt: userMessage,
      });
      const processingTime = Date.now() - startTime;
      
      logAI('CONVERSATION_FLOW_COMPLETE', {
        flowId,
        processingTimeMs: processingTime,
        responseLength: text.length,
        responsePreview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });
      
      return text;
    } catch (error) {
      logAI('CONVERSATION_FLOW_ERROR', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
);

// Update schema for document generation to include diagram prompts and flowchart code
const DocumentGenerationSchema = z.object({
  title: z.string().describe("Title for the PDF document"),
  sections: z.array(z.object({
    heading: z.string().optional().describe("Section heading"),
    content: z.string().describe("Section content text"),
    includeImage: z.boolean().describe("Whether to include an image in this section"),
    imageCaption: z.string().optional().describe("Caption for the image if included"),
  })).describe("Sections of the document with content and image instructions")
});

// New flow for generating document structure with advanced formatting
const documentGenerationFlow = ai.defineFlow(
  {
    name: 'documentGenerationFlow',
    inputSchema: z.object({
      userInput: z.string(),
      beautifiedOutput: z.object({
        summary: z.string(),
        concepts_diagram: z.array(z.string()),
        diagram_prompts: z.array(z.string()),
        concepts_flowcharts: z.array(z.string()),
        flowcharts_prompt: z.array(z.string())
      }),
      diagramCount: z.number(),
      flowchartCount: z.number(),
      diagramsWithPrompts: z.array(z.object({
        index: z.number(),
        concept: z.string(),
        prompt: z.string()
      })).optional(),
      flowchartsWithCode: z.array(z.object({
        index: z.number(),
        name: z.string(),
        code: z.string()
      })).optional()
    }),
    outputSchema: DocumentGenerationSchema,
  },
  async ({ userInput, beautifiedOutput, diagramCount, flowchartCount, diagramsWithPrompts, flowchartsWithCode }) => {
    try {
      const flowId = `flow-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      logAI('DOCUMENT_FLOW_START', {
        flowId,
        userInputLength: userInput?.length,
        diagramCount,
        flowchartCount
      });
      
      const startTime = Date.now();
      
      // Prepare system prompt for document generation
      const systemPrompt = `You are an expert educational content creator designing professional-looking documents with perfect integration of text and visuals.
      
      Your task is to create a comprehensive and educational document that effectively integrates explanatory text with visual elements like diagrams and flowcharts.

      IMPORTANT DOCUMENT STYLE GUIDELINES:
      1. Create a clear, descriptive title that reflects the document content
      2. Organize content into logical sections with concise headings
      3. For sections with diagrams, arrange content so text appears BESIDE the image (not just before/after)
      4. For sections with flowcharts, place explanatory text ABOVE the flowchart
      5. Every visual element must have a 1-2 line caption that clearly explains what it shows
      6. Do NOT include a "Summary" section or any introduction mentioning the source format (video/audio/image)
      7. Write as comprehensive, detailed educational notes about the topic - not a summary
      8. Maintain a professional, educational tone throughout
      9. Keep content factual and avoid phrases like "this video shows" or "in this image"`;

      // Build the user prompt with details about available visuals and their contexts
      let userPrompt = `Based on this user input: "${userInput.substring(0, 200)}${userInput.length > 200 ? '...' : ''}"
      
      I've already generated content about this topic. Your task is to organize it into a well-structured educational document.
      
      Key information:
      ${beautifiedOutput.summary}
      `;
      
      // Add information about available diagrams with their prompts
      if (diagramCount > 0 && diagramsWithPrompts?.length > 0) {
        userPrompt += `\nI have ${diagramCount} diagram(s) for these concepts:\n`;
        diagramsWithPrompts.forEach((diagram, i) => {
          userPrompt += `${i+1}. Concept: ${diagram.concept}\n`;
          userPrompt += `   Generation prompt: ${diagram.prompt}\n\n`;
        });
      } else if (diagramCount > 0) {
        userPrompt += `\nI have ${diagramCount} diagram(s) for these concepts:\n`;
        beautifiedOutput.concepts_diagram.slice(0, diagramCount).forEach((concept, i) => {
          userPrompt += `${i+1}. ${concept}\n`;
          if (beautifiedOutput.diagram_prompts[i]) {
            userPrompt += `   Generation prompt: ${beautifiedOutput.diagram_prompts[i]}\n\n`;
          }
        });
      }
      
      // Add information about available flowcharts with their code
      if (flowchartCount > 0 && flowchartsWithCode?.length > 0) {
        userPrompt += `\nI have ${flowchartCount} flowchart(s) for these concepts:\n`;
        flowchartsWithCode.forEach((flowchart, i) => {
          userPrompt += `${i+1}. Concept: ${flowchart.name}\n`;
          userPrompt += `   Flowchart code: ${flowchart.code.substring(0, 150)}...\n`;
          
          // Add indication if flowchart might be a placeholder due to API limits
          if (flowchart.isPlaceholder || flowchart.error) {
            userPrompt += `   Note: This flowchart may be displayed as a simplified placeholder due to rendering limitations.\n`;
          }
          
          userPrompt += `\n`;
        });
      } else if (flowchartCount > 0) {
        userPrompt += `\nI have ${flowchartCount} flowchart(s) for these concepts:\n`;
        beautifiedOutput.concepts_flowcharts.slice(0, flowchartCount).forEach((concept, i) => {
          userPrompt += `${i+1}. ${concept}\n`;
          if (beautifiedOutput.flowcharts_prompt[i]) {
            userPrompt += `   Flowchart code: ${beautifiedOutput.flowcharts_prompt[i].substring(0, 150)}...\n`;
            
            // Check if flowchart code suggests it might be problematic
            const flowchartCode = beautifiedOutput.flowcharts_prompt[i] || '';
            if (flowchartCode.includes('ERROR') || flowchartCode.includes('PLACEHOLDER') || 
                flowchartCode.length < 50) {
              userPrompt += `   Note: This flowchart may be displayed as a simplified placeholder.\n`;
            }
            
            userPrompt += `\n`;
          }
        });
      }
      
      userPrompt += `\nIMPORTANT LAYOUT INSTRUCTIONS:
      - For diagram sections: Place the image on one half of the page with explanatory text beside it. Images are square (1:1 aspect ratio). Add a 1-2 line caption below.
      - For flowchart sections: Place explanatory text above the flowchart. Flowcharts should be about 70% of page width. Add a 1-2 line caption below.
      - The document should be comprehensive and educational - NOT a summary.
      - DO NOT mention the source format (video/audio/image) or use phrases like "this video shows" or "in this image".
      - For sections with placeholder images, focus more on detailed textual explanations to compensate.
      
      CRITICAL VISUAL ASSIGNMENT INSTRUCTIONS:
      1. When you create a section that should include a diagram or flowchart, ENSURE that the section heading PRECISELY matches the visual's concept name
      2. For example, if you have a flowchart about "Attention Mechanism Process", the section should be titled exactly "Attention Mechanism Process"
      3. For flowcharts, always include the exact flowchart name in your section heading, verbatim with the same wording
      4. Make section headings descriptive but concise - no more than 4-5 words
      5. Each visual must be assigned to exactly one section 
      6. Never request more visuals than are available
      7. Every visual MUST be assigned to a section - don't leave any diagrams or flowcharts unused
      8. Create sections in a logical order that builds understanding progressively
      9. For complex technical topics, start with simpler concepts before advanced ones

FLOWCHART ASSIGNMENT IS CRITICAL: For each flowchart, create a section with the EXACT title matching the flowchart name. For example, if you have a flowchart called "Masking Process During Training", create a section titled exactly "Masking Process During Training".
`;

      logAI('DOCUMENT_PROMPT', {
        flowId,
        system: systemPrompt.substring(0, 200) + (systemPrompt.length > 200 ? '...' : ''),
        user: userPrompt.substring(0, 200) + (userPrompt.length > 200 ? '...' : '')
      });
      
      const { output } = await ai.generate({
        model: gemini20Flash,
        system: systemPrompt,
        prompt: userPrompt,
        output: { schema: DocumentGenerationSchema },
        config: {
          maxOutputTokens: 2048,
          temperature: 0.2, // Lower temperature for more consistent formatting
        }
      });

      if (!output) {
        logAI('DOCUMENT_FLOW_ERROR', {
          flowId,
          error: 'No output generated',
          processingTimeMs: Date.now() - startTime
        });
        throw new Error('Failed to generate document structure');
      }

      logAI('DOCUMENT_FLOW_COMPLETE', {
        flowId,
        processingTimeMs: Date.now() - startTime,
        title: output.title,
        sectionCount: output.sections.length
      });

      return output;
    } catch (error) {
      logAI('DOCUMENT_FLOW_ERROR', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
);

module.exports = {
  noteBeautifierFlow,
  conversationFlow,
  documentGenerationFlow,
  ai
};