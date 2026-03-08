# TurboNet Deployment Guide (Google Cloud VM)

## Prerequisites
- Google Cloud VM with Ubuntu 20.04/22.04
- At least 1GB RAM (e2-micro works)
- Open ports: 80, 443, 3000, 1812/udp, 1813/udp

---

## Step 1: SSH into your VM

```bash
gcloud compute ssh YOUR_VM_NAME --zone=YOUR_ZONE
# or
ssh -i ~/.ssh/your_key username@YOUR_VM_IP
```

---

## Step 2: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server

# Secure MySQL
sudo mysql_secure_installation

# Install Nginx (optional, for reverse proxy)
sudo apt install -y nginx
```

---

## Step 3: Setup MySQL Database

```bash
sudo mysql

# In MySQL shell:
CREATE DATABASE turbonet;
CREATE USER 'turbonet'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON turbonet.* TO 'turbonet'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## Step 4: Upload Project Files

**Option A: Using Git**
```bash
git clone https://github.com/your-repo/turbonet.git
cd turbonet
```

**Option B: Using SCP (from your Windows machine)**
```powershell
# In PowerShell on Windows
scp -r D:\munyua\portal\app username@YOUR_VM_IP:~/turbonet/
```

---

## Step 5: Configure Backend

```bash
cd ~/turbonet/app/backend

# Install dependencies
npm install

# Create .env file
nano .env
```

Add to `.env`:
```env
PORT=3000
DB_HOST=localhost
DB_USER=turbonet
DB_PASS=your_secure_password
DB_NAME=turbonet

# M-Pesa (get from Daraja portal)
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://your-domain.com/api/callback

# JWT
JWT_SECRET=your_random_secret_string
JWT_REFRESH_SECRET=another_random_string
```

---

## Step 6: Initialize Database

```bash
mysql -u turbonet -p turbonet < schema.sql
mysql -u turbonet -p turbonet < ../infra/freeradius/radius_schema.sql
```

---

## Step 7: Build Frontend

```bash
cd ~/turbonet/app/frontend

# Install dependencies
npm install

# Update API URL for production
# Edit src/App.jsx and src/admin/*.jsx
# Change: const API_URL = 'http://localhost:3000/api'
# To: const API_URL = '/api'  (if using Nginx proxy)
# Or: const API_URL = 'http://YOUR_VM_IP:3000/api'

# Build for production
npm run build
```

---

## Step 8: Setup PM2 (Process Manager)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start backend
cd ~/turbonet/app/backend
pm2 start server.js --name turbonet-api

# Save PM2 config
pm2 save

# Enable on boot
pm2 startup
```

---

## Step 9: Configure Nginx (Recommended)

```bash
sudo nano /etc/nginx/sites-available/turbonet
```

Add:
```nginx
server {
    listen 80;
    server_name your-domain.com YOUR_VM_IP;

    # Frontend (built files)
    location / {
        root /home/YOUR_USERNAME/turbonet/app/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/turbonet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Step 10: Open Firewall Ports

```bash
# Google Cloud Console > VPC Network > Firewall
# Or using gcloud:
gcloud compute firewall-rules create allow-turbonet \
    --allow tcp:80,tcp:443,tcp:3000,udp:1812,udp:1813 \
    --source-ranges 0.0.0.0/0
```

---

## Step 11: Test

- Frontend: `http://YOUR_VM_IP`
- Backend API: `http://YOUR_VM_IP:3000/api/plans`
- Admin Panel: `http://YOUR_VM_IP/admin`

---

## Quick Commands

```bash
# Check backend status
pm2 status

# View logs
pm2 logs turbonet-api

# Restart backend
pm2 restart turbonet-api

# Check Nginx status
sudo systemctl status nginx
```

---

## Optional: SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```
