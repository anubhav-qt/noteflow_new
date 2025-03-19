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

      // Modified system prompt for flowcharts
      systemPrompt += `\n\nIMPORTANT INSTRUCTIONS FOR FLOWCHARTS: When generating flowchart code, provide 100% VALID mermaid.js code that can be directly used, not prompts. Always start with 'flowchart TD' or another valid diagram type. Ensure the syntax is correct and can be rendered by a mermaid parser. 

CRITICAL SYNTAX RULES:
1. For node text containing parentheses or special characters, use double quotes: A[\"Text with (parentheses)\"] NOT A[Text with (parentheses)]
2. Keep node names simple (like A, B, C) and put descriptive text in the node labels
3. Avoid spaces in node names
4. Each line must end with semicolon (;)
5. Escape special characters properly
6. Test every flowchart in your mind line by line to verify correct syntax

Example of CORRECT syntax:
\`\`\`
flowchart TD
    A[\"Start: Initialize Matrices (U, V)\"] --> B[\"Fix Matrix U\"];
    B --> C[\"Optimize Matrix V\"];
    C --> D[\"Fix Matrix V\"];
    D --> E[\"Optimize Matrix U\"];
    E --> F{\"Check Convergence\"};
    F -- Yes --> G[\"End: Complete\"];
    F -- No --> B;
\`\`\`

Keep flowcharts simple and focused. Do not create flowcharts with excessive nodes or complexity. Always verify the syntax is 100% correct before returning.`;
      
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

// Add new schema for document generation
const DocumentGenerationSchema = z.object({
  title: z.string().describe("Title for the PDF document"),
  sections: z.array(z.object({
    heading: z.string().optional().describe("Section heading"),
    content: z.string().describe("Section content text"),
    includeImage: z.boolean().describe("Whether to include an image in this section"),
    imageCaption: z.string().optional().describe("Caption for the image if included")
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
      flowchartCount: z.number()
    }),
    outputSchema: DocumentGenerationSchema,
  },
  async ({ userInput, beautifiedOutput, diagramCount, flowchartCount }) => {
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
      const systemPrompt = `You are an expert document designer creating educational content with a focus on clarity and visual organization. 
      Your task is to create a structured document that effectively integrates text explanations with visual elements like diagrams and flowcharts.

      Use these guidelines when designing the document structure:
      1. Create a clear, descriptive title that reflects the document content
      2. Organize content into logical sections with clear headings
      3. For each section, provide educational text that explains concepts clearly
      4. Indicate where diagrams or flowcharts should be placed in the document
      5. Create appropriate captions for each visual element
      6. Ensure the document flows naturally and builds understanding progressively
      7. Use a professional, educational tone throughout`;

      // Build the user prompt with details about available visuals
      let userPrompt = `Based on this user input: "${userInput.substring(0, 200)}${userInput.length > 200 ? '...' : ''}"

      I've already generated these beautiful notes:
      
      Summary:
      ${beautifiedOutput.summary}
      
      `;
      
      // Add information about available diagrams
      if (diagramCount > 0) {
        userPrompt += `\nI have ${diagramCount} diagram(s) for these concepts:\n`;
        beautifiedOutput.concepts_diagram.slice(0, diagramCount).forEach((concept, i) => {
          userPrompt += `${i+1}. ${concept}\n`;
        });
      }
      
      // Add information about available flowcharts
      if (flowchartCount > 0) {
        userPrompt += `\nI have ${flowchartCount} flowchart(s) for these concepts:\n`;
        beautifiedOutput.concepts_flowcharts.slice(0, flowchartCount).forEach((concept, i) => {
          userPrompt += `${i+1}. ${concept}\n`;
        });
      }
      
      userPrompt += `\nPlease create a document structure that integrates these elements into a cohesive educational document. The output will be used to generate a PDF.`;
      
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