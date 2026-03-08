{
# =====================================================
# TurboNet MikroTik Hotspot Configuration (Optimized v7)
# =====================================================
# IMPORTANT: Before running this script, enable hotspot in device-mode:
#   /system/device-mode/update hotspot=yes
#   Then physically power-cycle the router to confirm.
# This is required on RouterOS 7.14+ (home mode blocks hotspot by default).

# ============ VARIABLES (EDIT THESE!) ============
:local portalURL "http://136.117.23.173"
:local radiusIP "136.117.23.173"
:local radiusSecret "TurboNetSecret2024"

# ============ 0. NETWORK SETUP ============
# Create the bridge if it doesn't exist
/interface bridge add name=bridge disabled=no auto-mac=yes

# Add LAN ports and Wi-Fi to the bridge
/interface bridge port add bridge=bridge interface=ether2 disabled=no
/interface bridge port add bridge=bridge interface=ether3 disabled=no
/interface bridge port add bridge=bridge interface=ether4 disabled=no
/interface bridge port add bridge=bridge interface=ether5 disabled=no
/interface bridge port add bridge=bridge interface=wlan1 disabled=no

# Set the IP address on the bridge
/ip address add address=192.168.88.1/24 interface=bridge disabled=no

# 1. RADIUS SERVER
/radius add address=$radiusIP secret=$radiusSecret service=hotspot timeout=3000ms
/radius incoming set accept=yes port=3799

# 2. HOTSPOT PROFILE
/ip hotspot profile add name="turbonet" hotspot-address=192.168.88.1 dns-name="wifi.local" html-directory=hotspot login-by=http-pap,http-chap use-radius=yes radius-interim-update=5m http-cookie-lifetime=3d split-user-domain=no

# 3. HOTSPOT SERVER
/ip hotspot add name="turbonet-hs" interface="bridge" profile=turbonet disabled=no

# 4. USER PROFILE (DEFAULT)
/ip hotspot user profile set [find default=yes] shared-users=1 idle-timeout=10m keepalive-timeout=2m

# 5. WALLED GARDEN
/ip hotspot walled-garden ip add action=accept dst-address=$radiusIP comment="Portal App"
/ip hotspot walled-garden ip add action=accept dst-host="*.safaricom.co.ke" comment="Safaricom"
/ip hotspot walled-garden ip add action=accept dst-host="*.mpesa.safaricom.co.ke" comment="M-Pesa"
/ip hotspot walled-garden ip add action=accept dst-address=8.8.8.8 comment="Google DNS"

# 6. NAT / FIREWALL
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="Internet"

# 7. TIME SYNC
/system ntp client set enabled=yes
/system ntp client servers add address=time.cloudflare.com
/system ntp client servers add address=pool.ntp.org

# 8. ENABLE WIFI (AP Mode)
/interface wireless set wlan1 mode=ap-bridge ssid="TurboNet_Free_WiFi" disabled=no

/log info "TurboNet Setup Successful!"
}
