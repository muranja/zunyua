{
# =====================================================
# TurboNet MikroTik Hotspot Configuration (Production v8)
# =====================================================
# IMPORTANT: Before running this script, enable hotspot in device-mode:
#   /system/device-mode/update hotspot=yes
#   Then physically power-cycle the router to confirm.
# This is required on RouterOS 7.14+ (home mode blocks hotspot by default).

# ============ VARIABLES (EDIT THESE!) ============
:local portalURL "http://136.109.224.75"
:local radiusIP "136.109.224.75"
:local radiusSecret "TurboNetSecret2024"
:local lanBridge "bridge"
:local lanIP "192.168.88.1/24"
:local lanNet "192.168.88.0/24"
:local dhcpPool "hs-pool"
:local dhcpServer "dhcp-hotspot"

# ============ 0. NETWORK & DNS SETUP ============
# Create the bridge if it doesn't exist
:if ([:len [/interface bridge find name=$lanBridge]] = 0) do={
    /interface bridge add name=$lanBridge disabled=no auto-mac=yes
}

# Add LAN ports and Wi-Fi to the bridge (idempotent)
:foreach p in={"ether2";"ether3";"ether4";"ether5";"wlan1"} do={
    :if ([:len [/interface bridge port find interface=$p bridge=$lanBridge]] = 0) do={
        /interface bridge port add bridge=$lanBridge interface=$p disabled=no
    }
}

# Set the IP address on the bridge
:if ([:len [/ip address find address=$lanIP interface=$lanBridge]] = 0) do={
    /ip address add address=$lanIP interface=$lanBridge disabled=no
}

# Enable MikroTik to process DNS requests (required for captive portal)
/ip dns set allow-remote-requests=yes servers=8.8.8.8,1.1.1.1

# DHCP (only if not already configured on the bridge)
:if ([:len [/ip pool find name=$dhcpPool]] = 0) do={
    /ip pool add name=$dhcpPool ranges=192.168.88.10-192.168.88.254
}
:if ([:len [/ip dhcp-server find interface=$lanBridge]] = 0) do={
    /ip dhcp-server add name=$dhcpServer interface=$lanBridge address-pool=$dhcpPool disabled=no
}
:if ([:len [/ip dhcp-server network find address=$lanNet]] = 0) do={
    /ip dhcp-server network add address=$lanNet gateway=192.168.88.1 dns-server=192.168.88.1
}

# Battle-Hardening: DHCP Lease Time
/ip dhcp-server set [find name=$dhcpServer] lease-time=30m

# ============ 1. RADIUS SERVER ============
:if ([:len [/radius find address=$radiusIP service=hotspot]] = 0) do={
    /radius add address=$radiusIP secret=$radiusSecret service=hotspot timeout=3000ms
}
/radius incoming set accept=yes port=3799

# ============ 2. HOTSPOT PROFILE ============
# Updated DNS name to avoid .local mDNS conflicts on Mac/Linux
:if ([:len [/ip hotspot profile find name="turbonet"]] = 0) do={
    /ip hotspot profile add name="turbonet" hotspot-address=192.168.88.1 dns-name="login.turbowifi.net" html-directory=hotspot login-by=http-pap,http-chap use-radius=yes radius-interim-update=5m http-cookie-lifetime=3d split-user-domain=no
} else={
    /ip hotspot profile set [find name="turbonet"] hotspot-address=192.168.88.1 dns-name="login.turbowifi.net" html-directory=hotspot login-by=http-pap,http-chap use-radius=yes radius-interim-update=5m http-cookie-lifetime=3d split-user-domain=no
}

# ============ 3. HOTSPOT SERVER ============
:if ([:len [/ip hotspot find name="turbonet-hs"]] = 0) do={
    /ip hotspot add name="turbonet-hs" interface=$lanBridge profile=turbonet disabled=no
} else={
    /ip hotspot set [find name="turbonet-hs"] interface=$lanBridge profile=turbonet disabled=no
}

# ============ 4. USER PROFILE (DEFAULT) ============
/ip hotspot user profile set [find default=yes] shared-users=1 idle-timeout=10m keepalive-timeout=2m

# ============ 5. WALLED GARDEN ============
:if ([:len [/ip hotspot walled-garden ip find dst-address=$radiusIP]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-address=$radiusIP comment="Portal/RADIUS App"
}
:if ([:len [/ip hotspot walled-garden ip find dst-host="login.turbowifi.net"]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-host="login.turbowifi.net" comment="Portal Hostname"
}
# REMOVED: Google DNS from Walled Garden as it bypasses the portal redirection
/ip hotspot walled-garden ip remove [find dst-address=8.8.8.8]
/ip hotspot walled-garden ip remove [find dst-address=8.8.4.4]

:if ([:len [/ip hotspot walled-garden ip find dst-host="*.safaricom.co.ke"]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-host="*.safaricom.co.ke" comment="Safaricom"
}
:if ([:len [/ip hotspot walled-garden ip find dst-host="*.mpesa.safaricom.co.ke"]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-host="*.mpesa.safaricom.co.ke" comment="M-Pesa"
}

# ============ 6. FIREWALL & NAT (Production Enforcement) ============
# Block DoH (DNS over HTTPS) for unauthenticated users only
:if ([:len [/ip firewall filter find comment="Block DoH Cloudflare (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH Cloudflare (unauth)" dst-address=1.1.1.1 dst-port=443 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block DoH Google (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH Google (unauth)" dst-address=8.8.8.8 dst-port=443 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block DoH Google Alternate (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH Google Alternate (unauth)" dst-address=8.8.4.4 dst-port=443 protocol=tcp reject-with=tcp-reset
}

# Block DoH Quad9
:if ([:len [/ip firewall filter find comment="Block DoH Quad9 (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH Quad9 (unauth)" dst-address=9.9.9.9 dst-port=443 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block DoH Quad9 Alt (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH Quad9 Alt (unauth)" dst-address=149.112.112.112 dst-port=443 protocol=tcp reject-with=tcp-reset
}

# Block DoH OpenDNS
:if ([:len [/ip firewall filter find comment="Block DoH OpenDNS (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH OpenDNS (unauth)" dst-address=208.67.222.222 dst-port=443 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block DoH OpenDNS Alt (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH OpenDNS Alt (unauth)" dst-address=208.67.220.220 dst-port=443 protocol=tcp reject-with=tcp-reset
}

# Block DoH NextDNS
:if ([:len [/ip firewall filter find comment="Block DoH NextDNS (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH NextDNS (unauth)" dst-address=45.90.28.0 dst-port=443 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block DoH NextDNS Alt (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoH NextDNS Alt (unauth)" dst-address=45.90.30.0 dst-port=443 protocol=tcp reject-with=tcp-reset
}

# Force DoT (DNS over TLS) Fallback
# Rejecting port 853 forces clients like Android/Linux/Mac to fallback to standard DNS (53)
:if ([:len [/ip firewall filter find comment="Block DoT (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block DoT (unauth)" dst-port=853 protocol=tcp reject-with=tcp-reset
}

# Block ALL HTTPS (port 443) for unauthenticated users
# This forces browsers to fall back to HTTP where the captive portal redirect works.
# Without this, Chrome/Firefox go straight to HTTPS and the portal never appears.
:if ([:len [/ip firewall filter find comment="Block HTTPS all (unauth) - forces captive portal"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block HTTPS all (unauth) - forces captive portal" dst-port=443 protocol=tcp reject-with=tcp-reset
}

# Force standard DNS traffic to the router for unauthenticated users only
:if ([:len [/ip firewall nat find comment="Force_DNS_UDP (unauth)"]] = 0) do={
    /ip firewall nat add action=redirect chain=hs-unauth-to comment="Force_DNS_UDP (unauth)" dst-port=53 protocol=udp to-ports=53
}
:if ([:len [/ip firewall nat find comment="Force_DNS_TCP (unauth)"]] = 0) do={
    /ip firewall nat add action=redirect chain=hs-unauth-to comment="Force_DNS_TCP (unauth)" dst-port=53 protocol=tcp to-ports=53
}

# General Masquerade for Internet access
:if ([:len [/ip firewall nat find comment="Internet"]] = 0) do={
    /ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="Internet"
}

# ============ 7. BATTLE-HARDENING (Production Safety) ============
# 1. Block IPv6 - Crucial for captive portals as clients will try to bypass via IPv6
/ipv6 settings set disable-ipv6=yes

# 2. Fasttrack Bypass - Hotspot and Fasttrack are incompatible
:if ([:len [/ip firewall filter find comment="Bypass_Fasttrack_for_Hotspot"]] = 0) do={
    /ip firewall filter add action=accept chain=forward comment="Bypass_Fasttrack_for_Hotspot" hotspot=auth place-before=0
    /ip firewall filter add action=accept chain=forward comment="Bypass_Fasttrack_for_Hotspot" hotspot=from-client place-before=0
}

# ============ 8. TIME SYNC ============
/system ntp client set enabled=yes
:if ([:len [/system ntp client servers find address="time.cloudflare.com"]] = 0) do={
    /system ntp client servers add address=time.cloudflare.com
}
:if ([:len [/system ntp client servers find address="pool.ntp.org"]] = 0) do={
    /system ntp client servers add address=pool.ntp.org
}

# ============ 8. ENABLE WIFI (AP Mode) ============
/interface wireless set wlan1 mode=ap-bridge ssid="TurboNet_Free_WiFi" disabled=no
/interface wireless enable wlan1

/log info "TurboNet Production Setup Complete!"
}
