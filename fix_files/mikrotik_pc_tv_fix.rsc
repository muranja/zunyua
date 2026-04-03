# =====================================================================
# TurboNet — PC & Smart TV Captive Portal Fix
# =====================================================================
# WHAT THIS FIXES:
#   - Windows PC: "DNS error" / captive portal popup never appears
#   - macOS/Mac: Portal not detected, Safari doesn't redirect
#   - Smart TV (Samsung, LG, Android TV): No portal shown
#   - Linux: Browser doesn't redirect to portal
#
# HOW TO APPLY:
#   Paste into MikroTik terminal (Winbox > New Terminal) or SSH.
#   Safe to run on top of your existing mikrotik_setup.rsc config.
# =====================================================================

# ---- STEP 1: Static DNS — redirect all OS probe domains to your VPS ----
# Each OS has a specific "connectivity check" URL it probes on Wi-Fi join.
# By default these resolve to the real internet, which MikroTik blocks
# for unauthenticated users — causing DNS timeouts / "no internet" errors.
# We redirect them to your VPS (136.109.224.75) so nginx can intercept them.

/ip dns static

# Windows — NCSI (Network Connectivity Status Indicator)
:if ([:len [/ip dns static find name="www.msftconnecttest.com"]] = 0) do={
    /ip dns static add name="www.msftconnecttest.com" address=136.109.224.75 comment="Windows NCSI probe"
}
:if ([:len [/ip dns static find name="ipv6.msftconnecttest.com"]] = 0) do={
    /ip dns static add name="ipv6.msftconnecttest.com" address=136.109.224.75 comment="Windows NCSI IPv6"
}
:if ([:len [/ip dns static find name="www.msftncsi.com"]] = 0) do={
    /ip dns static add name="www.msftncsi.com" address=136.109.224.75 comment="Windows NCSI legacy"
}

# macOS / iOS / Apple TV
:if ([:len [/ip dns static find name="captive.apple.com"]] = 0) do={
    /ip dns static add name="captive.apple.com" address=136.109.224.75 comment="Apple captive portal probe"
}
:if ([:len [/ip dns static find name="www.apple.com"]] = 0) do={
    /ip dns static add name="www.apple.com" address=136.109.224.75 comment="Apple probe fallback"
}
:if ([:len [/ip dns static find name="gsp1.apple.com"]] = 0) do={
    /ip dns static add name="gsp1.apple.com" address=136.109.224.75 comment="Apple TV probe"
}
:if ([:len [/ip dns static find name="apple.com"]] = 0) do={
    /ip dns static add name="apple.com" address=136.109.224.75 comment="Apple probe base domain"
}

# Android / Chrome (Google) — also used by Android TV / Google TV
:if ([:len [/ip dns static find name="connectivitycheck.gstatic.com"]] = 0) do={
    /ip dns static add name="connectivitycheck.gstatic.com" address=136.109.224.75 comment="Android/Chrome probe"
}
:if ([:len [/ip dns static find name="connectivitycheck.android.com"]] = 0) do={
    /ip dns static add name="connectivitycheck.android.com" address=136.109.224.75 comment="Android probe alt"
}
:if ([:len [/ip dns static find name="clients3.google.com"]] = 0) do={
    /ip dns static add name="clients3.google.com" address=136.109.224.75 comment="Android probe alt 2"
}

# Samsung Smart TV — uses this domain for connectivity checks
:if ([:len [/ip dns static find name="www.samsung.com"]] = 0) do={
    /ip dns static add name="www.samsung.com" address=136.109.224.75 comment="Samsung TV probe"
}
:if ([:len [/ip dns static find name="samsungcld.com"]] = 0) do={
    /ip dns static add name="samsungcld.com" address=136.109.224.75 comment="Samsung TV probe 2"
}

# LG Smart TV
:if ([:len [/ip dns static find name="www.lgtvsdp.com"]] = 0) do={
    /ip dns static add name="www.lgtvsdp.com" address=136.109.224.75 comment="LG TV probe"
}
:if ([:len [/ip dns static find name="lgappstv.com"]] = 0) do={
    /ip dns static add name="lgappstv.com" address=136.109.224.75 comment="LG TV probe 2"
}

# Linux (Ubuntu/Debian NetworkManager)
:if ([:len [/ip dns static find name="network-test.debian.org"]] = 0) do={
    /ip dns static add name="network-test.debian.org" address=136.109.224.75 comment="Linux NM probe"
}
:if ([:len [/ip dns static find name="nmcheck.gnome.org"]] = 0) do={
    /ip dns static add name="nmcheck.gnome.org" address=136.109.224.75 comment="Linux GNOME probe"
}


# ---- STEP 2: Walled Garden — allow OS probe IPs through unauthenticated ----
# The VPS IP is probably already in the walled garden, but make sure these
# are explicitly allowed so the probe responses get through.

/ip hotspot walled-garden ip
:if ([:len [/ip hotspot walled-garden ip find dst-address=136.109.224.75]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-address=136.109.224.75 comment="VPS Portal (all probe responses)"
}
# Allow TCP port 80 responses FROM the VPS to reach clients (belt-and-suspenders)
:if ([:len [/ip hotspot walled-garden ip find dst-address=136.109.224.75 protocol=tcp]] = 0) do={
    /ip hotspot walled-garden ip add action=accept dst-address=136.109.224.75 protocol=tcp comment="VPS Portal TCP"
}


# ---- STEP 3: Flush the DNS cache so old records don't linger ----
/ip dns cache flush

/log info "TurboNet PC/TV captive portal fix applied successfully!"
/log info "DNS static entries added for Windows, macOS, Samsung TV, LG TV, Android, Linux"
