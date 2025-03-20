/**
 * Python Bridge - Utility to call Python scripts from Node.js
 * 
 * This module provides functions to call Python scripts and handle their output.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Path to the Python scripts directory
const PYTHON_SCRIPTS_DIR = path.join(__dirname, '..', 'python_scripts');

/**
 * Check if Python is installed and available
 * 
 * @returns {Promise<boolean>} True if Python is available, false otherwise
 */
async function isPythonAvailable() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', ['--version']);
    
    pythonProcess.on('error', () => {
      // Try with 'python' if 'python3' fails
      const pythonFallback = spawn('python', ['--version']);
      
      pythonFallback.on('error', () => {
        console.warn('Python is not available on this system');
        resolve(false);
      });
      
      pythonFallback.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    pythonProcess.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Get the appropriate Python command for the system
 * 
 * @returns {Promise<string>} The Python command to use
 */
async function getPythonCommand() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python3', ['--version']);
    
    pythonProcess.on('error', () => {
      resolve('python'); // Fallback to 'python'
    });
    
    pythonProcess.on('close', (code) => {
      resolve(code === 0 ? 'python3' : 'python');
    });
  });
}

/**
 * Call the ambiance generator script with the provided text
 * 
 * @param {string} text - The text content to analyze
 * @returns {Promise<object>} The analysis results
 */
async function generateAmbiancePrompt(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.error('Invalid text provided to generateAmbiancePrompt');
    return {
      error: 'Invalid text provided',
      ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
    };
  }
  
  // Check if Python is available
  const pythonAvailable = await isPythonAvailable();
  if (!pythonAvailable) {
    console.error('Python is not available, cannot generate ambiance prompt');
    return {
      error: 'Python is not available on this system',
      ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
    };
  }
  
  // Get the appropriate Python command
  const pythonCommand = await getPythonCommand();
  
  // Path to the ambiance generator script
  const scriptPath = path.join(PYTHON_SCRIPTS_DIR, 'ambiance_generator.py');
  
  // Check if the script exists
  if (!fs.existsSync(scriptPath)) {
    console.error(`Ambiance generator script not found at ${scriptPath}`);
    return {
      error: 'Ambiance generator script not found',
      ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
    };
  }
  
  // Create a temporary file to store the text
  const tempFile = path.join(os.tmpdir(), `storia_text_${Date.now()}.txt`);
  
  try {
    // Write the text to the temporary file
    fs.writeFileSync(tempFile, text, 'utf8');
    
    return new Promise((resolve) => {
      // Call the Python script with the temporary file
      const pythonProcess = spawn(pythonCommand, [
        scriptPath,
        '--file',
        tempFile
      ]);
      
      let outputData = '';
      let errorData = '';
      
      // Collect stdout data
      pythonProcess.stdout.on('data', (data) => {
        outputData += data.toString();
      });
      
      // Collect stderr data
      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
        // We now log stderr but don't consider it an error as it contains regular logs
        console.log(`Python logs: ${data}`);
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        // Clean up the temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          console.warn(`Failed to delete temporary file ${tempFile}: ${e.message}`);
        }
        
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`Error output: ${errorData}`);
          
          resolve({
            error: `Python process exited with code ${code}: ${errorData}`,
            ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
          });
          return;
        }
        
        try {
          // The JSON output should now be clean in the stdout (outputData)
          // No need for regex extraction anymore
          console.log('Raw JSON output:', outputData);
          
          // Parse the JSON output
          const result = JSON.parse(outputData);
          resolve(result);
        } catch (e) {
          console.error(`Failed to parse Python output as JSON: ${e.message}`);
          console.error(`Raw output: ${outputData}`);
          
          resolve({
            error: `Failed to parse Python output: ${e.message}`,
            raw_output: outputData,
            ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
          });
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (err) => {
        console.error(`Failed to start Python process: ${err.message}`);
        
        // Clean up the temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          console.warn(`Failed to delete temporary file ${tempFile}: ${e.message}`);
        }
        
        resolve({
          error: `Failed to start Python process: ${err.message}`,
          ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
        });
      });
    });
  } catch (e) {
    console.error(`Error writing to temporary file: ${e.message}`);
    return {
      error: `Error writing to temporary file: ${e.message}`,
      ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
    };
  }
}

/**
 * Generate music using ElevenLabs API based on an ambiance prompt
 * 
 * @param {string} prompt - The ambiance prompt to use for generating music
 * @param {number} duration - The duration of the music in seconds (default: 15.0)
 * @param {number} influence - The prompt influence factor between 0.0 and 1.0 (default: 0.7)
 * @returns {Promise<Buffer>} The generated audio data as a Buffer
 */
async function generateMusic(prompt, duration = 15.0, influence = 0.7) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    console.error('Invalid prompt provided to generateMusic');
    return null;
  }
  
  // Check if Python is available
  const pythonAvailable = await isPythonAvailable();
  if (!pythonAvailable) {
    console.error('Python is not available, cannot generate music');
    return null;
  }
  
  // Get the appropriate Python command
  const pythonCommand = await getPythonCommand();
  
  // Path to the music generator script
  const scriptPath = path.join(PYTHON_SCRIPTS_DIR, 'music_gen.py');
  
  // Check if the script exists
  if (!fs.existsSync(scriptPath)) {
    console.error(`Music generator script not found at ${scriptPath}`);
    return null;
  }
  
  // Create a temporary file to store the prompt
  const tempFile = path.join(os.tmpdir(), `storia_prompt_${Date.now()}.txt`);
  
  try {
    // Write the prompt to the temporary file
    fs.writeFileSync(tempFile, prompt, 'utf8');
    
    return new Promise((resolve) => {
      // Call the Python script with the temporary file
      const pythonProcess = spawn(pythonCommand, [
        scriptPath,
        '--prompt', prompt,
        '--duration', duration.toString(),
        '--influence', influence.toString()
      ]);
      
      // Collect stdout data (audio binary data)
      const chunks = [];
      
      // Collect stdout data as binary
      pythonProcess.stdout.on('data', (data) => {
        chunks.push(data);
      });
      
      // Collect stderr data for logging - now expected to contain regular logs, not errors
      let logData = '';
      pythonProcess.stderr.on('data', (data) => {
        logData += data.toString();
        console.log(`Music generator logs: ${data}`);
      });
      
      // Handle process completion
      pythonProcess.on('close', (code) => {
        // Clean up the temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          console.warn(`Failed to delete temporary file ${tempFile}: ${e.message}`);
        }
        
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`Log output: ${logData}`);
          resolve(null);
          return;
        }
        
        // Combine the binary chunks into a single buffer
        const buffer = Buffer.concat(chunks);
        
        // Check if we got any data
        if (buffer.length === 0) {
          console.error('No audio data received from music generator');
          resolve(null);
          return;
        }
        
        console.log(`Received ${buffer.length} bytes of audio data`);
        resolve(buffer);
      });
      
      // Handle process errors
      pythonProcess.on('error', (err) => {
        console.error(`Failed to start Python process: ${err.message}`);
        
        // Clean up the temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          console.warn(`Failed to delete temporary file ${tempFile}: ${e.message}`);
        }
        
        resolve(null);
      });
    });
  } catch (e) {
    console.error(`Error preparing music generation: ${e.message}`);
    return null;
  }
}

/**
 * Generate ambiance prompt and then generate music in one step
 * 
 * @param {string} text - The text content to analyze for generating music
 * @param {number} duration - The duration of the music in seconds (default: 15.0)
 * @returns {Promise<Object>} Object containing the audio data, mood, and ambiance prompt
 */
async function generateMusicFromText(text, duration = 15.0) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    console.error('Invalid text provided to generateMusicFromText');
    return {
      error: 'Invalid text provided',
      audio: null,
      mood: 'neutral',
      ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
    };
  }
  
  try {
    console.log(`Generating music from text of length: ${text.length}`);
    
    // First, generate an ambiance prompt
    const ambianceResult = await generateAmbiancePrompt(text);
    
    if (!ambianceResult || ambianceResult.error) {
      console.error('Error generating ambiance prompt:', ambianceResult?.error || 'Unknown error');
      return {
        error: ambianceResult?.error || 'Failed to generate ambiance prompt',
        audio: null,
        mood: 'neutral',
        ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
      };
    }
    
    // Extract the ambiance prompt and mood
    const ambiancePrompt = ambianceResult.ambiance_prompt;
    const mood = ambianceResult.mood || 'neutral';
    
    console.log(`Generated ambiance prompt: ${ambiancePrompt}`);
    console.log(`Detected mood: ${mood}`);
    
    // Generate music using the ambiance prompt
    const audioData = await generateMusic(ambiancePrompt, duration, 0.7);
    
    if (!audioData) {
      console.error('Failed to generate music from ambiance prompt');
      return {
        error: 'Failed to generate music',
        audio: null,
        mood,
        ambiance_prompt: ambiancePrompt
      };
    }
    
    return {
      error: null,
      audio: audioData,
      mood,
      ambiance_prompt: ambiancePrompt
    };
  } catch (error) {
    console.error('Error in generateMusicFromText:', error.message);
    return {
      error: `Error generating music from text: ${error.message}`,
      audio: null,
      mood: 'neutral',
      ambiance_prompt: 'Subtle neutral background ambiance with gentle soundscape'
    };
  }
}

module.exports = {
  generateAmbiancePrompt,
  isPythonAvailable,
  generateMusic,
  generateMusicFromText
}; 