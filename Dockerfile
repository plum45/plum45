# Stacy AI Docker Configuration (v2.1.5-Master Edition)
# 🎯 เป้าหมาย: รัน Stacy ได้ตลอด 24 ชั่วโมงบน VPS/Server แบบเสถียรที่สุด

# 1. Base Image: ใช้ Node.js 20 Debian (เพื่อรองรับ Puppeteer และ Python)
FROM node:20-bullseye-slim

# 2. ตั้งค่า Environment
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 3. ติดตั้ง Dependencies ของระบบ (Chrome, Python, และเครื่องมือพื้นฐาน)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 4. ติดตั้ง uv (Ultra-fast Python package installer) ตามสไตล์ Stacy Architect
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# 5. สร้าง Directory ทำงาน
WORKDIR /app

# 6. ติดตั้ง PM2 สำหรับ Process Management (รัน 24 ชม. และ Restart เมื่อ Error)
RUN npm install -g pm2

# 7. คัดลอกและติดตั้ง Dependencies ของโปรเจกต์
COPY package*.json ./
RUN npm install --production

# 8. คัดลอกไฟล์ทั้งหมดของโปรเจกต์
COPY . .

# 9. สั่งรัน Stacy ผ่าน PM2 เพื่อความเสถียรสูงสุด
#    - ให้ใช้ --no-daemon เพื่อให้ Docker ทำงานต่อได้
CMD ["pm2-runtime", "server.js", "--name", "stacy-ai"]

# 10. Expose Port สำหรับ Web Dashboard
EXPOSE 10000
