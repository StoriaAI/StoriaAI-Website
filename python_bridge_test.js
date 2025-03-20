/**
 * Test script for Python Bridge
 * 
 * This script tests the Python bridge and music generation functionality.
 */

const { generateMusicFromText, isPythonAvailable } = require('./src/python_bridge');
const fs = require('fs');
const path = require('path');

// Test text for generating music
const testText = `
It was a dark and stormy night. The wind howled through the trees, 
and the rain pattered against the windowpanes. Lightning flashed, 
illuminating the old mansion on the hill. Inside, a group of friends 
gathered around a crackling fire, telling ghost stories and laughing nervously.
`;

async function runTests() {
  console.log('======= PYTHON BRIDGE TEST =======');
  console.log('Testing Python availability...');
  
  const pythonAvailable = await isPythonAvailable();
  console.log(`Python is ${pythonAvailable ? 'available' : 'not available'}`);
  
  if (!pythonAvailable) {
    console.error('Python is not available. Please install Python and try again.');
    process.exit(1);
  }
  
  console.log('\nTesting music generation from text...');
  console.log('Test text:', testText);
  
  try {
    const result = await generateMusicFromText(testText, 5.0); // Generate a 5-second clip
    
    console.log('\nMusic generation result:');
    console.log('Error:', result.error || 'None');
    console.log('Mood:', result.mood);
    console.log('Ambiance prompt:', result.ambiance_prompt);
    console.log('Audio data size:', result.audio ? `${result.audio.length} bytes` : 'No audio data');
    
    if (result.audio) {
      const outputFile = path.join(__dirname, 'test-output.mp3');
      fs.writeFileSync(outputFile, result.audio);
      console.log(`\nAudio saved to ${outputFile}`);
    } else {
      console.error('\nFailed to generate audio data');
    }
  } catch (error) {
    console.error('\nError generating music:', error);
  }
}

// Run tests
runTests(); 