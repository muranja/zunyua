# =====================================================================
# TurboNet — COMPREHENSIVE Leak Diagnostic v2
# =====================================================================
# Run this FIRST before applying any fixes. 
# It will print EVERYTHING to help identify the exact leak.
# =====================================================================


:log info "======================================================================"
:log info "         TURBONET LEAK DIAGNOSTIC v2 - STARTING"
:log info "======================================================================"


# =====================================================================
# 1. HOTSPOT STATUS
# =====================================================================
:log info ""
:log info "=== 1. HOTSPOT STATUS ==="

:local hsServerCount [/ip hotspot print count-only]
:log info "Hotspot Servers: $hsServerCount"

:if ($hsServerCount = 0) do={
    :log error "CRITICAL: NO HOTSPOT SERVER IS CONFIGURED!"
} else={
    :log info "Hotspot servers running:"
    /ip hotspot print
}


# =====================================================================
# 2. ACTIVE HOTSPOT USERS (CRITICAL - is your test device auth'd?)
# =====================================================================
:log info ""
:log info "=== 2. ACTIVE HOTSPOT USERS ==="

:local activeCount [/ip hotspot active print count-only]
:log info "Active users: $activeCount"

:if ($activeCount > 0) do={
    :log info "ACTIVE USER LIST:"
    /ip hotspot active print
    
    :log info ""
    :log info "===== IF YOUR TEST DEVICE IS HERE, IT'S ALREADY AUTHENTICATED ====="
    :log info "===== Firewall rules for UNAUTHENTICATED won't apply to it! ====="
}


# =====================================================================
# 3. HS-AUTH CHAIN (authenticated users) - what's allowed?
# =====================================================================
:log info ""
:log info "=== 3. HS-AUTH CHAIN (authenticated users) ==="

:local hsAuthCount [/ip firewall filter print count-only where chain=hs-auth]
:log info "hs-auth rules: $hsAuthCount"

/ip firewall filter print where chain=hs-auth


# =====================================================================
# 4. HS-UNAUTH CHAIN (unauthenticated users) - THE KEY CHAIN
# =====================================================================
:log info ""
:log info "=== 4. HS-UNAUTH CHAIN (unauthenticated users) ==="

:local hsUnauthCount [/ip firewall filter print count-only where chain=hs-unauth]
:log info "hs-unauth rules: $hsUnauthCount"

/ip firewall filter print where chain=hs-unauth


:log info ""
:log info "===== CHECK THESE RULES - are they in the right order? ====="

/ip firewall filter print where chain=hs-unauth detail


:log info ""
:log info "=== 4b. Do we have a catch-all reject? ==="

:local catchAll [/ip firewall filter find where chain=hs-unauth and action=reject and !dst-address]
:if ([:len $catchAll] > 0) do={
    :log info "OK: Catch-all reject EXISTS"
} else={
    :log error "MISSING: No catch-all reject! Packets fall through to internet!"
}


:log info ""
:log info "=== 4c. Is QUIC (UDP 443) blocked? ==="

:local quic [/ip firewall filter find where chain=hs-unauth and dst-port=443 and protocol=udp]
:if ([:len $quic] > 0) do={
    :log info "OK: QUIC (UDP 443) is blocked"
} else={
    :log error "MISSING: QUIC (UDP 443) not blocked! YouTube goes through!"
}


:log info ""
:log info "=== 4d. Is TCP 443 blocked? ==="

:local tcp443 [/ip firewall filter find where chain=hs-unauth and dst-port=443 and protocol=tcp]
:if ([:len $tcp443] > 0) do={
    :log info "OK: TCP 443 is blocked"
} else={
    :log error "MISSING: TCP 443 not blocked!"
}


# =====================================================================
# 5. WALLED GARDEN - what's allowed without authentication?
# =====================================================================
:log info ""
:log info "=== 5. WALLED GARDEN (allowed without auth) ==="

:local wgCount [/ip hotspot walled-garden print count-only]
:log info "Walled garden entries: $wgCount"

/ip hotspot walled-garden print


# =====================================================================
# 6. DNS STATIC OVERRIDES
# =====================================================================
:log info ""
:log info "=== 6. DNS STATIC ENTRIES ==="

:local dnsStatic [/ip dns static print count-only]
:log info "DNS static entries: $dnsStatic"

/ip dns static print


# =====================================================================
# 7. CURRENT DNS CACHE (what is being resolved?)
# =====================================================================
:log info ""
:log info "=== 7. DNS CACHE ==="

:local dnsCache [/ip dns cache print count-only]
:log info "DNS cache entries: $dnsCache"


# =====================================================================
# 8. IPV6 STATUS (IPv6 bypass?)
# =====================================================================
:log info ""
:log info "=== 8. IPv6 STATUS ==="

:local ipv6Disabled [/ipv6 settings get disable-ipv6]
:log info "IPv6 disabled: $ipv6Disabled"

:if ($ipv6Disabled = no) do={
    :log error "WARNING: IPv6 is ENABLED! Users can bypass via IPv6!"
}


# =====================================================================
# 9. NAT RULES (masquerade)
# =====================================================================
:log info ""
:log info "=== 9. NAT RULES ==="

:log info "NAT rules:"
/ip firewall nat print


# =====================================================================
# 10. PACKET COUNTERS - which rules are matching?
# =====================================================================
:log info ""
:log info "=== 10. PACKET COUNTERS on hs-unauth ==="
:log info "This shows which rules are actually being hit by traffic"

/ip firewall filter print where chain=hs-unauth stats


# =====================================================================
# SUMMARY
# =====================================================================
:log info ""
:log info "======================================================================"
:log info "                   DIAGNOSTIC COMPLETE"
:log info "======================================================================"
:log info ""
:log info "CHECK THESE COMMON ISSUES:"
:log info "1. Is your test device listed in /ip hotspot active? → It's already logged in"
:log info "2. Is there a catch-all reject in hs-unauth? → Otherwise packets leak"
:log info "3. Is QUIC UDP 443 blocked? → YouTube uses HTTP/3"
:log info "4. Any entries in walled garden allowing google/youtube?"
:log info "5. Is IPv6 disabled?"
:log info ""
:log info "======================================================================"