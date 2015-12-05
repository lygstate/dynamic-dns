::Start as administrator
cd /d %~dp0
set "WD=%CD%"
nssm stop dynamic-dns
nssm remove dynamic-dns confirm
nssm install dynamic-dns "%WD%\node.exe" "%WD%\index.js"
nssm start dynamic-dns
pause