@echo off
setlocal enabledelayedexpansion

echo ===== BeNice VPN Server Status Check =====
echo Current date: %DATE% %TIME%
echo.

set SSH_HOST=root@195.133.15.249
set REMOTE_PATH=/root/vpn-proj
set SERVER_PORT=3000
set ADMIN_PORT=3001

echo [1/3] Checking server status...
ssh %SSH_HOST% "systemctl status nginx | grep Active; systemctl status mongodb | grep Active; pm2 status"

echo.
echo [2/3] Checking recent server logs...
ssh %SSH_HOST% "cd %REMOTE_PATH%/server && tail -n 20 logs/combined.log || echo 'Log file not found'"

echo.
echo [3/3] Testing service connectivity...
echo Testing API server...
curl -s -m 5 -w "API server response code: %%{http_code}\n" http://%SSH_HOST:~5%:%SERVER_PORT%/
echo Testing admin panel...
curl -s -m 5 -w "Admin panel response code: %%{http_code}\n" http://%SSH_HOST:~5%:%ADMIN_PORT%/

echo.
echo ===== Status Check Complete =====
echo.
echo Commands for further diagnostics:
echo - View full logs: ssh %SSH_HOST% "cd %REMOTE_PATH%/server && cat logs/combined.log"
echo - Check PM2 logs: ssh %SSH_HOST% "pm2 logs vpn-server"
echo - Restart server: ssh %SSH_HOST% "cd %REMOTE_PATH%/server && pm2 restart vpn-server"
echo - Restart nginx: ssh %SSH_HOST% "systemctl restart nginx"
echo.

echo Press any key to exit...
pause > nul
endlocal