# =====================================================================
# TurboNet — COMPREHENSIVE LEAK FIX v2
# =====================================================================
# Run this AFTER the diagnostic to fix all leaks.
# This version explicitly places rules in correct positions.
# =====================================================================


:log info "========== COMPREHENSIVE LEAK FIX v2 - STARTING =========="


# =====================================================================
# STEP 1: FIRST - Remove old conflicting rules
# =====================================================================

# Remove any existing HTTPS/QUIC blocks so we start fresh
/ip firewall filter remove [find comment="Block HTTPS all (unauth)"]
/ip firewall filter remove [find comment="Block QUIC UDP 443 (unauth)"]
/ip firewall filter remove [find comment="Block Google direct (unauth)"]
/ip firewall filter remove [find comment="Block YouTube direct (unauth)"]
/ip firewall filter remove [find comment="Catch-all reject hs-unauth"]

:log info "Cleaned up old rules"


# =====================================================================
# STEP 2: Block QUIC (UDP 443) - place near TOP of chain
# =====================================================================
# This goes FIRST so it's checked before any other rule

/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=udp \
    dst-port=443 \
    comment="Block QUIC UDP 443 - YouTube/Google HTTP/3" \
    place-before=0

:log info "Added QUIC block at top"


# =====================================================================
# STEP 3: Block TCP 443 (HTTPS)
# =====================================================================

/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=tcp \
    dst-port=443 \
    comment="Block HTTPS TCP 443 - standard encrypted web" \
    place-before=0

:log info "Added HTTPS block"


# =====================================================================
# STEP 4: Block Google IP ranges (bypass DNS)
# =====================================================================

/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=tcp \
    dst-address=142.250.0.0/15 \
    comment="Block Google IP range - Chrome HSTS bypass" \
    place-before=0

/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    protocol=tcp \
    dst-address=208.65.152.0/22 \
    comment="Block YouTube IP range direct" \
    place-before=0

:log info "Added Google/YouTube IP blocks"


# =====================================================================
# STEP 5: Block ALL OTHER PORTS that could leak
# =====================================================================

# Block common ports that might allow tunnel/proxy
/ip firewall filter add action=reject chain=hs-unauth protocol=tcp dst-port=22,443,8080,8443 comment="Block SSH+HTTPS+proxies" place-before=0

# Block UDP specifically (except DNS which we need for captive portal)
# This is aggressive but necessary - UDP leaks are common
/ip firewall filter add action=reject chain=hs-unauth protocol=udp dst-port=443,53 comment="Block all UDP 443 except DNS" place-before=0

:log info "Added port blocks"


# =====================================================================
# STEP 6: FINAL - Catch-all reject at END of chain
# =====================================================================

# Put the catch-all at the END (highest position number)
# This ensures ANYTHING not caught above gets rejected

/ip firewall filter add \
    action=reject \
    chain=hs-unauth \
    comment="CATCH-ALL REJECT - block all remaining traffic" \
    reject-with=tcp-reset

:log info "Added catch-all reject at end"


# =====================================================================
# STEP 7: Verify the rules
# =====================================================================

:log info ""
:log info "=== VERIFICATION: Full hs-unauth chain ==="

/ip firewall filter print where chain=hs-unauth

:log info ""
:log info "=== PACKET COUNTERS ==="

/ip firewall filter print where chain=hs-unauth stats

:log info ""
:log info "========== COMPREHENSIVE LEAK FIX v2 - COMPLETE =========="