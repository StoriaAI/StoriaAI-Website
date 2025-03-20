#!/usr/bin/env node

/**
 * Setup Vercel Environment Variables
 * 
 * This script helps migrate API keys from .env files to Vercel 
 * environment variables by generating commands you can run.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}=== Storia Vercel Environment Setup ===${colors.reset}\n`);

// Check if Vercel CLI is installed
try {
  console.log(`${colors.blue}Checking for Vercel CLI...${colors.reset}`);
  execSync('vercel --version', { stdio: 'ignore' });
  console.log(`${colors.green}✓ Vercel CLI is installed${colors.reset}\n`);
} catch (error) {
  console.error(`${colors.red}✗ Vercel CLI is not installed.${colors.reset}`);
  console.log(`${colors.yellow}Please install it with: npm install -g vercel${colors.reset}\n`);
}

// Function to read environment variables from .env file
function readEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`${colors.yellow}File not found: ${filePath}${colors.reset}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const envVars = {};
    
    fileContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.error(`${colors.red}Error reading ${filePath}: ${error.message}${colors.reset}`);
    return null;
  }
}

// Read environment variables from .env and .env.production
const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env');
const envProdPath = path.join(rootDir, '.env.production');

console.log(`${colors.blue}Reading environment files...${colors.reset}`);
const envVars = readEnvFile(envPath);
const envProdVars = readEnvFile(envProdPath);

if (!envVars && !envProdVars) {
  console.error(`${colors.red}No environment files found.${colors.reset}`);
  process.exit(1);
}

// Combine environment variables, with production taking precedence
const combinedEnvVars = { ...envVars, ...envProdVars };

// Check for API keys
const importantKeys = [
  'ELEVENLABS_API_KEY',
  'OPENAI_API_KEY'
];

const missingKeys = [];
importantKeys.forEach(key => {
  if (!combinedEnvVars[key]) {
    missingKeys.push(key);
  }
});

if (missingKeys.length > 0) {
  console.warn(`${colors.yellow}⚠ Missing important keys: ${missingKeys.join(', ')}${colors.reset}`);
} else {
  console.log(`${colors.green}✓ All important API keys found${colors.reset}`);
}

// Generate Vercel CLI commands
console.log(`\n${colors.cyan}=== Vercel Environment Setup Commands ===${colors.reset}`);
console.log(`${colors.yellow}Run these commands to set up your Vercel environment:${colors.reset}\n`);

// First login command
console.log(`${colors.green}# 1. Login to Vercel if not already logged in:${colors.reset}`);
console.log(`vercel login\n`);

// Project linking command
console.log(`${colors.green}# 2. Link your local project to Vercel:${colors.reset}`);
console.log(`vercel link\n`);

// Environment variables commands
console.log(`${colors.green}# 3. Set environment variables:${colors.reset}`);

Object.keys(combinedEnvVars).forEach(key => {
  if (importantKeys.includes(key)) {
    console.log(`vercel env add ${key}`);
  }
});

console.log('');

// Set environment variables for all environments
console.log(`${colors.green}# 4. Apply environment variables to all environments:${colors.reset}`);
console.log(`vercel env ls`);
console.log(`vercel --prod\n`);

console.log(`${colors.cyan}=== Additional Vercel Deployment Settings ===${colors.reset}`);
console.log(`${colors.yellow}Make sure these settings are configured in your Vercel project:${colors.reset}\n`);

console.log(`${colors.green}1. Node.js Version:${colors.reset} 16.x or higher`);
console.log(`${colors.green}2. Build Command:${colors.reset} npm run vercel-build`);
console.log(`${colors.green}3. Output Directory:${colors.reset} public (if using a static site) or leave default`);
console.log(`${colors.green}4. Development Command:${colors.reset} npm run dev\n`);

console.log(`${colors.cyan}=== Troubleshooting ===${colors.reset}`);
console.log(`${colors.yellow}If music generation fails on Vercel:${colors.reset}\n`);

console.log(`1. Check that API keys are correctly set up with: ${colors.cyan}vercel env ls${colors.reset}`);
console.log(`2. Test your API key directly with: ${colors.cyan}curl -H "xi-api-key: YOUR_KEY" https://api.elevenlabs.io/v1/voices${colors.reset}`);
console.log(`3. Check logs with: ${colors.cyan}vercel logs${colors.reset}`);
console.log(`4. Try the API test page at: ${colors.cyan}https://your-domain.vercel.app/api-test.html${colors.reset}\n`);

console.log(`${colors.green}For more information, see the README or contact support.${colors.reset}`); 