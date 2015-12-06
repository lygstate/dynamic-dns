::Start as administrator
cd /d %~dp0
set "WD=%CD%"
nssm stop dynamic-dns
nssm remove dynamic-dns confirm
nssm install dynamic-dns "%WD%\node.exe" "%WD%\index.js" -rs --config route-remote.json
nssm start dynamic-dns
pause