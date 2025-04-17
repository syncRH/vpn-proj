#!/bin/bash

# BeNice VPN Server Monitor Script
# Этот скрипт мониторит состояние сервера и перезапускает компоненты в случае сбоев
# Поместите его на сервер и добавьте в планировщик cron: */5 * * * * /root/vpn-deployment/monitor.sh

# Настройки
DEPLOYMENT_DIR="/root/vpn-deployment"
LOG_FILE="/root/vpn-monitoring.log"
NOTIFICATION_EMAIL="admin@example.com"
MAX_RESTART_ATTEMPTS=3
RESTART_HISTORY_FILE="/root/restart_history.txt"

# Функции для логирования
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Проверка существования директории
if [ ! -d "$DEPLOYMENT_DIR" ]; then
    log "ERROR: Deployment directory $DEPLOYMENT_DIR does not exist!"
    exit 1
fi

# Переход в директорию с docker-compose
cd "$DEPLOYMENT_DIR" || exit 1

# Функция для проверки и перезапуска сервиса
check_and_restart() {
    local service_name="$1"
    
    # Получаем статус сервиса
    local service_status=$(docker-compose ps -q "$service_name" | xargs docker inspect -f '{{.State.Status}}' 2>/dev/null)
    
    # Проверяем статус запроса к API (только для server и admin)
    local http_status=0
    if [ "$service_name" == "server" ]; then
        http_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo 0)
    elif [ "$service_name" == "admin" ]; then
        http_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/ || echo 0)
    fi
    
    # Проверяем необходимость перезапуска
    if [ "$service_status" != "running" ] || ([ "$service_name" == "server" ] && [ "$http_status" -ne 200 ]) || ([ "$service_name" == "admin" ] && [ "$http_status" -lt 200 -o "$http_status" -ge 400 ]); then
        log "WARNING: Service $service_name is not healthy. Status: $service_status, HTTP status: $http_status"
        
        # Проверяем количество перезапусков за последние 24 часа
        local restart_count=0
        if [ -f "$RESTART_HISTORY_FILE" ]; then
            restart_count=$(grep -c "$(date '+%Y-%m-%d') $service_name" "$RESTART_HISTORY_FILE")
        fi
        
        if [ "$restart_count" -lt "$MAX_RESTART_ATTEMPTS" ]; then
            log "Restarting $service_name..."
            docker-compose restart "$service_name"
            echo "$(date '+%Y-%m-%d') $service_name" >> "$RESTART_HISTORY_FILE"
            
            # Ждем 30 секунд
            sleep 30
            
            # Проверяем, успешно ли перезапустился сервис
            service_status=$(docker-compose ps -q "$service_name" | xargs docker inspect -f '{{.State.Status}}' 2>/dev/null)
            if [ "$service_status" == "running" ]; then
                log "Service $service_name successfully restarted."
            else
                log "ERROR: Failed to restart $service_name. Sending alert email..."
                echo "VPN Server Alert: Failed to restart $service_name service on $(hostname)" | mail -s "VPN Server Alert" "$NOTIFICATION_EMAIL"
            fi
        else
            log "ERROR: Service $service_name has been restarted $restart_count times today. Manual intervention required."
            echo "VPN Server Alert: Service $service_name has been restarted $restart_count times today on $(hostname). Manual intervention required." | mail -s "URGENT: VPN Server Alert" "$NOTIFICATION_EMAIL"
        fi
    else
        log "Service $service_name is running properly. Status: $service_status, HTTP status: $http_status"
    fi
}

# Основная логика
log "Starting monitoring check..."

# Проверяем все сервисы
check_and_restart "mongodb"
check_and_restart "server"
check_and_restart "admin"

# Очищаем старую историю перезапусков (старше 24 часов)
if [ -f "$RESTART_HISTORY_FILE" ]; then
    grep "$(date '+%Y-%m-%d')" "$RESTART_HISTORY_FILE" > "${RESTART_HISTORY_FILE}.tmp"
    mv "${RESTART_HISTORY_FILE}.tmp" "$RESTART_HISTORY_FILE"
fi

# Проверка места на диске
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_usage" -gt 85 ]; then
    log "WARNING: Disk usage is high: ${disk_usage}%"
    echo "VPN Server Alert: Disk usage is high (${disk_usage}%) on $(hostname)" | mail -s "VPN Server Alert: High Disk Usage" "$NOTIFICATION_EMAIL"
fi

# Проверка загрузки CPU
load_average=$(cat /proc/loadavg | awk '{print $1}')
cpu_cores=$(nproc)
normalized_load=$(echo "$load_average $cpu_cores" | awk '{printf "%.2f", $1/$2*100}')

if (( $(echo "$normalized_load > 80" | bc -l) )); then
    log "WARNING: CPU load is high: ${normalized_load}% (${load_average} on ${cpu_cores} cores)"
    echo "VPN Server Alert: CPU load is high (${normalized_load}%) on $(hostname)" | mail -s "VPN Server Alert: High CPU Load" "$NOTIFICATION_EMAIL"
fi

log "Monitoring check completed."
exit 0