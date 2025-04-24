@echo off
setlocal enabledelayedexpansion

echo ===== BeNice VPN Selective Update Script =====
echo Current date: %DATE% %TIME%
echo.

set SSH_HOST=root@195.133.15.249
set REMOTE_PATH=/root/vpn-deployment
set COMPONENT=%1

if "%COMPONENT%"=="" (
    echo Error: Component not specified.
    echo Usage: update-component.bat [server^|admin^|all]
    goto :end
)

set IS_VALID=0
if /i "%COMPONENT%"=="server" set IS_VALID=1
if /i "%COMPONENT%"=="admin" set IS_VALID=1
if /i "%COMPONENT%"=="all" set IS_VALID=1

if %IS_VALID%==0 (
    echo Error: Invalid component. Must be one of: server, admin, all
    goto :end
)

echo Preparing to update %COMPONENT% component...
echo.

if exist update-package rmdir /s /q update-package
mkdir update-package

if /i "%COMPONENT%"=="server" (
    echo [1/4] Packaging server files...
    mkdir update-package\server
    xcopy /E /Y server\*.js update-package\server\
    xcopy /E /Y server\package*.json update-package\server\
    xcopy /E /Y server\config update-package\server\config\
    xcopy /E /Y server\controllers update-package\server\controllers\
    xcopy /E /Y server\middleware update-package\server\middleware\
    xcopy /E /Y server\middlewares update-package\server\middlewares\
    xcopy /E /Y server\models update-package\server\models\
    xcopy /E /Y server\routes update-package\server\routes\
    copy server\Dockerfile update-package\server\
    
    echo [2/4] Creating server update package...
    cd update-package
    tar -czf server-update.tar.gz server
    cd ..
    
    echo [3/4] Uploading and deploying server update...
    scp update-package\server-update.tar.gz %SSH_HOST%:%REMOTE_PATH%/
    ssh %SSH_HOST% "cd %REMOTE_PATH% && tar -xzf server-update.tar.gz && rm server-update.tar.gz && docker-compose up -d --no-deps --build server"
    
    echo [4/4] Server update complete. Testing API...
    timeout /t 5 /nobreak > nul
    curl -s -m 10 -o nul -w "API server response code: %%{http_code}\n" http://%SSH_HOST:~5%:3000/
)

if /i "%COMPONENT%"=="admin" (
    echo [1/4] Building admin panel...
    cd admin-panel
    call npm install
    call npm run build
    cd ..
    
    echo [2/4] Packaging admin panel files...
    mkdir update-package\admin
    xcopy /E /Y admin-panel\build\* update-package\admin\
    copy admin-panel\nginx.conf update-package\admin\
    
    echo [3/4] Creating admin panel update package...
    cd update-package
    tar -czf admin-update.tar.gz admin
    cd ..
    
    echo [4/4] Uploading and deploying admin panel update...
    scp update-package\admin-update.tar.gz %SSH_HOST%:%REMOTE_PATH%/
    ssh %SSH_HOST% "cd %REMOTE_PATH% && tar -xzf admin-update.tar.gz && rm admin-update.tar.gz && docker-compose up -d --no-deps admin"
    
    echo Admin panel update complete. Testing admin panel...
    timeout /t 5 /nobreak > nul
    curl -s -m 10 -o nul -w "Admin panel response code: %%{http_code}\n" http://%SSH_HOST:~5%:3001/
)

if /i "%COMPONENT%"=="all" (
    echo Using full deployment script instead...
    call deploy-full.bat
)

echo.
echo Update process finished.
echo.
echo Would you like to check logs for the updated component? (Y/N)
set /p check_logs="Enter your choice: "
if /i "%check_logs%"=="Y" (
    if /i "%COMPONENT%"=="server" (
        ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose logs server"
    ) else if /i "%COMPONENT%"=="admin" (
        ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose logs admin"
    ) else (
        ssh %SSH_HOST% "cd %REMOTE_PATH% && docker-compose logs"
    )
)

:end
endlocal