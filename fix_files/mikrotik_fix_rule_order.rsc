# =====================================================================
# TurboNet — LEAK FIX with CORRECT RULE ORDERING
# =====================================================================
# PROBLEM: Your custom block rules (12-15) are AFTER the catch-all reject (10)
# The reject at position 10 blocks everything first - your rules never run!
#
# FIX: Remove the catch-all reject, add BLOCK rules BEFORE the dynamic rules
# =====================================================================


:log info "========== FIXING RULE ORDER =========="


# =====================================================================
# STEP 1: Remove the duplicate catch-all rejects that are blocking everything
# =====================================================================

# Remove position 10 and 11 - these are global rejects that block everything
/ip firewall filter remove [find where chain=hs-unauth and action=reject and !dst-address and !dst-port]

:log info "Removed duplicate catch-all reject rules"


# =====================================================================
# STEP 2: Add BLOCK rules at TOP of chain (before dynamic return rules)
# These will be checked BEFORE the return rules
# =====================================================================

# Block QUIC (UDP 443) first - most important for YouTube
/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=udp \
    dst-port=443 \
    comment="Block QUIC UDP 443 - YouTube HTTP/3" \
    place-before=0

# Block HTTPS TCP 443
/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=tcp \
    dst-port=443 \
    comment="Block HTTPS TCP 443" \
    place-before=1

# Block Google IP ranges (bypass DNS)
/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=tcp \
    dst-address=142.250.0.0/15 \
    comment="Block Google IP range" \
    place-before=2

# Block YouTube IPs
/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=tcp \
    dst-address=208.65.152.0/22 \
    comment="Block YouTube IP range" \
    place-before=3


# =====================================================================
# STEP 3: Add catch-all reject at THE END (after all other rules)
# =====================================================================

/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    comment="CATCH-ALL - block any other traffic" \
    reject-with=tcp-reset


# =====================================================================
# STEP 4: Verify final rule order
# =====================================================================

:log info ""
:log info "=== FINAL RULES (top to bottom) ==="

/ip firewall filter print where chain=hs-unauth

:log info ""
:log info "========== FIX COMPLETE =========="
:log info "Block rules should now be ABOVE the dynamic return rules"
:log info "Try accessing YouTube now from an unauthenticated device"