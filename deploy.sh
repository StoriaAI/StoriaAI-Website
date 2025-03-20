#!/bin/bash

# Storia Deployment Script

echo "Deploying Storia to production..."

# Kill any running instances
echo "Stopping any running instances..."
pkill -f "node src/index.js" || true

# Build the application
echo "Building the application..."
npm run build

# Start the server in production mode
echo "Starting server in production mode..."
npm run prod &

echo "Deployment complete! Server is running in production mode."
echo "Access the application at http://localhost:3000" 