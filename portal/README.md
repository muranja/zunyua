# TurboNet WiFi Portal

A complete WiFi hotspot management system with M-Pesa integration, MikroTik RADIUS authentication, and an admin dashboard.

![Status](https://img.shields.io/badge/status-production%20ready-green)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🌟 Features

| Feature | Description |
|---------|-------------|
| **Customer Portal** | Beautiful UI for plan selection and payment |
| **M-Pesa Integration** | STK Push for instant payments |
| **Voucher System** | Pre-paid codes for offline sales |
| **Admin Dashboard** | Manage users, vouchers, view stats |
| **User Management** | Disconnect, extend time, change speeds |
| **MikroTik Integration** | RADIUS authentication for routers |
| **Mobile Responsive** | Works on all devices |

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Customer      │────▶│   Frontend      │────▶│   Backend       │
│   (Browser)     │     │   (React/Vite)  │     │   (Node.js)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        │                                │                                │
                        ▼                                ▼                                ▼
                  ┌───────────┐                   ┌────────────┐                  ┌───────────────┐
                  │   MySQL   │                   │   M-Pesa   │                  │   MikroTik    │
                  │  Database │                   │    API     │                  │    Router     │
                  └───────────┘                   └────────────┘                  └───────────────┘
```

---

## 📋 Requirements

- **Node.js** 18+ 
- **MySQL** 8.0+
- **Nginx** (production)
- **PM2** (process manager)
- **MikroTik** router with hotspot

---

## 🚀 Quick Start

### Development (Local)

```bash
# Clone the project
git clone <your-repo-url>
cd turbonet

# Backend setup
cd app/backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm start

# Frontend setup (new terminal)
cd app/frontend
npm install
npm run dev
```

### Production (VPS)

See [DEPLOY.md](./DEPLOY.md) for full deployment instructions.

---

## 📁 Project Structure

```
turbonet/
├── app/
│   ├── backend/               # Node.js API server
│   │   ├── routes/
│   │   │   ├── admin.js       # Admin endpoints
│   │   │   ├── customer.js    # Customer endpoints
│   │   │   └── users.js       # User management
│   │   ├── middleware/
│   │   │   └── auth.js        # JWT authentication
│   │   ├── utils/
│   │   │   └── generators.js  # Token/code generators
│   │   ├── db.js              # MySQL connection
│   │   ├── server.js          # Main server
│   │   └── schema.sql         # Database schema
│   │
│   └── frontend/              # React/Vite frontend
│       ├── src/
│       │   ├── admin/         # Admin dashboard components
│       │   ├── App.jsx        # Customer portal
│       │   └── config.js      # API configuration
│       └── dist/              # Built files
│
├── infra/                     # Infrastructure scripts
│   ├── freeradius/            # RADIUS configuration
│   ├── backup.sh              # Database backup
│   ├── restore.sh             # Database restore
│   └── setup-backups.sh       # Cron job setup
│
├── router/                    # MikroTik configuration
│   ├── mikrotik_setup.rsc     # Router script
│   └── hotspot/               # Custom login pages
│
├── deploy.sh                  # Deployment script
└── DEPLOY.md                  # Deployment guide
```

---

## 🔧 Configuration

### Environment Variables (.env)

```env
# Server
PORT=3000

# Database
DB_HOST=localhost
DB_USER=turbonet
DB_PASS=your_password
DB_NAME=turbonet

# M-Pesa API
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=https://your-domain.com/api/callback

# JWT Secrets
JWT_SECRET=random_secret_string
JWT_REFRESH_SECRET=another_random_string
```

---

## 📡 API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plans` | Get available plans |
| POST | `/api/stkpush` | Initiate M-Pesa payment |
| POST | `/api/callback` | M-Pesa callback |
| POST | `/api/voucher/redeem` | Redeem voucher code |

### Admin Endpoints (JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/vouchers` | List vouchers |
| POST | `/api/admin/vouchers/generate` | Generate vouchers |
| GET | `/api/admin/users` | List active users |
| POST | `/api/admin/users/add` | Add user manually |
| POST | `/api/admin/users/:id/disconnect` | Disconnect user |
| POST | `/api/admin/users/:id/extend` | Extend session |
| POST | `/api/admin/users/:id/speed` | Change speed limit |

---

## 👤 Admin Dashboard

### Default Credentials (Production)
- **Username:** MIKDash
- **Password:** Jz@7Hbh--@9324

### Features
- 📊 **Dashboard** - Revenue, active users, voucher stats
- 👥 **Users** - View, disconnect, extend, change speed
- 🎫 **Vouchers** - Generate, view, revoke vouchers
- 📋 **Activity Log** - Track admin actions

---

## 🌐 MikroTik Setup

1. Upload hotspot HTML files to `/hotspot/` on router
2. Configure RADIUS server pointing to your VPS
3. Apply the configuration script

See [router/mikrotik_setup.rsc](./router/mikrotik_setup.rsc)

---

## 💾 Backups

### Enable Automatic Backups
```bash
cd ~/turbonet/infra
./setup-backups.sh
```

### Manual Backup
```bash
./backup.sh
```

### Restore
```bash
./restore.sh turbonet_2024-12-29.sql.gz
```

Backups are stored in `~/backups/` with 30-day retention.

---

## 🔒 Security Considerations

- ✅ Change default admin password immediately
- ✅ Use HTTPS in production (Let's Encrypt)
- ✅ Secure MySQL with strong passwords
- ✅ Keep JWT secrets random and secure
- ✅ Regular database backups
- ✅ Keep Node.js and dependencies updated

---

## 📱 URLs

| Environment | Customer Portal | Admin Panel |
|-------------|-----------------|-------------|
| Development | http://localhost:5173 | http://localhost:5173/admin |
| Production | http://136.109.224.75 | http://136.109.224.75/admin |

---

## 🛠️ Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs turbonet-api

# Verify database connection
mysql -u turbonet -p turbonet -e "SELECT 1"
```

### Frontend build fails
```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npm run build
```

### M-Pesa not working
1. Verify credentials in `.env`
2. Check callback URL is accessible
3. Test with Daraja sandbox first

---

## 📄 License

MIT License - Feel free to use and modify.

---

## 🤝 Support

For issues or questions, contact the development team.
