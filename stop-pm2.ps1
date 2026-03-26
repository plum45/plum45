# Stacy AI - PM2 Stop Script
Write-Host "🛑 Stopping Stacy AI..." -ForegroundColor Yellow

pm2 stop stacy-ai
pm2 delete stacy-ai
pm2 save

Write-Host "✅ Stacy has been stopped and removed from the background list." -ForegroundColor Green
