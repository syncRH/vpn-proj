#!/bin/bash

# Test admin login script
echo "Testing admin login..."

# Set variables
API_URL="http://localhost:3000/api/auth/login"
EMAIL="admin@example.com"
PASSWORD="admin123"

# Test login with curl
echo "Sending login request to $API_URL..."
curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

echo -e "\n\nIf you received a token, the login was successful!"
echo "You can use this token in the Authorization header for other API requests."