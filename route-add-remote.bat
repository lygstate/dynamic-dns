::Start as administrator
cd /d %~dp0
set "WD=%CD%"
ipconfig /flushdns
"%WD%\node.exe" "%WD%\index.js" -r --config route-remote.json
pause