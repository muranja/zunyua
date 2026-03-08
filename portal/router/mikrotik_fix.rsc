# ============ FINAL FIXES ============

# 1. Create the Hotspot Server (Fixed interface error)
/ip hotspot
add name="turbonet-hs" interface="bridge" profile=turbonet disabled=no

# 2. Update the User Profile (Fixed session-timeout syntax)
/ip hotspot user profile
set [find default=yes] shared-users=1 idle-timeout=10m keepalive-timeout=2m

# 3. Check if Wi-Fi is enabled
/interface wireless enable wlan1
