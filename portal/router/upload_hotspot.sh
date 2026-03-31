#!/bin/bash
# Script to upload hotspot files to MikroTik router
# Usage: ./upload_hotspot.sh <router_ip> [username] [password]

ROUTER_IP=${1:-192.168.88.1}
USERNAME=${2:-admin}
PASSWORD=${3:-}
HOTSPOT_DIR="/home/vin/turbonet/portal/router/hotspot"

echo "📤 Uploading hotspot files to MikroTik at $ROUTER_IP..."

# Method 1: Using SCP (if SSH is enabled on MikroTik)
if [ -z "$PASSWORD" ]; then
    echo "Using SSH key authentication..."
    scp -r $HOTSPOT_DIR/* ${USERNAME}@${ROUTER_IP}:/hotspot/
else
    # Using sshpass for password authentication
    if command -v sshpass &> /dev/null; then
        sshpass -p "$PASSWORD" scp -r $HOTSPOT_DIR/* ${USERNAME}@${ROUTER_IP}:/hotspot/
    else
        echo "❌ sshpass not installed. Install with: sudo apt install sshpass"
        echo "Or use SSH key authentication instead."
        exit 1
    fi
fi

if [ $? -eq 0 ]; then
    echo "✅ Hotspot files uploaded successfully!"
    echo "Files uploaded:"
    ls -la $HOTSPOT_DIR/
else
    echo "❌ Upload failed. Trying alternative method..."
    echo ""
    echo "Manual upload instructions:"
    echo "1. Open Winbox and connect to $ROUTER_IP"
    echo "2. Go to Files → hotspot/"
    echo "3. Drag and drop the files from:"
    echo "   $HOTSPOT_DIR/"
    echo ""
    echo "Or via SSH:"
    echo "  ssh ${USERNAME}@${ROUTER_IP}"
    echo "  /file print where path~hotspot"
    echo "  /file set [find name=login.html] contents=[/file get login.html contents]"
fi
