#!/usr/bin/env python3
"""
Test script for music generator
"""

import os
import sys
import json
from pathlib import Path
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('test_music')

# Add parent directory to path to import music_gen
sys.path.append(str(Path(__file__).resolve().parent))
import music_gen

def test_music_generation():
    """Test the music generator with a sample prompt"""
    logger.info("Starting music generator test")
    
    # Sample prompt for testing
    sample_prompt = """
    Create a background ambiance with a soft instrumental piano melody playing in the background, 
    interwoven with sounds of distant thunder rumbling, rain tapping against window panes, 
    and occasional crackling of the fire. This combination will evoke a sense of warmth, 
    nostalgia, and a hint of mystery, perfect for a cozy night in an old house during a storm.
    """
    
    logger.info(f"Using sample prompt of length: {len(sample_prompt)}")
    
    # Test the music generator
    try:
        # Create a temporary output file
        output_file = Path(os.path.expanduser("~/Desktop/test_music_output.mp3"))
        
        # Generate music with a short duration for testing
        audio_data = music_gen.generate_music(
            prompt=sample_prompt,
            duration_seconds=5.0,  # Short duration for testing
            prompt_influence=0.7,
            output_file=str(output_file)
        )
        
        # Check if we got valid audio data
        if audio_data and len(audio_data) > 0:
            logger.info(f"✅ Test passed: Generated {len(audio_data)} bytes of audio data")
            logger.info(f"Audio saved to: {output_file}")
            return True
        else:
            logger.error("❌ Test failed: Did not receive valid audio data")
            return False
    except Exception as e:
        logger.error(f"❌ Test failed with exception: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_music_generation()
    sys.exit(0 if success else 1) 