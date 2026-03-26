# =====================================================================
# TurboNet — Block HTTPS & QUIC for Unauthenticated Users
# =====================================================================
# WHAT THIS FIXES:
#   - PC browsers go straight to HTTPS and never see the captive portal
#   - YouTube/Google load via QUIC (UDP 443) without paying
#   - Chrome connects to Google via pre-cached DNS (HSTS preload)
#
# HOW IT WORKS:
#   1. Rejects TCP port 443 for all unauthenticated hotspot users
#   2. Rejects UDP port 443 (QUIC/HTTP3) for all unauthenticated users
#   3. Blocks Google/YouTube IP ranges directly
#   4. Adds catch-all reject at end of hs-unauth chain
#
# HOW TO APPLY:
#   Paste into MikroTik terminal (Winbox > New Terminal) or SSH.
#   Safe to run on top of existing config — all rules are idempotent.
# =====================================================================

# Block ALL HTTPS (TCP 443) for unauthenticated users
:if ([:len [/ip firewall filter find comment="Block HTTPS all (unauth) - forces captive portal"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block HTTPS all (unauth) - forces captive portal" dst-port=443 protocol=tcp reject-with=tcp-reset
}

# Block QUIC (UDP 443) — THE #1 LEAK for YouTube/Google
:if ([:len [/ip firewall filter find comment="Block QUIC UDP 443 (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block QUIC UDP 443 (unauth)" dst-port=443 protocol=udp reject-with=icmp-admin-prohibited
}

# Block Google IP ranges directly (Chrome has HSTS preload — no DNS needed)
:if ([:len [/ip firewall filter find comment="Block Google direct (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block Google direct (unauth)" dst-address=142.250.0.0/15 protocol=tcp reject-with=tcp-reset
}
:if ([:len [/ip firewall filter find comment="Block YouTube direct (unauth)"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Block YouTube direct (unauth)" dst-address=208.65.152.0/22 protocol=tcp reject-with=tcp-reset
}

# Catch-all reject at end of hs-unauth chain
:if ([:len [/ip firewall filter find comment="Catch-all reject hs-unauth"]] = 0) do={
    /ip firewall filter add action=reject chain=hs-unauth comment="Catch-all reject hs-unauth" reject-with=tcp-reset
}

/log info "HTTPS & QUIC leak fix applied!"
