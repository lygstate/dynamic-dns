@echo off

set gw=192.168.1.1
ipconfig /flushdns

route delete 54.230.0.0
route delete 54.192.0.0
route delete 205.251.0.0
route delete 93.46.0.0

pause