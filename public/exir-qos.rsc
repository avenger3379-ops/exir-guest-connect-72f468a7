# Exir Gamenet — Mikrotik RouterOS QoS config
# Router: RB951Ui-2HnD · RouterOS 7.12.1
# LAN 192.168.3.0/24 · VIP01..VIP12 → 192.168.3.101..112
#
# ⚠️  IMPORTANT: This is a SCRIPT (.rsc), NOT a backup (.backup).
#     Do NOT use  System → "Restore Configuration"  — that only accepts
#     .backup files and will fail with "couldn't restore config / file not found".
#     Instead, IMPORT it with the steps below.
#
# HOW TO APPLY (import, not restore):
#   1) Winbox/WebFig → Files → drag & drop this file (must stay named exir-qos.rsc)
#   2) Open  New Terminal  and run EXACTLY:
#          /import file-name=exir-qos.rsc
#      (If you renamed the upload, use that exact name in file-name=.)
#   3) Optional: adjust IPs below if your VIP mapping differs.
#
# The dashboard's local agent will toggle limits per VIP via:
#   /queue simple set [find name="qos-VIPxx"] disabled=yes|no max-limit=Xk/Yk

#
# ---------------------------------------------------------------
# 1. Address list for each station (edit IPs to match your LAN)
# ---------------------------------------------------------------
/ip firewall address-list
add list=vip01 address=192.168.3.101
add list=vip02 address=192.168.3.102
add list=vip03 address=192.168.3.103
add list=vip04 address=192.168.3.104
add list=vip05 address=192.168.3.105
add list=vip06 address=192.168.3.106
add list=vip07 address=192.168.3.107
add list=vip08 address=192.168.3.108
add list=vip09 address=192.168.3.109
add list=vip10 address=192.168.3.110
add list=vip11 address=192.168.3.111
add list=vip12 address=192.168.3.112

# ---------------------------------------------------------------
# 2. Simple queues (start DISABLED · agent will flip them on/off)
#    max-limit format: upload/download
#    Defaults set to "unlimited" (0) — the agent will overwrite when a tier is chosen.
# ---------------------------------------------------------------
/queue simple
add name=qos-VIP01 target=192.168.3.101/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP02 target=192.168.3.102/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP03 target=192.168.3.103/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP04 target=192.168.3.104/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP05 target=192.168.3.105/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP06 target=192.168.3.106/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP07 target=192.168.3.107/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP08 target=192.168.3.108/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP09 target=192.168.3.109/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP10 target=192.168.3.110/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP11 target=192.168.3.111/32 max-limit=0/0  disabled=yes comment="exir-qos"
add name=qos-VIP12 target=192.168.3.112/32 max-limit=0/0  disabled=yes comment="exir-qos"

# ---------------------------------------------------------------
# 3. Enable REST API (RouterOS 7+) so the dashboard agent can control queues.
#    Access from LAN only — change password before production!
# ---------------------------------------------------------------
/ip service
set www-ssl disabled=no
set api disabled=no
# For REST over HTTPS:  https://192.168.3.200/rest/queue/simple
#
# Recommended: create a dedicated user for the agent
/user group add name=qos-ctl policy=api,rest-api,read,write,test
/user add name=exir-agent group=qos-ctl password=CHANGE_ME address=192.168.3.0/24

# ---------------------------------------------------------------
# TIER REFERENCE (agent uses these values when a button is clicked)
#   500K  → max-limit=512k/512k
#   1M    → max-limit=1M/1M
#   2M    → max-limit=2M/2M
#   ∞     → disabled=yes  (queue turned off = no limit)
# ---------------------------------------------------------------
