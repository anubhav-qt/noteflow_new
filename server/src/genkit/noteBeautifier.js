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
  flowcharts_prompt: z.array(z.string()).describe("For each concept above, generate mermaid.js code to create a flowchart")
});

// The note beautifier flow
const noteBeautifierFlow = ai.defineFlow(
  {
    name: 'noteBeautifierFlow',
    inputSchema: z.object({
      text: z.string().optional(),
      inputType: z.string(),
      fileBuffer: z.string().optional()  // Base64 encoded file content
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
        hasFileBuffer: !!fileBuffer
      });
      
      const startTime = Date.now();
      
      // Prepare different prompt based on input type
      let systemPrompt = `You are an advanced Note Beautification System designed to transform raw input into well-structured notes.`;
      let userPrompt = "";
      
      // Build the prompt based on input type
      if (fileBuffer) {
        // If we have a file buffer
        if (inputType.startsWith('image/')) {
          userPrompt = `This input is an image of type: ${inputType}. Please analyze this image and provide structured notes based on what you see.`;
        } else if (inputType.startsWith('audio/')) {
          userPrompt = `This input is an audio file of type: ${inputType}. Please analyze this audio content and provide structured notes.`;
        } else if (inputType.startsWith('video/')) {
          userPrompt = `This input is a video file of type: ${inputType}. Please analyze this video content and provide structured notes.`;
        } else if (inputType === 'application/pdf') {
          userPrompt = `This input is a PDF document. Please analyze the PDF content and provide structured notes.`;
        } else {
          // For any other file types
          userPrompt = `This input is a file of type: ${inputType}. Please analyze its content and provide structured notes.`;
        }
      } else {
        // For plain text input
        userPrompt = `This input is text content of type: ${inputType}. Please analyze and structure the following content:\n\n${text}`;
      }
      
      // Include additional context and instructions
      systemPrompt += `\n\nPlease structure your output to include:
      1. A concise summary of the content
      2. Key concepts that would benefit from visual diagrams
      3. Image generation prompts for those diagrams
      4. Concepts that would benefit from flowcharts
      5. Mermaid.js code to create those flowcharts`;
      
      const { output } = await ai.generate({
        model: gemini20Flash,
        system: systemPrompt,
        prompt: userPrompt,
        output: { schema: NoteBeautifierSchema },
        config: {
          maxOutputTokens: 2048,
          temperature: 0.7,
        },
        parts: fileBuffer ? [{ fileData: { mimeType: inputType, data: fileBuffer } }] : undefined
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

module.exports = {
  noteBeautifierFlow,
  conversationFlow,
  ai
};
