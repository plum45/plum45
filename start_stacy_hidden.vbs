Set WshShell = CreateObject("WScript.Shell")
' Run npm start but hide the console window (0)
' Change the directory below to your Stacy project directory
projectDir = "C:\Users\lgopl\.gemini\antigravity\scratch\qwen-chat"
WshShell.CurrentDirectory = projectDir
WshShell.Run "cmd /c npm start", 0, False
