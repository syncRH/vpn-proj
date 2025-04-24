@echo off
REM --- start-server.bat --- launch the VPN API locally

echo Installing dependencies...
cd server
call npm install

echo Loading environment...
REM ensure .env is in place at vpn-proj or server/
cd ..

echo Starting server...
cd server
call npm run start

pause