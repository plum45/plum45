# Stacy AI - PM2 Background Runner
# Ensures the bot runs silently in the background and restarts on crash

Write-Host ">>> Starting Stacy AI with PM2..." -ForegroundColor Cyan

# Check for .env file
if (-not (Test-Path "config/.env")) {
    Write-Host "!!! Warning: config/.env not found. Make sure your environment variables are set!" -ForegroundColor Yellow
}

# Check if already running
$is_running = pm2 describe "stacy-ai" | Out-String
if ($is_running -match "id") {
    Write-Host ">>> Stacy is already running. Restarting for fresh session..." -ForegroundColor Yellow
    pm2 restart "stacy-ai"
} else {
    Write-Host ">>> Launching new Stacy instance..." -ForegroundColor Yellow
    pm2 start server.js --name "stacy-ai" --exp-backoff-restart-delay 1000
}

# Save PM2 list so it persists on reboot
pm2 save

Write-Host "DONE: Stacy is now active in the background." -ForegroundColor Green
Write-Host "Use 'pm2 status' or 'pm2 logs stacy-ai' for more details." -ForegroundColor Gray
