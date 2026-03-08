#!/bin/bash
# Setup DuckDNS for turbowifi.duckdns.org

DUCKDNS_TOKEN="2266cd6c-a6e7-4539-beff-9ec53cc82b7a"
DUCKDNS_DOMAIN="turbowifi"

# Create duckdns directory
mkdir -p ~/duckdns

# Create update script
cat > ~/duckdns/duck.sh << 'EOF'
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=turbowifi&token=2266cd6c-a6e7-4539-beff-9ec53cc82b7a&ip=" | curl -k -o ~/duckdns/duck.log -K -
EOF

chmod +x ~/duckdns/duck.sh

# Run initial update
~/duckdns/duck.sh
echo "DuckDNS response:"
cat ~/duckdns/duck.log

# Add cron job (every 5 minutes)
(crontab -l 2>/dev/null | grep -v duckdns; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1") | crontab -

echo ""
echo "Cron job added:"
crontab -l | grep duckdns

echo ""
echo "DuckDNS setup complete for turbowifi.duckdns.org"
