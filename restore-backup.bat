@echo off
setlocal enabledelayedexpansion

echo ===== BeNice VPN Restore from Backup Script =====
echo Current date: %DATE% %TIME%
echo.

set SSH_HOST=root@195.133.15.249
set REMOTE_PATH=/root/vpn-deployment
set BACKUP_DIR=/root/vpn-backup

echo Retrieving available backups...
ssh %SSH_HOST% "ls -la %BACKUP_DIR%"
echo.

echo Please enter the backup folder name to restore from:
set /p BACKUP_NAME="Backup folder name: "

if "%BACKUP_NAME%"=="" (
    echo Error: No backup folder name provided.
    goto :end
)

set BACKUP_PATH=%BACKUP_DIR%/%BACKUP_NAME%

echo.
echo Checking if backup exists...
ssh %SSH_HOST% "if [ ! -d %BACKUP_PATH% ]; then echo Backup not found; exit 1; fi"
if ERRORLEVEL 1 (
    echo Error: Backup folder %BACKUP_NAME% not found.
    goto :end
)

echo.
echo Are you sure you want to restore from backup %BACKUP_NAME%?
echo This will stop all running services and replace the current deployment.
set /p CONFIRM="Type 'yes' to continue: "

if /i not "%CONFIRM%"=="yes" (
    echo Restore cancelled.
    goto :end
)

echo.
echo [1/4] Stopping current services...
ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose down"

echo [2/4] Backing up current deployment...
set CURRENT_BACKUP=%BACKUP_DIR%/pre-restore-%DATE:~-4,4%%DATE:~-7,2%%DATE:~-10,2%-%TIME:~0,2%%TIME:~3,2%
ssh %SSH_HOST% "mkdir -p %CURRENT_BACKUP% && cp -r %REMOTE_PATH%/* %CURRENT_BACKUP%/ 2>/dev/null || true"

echo [3/4] Restoring from backup...
ssh %SSH_HOST% "rm -rf %REMOTE_PATH%/* && cp -r %BACKUP_PATH%/* %REMOTE_PATH%/"

echo [4/4] Starting services from backup...
ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose up -d"

echo.
echo ===== Checking Restored Services =====
timeout /t 10 /nobreak > nul

echo Running health checks...
ssh %SSH_HOST% "cd %REMOTE_PATH% && ./healthcheck.sh"
if ERRORLEVEL 1 (
    echo Some services may not be running correctly. Check logs for details.
    ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose logs"
) else (
    echo All services running correctly.
)

echo Testing API server...
curl -s -m 10 -o nul -w "API server response code: %%{http_code}\n" http://%SSH_HOST:~5%:3000/

echo Testing admin panel...
curl -s -m 10 -o nul -w "Admin panel response code: %%{http_code}\n" http://%SSH_HOST:~5%:3001/

echo.
echo ===== Restore Complete =====
echo.
echo A backup of the current deployment before restore was created at %CURRENT_BACKUP%
echo.

echo Would you like to check the logs of the restored deployment? (Y/N)
set /p check_logs="Enter your choice: "
if /i "%check_logs%"=="Y" (
    ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose logs"
)

:end
echo Press any key to exit...
pause > nul
endlocal