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
            width: 1024,
            height: 768,
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
          return null; // Return null instead of retrying
        }
        
        // Special handling for model loading response
        if (response.status === 503 && errorData.error && errorData.error.includes("loading")) {
          return null; // Return null instead of retrying
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
    return null;
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
            backgroundColor: 'transparent',
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
            command = `mmdc -i "${mmdFilePath}" -o "${pngFilePath}" -b transparent`;
          } else if (mermaidCliPath.endsWith('.js')) {
            // JavaScript file - use Node to execute
            command = `node "${mermaidCliPath}" -i "${mmdFilePath}" -o "${pngFilePath}" -b transparent`;
          } else {
            // Direct executable
            command = `"${mermaidCliPath}" -i "${mmdFilePath}" -o "${pngFilePath}" -b transparent`;
          }
          
          console.log(`Executing command: ${command}`);
          await execAsync(command);
        } else {
          throw new Error('No mermaid-cli execution method available');
        }
        
        // Check if the PNG was generated and has content
        const fileStats = await fs.stat(pngFilePath);
        console.log(`Generated PNG file size: ${fileStats.size} bytes`);
        
        if (fileStats.size === 0) {
          throw new Error("Generated PNG is empty");
        }
        
        // Read the generated PNG file
        const buffer = await fs.readFile(pngFilePath);
        console.log(`Read PNG file: ${buffer.length} bytes`);
        
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
      throw new Error('Mermaid CLI not available');
    }
  } catch (error) {
    console.log(`Using fallback rendering for flowchart "${conceptName}"`, error);
    
    // ...existing fallback code...
    return generateFallbackFlowchart(mermaidCode, conceptName);
  }
}

// Separate function for the fallback renderer to keep the code cleaner
function generateFallbackFlowchart(mermaidCode, conceptName) {
  try {
    // Create a simple image with the mermaid code as text
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 600);
    
    // Add title and border
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`Flowchart: ${conceptName}`, 20, 30);
    
    // Draw a border
    ctx.strokeStyle = '#9999cc';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 780, 580);
    
    // Add explanation
    ctx.fillStyle = '#555555';
    ctx.font = '14px Arial';
    ctx.fillText(`This is a text representation of the flowchart code:`, 20, 60);
    
    // Draw the mermaid code as text
    ctx.fillStyle = '#333333';
    ctx.font = '12px Monospace';
    const lines = mermaidCode.split('\n');
    const maxLines = Math.min(lines.length, 25); // Limit to 25 lines
    
    for (let i = 0; i < maxLines; i++) {
      ctx.fillText(lines[i].substring(0, 70), 30, 90 + i * 18);
    }
    
    if (lines.length > maxLines) {
      ctx.fillText('...', 30, 90 + maxLines * 18);
    }
    
    return canvas.toBuffer('image/png');
  } catch (canvasError) {
    console.error('Error in fallback flowchart generation:', canvasError);
    // If even the fallback fails, return a very basic PNG
    const canvas = createCanvas(400, 200);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 200);
    ctx.fillStyle = '#ff0000';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Error generating flowchart', 20, 50);
    ctx.fillText(conceptName, 20, 80);
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
      const buffer = await generateDiagram(diagramPrompts[i]);
      
      // If buffer is null (API failed), add an error result
      if (!buffer) {
        results.push({
          index: i,
          buffer: null,
          error: "API rate limited or temporarily unavailable"
        });
        continue;
      }
      
      results.push({
        index: i,
        buffer: buffer,
        error: null
      });
    } catch (error) {
      console.error(`Error generating diagram ${i+1}:`, error);
      results.push({
        index: i,
        buffer: null,
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
      const buffer = await generateFlowchart(flowchartCodes[i], conceptName);
      
      // If buffer is null (generation failed), add error
      if (!buffer) {
        results.push({
          index: i,
          name: conceptName,
          buffer: null,
          error: "Failed to generate flowchart image"
        });
        continue;
      }
      
      results.push({
        index: i,
        name: conceptName,
        buffer: buffer,
        error: null
      });
    } catch (error) {
      console.error(`Error generating flowchart ${i+1}:`, error);
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
