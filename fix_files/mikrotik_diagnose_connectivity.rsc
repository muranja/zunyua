# =====================================================================
# TurboNet — Diagnose Captive Portal Connectivity
# =====================================================================
# Run this on MikroTik to check why VPS might be unreachable
# Paste into Winbox > New Terminal or SSH
# =====================================================================

:put ""
:put "========================================"
:put "  TurboNet Connectivity Diagnostics"
:put "========================================"
:put ""

# ---- 1. Check walled garden for VPS IP ----
:put "--- 1. WALLED GARDEN (VPS IP 136.109.224.75) ---"
:local wgRules [/ip hotspot walled-garden ip find dst-address=136.109.224.75]
:if ([:len $wgRules] = 0) do={
    :put "!! PROBLEM: VPS IP 136.109.224.75 NOT in walled-garden-ip !!"
    :put "   FIX: /ip hotspot walled-garden ip add action=accept dst-address=136.109.224.75 comment=\"VPS Portal\""
} else={
    :put "OK: VPS IP found in walled-garden-ip:"
    /ip hotspot walled-garden ip print where dst-address=136.109.224.75
}
:put ""

:put "--- 2. WALLED GARDEN (hostname-based) ---"
:local wgHostRules [/ip hotspot walled-garden find dst-host=136.109.224.75]
:if ([:len $wgHostRules] = 0) do={
    :put "!! WARNING: VPS IP not in walled-garden (hostname-based) !!"
    :put "   FIX: /ip hotspot walled-garden add action=allow dst-host=136.109.224.75"
} else={
    :put "OK: VPS IP found in walled-garden:"
    /ip hotspot walled-garden print where dst-host=136.109.224.75
}
:put ""

# ---- 2. Check firewall rules ----
:put "--- 3. FIREWALL RULES (hs-unauth chain) ---"
/ip firewall filter print where chain=hs-unauth
:put ""

:put "--- 4. FIREWALL RULES (catch-all reject) ---"
:local catchAll [/ip firewall filter find chain=hs-unauth and action=reject and dst-address!=""]
:if ([:len $catchAll] > 0) do={
    :put "!! These reject rules might block VPS traffic:"
    /ip firewall filter print where chain=hs-unauth and action=reject
} else={
    :put "No specific reject rules found"
}
:put ""

# ---- 3. Check hotspot server ----
:put "--- 5. HOTSPOT SERVER ---"
/ip hotspot print
:put ""

:put "--- 6. HOTSPOT PROFILE ---"
/ip hotspot profile print
:put ""

# ---- 4. DNS static entries ----
:put "--- 7. DNS STATIC ENTRIES (probe domains) ---"
/ip dns static print where comment~"probe"
:put ""

# ---- 5. Test connectivity to VPS ----
:put "--- 8. CONNECTIVITY TEST TO VPS ---"
:put "Pinging 136.109.224.75..."
:local pingResult [/ping 136.109.224.75 count=3]
:if ($pingResult > 0) do={
    :put ("OK: Ping succeeded (" . $pingResult . "/3 replies)")
} else={
    :put "!! PROBLEM: Ping to VPS FAILED — VPS unreachable from router !!"
}
:put ""

# ---- 6. Check if hotspot is enabled ----
:put "--- 9. HOTSPOT STATUS ---"
:local hsCount [/ip hotspot print count-only]
:if ($hsCount = 0) do={
    :put "!! PROBLEM: No hotspot servers configured !!"
} else={
    :put ("OK: " . $hsCount . " hotspot server(s) configured")
    /ip hotspot print where disabled=no
}
:put ""

:put "--- 10. ACTIVE HOTSPOT USERS ---"
/ip hotspot active print
:put ""

:put "========================================"
:put "  If VPS is reachable but browser fails:"
:put "  1. Check walled garden has 136.109.224.75"
:put "  2. Check no hs-unauth rule blocks port 80 to VPS"
:put "  3. Flush DNS cache: /ip dns cache flush"
:put "========================================"
