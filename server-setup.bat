@echo off
echo ===== BeNice VPN Server Setup Script =====
echo Current date: %DATE% %TIME%
echo.

REM Set variables
set SSH_HOST=root@45.147.178.200
set REMOTE_PATH=/home/dan31iva/web/benice.games/public_html/vpn/vpn-proj

echo [1/4] Connecting to server to fix repository and configure admin panel...
echo You will be prompted for the password.
echo Password is: tnrE#XrR5(9V
echo.

REM Create a temporary SSH command file with setup commands
> setup_commands.txt echo cd %REMOTE_PATH%
>> setup_commands.txt echo echo "Checking if directory exists and is a Git repository..."
>> setup_commands.txt echo if [ ! -d ".git" ]; then
>> setup_commands.txt echo   echo "Initializing Git repository..."
>> setup_commands.txt echo   git init
>> setup_commands.txt echo   git remote add origin https://github.com/syncRH/vpn-proj.git
>> setup_commands.txt echo   git fetch
>> setup_commands.txt echo   git checkout -f main
>> setup_commands.txt echo fi
>> setup_commands.txt echo echo "Configuring admin panel build script..."
>> setup_commands.txt echo cd admin-panel
>> setup_commands.txt echo if ! grep -q "\"build\":" package.json; then
>> setup_commands.txt echo   echo "Adding build script to package.json..."
>> setup_commands.txt echo   sed -i 's/"scripts": {/"scripts": {\n    "build": "react-scripts build",/g' package.json
>> setup_commands.txt echo fi
>> setup_commands.txt echo echo "Ensuring server listens on all interfaces..."
>> setup_commands.txt echo cd ../server
>> setup_commands.txt echo if ! grep -q "app.listen(PORT, '0.0.0.0'" server.js; then
>> setup_commands.txt echo   echo "Updating server to listen on all interfaces..."
>> setup_commands.txt echo   sed -i 's/app.listen(PORT,/app.listen(PORT, '"'"'0.0.0.0'"'"',/g' server.js
>> setup_commands.txt echo fi
>> setup_commands.txt echo echo "Setting up environment variables..."
>> setup_commands.txt echo cat > .env << EOF
>> setup_commands.txt echo PORT=3000
>> setup_commands.txt echo NODE_ENV=production
>> setup_commands.txt echo MONGODB_URI=mongodb://localhost:27017/vpn-service
>> setup_commands.txt echo JWT_SECRET=your_secure_secret_here
>> setup_commands.txt echo JWT_EXPIRES_IN=24h
>> setup_commands.txt echo EOF
>> setup_commands.txt echo echo "Checking firewall status..."
>> setup_commands.txt echo ufw status
>> setup_commands.txt echo echo "Ensuring port 3000 is allowed..."
>> setup_commands.txt echo ufw allow 3000/tcp
>> setup_commands.txt echo echo "Restarting server..."
>> setup_commands.txt echo pm2 restart vpn-server
>> setup_commands.txt echo echo "Setup completed!"

REM Execute SSH commands
echo Executing setup commands on server...
ssh %SSH_HOST% "bash -s" < setup_commands.txt

REM Clean up temporary file
del setup_commands.txt

echo.
echo [2/4] Setup commands executed on server.

echo.
echo [3/4] Checking server accessibility...
timeout /t 10 /nobreak
ping -n 1 45.147.178.200 > nul
if %ERRORLEVEL% EQU 0 (
    echo Server is online. Checking if application is responding...
    timeout /t 5 /nobreak > nul
    curl -s -o nul -w "HTTP Status: %%{http_code}\n" http://45.147.178.200:3000/
    if !ERRORLEVEL! EQU 0 (
        echo SUCCESS: Server is now accessible at http://45.147.178.200:3000/
    ) else (
        echo WARNING: Server is online but not responding on port 3000
    )
) else (
    echo WARNING: Unable to reach server IP address
)

echo.
echo [4/4] Server setup operation completed!
echo.
echo ===== BeNice VPN Server Setup Completed =====
echo.
echo Next steps:
echo 1. Run deploy.bat to deploy changes
echo 2. If server is still not accessible, SSH to server and check logs with: pm2 logs vpn-server
echo.
echo Press any key to exit...
pause > nul