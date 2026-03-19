# Stacy AI Cloud-Native Dockerfile
FROM node:20-slim

# Install system dependencies for Puppeteer & Chrome
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    procps libxss1 libasound2 libnss3 libatk-bridge2.0-0 libgtk-3-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package config and install
COPY package*.json ./
RUN npm install

# Copy all code
COPY . .

# Set environment for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV IS_DOCKER=true

EXPOSE 10000

CMD ["node", "server.js"]
