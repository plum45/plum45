# restart-bot.ps1
# This script kills all node.exe processes and restarts the AI Agent server.

Write-Host "🛑 Stopping any existing Node.js processes..." -ForegroundColor Yellow
try {
    Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "✅ All Node processes stopped." -ForegroundColor Green
} catch {
    Write-Host "ℹ️ No running Node processes found."
}

Write-Host "🚀 Starting Qwen AI Agent..." -ForegroundColor Cyan
node server.js
