FROM nginx:alpine

# Create required cache directories and set proper permissions
RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chmod 777 -R /var/cache/nginx \
    && chmod 777 -R /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chmod 777 /var/run/nginx.pid

# Copy frontend build files
COPY build/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 3001
EXPOSE 3001

# Start nginx
CMD ["nginx", "-g", "daemon off;"]