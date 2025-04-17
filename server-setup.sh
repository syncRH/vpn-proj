#!/bin/bash

# BeNice VPN Server Setup Script
# Этот скрипт устанавливает все необходимое ПО на удаленный сервер
# Запускать локально: ./server-setup.sh

# Настройки
SSH_HOST="root@195.133.15.249"
REMOTE_SCRIPT="/tmp/remote-setup.sh"

echo "===== BeNice VPN Server Setup Script ====="
echo "Подготовка удаленного сервера: $SSH_HOST"
echo

# Создаем скрипт для удаленного выполнения
cat > "$REMOTE_SCRIPT" << 'EOL'
#!/bin/bash

# Цветной вывод
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}===== Настройка сервера BeNice VPN =====${NC}"
echo "$(date)"
echo

# Функция для логирования
log() {
    echo -e "${GREEN}[+]${NC} $1"
}

error() {
    echo -e "${RED}[!]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Проверка root прав
if [ "$(id -u)" -ne 0 ]; then
    error "Этот скрипт должен быть запущен с правами root"
    exit 1
fi

# Обновление системы
log "Обновление системы..."
apt-get update
apt-get upgrade -y

# Установка базовых пакетов
log "Установка базовых пакетов..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    htop \
    iftop \
    fail2ban \
    ufw \
    unzip \
    git \
    vim \
    bc \
    mailutils

# Настройка часового пояса
log "Настройка часового пояса..."
timedatectl set-timezone Europe/Moscow

# Установка Docker и Docker Compose
log "Проверка наличия Docker..."
if ! command -v docker &> /dev/null; then
    log "Установка Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker root
else
    log "Docker уже установлен."
fi

log "Проверка наличия Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    log "Установка Docker Compose..."
    
    # Проверка архитектуры процессора
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) COMPOSE_ARCH="x86_64" ;;
        aarch64) COMPOSE_ARCH="aarch64" ;;
        armv7l) COMPOSE_ARCH="armv7" ;;
        *) error "Неподдерживаемая архитектура: $ARCH"; exit 1 ;;
    esac
    
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
    curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
else
    log "Docker Compose уже установлен."
fi

# Настройка брандмауэра UFW
log "Настройка брандмауэра UFW..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 3000/tcp  # API Server
ufw allow 3001/tcp  # Admin Panel
ufw allow 1194/udp  # OpenVPN (если нужно)

# Включаем UFW без запроса подтверждения
echo "y" | ufw enable

# Настройка Fail2ban
log "Настройка Fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
EOF

systemctl restart fail2ban

# Создание директории для развертывания
log "Создание директории для развертывания..."
mkdir -p /root/vpn-deployment
mkdir -p /root/vpn-backup

# Установка утилит для мониторинга
log "Установка утилит для мониторинга..."
apt-get install -y \
    prometheus-node-exporter \
    sysstat \
    logwatch

# Настройка ежедневного отчета по логам
cat > /etc/cron.daily/00logwatch << 'EOF'
#!/bin/bash
/usr/sbin/logwatch --output mail --mailto admin@example.com --detail high
EOF
chmod +x /etc/cron.daily/00logwatch

# Дополнительная оптимизация
log "Оптимизация системы..."

# Увеличение лимита открытых файлов
cat >> /etc/security/limits.conf << 'EOF'
* soft nofile 65536
* hard nofile 65536
EOF

# Настройка параметров ядра
cat > /etc/sysctl.d/99-vpn-server.conf << 'EOF'
# Оптимизация сети
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_syncookies = 1
net.ipv4.ip_local_port_range = 1024 65535
net.core.somaxconn = 1024

# Оптимизация для MongoDB
vm.swappiness = 1
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF

sysctl -p /etc/sysctl.d/99-vpn-server.conf

# Настройка планировщика для мониторинга
log "Настройка планировщика для мониторинга..."
cat > /etc/cron.d/vpn-monitor << 'EOF'
# Запуск скрипта мониторинга каждые 5 минут
*/5 * * * * root /root/vpn-deployment/monitor.sh > /dev/null 2>&1
EOF

# Завершение установки
log "Настройка сервера успешно завершена!"
log "Сервер готов к развертыванию BeNice VPN"
log "Сведения о системе:"
echo "--------------------------------------"
echo "Версия ОС: $(lsb_release -ds)"
echo "Ядро: $(uname -r)"
echo "Доступная память: $(free -h | awk '/^Mem:/ {print $2}')"
echo "Доступное место на диске: $(df -h / | awk 'NR==2 {print $4}')"
echo "Docker версия: $(docker --version)"
echo "Docker Compose версия: $(docker-compose --version)"
echo "--------------------------------------"
EOL

# Копирование скрипта на удаленный хост
scp "$REMOTE_SCRIPT" "$SSH_HOST:/tmp/remote-setup.sh"

# Выполнение скрипта на удаленном хосте
echo "Запуск скрипта настройки на удаленном сервере..."
ssh "$SSH_HOST" "chmod +x /tmp/remote-setup.sh && /tmp/remote-setup.sh"

# Удаление временного скрипта
ssh "$SSH_HOST" "rm /tmp/remote-setup.sh"

echo
echo "Настройка сервера завершена!"
echo "Теперь вы можете выполнить развертывание с помощью скрипта deploy-full.bat"