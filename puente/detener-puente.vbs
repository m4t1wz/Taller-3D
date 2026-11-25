' Taller 3D · Detiene el puente que corre en segundo plano.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pidFile = fso.GetParentFolderName(WScript.ScriptFullName) & "\logs\puente.pid"
If fso.FileExists(pidFile) Then
  pid = Trim(fso.OpenTextFile(pidFile).ReadAll)
  sh.Run "taskkill /PID " & pid & " /F", 0, True
  If fso.FileExists(pidFile) Then fso.DeleteFile pidFile
  MsgBox "Puente detenido.", 64, "Taller 3D"
Else
  MsgBox "El puente no estaba corriendo.", 64, "Taller 3D"
End If
