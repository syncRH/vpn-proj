FROM node:16-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm install --production

# Копирование исходного кода приложения
COPY . .

# Создание директорий для логов и конфигураций
RUN mkdir -p logs uploads/configs

# Назначение прав на директории
RUN chmod -R 755 logs uploads

# Экспонирование порта
EXPOSE 3000

# Запуск приложения
CMD ["node", "server.js"]