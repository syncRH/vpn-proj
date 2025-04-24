@echo off
setlocal

echo ===== VPN Admin Panel Docker Config Fix =====
echo Current date: %DATE% %TIME%
echo.

set SSH_HOST=root@195.133.15.249

echo [1/3] Creating fix script...
echo #!/bin/bash > fix-docker-compose.sh
echo echo "Updating docker-compose.yml with correct Nginx config path..." >> fix-docker-compose.sh
echo sed -i 's#- ./admin-panel/nginx.conf:/etc/nginx/conf.d/default.conf#- ./admin/nginx.conf:/etc/nginx/conf.d/default.conf#g' /root/vpn-deployment/docker-compose.yml >> fix-docker-compose.sh
echo echo "Docker Compose file updated. Restarting containers..." >> fix-docker-compose.sh
echo cd /root/vpn-deployment >> fix-docker-compose.sh
echo docker-compose down >> fix-docker-compose.sh
echo docker-compose up -d >> fix-docker-compose.sh
echo echo "Containers restarted. Checking status..." >> fix-docker-compose.sh
echo docker-compose ps >> fix-docker-compose.sh
echo echo "Checking for errors in admin container logs:" >> fix-docker-compose.sh
echo sleep 2 >> fix-docker-compose.sh
echo docker-compose logs admin --tail=10 >> fix-docker-compose.sh

echo [2/3] Uploading and running fix script...
scp fix-docker-compose.sh %SSH_HOST%:/root/fix-docker-compose.sh
ssh %SSH_HOST% "chmod +x /root/fix-docker-compose.sh && /root/fix-docker-compose.sh"
del fix-docker-compose.sh

echo [3/3] Verification complete.
echo.
echo Fix has been applied. Check if the admin panel is now accessible at:
echo http://195.133.15.249:3001/
echo.

endlocal