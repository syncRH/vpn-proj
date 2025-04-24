@echo off
echo ===== Начало автоматического деплоя VPN проекта =====
echo.

REM Устанавливаем переменные
set SERVER=195.133.15.249
set PROJECT_PATH=~/vpn-proj

REM Подключение к серверу и выполнение команд деплоя
echo Подключение к серверу %SERVER%...
echo Выполнение команд обновления в директории %PROJECT_PATH%...

REM Обработка неотслеживаемых файлов и обновление проекта
ssh root@%SERVER% "cd %PROJECT_PATH% && git stash -u || true && rm -f package.json.bak package-lock.json.bak && [ -f package.json ] && mv package.json package.json.bak || true && [ -f package-lock.json ] && mv package-lock.json package-lock.json.bak || true && git pull && [ -f package.json.bak ] && mv package.json.bak package.json || true && [ -f package-lock.json.bak ] && mv package-lock.json.bak package-lock.json || true && npm install && docker-compose down && docker-compose build && docker-compose up -d && echo 'Деплой успешно завершен!'"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===== Деплой успешно завершен! =====
) else (
    echo.
    echo ===== При выполнении деплоя произошла ошибка! =====
)

echo.
echo Нажмите любую клавишу для завершения...
pause > nul
