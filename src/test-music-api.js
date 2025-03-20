/**
 * Test script for the music generation API endpoint
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Sample text for testing
const sampleText = `
The old house creaked in the wind, its wooden beams protesting against the storm outside.
Rain lashed against the windows, creating a rhythmic pattern that was both soothing and eerie.
Inside, a fire crackled in the hearth, casting dancing shadows on the walls.
The room smelled of old books and wood smoke, a comforting scent that reminded her of childhood.
She sat in the worn armchair, a cup of tea growing cold on the side table as she lost herself in the pages of her novel.
`;

// Test the API endpoint
async function testMusicGenerationAPI() {
  console.log('Testing music generation API endpoint...');
  console.log(`Using sample text of length: ${sampleText.length}`);
  
  try {
    // Make a request to the API endpoint
    console.log('Sending request to API...');
    const response = await axios.post('http://localhost:3000/api/music/generate-from-text', {
      text: sampleText,
      duration: 5.0 // Short duration for testing
    }, {
      responseType: 'arraybuffer',
      validateStatus: null // Don't throw on non-2xx status
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.status !== 200) {
      // Try to parse error message
      const errorText = Buffer.from(response.data).toString('utf8');
      console.error('Error response:', errorText);
      return;
    }
    
    // Get metadata from headers
    const mood = response.headers['x-detected-mood'] || 'unknown';
    const prompt = response.headers['x-ambiance-prompt'] || '';
    const isFallback = response.headers['x-fallback-audio'] === 'true';
    
    console.log('Response headers:');
    console.log(`- Detected mood: ${mood}`);
    console.log(`- Ambiance prompt: ${prompt}`);
    console.log(`- Using fallback audio: ${isFallback ? 'Yes' : 'No'}`);
    
    // Save the audio to a file
    const outputFile = path.join(__dirname, '../test-output.mp3');
    fs.writeFileSync(outputFile, Buffer.from(response.data));
    
    console.log(`Audio saved to: ${outputFile}`);
    console.log(`Audio size: ${response.data.length} bytes`);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

// Run the test
testMusicGenerationAPI(); 