#!/usr/bin/env python3
"""
Ambiance Generator for Storia

This script uses OpenAI's API to analyze the current page content and generate
a prompt for creating background ambiance that matches the emotional mood and setting.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv
import openai
from openai import OpenAI
import logging
import traceback  # Added for more detailed error tracing

# Set up logging with more detailed format - send logs to stderr instead of stdout
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stderr)  # Change from stdout to stderr
    ]
)
logger = logging.getLogger('ambiance_generator')

def load_environment():
    """Load environment variables from .env files"""
    logger.info("Starting environment loading process")
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
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        logger.error("OPENAI_API_KEY not found in environment variables")
        # List all environment variables for debugging (without their values)
        env_vars = list(os.environ.keys())
        logger.info(f"Available environment variables: {env_vars}")
        return False
    
    logger.info(f"API key loaded successfully (length: {len(api_key)})")
    logger.info(f"API key starts with: {api_key[:5]}***")
    return True

def analyze_text_content(text):
    """
    Analyze the text content using OpenAI API to extract emotional mood and setting
    
    Args:
        text (str): The text content to analyze
        
    Returns:
        dict: Analysis results including mood, setting, and ambiance prompt
    """
    logger.info(f"Starting analysis of text (length: {len(text)})")
    if not text or len(text.strip()) < 10:
        logger.warning("Text content too short for analysis")
        return {
            "mood": "neutral",
            "setting": "unspecified",
            "ambiance_prompt": "Subtle neutral background ambiance with gentle soundscape"
        }
    
    # Truncate text if it's too long
    max_length = 4000  # Limit to avoid token limits
    if len(text) > max_length:
        text = text[:max_length] + "..."
        logger.info(f"Text truncated to {max_length} characters")
    
    try:
        logger.info("Creating OpenAI client and sending request")
        # Print first 100 characters of the text for debugging
        logger.info(f"Text begins with: {text[:100]}...")
        
        # Get the API key
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            logger.error("OPENAI_API_KEY not found in environment variables")
            return {
                "mood": "neutral",
                "setting": "unspecified",
                "error": "OPENAI_API_KEY not found in environment variables",
                "ambiance_prompt": "Subtle neutral background ambiance with gentle soundscape"
            }
        
        # Set the API key in the environment
        os.environ["OPENAI_API_KEY"] = api_key
        
        # Import required modules
        import openai
        from openai import OpenAI
        
        try:
            # Create the OpenAI client using the environment variable
            client = OpenAI()
            logger.info("Successfully created OpenAI client using environment variable")
        except Exception as e:
            logger.error(f"Failed to create OpenAI client: {str(e)}")
            # Fall back to a default response
            return {
                "mood": "neutral",
                "setting": "unspecified",
                "error": f"Failed to create OpenAI client: {str(e)}",
                "ambiance_prompt": "Subtle neutral background ambiance with gentle soundscape"
            }
        
        # Create the analysis prompt
        system_prompt = """
        You are an expert at analyzing text and extracting emotional mood and setting details.
        Analyze the provided text and extract:
        1. The dominant emotional mood (e.g., joyful, tense, melancholic, peaceful)
        2. The setting or environment described (e.g., forest, urban, ocean, space)
        3. Any notable ambient sounds that would be present in this scene
        4. A concise prompt (max 100 words) for generating background ambiance that combines 
           subtle music and soundscape elements matching the mood and setting
        """
        
        logger.info("Sending request to OpenAI API...")
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        # Extract the response content
        analysis_text = response.choices[0].message.content
        logger.info("Successfully received analysis from OpenAI")
        logger.info(f"Full analysis response: {analysis_text}")
        
        # Parse the analysis to extract structured information
        mood = "neutral"
        setting = "unspecified"
        ambient_sounds = []
        ambiance_prompt = ""
        
        # Simple parsing of the response
        lines = analysis_text.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith("1.") and "mood" in line.lower():
                mood = line.split(":", 1)[1].strip() if ":" in line else line[2:].strip()
                logger.info(f"Extracted mood: {mood}")
            elif line.startswith("2.") and "setting" in line.lower():
                setting = line.split(":", 1)[1].strip() if ":" in line else line[2:].strip()
                logger.info(f"Extracted setting: {setting}")
            elif line.startswith("3.") and "ambient" in line.lower():
                sounds_text = line.split(":", 1)[1].strip() if ":" in line else line[2:].strip()
                ambient_sounds = [s.strip() for s in sounds_text.split(',')]
                logger.info(f"Extracted ambient sounds: {ambient_sounds}")
            elif line.startswith("4.") and "prompt" in line.lower():
                ambiance_prompt = line.split(":", 1)[1].strip() if ":" in line else line[2:].strip()
                # If the prompt continues on next lines, capture those too
                prompt_index = lines.index(line)
                for i in range(prompt_index + 1, len(lines)):
                    if lines[i].strip() and not lines[i].strip().startswith(("1.", "2.", "3.")):
                        ambiance_prompt += " " + lines[i].strip()
                logger.info(f"Extracted ambiance prompt: {ambiance_prompt}")
        
        # If we couldn't extract a proper prompt, use the whole analysis
        if not ambiance_prompt:
            ambiance_prompt = analysis_text
            logger.warning("Could not extract structured prompt, using full analysis")
        
        return {
            "mood": mood,
            "setting": setting,
            "ambient_sounds": ambient_sounds,
            "ambiance_prompt": ambiance_prompt
        }
        
    except Exception as e:
        logger.error(f"Error analyzing text with OpenAI: {str(e)}")
        # Print full traceback for debugging
        logger.error(f"Traceback: {traceback.format_exc()}")
        return {
            "mood": "neutral",
            "setting": "unspecified",
            "error": str(e),
            "ambiance_prompt": "Subtle neutral background ambiance with gentle soundscape"
        }

def generate_ambiance_prompt(text_content):
    """
    Generate an ambiance prompt based on the text content
    
    Args:
        text_content (str): The text content to analyze
        
    Returns:
        str: JSON string with the analysis results
    """
    logger.info("--- STARTING AMBIANCE GENERATION ---")
    logger.info(f"Received text content of length: {len(text_content)}")
    
    if not load_environment():
        logger.error("Failed to load environment, returning default response")
        return json.dumps({
            "error": "Failed to load environment variables",
            "ambiance_prompt": "Subtle neutral background ambiance with gentle soundscape"
        })
    
    analysis = analyze_text_content(text_content)
    
    # Log the generated prompt
    logger.info(f"Final analysis results: {json.dumps(analysis)}")
    logger.info(f"Generated ambiance prompt: {analysis['ambiance_prompt']}")
    logger.info("--- COMPLETED AMBIANCE GENERATION ---")
    
    return json.dumps(analysis)

def main():
    """Main function to run the script from command line"""
    logger.info("Starting ambiance_generator.py main function")
    parser = argparse.ArgumentParser(description='Generate ambiance prompts from text content')
    parser.add_argument('--text', type=str, help='Text content to analyze')
    parser.add_argument('--file', type=str, help='File containing text content to analyze')
    
    args = parser.parse_args()
    logger.info(f"Command arguments: text={args.text is not None}, file={args.file}")
    
    text_content = ""
    if args.text:
        text_content = args.text
        logger.info(f"Using text provided via --text argument (length: {len(text_content)})")
    elif args.file:
        try:
            with open(args.file, 'r', encoding='utf-8') as f:
                text_content = f.read()
                logger.info(f"Read text from file: {args.file} (length: {len(text_content)})")
        except Exception as e:
            logger.error(f"Error reading file: {str(e)}")
            return 1
    else:
        # If no arguments provided, try to read from stdin
        if not sys.stdin.isatty():
            text_content = sys.stdin.read()
            logger.info(f"Read text from stdin (length: {len(text_content)})")
        else:
            logger.error("No input provided (no --text, --file, or stdin)")
            parser.print_help()
            return 1
    
    if not text_content:
        logger.error("No text content provided")
        return 1
    
    result = generate_ambiance_prompt(text_content)
    print(result)  # This will go to stdout only, while logs go to stderr
    return 0

if __name__ == "__main__":
    sys.exit(main()) 