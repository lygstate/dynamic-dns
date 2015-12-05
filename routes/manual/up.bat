@echo off

set gw=192.168.1.1
ipconfig /flushdns

:: cloundfront
route add 54.230.0.0 mask 255.255.0.0 %gw% metric 5
route add 54.192.0.0 mask 255.255.0.0 %gw% metric 5
route add 205.251.0.0 mask 255.255.0.0 %gw% metric 5
route add 93.46.0.0 mask 255.255.0.0 %gw% metric 5

:: microsoft
route add 176.32.0.0 mask 255.255.0.0 %gw% metric 5
route add 68.232.0.0 mask 255.255.0.0 %gw% metric 5
route add 23.53.0.0 mask 255.255.0.0 %gw% metric 5
route add 192.229.0.0 mask 255.255.0.0 %gw% metric 5


:: amazon ec2
route add 176.32.0.0 mask 255.255.0.0 %gw% metric 5

pause