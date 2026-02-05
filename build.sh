#!/bin/bash
set -e

echo "Current directory: $(pwd)"
echo "Listing contents:"
ls -la

if [ ! -d "client" ]; then
  echo "ERROR: client directory not found!"
  echo "Current directory contents:"
  ls -la
  exit 1
fi

echo "Found client directory, changing to it..."
cd client

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Build complete!"
