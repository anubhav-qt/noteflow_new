const fetch = require('node-fetch');
const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const fsSync = require('fs'); // For synchronous fs methods
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Import mermaid-cli properly with better error handling and alternative approaches
let mermaidCliPath;
let mmdc = null;
let mermaidCliAvailable = false;

try {
  // Try multiple ways to locate mermaid-cli
  const npmRoot = execSync('npm root').toString().trim();
  
  // First try the newer installation path (for recent versions)
  let possiblePaths = [
    path.join(npmRoot, '@mermaid-js', 'mermaid-cli', 'src', 'cli.js'),
    path.join(npmRoot, '@mermaid-js', 'mermaid-cli', 'index.bundle.js'),
    path.join(npmRoot, '@mermaid-js', 'mermaid-cli', 'dist', 'index.bundle.js'),
    path.join(npmRoot, '@mermaid-js', 'mermaid-cli', 'dist', 'cli.js'),
    path.join(npmRoot, '@mermaid-js', 'mermaid-cli', 'node_modules', '.bin', 'mmdc')
  ];
  
  console.log('Trying to locate mermaid-cli. Checking these paths:');
  possiblePaths.forEach(p => console.log(`- ${p}`));
  
  // Try each path until we find one that exists
  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      mermaidCliPath = p;
      console.log(`Found mermaid-cli at: ${mermaidCliPath}`);
      mermaidCliAvailable = true;
      break;
    }
  }
  
  // If we didn't find any of the paths, check if mmdc is in PATH
  if (!mermaidCliAvailable) {
    try {
      execSync('mmdc --version', { stdio: 'pipe' });
      mermaidCliPath = 'mmdc'; // Just use the command directly
      mermaidCliAvailable = true;
      console.log('Found mmdc in PATH');
    } catch (cmdError) {
      console.log('mmdc not found in PATH');
    }
  }
  
  if (!mermaidCliAvailable) {
    // Try to find the executable using npm bin
    try {
      const npmBinPath = execSync('npm bin').toString().trim();
      const mmdcBinPath = path.join(npmBinPath, 'mmdc');
      
      if (fsSync.existsSync(mmdcBinPath)) {
        mermaidCliPath = mmdcBinPath;
        mermaidCliAvailable = true;
        console.log(`Found mmdc binary at: ${mermaidCliPath}`);
      }
    } catch (npmBinError) {
      console.log('Failed to find mmdc using npm bin:', npmBinError.message);
    }
  }
  
  // Try direct require as a last resort, with a fallback that ensures we don't crash
  if (!mermaidCliAvailable) {
    try {
      mmdc = require('@mermaid-js/mermaid-cli');
      mermaidCliAvailable = true;
      console.log('Successfully imported mermaid-cli via require');
    } catch (requireError) {
      console.error('Error requiring mermaid-cli module:', requireError.message);
    }
  }
  
  // Final check - verify puppeteer is installed
  if (mermaidCliAvailable) {
    try {
      require('puppeteer');
      console.log('Puppeteer is available');
    } catch (puppeteerError) {
      console.warn('WARNING: Puppeteer is not available, mermaid CLI may not work:', puppeteerError.message);
      console.warn('Try running: npm install puppeteer --save');
    }
  }
} catch (err) {
  console.error('Error during mermaid-cli initialization:', err.message);
  console.log('Flowcharts will use fallback rendering method');
  mermaidCliAvailable = false;
}

/**
 * Generate diagram images using Hugging Face API
 */
async function generateDiagram(prompt) {
  try {
    // Using FLUX.1-dev model for better text rendering in diagrams
    const response = await fetch(
      "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        },
        body: JSON.stringify({ 
          inputs: prompt,
          parameters: {
            guidance_scale: 7.5,          // Higher guidance scale for better text clarity
            num_inference_steps: 50,
            width: 1024,                  // Square aspect ratio (1:1)
            height: 1024,                 // Square aspect ratio (1:1)
            seed: Math.floor(Math.random() * 2147483647) // Random seed for variety
          }
        }),
      }
    );
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        
        // Handle rate limiting error (429 or specific message)
        if (response.status === 429 || 
            (errorData.error && 
             (errorData.error.includes("rate") || 
              errorData.error.includes("limit")))) {
          console.warn("API rate limit reached, generating placeholder image");
          return createPlaceholderImage(prompt);
        }
        
        // Special handling for model loading response
        if (response.status === 503 && errorData.error && errorData.error.includes("loading")) {
          console.warn("Model is loading, generating placeholder image");
          return createPlaceholderImage(prompt);
        }
        
        throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
      } else {
        const errorText = await response.text();
        throw new Error(`Invalid response from API: ${response.status} ${response.statusText}`);
      }
    }
    
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    console.error(`Error in generateDiagram: ${error.message}`);
    console.warn("Generating placeholder image due to error");
    return createPlaceholderImage(prompt);
  }
}

/**
 * Creates a placeholder pink image with the prompt text
 * @param {string} prompt - The original prompt for the image
 * @returns {Buffer} - Image buffer of the placeholder
 */
function createPlaceholderImage(prompt) {
  try {
    // Create a canvas with the same dimensions as the expected image
    const width = 1024;
    const height = 1024;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill with pink background
    ctx.fillStyle = '#ffccee';
    ctx.fillRect(0, 0, width, height);
    
    // Add a border
    ctx.strokeStyle = '#ff66aa';
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    
    // Add heading text
    ctx.fillStyle = '#880044';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Image Generation Limited', width / 2, height / 4);
    
    // Add placeholder text about rate limits
    ctx.fillStyle = '#550033';
    ctx.font = '30px Arial';
    ctx.fillText('API rate limit reached', width / 2, height / 4 + 60);
    
    // Display a portion of the original prompt
    const maxPromptLength = 200;
    const promptPreview = prompt.length > maxPromptLength 
      ? prompt.substring(0, maxPromptLength) + "..."
      : prompt;
    
    ctx.fillStyle = '#000000';
    ctx.font = '24px Arial';
    ctx.fillText('Original Prompt:', width / 2, height / 2);
    
    // Wrap the prompt text
    const words = promptPreview.split(' ');
    let line = '';
    let y = height / 2 + 40;
    const lineHeight = 30;
    const maxWidth = width * 0.8;
    
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth) {
        ctx.fillText(line, width / 2, y);
        line = words[i] + ' ';
        y += lineHeight;
        
        // Prevent text from going off the canvas
        if (y > height - 50) {
          ctx.fillText('...', width / 2, y);
          break;
        }
      } else {
        line = testLine;
      }
    }
    
    // Draw the last line
    if (line.trim() !== '') {
      ctx.fillText(line, width / 2, y);
    }
    
    // Convert canvas to PNG buffer
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error creating placeholder image:', error);
    
    // If even this fails, create an ultra-simple fallback
    try {
      const canvas = createCanvas(800, 800);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffccee';  // Pink
      ctx.fillRect(0, 0, 800, 800);
      return canvas.toBuffer('image/png');
    } catch (fallbackError) {
      console.error('Critical error creating fallback image:', fallbackError);
      // At this point we have to return null, but our PDF generator should handle that
      return null;
    }
  }
}

/**
 * Generate flowchart images from mermaid code using mermaid-cli
 */
async function generateFlowchart(mermaidCode, conceptName) {
  try {
    // Create temp directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'flowchart-'));
    const sanitizedName = conceptName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const uniqueId = uuidv4().substring(0, 8);
    
    // Define file paths
    const mmdFilePath = path.join(tempDir, `${sanitizedName}_${uniqueId}.mmd`);
    const pngFilePath = path.join(tempDir, `${sanitizedName}_${uniqueId}.png`);
    
    // Handle common syntax issues in the generated code
    let fixedMermaidCode = mermaidCode;
    
    // Fix missing graph declaration
    if (!fixedMermaidCode.trim().toLowerCase().startsWith('graph') && 
        !fixedMermaidCode.trim().toLowerCase().startsWith('flowchart')) {
      fixedMermaidCode = 'flowchart TD\n' + fixedMermaidCode;
    }
    
    // Fix missing semicolons
    const lines = fixedMermaidCode.split('\n');
    const fixedLines = lines.map(line => {
      // If line contains arrow but doesn't end with semicolon, add it
      if ((line.includes('-->') || line.includes('---')) && 
          !line.trim().endsWith(';') && 
          !line.trim().endsWith('subgraph') &&
          !line.includes('end')) {
        return line + ';';
      }
      return line;
    });
    fixedMermaidCode = fixedLines.join('\n');
    
    console.log(`Fixed mermaid code for "${conceptName}":`, fixedMermaidCode.substring(0, 100) + '...');
    
    // Save to file
    await fs.writeFile(mmdFilePath, fixedMermaidCode, 'utf8');
    
    // Try to execute Mermaid CLI using available methods
    if (mermaidCliAvailable) {
      console.log(`Generating flowchart using mermaid-cli for "${conceptName}"...`);
      console.log(`Saved mermaid code to ${mmdFilePath}`);
      
      try {
        if (mmdc && mmdc.run) {
          // Use the module's API if available
          console.log('Using mmdc.run API approach');
          await mmdc.run({
            input: mmdFilePath,
            output: pngFilePath,
            backgroundColor: 'white', // Change to white for better visibility
            puppeteerConfig: {
              args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
          });
        } else if (mermaidCliPath) {
          // Use CLI path with appropriate command
          console.log(`Using CLI command approach with: ${mermaidCliPath}`);
          
          let command;
          if (mermaidCliPath === 'mmdc') {
            // Direct command (in PATH)
            command = `mmdc -i "${mmdFilePath}" -o "${pngFilePath}" -b white`; // Change to white background
          } else if (mermaidCliPath.endsWith('.js')) {
            // JavaScript file - use Node to execute
            command = `node "${mermaidCliPath}" -i "${mmdFilePath}" -o "${pngFilePath}" -b white`;
          } else {
            // Direct executable
            command = `"${mermaidCliPath}" -i "${mmdFilePath}" -o "${pngFilePath}" -b white`;
          }
          
          console.log(`Executing command: ${command}`);
          await execAsync(command);
        } else {
          throw new Error('No mermaid-cli execution method available');
        }
        
        // Verify the generated PNG exists and has content
        const fileStats = await fs.stat(pngFilePath);
        console.log(`Generated PNG file size: ${fileStats.size} bytes`);
        
        if (fileStats.size < 1000) {
          console.warn('Generated PNG is too small, likely not a valid image');
          throw new Error("Generated PNG is too small to be a valid image");
        }
        
        // Read the generated PNG file
        const buffer = await fs.readFile(pngFilePath);
        console.log(`Successfully read PNG file: ${buffer.length} bytes`);
        
        // Save a copy of the PNG for debugging
        try {
          const debugDir = path.join(os.tmpdir(), 'noteflow-debug');
          await fs.mkdir(debugDir, { recursive: true });
          const debugFilePath = path.join(debugDir, `${sanitizedName}_${uniqueId}.png`);
          await fs.writeFile(debugFilePath, buffer);
          console.log(`Debug copy saved to: ${debugFilePath}`);
        } catch (debugError) {
          console.warn('Failed to save debug copy:', debugError.message);
        }
        
        // Clean up temp directory
        await fs.rm(tempDir, { recursive: true, force: true })
          .catch(err => console.error('Error cleaning temp dir:', err));
        
        return buffer;
      } catch (cliError) {
        console.error(`Mermaid CLI execution error:`, cliError);
        console.error(`Command output:`, cliError.stdout, cliError.stderr);
        
        // Try to show the problematic mermaid code
        console.log('Problematic mermaid code:');
        console.log(fixedMermaidCode.substring(0, 500) + (fixedMermaidCode.length > 500 ? '...' : ''));
        
        // Fall through to the fallback method
        throw cliError;
      }
    } else {
      throw new Error('Mermaid CLI not available, using fallback renderer');
    }
  } catch (error) {
    console.log(`Using fallback rendering for flowchart "${conceptName}": ${error.message}`);
    return generateFallbackFlowchart(mermaidCode, conceptName);
  }
}

// Improve the fallback flowchart generator to make it clearer this is a fallback
function generateFallbackFlowchart(mermaidCode, conceptName) {
  try {
    // Create a canvas with better dimensions (16:9 aspect ratio)
    const canvas = createCanvas(1024, 768);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 768);
    
    // Add title and border - make it more prominent
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`Flowchart: ${conceptName}`, 40, 40);
    
    // Add a notice about fallback mode
    ctx.fillStyle = '#cc0000';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('Flowchart visualization unavailable - showing code representation', 40, 70);
    
    // Draw a border
    ctx.strokeStyle = '#9999cc';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 984, 728);
    
    // Draw the mermaid code as text with better formatting
    ctx.fillStyle = '#000000';
    ctx.font = '16px Courier New';
    const lines = mermaidCode.split('\n');
    const maxLines = Math.min(lines.length, 30); // Limit to 30 lines
    
    for (let i = 0; i < maxLines; i++) {
      ctx.fillText(lines[i].substring(0, 90), 40, 110 + i * 20);
    }
    
    if (lines.length > maxLines) {
      ctx.fillText('...', 40, 110 + maxLines * 20);
    }
    
    console.log(`Generated fallback flowchart image for "${conceptName}"`);
    return canvas.toBuffer('image/png');
  } catch (canvasError) {
    console.error('Error in fallback flowchart generation:', canvasError);
    // If even the fallback fails, return a very basic PNG
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = '#cc0000';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Error generating flowchart', 40, 80);
    ctx.fillStyle = '#000000';
    ctx.font = '18px Arial';
    ctx.fillText(conceptName, 40, 120);
    ctx.fillText('Flowchart renderer failed completely', 40, 160);
    return canvas.toBuffer('image/png');
  }
}

/**
 * Batch processing function for generating multiple diagrams
 */
async function generateAllDiagrams(diagramPrompts) {
  const results = [];
  
  for (let i = 0; i < diagramPrompts.length; i++) {
    try {
      console.log(`Generating diagram #${i+1} with prompt: "${diagramPrompts[i].substring(0, 50)}..."`);
      const buffer = await generateDiagram(diagramPrompts[i]);
      
      // If buffer is null (which should be rare now), add an error result
      if (!buffer) {
        console.error(`Failed to generate diagram #${i+1} - null buffer returned`);
        results.push({
          index: i,
          buffer: null,
          error: "Failed to generate even a placeholder image"
        });
        continue;
      }
      
      console.log(`Successfully generated diagram #${i+1} - buffer size: ${buffer.length} bytes`);
      results.push({
        index: i,
        buffer: buffer,
        prompt: diagramPrompts[i],
        error: null
      });
    } catch (error) {
      console.error(`Error generating diagram #${i+1}:`, error);
      // Try to create a placeholder directly here as well
      const placeholderBuffer = createPlaceholderImage(diagramPrompts[i]);
      
      results.push({
        index: i,
        buffer: placeholderBuffer,
        prompt: diagramPrompts[i],
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Batch processing function for generating multiple flowcharts
 */
async function generateAllFlowcharts(flowchartCodes, conceptNames) {
  const results = [];
  
  for (let i = 0; i < flowchartCodes.length; i++) {
    try {
      const conceptName = conceptNames[i] || `Flowchart ${i+1}`;
      console.log(`Generating flowchart #${i+1} "${conceptName}" with code length: ${flowchartCodes[i].length} chars`);
      
      const buffer = await generateFlowchart(flowchartCodes[i], conceptName);
      
      // If buffer is null (generation failed), add error
      if (!buffer) {
        console.error(`Failed to generate flowchart #${i+1} "${conceptName}" - null buffer returned`);
        results.push({
          index: i,
          name: conceptName,
          buffer: null,
          error: "Failed to generate flowchart image"
        });
        continue;
      }
      
      console.log(`Successfully generated flowchart #${i+1} "${conceptName}" - buffer size: ${buffer.length} bytes`);
      results.push({
        index: i,
        name: conceptName,
        buffer: buffer,
        error: null
      });
    } catch (error) {
      console.error(`Error generating flowchart #${i+1}:`, error);
      results.push({
        index: i,
        name: conceptNames[i] || `Flowchart ${i+1}`,
        buffer: null,
        error: error.message
      });
    }
  }
  
  return results;
}

module.exports = {
  generateDiagram,
  generateFlowchart,
  generateAllDiagrams,
  generateAllFlowcharts
};
