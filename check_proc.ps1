Get-Process chrome | Where-Object {$_.MainWindowTitle -like '*YouTube*'} | Select-Object Id, MainWindowTitle
