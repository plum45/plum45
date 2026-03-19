# restart_services.ps1
# This script kills only Stacy and Vecna processes by looking at their paths
# and then restarts them in the background.

Write-Host "🛑 Finding and stopping Stacy and Vecna processes..." -ForegroundColor Yellow

# Get all node processes and identify them by their command line or working directory
$nodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"

foreach ($node in $nodes) {
    if ($node.CommandLine -like "*qwen-chat*") {
        Write-Host "Killing process: $($node.CommandLine)" -ForegroundColor Gray
        Stop-Process -Id $node.ProcessId -Force
    }
}

Write-Host "✅ All bot processes stopped." -ForegroundColor Green

# Start Stacy
Write-Host "🚀 Starting Stacy AI..." -ForegroundColor Cyan
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -WorkingDirectory "C:\Users\lgopl\.gemini\antigravity\scratch\qwen-chat\stacy"

# Start Vecna
Write-Host "🚀 Starting Vecna AI..." -ForegroundColor Cyan
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -WorkingDirectory "C:\Users\lgopl\.gemini\antigravity\scratch\qwen-chat\vecna"

Write-Host "🌟 Both bots are now running in the background!" -ForegroundColor Yellow
