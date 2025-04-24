@echo off
echo ===== Начало автоматического деплоя VPN проекта =====
echo.

REM Устанавливаем переменные
set SERVER=195.133.15.249
set PROJECT_PATH=~/vpn-proj

REM Подключение к серверу и выполнение команд деплоя
echo Подключение к серверу %SERVER%...
echo Выполнение команд обновления в директории %PROJECT_PATH%...

ssh root@%SERVER% "cd %PROJECT_PATH% && git pull && echo 'Обновление кода из репозитория завершено!' && npm install && echo 'Установка зависимостей завершена!' && docker-compose down && echo 'Предыдущие контейнеры остановлены' && docker-compose build && echo 'Образы пересобраны' && docker-compose up -d && echo 'Контейнеры успешно запущены в фоновом режиме!'"

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
