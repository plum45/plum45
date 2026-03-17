# Stacy AI Background Stopper
Get-Process node | Where-Object { $_.CommandLine -like "*server.js*" } | Stop-Process -Force
Write-Host "🛑 Stacy AI background process has been stopped." -ForegroundColor Red
