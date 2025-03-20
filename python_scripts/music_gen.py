#!/usr/bin/env python3
"""
Music Generator for Storia

This script uses ElevenLabs API to generate background music based on
a prompt that describes the emotional mood and setting.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs import ElevenLabs
import logging

# Set up logging - use stderr instead of stdout for logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr)  # Changed from stdout to stderr
    ]
)
logger = logging.getLogger('music_gen')

def load_environment():
    """Load environment variables from .env files"""
    logger.info("Starting environment loading process for music generation")
    # Try to load from project root .env file
    root_dir = Path(__file__).resolve().parent.parent
    env_file = root_dir / '.env'
    env_prod_file = root_dir / '.env.production'
    
    logger.info(f"Looking for env files in: {root_dir}")
    logger.info(f"Checking for .env file: {env_file.exists()}")
    logger.info(f"Checking for .env.production file: {env_prod_file.exists()}")
    
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
        return False
    
    logger.info(f"API key loaded successfully (length: {len(api_key)})")
    logger.info(f"API key starts with: {api_key[:5]}***")
    return True

def generate_music(prompt, duration_seconds=15.0, prompt_influence=0.7, output_file=None):
    """
    Generate music based on a prompt using ElevenLabs API
    
    Args:
        prompt (str): The prompt describing the music to generate
        duration_seconds (float): Duration of the music in seconds
        prompt_influence (float): How much the prompt influences the generation (0.0-1.0)
        output_file (str): Path to save the generated audio (optional)
        
    Returns:
        bytes: The generated audio data or None if there was an error
    """
    if not load_environment():
        logger.error("Failed to load environment variables")
        return None
    
    try:
        logger.info(f"Generating music with prompt: {prompt}")
        logger.info(f"Duration: {duration_seconds} seconds, Influence: {prompt_influence}")
        
        # Create ElevenLabs client with proper error handling
        try:
            client = ElevenLabs(
                api_key=os.getenv('ELEVENLABS_API_KEY'),
            )
            logger.info("Successfully created ElevenLabs client")
        except Exception as client_error:
            logger.error(f"Error creating ElevenLabs client: {str(client_error)}")
            return None
        
        logger.info("Sending request to ElevenLabs API...")
        response = client.text_to_sound_effects.convert(
            text=prompt,
            prompt_influence=prompt_influence,
            duration_seconds=duration_seconds,
        )
        
        logger.info("Successfully received response from ElevenLabs")
        
        # Join all chunks into one bytes object
        audio_data = b"".join(response)
        
        # Save to file if output_file is specified
        if output_file:
            try:
                with open(output_file, "wb") as f:
                    f.write(audio_data)
                logger.info(f"Saved audio to {output_file}")
            except Exception as e:
                logger.error(f"Error saving audio file: {str(e)}")
        
        return audio_data
        
    except Exception as e:
        logger.error(f"Error generating music: {str(e)}")
        logger.error(f"Error details: {type(e).__name__}")
        return None

def main():
    """Main function to run the script from command line"""
    parser = argparse.ArgumentParser(description='Generate music based on a prompt')
    parser.add_argument('--prompt', type=str, help='Prompt describing the music to generate')
    parser.add_argument('--duration', type=float, default=15.0, help='Duration in seconds')
    parser.add_argument('--influence', type=float, default=0.7, help='Prompt influence (0.0-1.0)')
    parser.add_argument('--output', type=str, help='Output file path')
    
    args = parser.parse_args()
    
    prompt = args.prompt
    if not prompt:
        # If no prompt provided via command line, try to read from stdin
        if not sys.stdin.isatty():
            prompt = sys.stdin.read().strip()
    
    if not prompt:
        logger.error("No prompt provided")
        return 1
    
    audio_data = generate_music(
        prompt=prompt, 
        duration_seconds=args.duration,
        prompt_influence=args.influence,
        output_file=args.output
    )
    
    if audio_data:
        # If output file wasn't specified, output to stdout
        if not args.output:
            if hasattr(sys.stdout, 'buffer'):
                sys.stdout.buffer.write(audio_data)
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())

