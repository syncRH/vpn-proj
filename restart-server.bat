@echo off
setlocal enabledelayedexpansion

echo ===== BeNice VPN Server Restart Script =====
echo Current date: %DATE% %TIME%
echo.

set SSH_HOST=root@195.133.15.249
set REMOTE_PATH=/root/vpn-proj
set SERVER_PORT=3000

echo Restarting VPN server service...
ssh %SSH_HOST% "cd %REMOTE_PATH%/server && pm2 restart vpn-server || pm2 start server.js --name vpn-server"

echo.
echo Testing server accessibility...
timeout /t 3 /nobreak > nul
curl -s -m 10 -o nul -w "Server response code: %%{http_code}\n" http://%SSH_HOST:~5%:%SERVER_PORT%/

echo.
echo To check server logs, run:
echo ssh %SSH_HOST% "cd %REMOTE_PATH%/server && pm2 logs vpn-server"
echo.

echo Press any key to exit...
pause > nul
endlocal