#!/bin/bash

echo "===== BeNice VPN Deployment Script ====="
echo "Current date: $(date)"
echo

# Check for git installation
if ! command -v git &> /dev/null; then
    echo "[ERROR] Git is not installed. Please install Git and try again."
    exit 1
fi

# Set variables
SSH_HOST="root@45.147.178.200"
REMOTE_PATH="/home/dan31iva/web/benice.games/public_html/vpn/vpn-proj"

echo "[1/5] Adding all changes to git..."
git add .

echo
echo "[2/5] Committing changes..."
read -p "Enter commit message (or press Enter for default): " COMMIT_MSG
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Automatic deployment $(date)"
fi
git commit -m "$COMMIT_MSG"

echo
echo "[3/5] Pushing to GitHub..."
git push

echo
echo "[4/5] Connecting to server and updating project..."
echo "This may take a few minutes..."

# Create SSH commands
SSH_COMMANDS="cd $REMOTE_PATH && \
git pull && \
cd $REMOTE_PATH/server && \
npm install --production && \
pm2 restart vpn-server && \
cd $REMOTE_PATH/admin-panel && \
npm install --production && \
npm run build"

# Execute SSH commands
echo "Using SSH to connect to server..."
echo "You will be prompted for the password."
ssh $SSH_HOST "$SSH_COMMANDS"

echo
echo "[5/5] Deployment completed!"
echo
echo "===== BeNice VPN Deployment Completed ====="
echo "Server and admin panel have been updated and restarted."
echo "Visit http://45.147.178.200:3000/ to check API status"
echo