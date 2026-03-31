# =====================================================================
# TurboNet — Fix Captive Portal Connectivity
# =====================================================================
# The diagnostic showed VPS IP 136.117.23.173 is NOT in the walled garden.
# This means the hotspot intercepts all traffic to the VPS, blocking
# unauthenticated users from reaching the portal or API.
#
# Paste into Winbox > New Terminal or SSH
# =====================================================================

:put ""
:put "=== Fixing captive portal connectivity ==="
:put ""

# ---- 1. Add VPS IP to walled-garden-ip (primary fix) ----
:if ([:len [/ip hotspot walled-garden ip find dst-address=136.117.23.173]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-address=136.117.23.173 comment="VPS Portal - all traffic"
    :put "OK: Added VPS IP to walled-garden-ip"
} else={
    :put "SKIP: VPS IP already in walled-garden-ip"
}

# ---- 2. Add VPS IP to walled-garden (hostname-based) ----
:if ([:len [/ip hotspot walled-garden find dst-host=136.117.23.173]] = 0) do={
    /ip hotspot walled-garden add action=allow dst-host=136.117.23.173 comment="VPS Portal HTTP bypass"
    :put "OK: Added VPS IP to walled-garden (hostname)"
} else={
    :put "SKIP: VPS IP already in walled-garden (hostname)"
}

# ---- 3. Add protocol-specific rules for belt-and-suspenders ----
:if ([:len [/ip hotspot walled-garden ip find dst-address=136.117.23.173 protocol=tcp dst-port=80]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-address=136.117.23.173 protocol=tcp dst-port=80 comment="VPS HTTP"
    :put "OK: Added VPS HTTP (port 80) to walled-garden"
} else={
    :put "SKIP: VPS HTTP already in walled-garden"
}

:if ([:len [/ip hotspot walled-garden ip find dst-address=136.117.23.173 protocol=tcp dst-port=443]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-address=136.117.23.173 protocol=tcp dst-port=443 comment="VPS HTTPS"
    :put "OK: Added VPS HTTPS (port 443) to walled-garden"
} else={
    :put "SKIP: VPS HTTPS already in walled-garden"
}

# ---- 4. Flush DNS cache ----
/ip dns cache flush
:put "OK: DNS cache flushed"

# ---- 5. Verify ----
:put ""
:put "=== Verification ==="
:put ""
:put "Walled garden entries for VPS:"
/ip hotspot walled-garden ip print where dst-address=136.117.23.173
/ip hotspot walled-garden print where dst-host=136.117.23.173
:put ""

:put "Testing ping to VPS..."
:local pingResult [/ping 136.117.23.173 count=3]
:if ($pingResult > 0) do={
    :put ("OK: Ping succeeded (" . $pingResult . "/3 replies)")
} else={
    :put "WARNING: Ping failed — check WAN connectivity"
}

:put ""
:put "=== Fix complete! ==="
:put "Now disconnect and reconnect your test device."
:put "You should see the captive portal popup."
