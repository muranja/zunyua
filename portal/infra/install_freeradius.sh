#!/bin/bash
# =====================================================
# Complete FreeRADIUS Setup for TurboNet
# Run this on your Ubuntu 20.04/22.04 VPS
# =====================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 TurboNet FreeRADIUS Setup${NC}"
echo ""

# ============ CONFIGURATION - EDIT THESE! ============
DB_HOST="localhost"
DB_USER="turbonet_user"
DB_PASS="YOUR_DATABASE_PASSWORD"
DB_NAME="turbonet"
RADIUS_SECRET="TurboNetSecret2024"  # Same as in MikroTik!
# ====================================================

# 1. Install packages
echo -e "${YELLOW}📦 Installing FreeRADIUS...${NC}"
sudo apt update
sudo apt install -y freeradius freeradius-mysql freeradius-utils mysql-client

# 2. Stop FreeRADIUS for configuration
sudo systemctl stop freeradius

# 3. Enable SQL module
echo -e "${YELLOW}🔧 Enabling SQL module...${NC}"
sudo ln -sf /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql

# 4. Configure SQL connection
echo -e "${YELLOW}📝 Configuring database connection...${NC}"
sudo cat > /etc/freeradius/3.0/mods-available/sql << EOF
sql {
    driver = "rlm_sql_mysql"
    dialect = "mysql"
    
    server = "${DB_HOST}"
    port = 3306
    login = "${DB_USER}"
    password = "${DB_PASS}"
    radius_db = "${DB_NAME}"
    
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    postauth_table = "radpostauth"
    authcheck_table = "radcheck"
    authreply_table = "radreply"
    groupcheck_table = "radgroupcheck"
    groupreply_table = "radgroupreply"
    usergroup_table = "radusergroup"
    
    read_groups = yes
    delete_stale_sessions = yes
    
    \$INCLUDE \${modconfdir}/\${.:name}/main/\${dialect}/queries.conf
    
    pool {
        start = 5
        min = 4
        max = 32
        spare = 3
        uses = 0
        lifetime = 0
        idle_timeout = 60
    }
    
    read_clients = no
}
EOF

# 5. Add MikroTik as RADIUS client
echo -e "${YELLOW}🔌 Adding MikroTik client...${NC}"
sudo cat >> /etc/freeradius/3.0/clients.conf << EOF

# TurboNet MikroTik Router
client mikrotik {
    ipaddr = 0.0.0.0/0
    secret = ${RADIUS_SECRET}
    shortname = turbonet-router
    nastype = mikrotik
    require_message_authenticator = no
}
EOF

# 6. Enable SQL in sites
echo -e "${YELLOW}⚙️ Enabling SQL in authorization...${NC}"
# Add -sql to authorize and accounting sections
sudo sed -i 's/#.*sql/sql/' /etc/freeradius/3.0/sites-enabled/default

# 7. Set permissions
sudo chown -R freerad:freerad /etc/freeradius/3.0/mods-enabled/sql
sudo chmod 640 /etc/freeradius/3.0/mods-enabled/sql

# 8. Open firewall ports
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
sudo ufw allow 1812/udp comment "RADIUS Auth"
sudo ufw allow 1813/udp comment "RADIUS Accounting"
sudo ufw allow 3799/udp comment "RADIUS CoA/Disconnect"

# 9. Test configuration
echo -e "${YELLOW}🧪 Testing configuration...${NC}"
sudo freeradius -CX

echo ""
echo -e "${GREEN}✅ FreeRADIUS Setup Complete!${NC}"
echo ""
echo "📝 Important:"
echo "1. Edit /etc/freeradius/3.0/mods-available/sql with your DB password"
echo "2. Run the RADIUS schema: mysql -u $DB_USER -p $DB_NAME < radius_schema.sql"
echo "3. Start FreeRADIUS: sudo systemctl start freeradius"
echo "4. Enable on boot: sudo systemctl enable freeradius"
echo ""
echo "🧪 To test:"
echo "   sudo systemctl stop freeradius"
echo "   sudo freeradius -X  (debug mode)"
echo ""
echo "📊 Your RADIUS secret is: ${RADIUS_SECRET}"
echo "   Use this SAME secret in MikroTik!"
