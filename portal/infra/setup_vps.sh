#!/bin/bash

# TurboNet VPS Setup Script
# Ubuntu 22.04 LTS

set -e

# 1. Update & Upgrade
echo "Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install Essentials
echo "Installing essential packages..."
sudo apt install -y curl ufw mariadb-server freeradius freeradius-mysql freeradius-utils nodejs npm nginx certbot python3-certbot-nginx

# 3. Secure Server (UFW)
echo "Configuring Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 1812/udp
sudo ufw allow 1813/udp
sudo ufw --force enable

# 4. Database Setup
echo "Securing MariaDB..."
# Note: In a real script we might automate mysql_secure_installation or set root pass via SQL
# For now, we assume user will run 'sudo mysql_secure_installation' manually or we define a setup SQL.

# 5. Node.js (Latest LTS via nodesource is better, but using apt default for simplicity as per request)
# To get specific version:
# curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
# sudo apt-get install -y nodejs

echo "Setup Complete!"
echo "Next steps:"
echo "1. Run 'mysql_secure_installation'"
echo "2. Import schema.sql into MariaDB"
echo "3. Configure FreeRADIUS to use SQL"
