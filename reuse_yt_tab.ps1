Add-Type -AssemblyName System.Windows.Forms
$wshell = New-Object -ComObject WScript.Shell

# Find Chrome windows with YouTube
$chrome = Get-Process chrome | Where-Object {$_.MainWindowTitle -like "*YouTube*"} | Select-Object -First 1

if ($chrome) {
    Write-Host "Found YouTube tab: $($chrome.MainWindowTitle)"
    $wshell.AppActivate($chrome.Id)
    Start-Sleep -Milliseconds 500
    
    # Focus address bar
    $wshell.SendKeys("^l")
    Start-Sleep -Milliseconds 200
    
    # Type new URL (One Piece song or something)
    $url = "https://www.youtube.com/watch?v=XzW-mS2L-E0"
    $wshell.SendKeys($url)
    Start-Sleep -Milliseconds 200
    
    # Enter
    $wshell.SendKeys("{ENTER}")
    Write-Host "Sent navigation command to existing tab!"
} else {
    Write-Host "No YouTube tab found."
}
