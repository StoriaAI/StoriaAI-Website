#!/usr/bin/env python3
"""
Test script for ambiance generator
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
logger = logging.getLogger('test_ambiance')

# Add parent directory to path to import ambiance_generator
sys.path.append(str(Path(__file__).resolve().parent))
import ambiance_generator

def test_ambiance_generation():
    """Test the ambiance generator with a sample text"""
    logger.info("Starting ambiance generator test")
    
    # Sample text for testing
    sample_text = """
    The old house creaked in the wind, its wooden beams protesting against the storm outside.
    Rain lashed against the windows, creating a rhythmic pattern that was both soothing and eerie.
    Inside, a fire crackled in the hearth, casting dancing shadows on the walls.
    The room smelled of old books and wood smoke, a comforting scent that reminded her of childhood.
    She sat in the worn armchair, a cup of tea growing cold on the side table as she lost herself in the pages of her novel.
    """
    
    logger.info(f"Using sample text of length: {len(sample_text)}")
    
    # Test the ambiance generator
    try:
        result = ambiance_generator.analyze_text_content(sample_text)
        logger.info(f"Ambiance generation result: {json.dumps(result, indent=2)}")
        
        # Check if we got a valid result
        if result and 'ambiance_prompt' in result:
            logger.info("✅ Test passed: Received valid ambiance prompt")
            logger.info(f"Ambiance prompt: {result['ambiance_prompt']}")
            logger.info(f"Detected mood: {result.get('mood', 'unknown')}")
            return True
        else:
            logger.error("❌ Test failed: Did not receive valid ambiance prompt")
            logger.error(f"Result: {result}")
            return False
    except Exception as e:
        logger.error(f"❌ Test failed with exception: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_ambiance_generation()
    sys.exit(0 if success else 1) 