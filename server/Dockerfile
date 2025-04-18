FROM node:16-alpine

# Install build tools needed for native modules like bcrypt
RUN apk add --no-cache python3 make g++

# Установка рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей (including devDependencies initially to ensure build)
RUN npm install

# Копирование исходного кода приложения
COPY . .

# Optional: Prune devDependencies if needed for smaller image size
# RUN npm prune --production

# Создание директорий для логов и конфигураций
RUN mkdir -p logs uploads/configs

# Назначение прав на директории
RUN chmod -R 755 logs uploads

# Экспонирование порта
EXPOSE 3000

# Запуск приложения
CMD ["node", "server.js"]