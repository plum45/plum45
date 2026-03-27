Set WshShell = CreateObject("WScript.Shell")
' Launch Stacy AI via PM2 silently
WshShell.Run "powershell.exe -WindowStyle Hidden -Command ""pm2 start stacy-ai; pm2 save""", 0, False
