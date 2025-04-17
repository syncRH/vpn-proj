#!/bin/bash

# Script to install MongoDB and other requirements on the new VPN server

echo "===== Setting up VPN server environment ====="
echo "Installing system dependencies..."
apt-get update
apt-get install -y curl gnupg net-tools git wget

# Install MongoDB 6.0
echo "Setting up MongoDB repository..."
curl -fsSL https://pgp.mongodb.com/server-6.0.asc | gpg -o /usr/share/keyrings/mongodb-server-6.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list
apt-get update

echo "Installing MongoDB..."
apt-get install -y mongodb-org

echo "Starting MongoDB service..."
systemctl start mongod
systemctl enable mongod

# Install Node.js 18.x
echo "Setting up Node.js repository..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

echo "Installing PM2 globally..."
npm install -g pm2

echo "===== Server setup complete ====="
echo "MongoDB status: $(systemctl is-active mongod)"
echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "PM2 version: $(pm2 -v)"