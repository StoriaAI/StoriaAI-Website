#!/usr/bin/env python3
"""
Environment Checker for StoriaAI

This script checks the Python environment and verifies that all required packages
are installed and functioning properly.
"""

import os
import sys
import json
import platform
import importlib.util
from pathlib import Path

def check_package(package_name):
    """Check if a package is installed and get its version"""
    spec = importlib.util.find_spec(package_name)
    if spec is None:
        return {
            "installed": False,
            "version": None,
            "error": f"Package {package_name} is not installed"
        }
    
    try:
        module = importlib.import_module(package_name)
        version = getattr(module, "__version__", "unknown")
        return {
            "installed": True,
            "version": version,
            "error": None
        }
    except Exception as e:
        return {
            "installed": False,
            "version": None,
            "error": str(e)
        }

def check_env_file(file_path):
    """Check if an environment file exists and has API keys"""
    try:
        if not file_path.exists():
            return {
                "exists": False,
                "has_elevenlabs_key": False,
                "has_openai_key": False,
                "error": "File does not exist"
            }
        
        with open(file_path, 'r') as f:
            content = f.read()
            
        has_elevenlabs = "ELEVENLABS_API_KEY" in content
        has_openai = "OPENAI_API_KEY" in content
        
        return {
            "exists": True,
            "has_elevenlabs_key": has_elevenlabs,
            "has_openai_key": has_openai,
            "error": None
        }
    except Exception as e:
        return {
            "exists": False,
            "has_elevenlabs_key": False,
            "has_openai_key": False,
            "error": str(e)
        }

def check_environment():
    """Check the overall environment and return results as JSON"""
    result = {
        "python": {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "executable": sys.executable,
            "path": sys.path
        },
        "system": {
            "platform": platform.platform(),
            "system": platform.system(),
            "node": platform.node(),
            "processor": platform.processor()
        },
        "packages": {
            "elevenlabs": check_package("elevenlabs"),
            "openai": check_package("openai"),
            "dotenv": check_package("dotenv"),
            "requests": check_package("requests")
        },
        "environment_variables": {
            "ELEVENLABS_API_KEY": os.environ.get("ELEVENLABS_API_KEY") is not None,
            "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY") is not None
        }
    }
    
    # Check env files
    root_dir = Path(__file__).resolve().parent.parent
    result["env_files"] = {
        ".env": check_env_file(root_dir / ".env"),
        ".env.production": check_env_file(root_dir / ".env.production")
    }
    
    # Check if key Python scripts exist
    result["files"] = {
        "music_gen.py": (root_dir / "python_scripts" / "music_gen.py").exists(),
        "ambiance_generator.py": (root_dir / "python_scripts" / "ambiance_generator.py").exists(),
        "requirements.txt": (root_dir / "python_scripts" / "requirements.txt").exists()
    }
    
    return result

def main():
    """Main function to run the check and print results"""
    result = check_environment()
    print(json.dumps(result, indent=2))
    
    # Check for critical issues
    critical_issues = []
    
    # Check Python packages
    for package_name, package_info in result["packages"].items():
        if not package_info["installed"]:
            critical_issues.append(f"Package {package_name} is not installed")
    
    # Check environment variables
    if not result["environment_variables"]["ELEVENLABS_API_KEY"]:
        critical_issues.append("ELEVENLABS_API_KEY environment variable is not set")
    
    if not result["environment_variables"]["OPENAI_API_KEY"]:
        critical_issues.append("OPENAI_API_KEY environment variable is not set")
    
    # Print critical issues
    if critical_issues:
        print("\nCRITICAL ISSUES FOUND:")
        for issue in critical_issues:
            print(f"- {issue}")
        return 1
    else:
        print("\nNo critical issues found. Environment looks good!")
        return 0

if __name__ == "__main__":
    sys.exit(main()) 