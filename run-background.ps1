# Stacy AI Background Runner
$ProjectDir = "C:\Users\lgopl\.gemini\antigravity\scratch\qwen-chat"
Set-Location $ProjectDir

# Run node server.js in a hidden window
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -WorkingDirectory $ProjectDir

Write-Host "🚀 Stacy AI is now running in the background!" -ForegroundColor Cyan
Write-Host "Tip: You can check the process in Task Manager (node.exe)" -ForegroundColor Gray
