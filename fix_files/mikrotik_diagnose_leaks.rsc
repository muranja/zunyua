# =====================================================================
# TurboNet — Hotspot Leak Diagnostic
# =====================================================================
# Run this to find WHY traffic is leaking through your hotspot.
# Paste into MikroTik terminal. It prints a report to the log.
# =====================================================================

:log info "========== HOTSPOT LEAK DIAGNOSTIC =========="

# --- 1. Check if hotspot is enabled ---
:local hsCount [/ip hotspot print count-only]
:log info ("Hotspot servers: " . $hsCount)
:if ($hsCount = 0) do={ :log error "NO HOTSPOT SERVER FOUND — nothing is being intercepted!" }

# --- 2. Check active hotspot users ---
:local activeUsers [/ip hotspot active print count-only]
:log info ("Active hotspot users: " . $activeUsers)
:if ($activeUsers > 0) do={
    :log info "Active users detail:"
    /ip hotspot active print where
}

# --- 3. Check firewall rules in hs-unauth chain ---
:local unauthRules [/ip firewall filter print count-only where chain=hs-unauth]
:log info ("hs-unauth firewall rules: " . $unauthRules)

:local hasQuicBlock [/ip firewall filter find where chain=hs-unauth and dst-port=443 and protocol=udp]
:if ([:len $hasQuicBlock] = 0) do={
    :log error "LEAK FOUND: No QUIC/UDP 443 block in hs-unauth! YouTube uses QUIC."
} else={
    :log info "OK: QUIC/UDP 443 is blocked"
}

:local hasHttpsBlock [/ip firewall filter find where chain=hs-unauth and dst-port=443 and protocol=tcp]
:if ([:len $hasHttpsBlock] = 0) do={
    :log error "LEAK FOUND: No TCP 443 block in hs-unauth! HTTPS traffic goes straight through."
} else={
    :log info "OK: TCP 443 is blocked"
}

:local hasCatchAll [/ip firewall filter find where chain=hs-unauth and action=reject and dst-address=""]
:if ([:len $hasCatchAll] = 0) do={
    :log error "LEAK FOUND: No catch-all reject at end of hs-unauth! Unmatched packets reach internet."
} else={
    :log info "OK: Catch-all reject exists"
}

# --- 4. Check walled garden for leaks ---
:local wgCount [/ip hotspot walled-garden print count-only]
:log info ("Walled garden entries: " . $wgCount)

:local googleWG [/ip hotspot walled-garden find where dst-host~"google" or dst-host~"youtube"]
:if ([:len $googleWG] > 0) do={
    :log error "LEAK FOUND: Google/YouTube in walled garden!"
    /ip hotspot walled-garden print where dst-host~"google" or dst-host~"youtube"
} else={
    :log info "OK: No Google/YouTube in walled garden"
}

:local wildcardWG [/ip hotspot walled-garden find where dst-host=""]
:if ([:len $wildcardWG] > 0) do={
    :log error "WARNING: Walled garden has wildcard entries (empty dst-host)"
    /ip hotspot walled-garden print where dst-host=""
}

# --- 5. Check DNS static entries ---
:local dnsCount [/ip dns static print count-only]
:log info ("DNS static entries: " . $dnsCount)

# --- 6. Check if IPv6 is disabled ---
:local ipv6Disabled [/ipv6 settings get disable-ipv6]
:if ($ipv6Disabled = no) do={
    :log error "LEAK FOUND: IPv6 is NOT disabled! Clients can bypass hotspot via IPv6."
} else={
    :log info "OK: IPv6 is disabled"
}

# --- 7. Check DHCP ---
:local dhcpLeases [/ip dhcp-server lease print count-only where status=bound]
:log info ("Active DHCP leases: " . $dhcpLeases)

# --- 8. Check masquerade NAT ---
:local masqRule [/ip firewall nat find where action=masquerade]
:if ([:len $masqRule] = 0) do={
    :log error "No masquerade NAT found — hotspot may not have internet access at all"
} else={
    :log info "OK: Masquerade NAT exists"
}

# --- 9. Print full hs-unauth chain for manual review ---
:log info "=== Full hs-unauth chain ==="
/ip firewall filter print where chain=hs-unauth

:log info "========== DIAGNOSTIC COMPLETE =========="
