# =====================================================================
# TurboNet — Debug: Show all hotspot NAT and filter rules
# =====================================================================
# This shows exactly what the hotspot is doing with traffic.
# Paste into Winbox > New Terminal or SSH
# =====================================================================

:put "=== HOTSPOT SERVER STATUS ==="
/ip hotspot print
:put ""

:put "=== ALL FIREWALL NAT RULES ==="
/ip firewall nat print detail
:put ""

:put "=== ALL FIREWALL FILTER RULES (hs-* chains) ==="
/ip firewall filter print detail where chain~"hs-"
:put ""

:put "=== WALLED GARDEN IP ==="
/ip hotspot walled-garden ip print detail
:put ""

:put "=== WALLED GARDEN (hostname) ==="
/ip hotspot walled-garden print detail
:put ""

:put "=== HOTSPOT ACTIVE USERS ==="
/ip hotspot active print detail
:put ""

:put "=== DNS STATIC ENTRIES ==="
/ip dns static print
