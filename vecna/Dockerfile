# Vecna AI Music Bot Dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package config and install
COPY package*.json ./
RUN npm install

# Copy all code
COPY . .

# Set environment
ENV IS_DOCKER=true

EXPOSE 3000

CMD ["node", "server.js"]
