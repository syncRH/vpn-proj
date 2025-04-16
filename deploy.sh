#!/bin/bash

echo "Starting deployment..."

echo "Step 1: Navigating to project folder"
if [ $? -ne 0 ]; then
  echo "Error: Directory /home/dan31iva/web/benice.games/public_html/vpn/vpn-proj does not exist"
  mkdir -p /home/dan31iva/web/benice.games/public_html/vpn/vpn-proj
  cd /home/dan31iva/web/benice.games/public_html/vpn/vpn-proj
  echo "Initialized new directory"
fi

echo "Step 2: Checking Git repository"
if [ ! -d ".git" ]; then
  echo "Git repository not found. Initializing..."
  git init
  git remote add origin https://github.com/syncRH/vpn-proj.git
  git fetch
  git checkout -f main
else
  echo "Pulling latest changes..."
  git pull origin main
fi

echo "Step 3: Setting up server"
cd /home/dan31iva/web/benice.games/public_html/vpn/vpn-proj/server
echo "Installing server dependencies..."
npm install --omit=dev

echo "Setting up environment variables..."
