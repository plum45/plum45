Add-Type -AssemblyName System.Windows.Forms
$ws = New-Object -ComObject WScript.Shell
$p = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1

if ($p) {
    Write-Host "Found Chrome PID: $($p.Id)"
    $ws.AppActivate($p.Id)
    Start-Sleep -Milliseconds 500
    
    for ($i=0; $i -lt 30; $i++) {
        $p2 = Get-Process -Id $p.Id
        $title = $p2.MainWindowTitle
        Write-Host "Tab $i - Title: $title"
        
        # Check matching logic
        if ($title -like '*YouTube*' -or $title -like '*Play*' -or $title -like '*Music*' -or $title -match '^\(\d+\)') {
            Write-Host ">>> MATCH FOUND! <<<" -ForegroundColor Green
        }
        
        [System.Windows.Forms.SendKeys]::SendWait('^{TAB}')
        Start-Sleep -Milliseconds 400
    }
} else {
    Write-Host "Chrome not found or has no window."
}
