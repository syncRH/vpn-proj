@echo off
echo ===== Starting Automatic VPN Project Deployment =====
echo.

REM Setting variables
set SERVER=195.133.15.249
set PROJECT_PATH=~/vpn-proj
set COMMIT_MESSAGE=Security update %date% %time%

REM First, commit and push local changes
echo Checking for local changes...
git add .
git commit -m "%COMMIT_MESSAGE%"
echo Pushing changes to repository...
git push
echo Local changes committed and pushed.

REM Connecting to server and executing deployment commands
echo Connecting to server %SERVER%...
echo Executing update commands in directory %PROJECT_PATH%...

REM Handling untracked files and updating the project
ssh root@%SERVER% "cd %PROJECT_PATH% && git stash -u || true && rm -f package.json.bak package-lock.json.bak && [ -f package.json ] && mv package.json package.json.bak || true && [ -f package-lock.json ] && mv package-lock.json package-lock.json.bak || true && git pull && [ -f package.json.bak ] && mv package.json.bak package.json || true && [ -f package-lock.json.bak ] && mv package-lock.json.bak package-lock.json || true && npm install && docker-compose down && docker-compose build && docker-compose up -d && echo 'Deployment successfully completed!'"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===== Deployment Successfully Completed! =====
) else (
    echo.
    echo ===== An Error Occurred During Deployment! =====
)

echo.
echo Press any key to exit...
pause > nul
