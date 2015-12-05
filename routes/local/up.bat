@echo off

set gw=192.168.1.1
ipconfig /flushdns

route add 192.168.1.0  mask 255.255.255.0 %gw% metric 5

pause