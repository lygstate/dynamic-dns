::Start as administrator
cd /d %~dp0
set "WD=%CD%"
"%WD%\node.exe" "%WD%\index.js"
pause