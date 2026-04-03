# =====================================================================
# TurboNet — Aggressive Fix: Force HTTP traffic to VPS
# =====================================================================
# The walled garden alone isn't working. This adds NAT redirect rules
# that force unauthenticated HTTP traffic to the VPS portal.
#
# Paste into Winbox > New Terminal or SSH
# =====================================================================

:put ""
:put "=== Applying aggressive HTTP redirect fix ==="
:put ""

# ---- 1. Verify walled garden entries exist ----
:put "Current walled garden entries:"
/ip hotspot walled-garden ip print
:put ""

:put "Current walled garden (hostname-based):"
/ip hotspot walled-garden print
:put ""

# ---- 2. Add NAT redirect for unauthenticated HTTP to VPS ----
# This catches ANY TCP port 80 traffic from unauthenticated users
# and redirects it to the VPS portal
:if ([:len [/ip firewall nat find comment="Force HTTP to VPS Portal"]] = 0) do={
    /ip firewall nat add chain=dstnat protocol=tcp dst-port=80 action=dst-nat to-addresses=136.109.224.75 to-ports=80 comment="Force HTTP to VPS Portal" place-before=0
    :put "OK: Added NAT redirect for HTTP traffic to VPS"
} else={
    :put "SKIP: NAT redirect already exists"
}

# ---- 3. Check for existing hotspot NAT rules that might interfere ----
:put ""
:put "Current NAT rules:"
/ip firewall nat print
:put ""

# ---- 4. Check hotspot active users ----
:put "Active hotspot users:"
/ip hotspot active print
:put ""

# ---- 5. Test from the router ----
:put "Testing HTTP connection to VPS from router..."
:local httpTest [/tool fetch url="http://136.109.224.75/api/health" output=as-text as-value]
:put ("HTTP response: " . $httpTest)

:put ""
:put "=== Fix applied! ==="
:put "Disconnect and reconnect your test device."
