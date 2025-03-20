#!/usr/bin/env python3
"""
Test ElevenLabs API Connection

This script tests the connection to the ElevenLabs API and verifies
that the API key is working correctly.
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
import requests
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr)
    ]
)
logger = logging.getLogger('elevenlabs_test')

def load_environment():
    """Load environment variables from .env files"""
    logger.info("Starting environment loading process for ElevenLabs test")
    # Try to load from project root .env file
    root_dir = Path(__file__).resolve().parent.parent
    env_file = root_dir / '.env'
    env_prod_file = root_dir / '.env.production'
    
    logger.info(f"Looking for env files in: {root_dir}")
    logger.info(f"Checking for .env file: {env_file.exists()}")
    logger.info(f"Checking for .env.production file: {env_prod_file.exists()}")
    
    # Log all environment variables (excluding sensitive values)
    logger.info("Current environment variables:")
    for key in os.environ:
        if 'API_KEY' in key or 'SECRET' in key or 'PASSWORD' in key:
            value = "***REDACTED***"
        else:
            value = os.environ[key]
        logger.info(f"  {key}: {value}")
    
    # Try different env files
    if env_prod_file.exists():
        load_dotenv(env_prod_file)
        logger.info(f"Loaded environment from {env_prod_file}")
    elif env_file.exists():
        load_dotenv(env_file)
        logger.info(f"Loaded environment from {env_file}")
    else:
        logger.warning("No .env file found")
    
    # Check if API key is available
    api_key = os.getenv('ELEVENLABS_API_KEY')
    if not api_key:
        logger.error("ELEVENLABS_API_KEY not found in environment variables")
        return None
    
    logger.info(f"API key loaded successfully (length: {len(api_key)})")
    logger.info(f"API key starts with: {api_key[:5]}***")
    return api_key

def test_elevenlabs_api():
    """Test connection to ElevenLabs API"""
    api_key = load_environment()
    if not api_key:
        logger.error("Failed to load API key")
        return False
    
    try:
        logger.info("Testing ElevenLabs API connection...")
        response = requests.get(
            "https://api.elevenlabs.io/v1/user",
            headers={"xi-api-key": api_key}
        )
        
        logger.info(f"API response status code: {response.status_code}")
        
        if response.status_code == 200:
            logger.info("API connection successful!")
            user_data = response.json()
            logger.info(f"User data: {json.dumps(user_data, indent=2)}")
            
            logger.info("Testing sound effects endpoint availability...")
            sound_effects_response = requests.get(
                "https://api.elevenlabs.io/v1/sound-effects/categories",
                headers={"xi-api-key": api_key}
            )
            
            logger.info(f"Sound effects endpoint status code: {sound_effects_response.status_code}")
            
            if sound_effects_response.status_code == 200:
                logger.info("Sound effects endpoint available!")
                categories = sound_effects_response.json()
                logger.info(f"Available categories: {json.dumps(categories, indent=2)}")
                return True
            else:
                logger.error(f"Sound effects endpoint not available: {sound_effects_response.text}")
                return False
        else:
            logger.error(f"API connection failed: {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Error testing ElevenLabs API: {str(e)}")
        return False

def main():
    """Main function"""
    success = test_elevenlabs_api()
    if success:
        logger.info("ElevenLabs API test successful!")
        return 0
    else:
        logger.error("ElevenLabs API test failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 