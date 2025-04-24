@echo off
setlocal enabledelayedexpansion

echo ===== BeNice VPN Direct Upload Script =====
echo Current date: %DATE% %TIME%
echo.

set SSH_HOST=root@195.133.15.249
set REMOTE_PATH=/root/vpn-proj
set PORT=4000

echo [1/4] Preparing for upload...
echo Creating remote directories...
ssh %SSH_HOST% "mkdir -p %REMOTE_PATH%/server/logs %REMOTE_PATH%/server/uploads/configs"

echo.
echo [2/4] Uploading server files...
rem Upload server files
echo Uploading server files...
scp -r "server\*.js" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp -r "server\package*.json" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp -r "server\config" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp -r "server\controllers" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp -r "server\middleware" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp -r "server\models" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp -r "server\routes" "%SSH_HOST%:%REMOTE_PATH%/server/"
scp "server\ecosystem.config.js" "%SSH_HOST%:%REMOTE_PATH%/server/"

echo.
echo [3/4] Setting up server...
echo Creating .env file...
ssh %SSH_HOST% "cat > %REMOTE_PATH%/server/.env << 'EOL'
PORT=%PORT%
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/vpn-service
JWT_SECRET=secure_secret_key_production
JWT_EXPIRES_IN=24h
CORS_ORIGIN=*
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
LOGS_DIR=logs
CONFIGS_UPLOAD_PATH=uploads/configs
EOL"

echo Installing dependencies...
ssh %SSH_HOST% "cd %REMOTE_PATH%/server && npm install"

echo Starting server with PM2...
ssh %SSH_HOST% "cd %REMOTE_PATH%/server && pm2 delete vpn-server 2>/dev/null || echo \"Server not running yet\" && pm2 start ecosystem.config.js"

echo.
echo [4/4] Testing server...
timeout /t 5 /nobreak > nul
echo Testing connection to server...
curl -s -m 10 -o nul -w "Server response code: %%{http_code}\n" http://%SSH_HOST:~5%:%PORT%/

echo.
echo ===== Upload Complete =====
echo.
echo Your server should be accessible at http://%SSH_HOST:~5%:%PORT%/
echo.
echo To check server logs, run:
echo ssh %SSH_HOST% "cd %REMOTE_PATH%/server && pm2 logs vpn-server"
echo.
echo Press any key to exit...
pause > nul
endlocal