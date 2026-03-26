#!/bin/bash
# TurboNet Deployment Script for 136.117.23.173
# Run this on your Google Cloud VM

set -e

echo "🚀 TurboNet Deployment Starting..."
echo "=================================="

# Variables
DOMAIN="136.117.23.173"
DUCKDNS_TOKEN="2266cd6c-a6e7-4539-beff-9ec53cc82b7a"
DB_PASS="TurboNet2024!"

# 1. Update DuckDNS
echo "🦆 Updating DuckDNS..."
curl -s "https://www.duckdns.org/update?domains=turbowifi&token=$DUCKDNS_TOKEN&ip=" > /dev/null
echo "DuckDNS updated!"

# 2. Install Node.js 20
echo "📦 Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
echo "Node.js $(node -v) installed"

# 3. Install MySQL
echo "📦 Installing MySQL..."
if ! command -v mysql &> /dev/null; then
    sudo apt install -y mysql-server
    sudo systemctl start mysql
    sudo systemctl enable mysql
fi

# 4. Setup Database
echo "🗄️ Setting up database..."
sudo mysql -e "CREATE DATABASE IF NOT EXISTS turbonet;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'turbonet'@'localhost' IDENTIFIED BY '$DB_PASS';"
sudo mysql -e "GRANT ALL PRIVILEGES ON turbonet.* TO 'turbonet'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"

# 5. Import schema
echo "📊 Importing database schema..."
cd ~/turbonet/portal/app/backend
mysql -u turbonet -p$DB_PASS turbonet < schema.sql 2>/dev/null || true

# Import RADIUS schema if exists
if [ -f ~/turbonet/portal/infra/freeradius/radius_schema.sql ]; then
    mysql -u turbonet -p$DB_PASS turbonet < ~/turbonet/portal/infra/freeradius/radius_schema.sql 2>/dev/null || true
fi

# 6. Setup Backend
echo "⚙️ Setting up backend..."
cd ~/turbonet/portal/app/backend
cp .env.production .env 2>/dev/null || true
npm install --production

# 7. Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2 --quiet

# 8. Build Frontend
echo "🎨 Building frontend..."
cd ~/turbonet/portal/app/frontend
npm install --production=false
npm run build

# 9. Install and configure Nginx
echo "🌐 Setting up Nginx..."
sudo apt install -y nginx

# Deploy the captive portal nginx config (includes OS probe interception)
if [ -f ~/turbonet/fix_files/nginx_captive_portal.conf ]; then
    sudo cp ~/turbonet/fix_files/nginx_captive_portal.conf /etc/nginx/sites-available/turbonet
else
    sudo tee /etc/nginx/sites-available/turbonet > /dev/null << 'EOF'
# =====================================================================
# BLOCK 1 — Catch-all for OS probe domains (captive portal detection)
# =====================================================================
server {
    listen 80 default_server;
    server_name _;

    # Windows NCSI
    location = /connecttest.txt { return 302 http://136.117.23.173/; }
    location = /redirect { return 302 http://136.117.23.173/; }
    location = /ncsi.txt { return 302 http://136.117.23.173/; }

    # Apple / macOS / iOS
    location = /hotspot-detect.html { return 302 http://136.117.23.173/; }
    location = /library/test/success.html { return 302 http://136.117.23.173/; }
    location = /success.html { return 302 http://136.117.23.173/; }

    # Android / Chrome
    location = /generate_204 { return 302 http://136.117.23.173/; }
    location = /gen_204 { return 302 http://136.117.23.173/; }

    # Linux
    location = /nm-check.txt { return 302 http://136.117.23.173/; }
    location = /check_network_status.txt { return 302 http://136.117.23.173/; }

    # Firefox
    location = /canonical.html { return 302 http://136.117.23.173/; }
    location = /success.txt { return 302 http://136.117.23.173/; }

    # Everything else
    location / { return 302 http://136.117.23.173/; }
}

# =====================================================================
# BLOCK 2 — Portal domain (HTTP only for captive portal)
# =====================================================================
server {
    listen 80;
    server_name 136.117.23.173;

    location /.well-known/acme-challenge/ { root /var/www/html; }
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
    location / {
        root /home/vin/turbonet/portal/app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}

# =====================================================================
# BLOCK 3 — Raw VPS IP (MikroTik login.html redirects here)
# =====================================================================
server {
    listen 80;
    server_name 136.117.23.173;

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location / {
        root /home/vin/turbonet/portal/app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
EOF
fi

sudo ln -sf /etc/nginx/sites-available/turbonet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# 10. Start Backend with PM2
echo "🚀 Starting backend..."
cd ~/turbonet/portal/app/backend
pm2 delete turbonet-api 2>/dev/null || true
pm2 start server.js --name turbonet-api
pm2 save

# 11. Setup PM2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER 2>/dev/null || true

# 12. Setup DuckDNS auto-update cron
echo "🦆 Setting up DuckDNS auto-update..."
mkdir -p ~/duckdns
echo "echo url=\"https://www.duckdns.org/update?domains=turbowifi&token=$DUCKDNS_TOKEN&ip=\" | curl -k -o ~/duckdns/duck.log -K -" > ~/duckdns/duck.sh
chmod 700 ~/duckdns/duck.sh
(crontab -l 2>/dev/null | grep -v duckdns; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1") | crontab -

echo ""
echo "✅ TurboNet Deployment Complete!"
echo "=================================="
echo ""
echo "🌐 Portal: http://$DOMAIN"
echo "📊 Admin:  http://$DOMAIN/admin"
echo "🔌 API:    http://$DOMAIN/api/plans"
echo ""
echo "📝 Default admin login:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "🔒 To enable HTTPS (recommended), run:"
echo "   sudo apt install certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d $DOMAIN"
echo ""
echo "⚠️  Remember to:"
echo "   1. Open port 80 (and 443 for HTTPS) in Google Cloud Firewall"
echo "   2. Change the admin password"
echo "   3. Update M-Pesa credentials in ~/turbonet/portal/app/backend/.env"
