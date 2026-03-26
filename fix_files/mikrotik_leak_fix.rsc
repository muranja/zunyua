# =====================================================================
# TurboNet — Hotspot Leak Fix (PC/YouTube/Google bypass)
# =====================================================================
# WHAT THIS FIXES:
#   - PC can access YouTube/Google without paying (QUIC/UDP 443 leak)
#   - Chrome connects to Google via pre-cached DNS (no DNS needed)
#   - Unmatched packets in hs-unauth fall through to internet
#
# ROOT CAUSES:
#   1. QUIC (UDP 443) was not blocked — Google/YouTube use HTTP/3
#   2. No catch-all reject at end of hs-unauth chain
#   3. Chrome has HSTS preload + pre-cached DNS for google.com
#
# HOW TO APPLY:
#   Paste into MikroTik terminal (Winbox > New Terminal) or SSH.
#   Safe to run on top of existing config — all rules are idempotent.
# =====================================================================


# =====================================================================
# STEP 1: Block QUIC (UDP 443) — THE #1 LEAK
# =====================================================================
# Google/YouTube use HTTP/3 (QUIC) which runs over UDP port 443.
# Your existing rules only block TCP 443. UDP 443 was wide open.

:if ([:len [/ip firewall filter find comment="Block QUIC UDP 443 (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block QUIC UDP 443 (unauth)" dst-port=443 protocol=udp reject-with=icmp-admin-prohibited
}


# =====================================================================
# STEP 2: Block Google/YouTube IP ranges directly
# =====================================================================
# Chrome has HSTS preload for google.com — it connects to the IP directly
# without DNS. We must block Google's IP ranges for unauthenticated users.

:if ([:len [/ip firewall filter find comment="Block Google direct (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block Google direct (unauth)" dst-address=142.250.0.0/15 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block YouTube direct (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block YouTube direct (unauth)" dst-address=208.65.152.0/22 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block YouTube alt (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block YouTube alt (unauth)" dst-address=208.117.224.0/19 protocol=tcp reject-with=tcp-reset
}

# Also block Google IPs via UDP (QUIC to direct IPs)
:if ([:len [/ip firewall filter find comment="Block Google QUIC (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block Google QUIC (unauth)" dst-address=142.250.0.0/15 dst-port=443 protocol=udp reject-with=icmp-admin-prohibited
}


# =====================================================================
# STEP 3: Add catch-all reject at end of hs-unauth chain
# =====================================================================
# Without this, any packet that doesn't match a specific rule in hs-unauth
# falls through to the forward chain, gets masqueraded, and reaches the internet.
# This is the most dangerous leak — it means ANY traffic type not explicitly
# blocked gets through.

:if ([:len [/ip firewall filter find comment="Catch-all reject hs-unauth"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Catch-all reject hs-unauth" reject-with=tcp-reset
}


# =====================================================================
# STEP 4: Verify — print diagnostic info
# =====================================================================

:log info "=== Hotspot Leak Fix Applied ==="
:log info "Checking firewall rules..."

:local quicRule [/ip firewall filter find comment="Block QUIC UDP 443 (unauth)"]
:if ([:len $quicRule] > 0) do={ :log info "OK: QUIC UDP 443 blocked" } else={ :log error "FAIL: QUIC rule not found" }

:local catchAll [/ip firewall filter find comment="Catch-all reject hs-unauth"]
:if ([:len $catchAll] > 0) do={ :log info "OK: Catch-all reject in hs-unauth" } else={ :log error "FAIL: Catch-all rule not found" }

:local googleRule [/ip firewall filter find comment="Block Google direct (unauth)"]
:if ([:len $googleRule] > 0) do={ :log info "OK: Google IPs blocked" } else={ :log error "FAIL: Google block not found" }

:log info "=== Run these commands to verify manually ==="
:log info "/ip firewall filter print where chain=hs-unauth"
:log info "/ip hotspot walled-garden print"
:log info "/ip hotspot active print"
