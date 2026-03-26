# ☁️ Stacy AI: 24/7 Cloud Deployment Guide

To keep Stacy AI running even when your computer is **turned off**, you need to host it on a **Cloud Server (VPS)** or a **Platform-as-a-Service (PaaS)**.

## Option 1: Render.com (Recommended & Easiest)
The project includes a `render.yaml` and `Dockerfile`, making deployment fully automated.

1. Create a free account at [Render.com](https://render.com).
2. Create a new **Blueprint** (instead of a Web Service).
3. Connect your GitHub repository.
4. Render will detect the `render.yaml` and prompt you for:
   - `TELEGRAM_TOKEN`: Your Bot Token
   - `NVIDIA_API_KEY`: Your API Key
5. Click **Apply** and Render will handle the build and deployment.

## Option 2: VPS (DigitalOcean, Hetzner, Google Cloud)
For total control, use a Linux VPS.

1. SSH into your VPS.
2. Install Node.js and PM2:
   ```bash
   sudo apt update
   sudo apt install nodejs npm
   sudo npm install pm2 -g
   ```
3. Clone your repo and install dependencies:
   ```bash
   git clone <your-repo-url>
   cd qwen-chat
   npm install
   ```
4. Start the bot with PM2:
   ```bash
   pm2 start server.js --name "stacy-ai"
   pm2 save
   pm2 startup
   ```

## Comparison
| Feature | Local (PM2) | Cloud (Render/VPS) |
|---------|-------------|-------------------|
| **Cost** | Free | Free to $5/mo |
| **Uptime** | Only when PC is ON | **24/7 (Even if PC is OFF)** |
| **Setup** | 1 Minute | 10 Minutes |
| **Best For** | Personal Use | Professional/Assistant Use |
