' Taller 3D · Inicia el puente en segundo plano (sin ventana).
' Se puede ejecutar con doble clic o poner un acceso directo en la carpeta Inicio de Windows.
' Si ya hay un puente corriendo, el nuevo se cierra solo.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta
sh.Run "node """ & carpeta & "\puente.mjs""", 0, False
