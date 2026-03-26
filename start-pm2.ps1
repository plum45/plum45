# Stacy AI - PM2 Background Runner
# Ensures the bot runs silently in the background and restarts on crash

Write-Host "🚀 Starting Stacy AI with PM2..." -ForegroundColor Cyan

# Check for .env file
if (-not (Test-Path "config/.env")) {
    Write-Host "⚠️ Warning: config/.env not found. Make sure your environment variables are set!" -ForegroundColor Yellow
}

# Start with PM2
pm2 start server.js --name "stacy-ai" --exp-backoff-restart-delay 1000

# Save PM2 list so it persists on reboot (if pm2-windows-startup is installed)
pm2 save

Write-Host "✅ Stacy is now running in the background." -ForegroundColor Green
Write-Host "📋 Type 'pm2 status' to see all processes." -ForegroundColor White
Write-Host "📝 Type 'pm2 logs stacy-ai' to see the logs." -ForegroundColor White
