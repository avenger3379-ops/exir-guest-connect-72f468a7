# 2026-07-04 14:22:31 by RouterOS 7.12.1
# software id = XRNX-MAHW
#
# model = RB951Ui-2HnD
# serial number = 4AC704FCEA93
/interface bridge
add comment="LAN Bridge" name=bridge-lan
/interface wireless security-profiles
set [ find default=yes ] supplicant-identity=MikroTik
add authentication-types=wpa2-psk mode=dynamic-keys name=GuestWiFi \
    supplicant-identity=MikroTik
/interface wireless
set [ find default-name=wlan1 ] band=2ghz-b/g/n country=iran disabled=no \
    frequency=auto mode=ap-bridge security-profile=GuestWiFi ssid=\
    ExirGameNet-Guest
/ip hotspot user profile
add idle-timeout=5m name=exir-guest rate-limit=100k/100k session-timeout=30m \
    shared-users=unlimited
/ip hotspot profile
add dns-name=login.exir.net hotspot-address=192.168.50.1 login-by=\
    http-chap,http-pap,trial name=exir-hsprof trial-user-profile=exir-guest
/ip pool
add name=pool-gamenet ranges=192.168.3.100-192.168.3.150
add name=guest-pool ranges=192.168.50.10-192.168.50.200
/ip dhcp-server
add address-pool=pool-gamenet interface=bridge-lan name=dhcp-gamenet
add address-pool=guest-pool interface=wlan1 name=guest-dhcp
/ip hotspot
add address-pool=guest-pool disabled=no interface=wlan1 name=exir-hotspot \
    profile=exir-hsprof
/queue simple
add comment=exir-qos max-limit=512k/512k name=qos-VIP01 target=\
    192.168.3.101/32
add comment=exir-qos max-limit=512k/512k name=qos-VIP02 target=\
    192.168.3.102/32
add comment=exir-qos name=qos-VIP03 target=192.168.3.103/32
add comment=exir-qos max-limit=512k/512k name=qos-VIP04 target=\
    192.168.3.104/32
add comment=exir-qos name=qos-VIP05 target=192.168.3.105/32
add comment=exir-qos max-limit=512k/512k name=qos-VIP06 target=\
    192.168.3.106/32
add comment=exir-qos max-limit=512k/512k name=qos-VIP07 target=\
    192.168.3.107/32
add comment=exir-qos name=qos-VIP08 target=192.168.3.108/32
add comment=exir-qos name=qos-VIP09 target=192.168.3.109/32
add comment=exir-qos name=qos-VIP10 target=192.168.3.110/32
add comment=exir-qos max-limit=2M/2M name=qos-VIP11 target=192.168.3.111/32
add comment=exir-qos name=qos-VIP12 target=192.168.3.112/32
/user group
add name=qos-ctl policy="read,write,test,api,rest-api,!local,!telnet,!ssh,!ftp\
    ,!reboot,!policy,!winbox,!password,!web,!sniff,!sensitive,!romon"
/interface bridge port
add bridge=bridge-lan interface=ether4
add bridge=bridge-lan interface=ether5
/ip address
add address=192.168.3.200/24 comment=LAN interface=bridge-lan network=\
    192.168.3.0
add address=192.168.10.254/24 comment=POS interface=ether3 network=\
    192.168.10.0
add address=192.168.50.1/24 comment="Guest Hotspot Gateway" interface=wlan1 \
    network=192.168.50.0
/ip dhcp-client
add add-default-route=no comment=WAN1 interface=ether1 use-peer-dns=no
add add-default-route=no comment=WAN2 interface=ether2 use-peer-dns=no
/ip dhcp-server network
add address=192.168.3.0/24 dns-server=192.168.3.200,8.8.8.8 gateway=\
    192.168.3.200
add address=192.168.50.0/24 dns-server=8.8.8.8,1.1.1.1 gateway=192.168.50.1
/ip dns
set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8
/ip firewall address-list
add address=192.168.3.101 list=vip01
add address=192.168.3.102 list=vip02
add address=192.168.3.103 list=vip03
add address=192.168.3.104 list=vip04
add address=192.168.3.105 list=vip05
add address=192.168.3.106 list=vip06
add address=192.168.3.107 list=vip07
add address=192.168.3.108 list=vip08
add address=192.168.3.109 list=vip09
add address=192.168.3.110 list=vip10
add address=192.168.3.111 list=vip11
add address=192.168.3.112 list=vip12
/ip firewall filter
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=accept chain=input comment="Hotspot HTTP wlan1" dst-port=80 \
    in-interface=wlan1 protocol=tcp
add action=accept chain=input comment="Hotspot HTTPS wlan1" dst-port=443 \
    in-interface=wlan1 protocol=tcp
add action=accept chain=input comment="Hotspot API wlan1" dst-port=64872 \
    in-interface=wlan1 protocol=tcp
add action=accept chain=input comment="Hotspot DNS wlan1 UDP" dst-port=53 \
    in-interface=wlan1 protocol=udp
add action=accept chain=input comment="Hotspot DNS wlan1 TCP" dst-port=53 \
    in-interface=wlan1 protocol=tcp
/ip firewall nat
add action=passthrough chain=unused-hs-chain comment=\
    "place hotspot rules here" disabled=yes
add action=masquerade chain=srcnat comment="NAT WAN1" out-interface=ether1
add action=masquerade chain=srcnat comment="NAT WAN2" out-interface=ether2
/ip hotspot user
add comment="Exir default guest user" name=Exir profile=exir-guest
/ip hotspot walled-garden
add comment="Steam login" dst-host=*.steampowered.com
add comment="Steam community" dst-host=*.steamcommunity.com
add comment="Steam static" dst-host=*.steamstatic.com
add comment="Steam CDN (Akamai)" dst-host=*.akamaihd.net
add comment=Discord dst-host=*.discord.com
add comment="Discord app" dst-host=*.discordapp.com
add comment="Discord media" dst-host=*.discordapp.net
add comment="Epic Games" dst-host=*.epicgames.com
add comment="Epic support" dst-host=*.helpshift.com
/ip route
add comment="Backup WAN" distance=2 dst-address=0.0.0.0/0 gateway=192.168.2.1
add check-gateway=ping comment="Primary WAN" disabled=yes distance=1 \
    dst-address=0.0.0.0/0 gateway=192.168.1.1
/ip service
set www-ssl certificate=local-cert disabled=no
/system clock
set time-zone-name=Asia/Tehran
/system note
set show-at-login=no
/tool netwatch
add down-script="/ip route disable [find comment=\"Primary WAN\"]" host=\
    8.8.8.8 interval=5s timeout=2s type=simple up-script=\
    "/ip route enable [find comment=\"Primary WAN\"]"
