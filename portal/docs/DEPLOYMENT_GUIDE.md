# TurboNet WiFi Portal - Deployment & Troubleshooting Guide

## Overview
This document covers the complete deployment of TurboNet to GCP and the step-by-step resolution of the admin login issue.

---

## Part 1: Initial Deployment Setup

### Step 1: SSH Key Setup (Passwordless Access)
```bash
# Generate new SSH key without passphrase
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_gcp -N "" -C "aspenhorgan254"

# Add the public key to GCP Console:
# Compute Engine → VM instances → Edit → SSH Keys → Add
```

### Step 2: Nginx + SSL Setup
```bash
# Install nginx site config
sudo cp turbowifi.conf /etc/nginx/sites-available/turbowifi
sudo ln -s /etc/nginx/sites-available/turbowifi /etc/nginx/sites-enabled/

# Get SSL certificate
sudo certbot --nginx -d 136.109.224.75 --non-interactive --agree-tos --email your@email.com
```

### Step 4: PM2 Process Manager
```bash
sudo npm install -g pm2
cd ~/turbonet/app/backend
pm2 start server.js --name turbonet-api
pm2 save
pm2 startup systemd
```

---

## Part 2: Admin Login Issue Investigation

### The Problem
- ✅ `admin` / `admin123` worked
- ❌ `MIKDash` / `Jz@7Hbh--@9324` did NOT work
- Database only had `MIKDash` user

### Step 1: Check Database for Admin Users
```bash
mysql -u turbonet -p'Wassa@254' turbonet -e 'SELECT id, username FROM admin_users;'
```
**Result:** Only `MIKDash` exists - no `admin` user!

### Step 2: Check Backend Code for Hardcoded Credentials
```bash
grep -rn 'admin123' ~/turbonet/app/backend/
```
**Result:** Only found in `setup-db.js` as a console.log message (not actual auth).

### Step 3: Check Frontend API URLs
```bash
grep -rn 'localhost:3000' ~/turbonet/app/frontend/src/
```
**Result:** Found hardcoded URLs in multiple files:
- `App.jsx` line 8
- `admin/Login.jsx` line 5
- `admin/Dashboard.jsx` line 8
- `admin/Vouchers.jsx` line 8
- `admin/Users.jsx` lines 8, 52

### Step 4: Root Cause Identified
The frontend was calling `http://localhost:3000/api` which means:
- Browser connects to **USER'S LOCAL machine** (port 3000)
- NOT the production GCP server
- Local database has different admin users!

---

## Part 3: The Fix

### Step 1: Update All API URLs
Changed from:
```javascript
const API_URL = 'http://localhost:3000/api/admin';
```

To:
```javascript
const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';
```

This makes:
- **Development:** Uses `localhost:3000`
- **Production:** Uses relative `/api/admin` (resolves to GCP server)

### Step 2: Rebuild Frontend
```bash
cd d:\munyua\portal\app\frontend
npm run build
```

### Step 3: Deploy to Server
```bash
scp -i ~/.ssh/id_ed25519_gcp -r dist/* aspenhorgan254@136.109.224.75:~/turbonet/app/frontend/dist/
```

### Step 4: Verify Fix
Login at http://136.109.224.75/admin with:
- **Username:** `MIKDash`
- **Password:** `Jz@7Hbh--@9324`

---

## Quick Reference

### Credentials Summary
| Environment | Purpose | Username | Password |
|-------------|---------|----------|----------|
| Production | Admin Dashboard | `MIKDash` | `Jz@7Hbh--@9324` |
| Production | MySQL Database | `turbonet` | `Wassa@254` |
| Local Dev | Admin Dashboard | `admin` | `admin123` |

### Important URLs
- **Customer Portal:** http://136.109.224.75/
- **Admin Panel:** http://136.109.224.75/admin

### Server Commands
```bash
# SSH to server
ssh -i ~/.ssh/id_ed25519_gcp aspenhorgan254@136.109.224.75

# Backend management
pm2 status
pm2 logs turbonet-api
pm2 restart turbonet-api
```

---

## Key Lesson Learned
> Always use environment-aware API URLs in frontend code. Using `import.meta.env.DEV` in Vite projects ensures the correct server is called in both development and production environments.
