# TurboNet: Premium Captive Portal & Admin Suite

A high-performance, monolithic utility-themed captive portal system designed for secure and aesthetic network access.

## 🚀 Key Features

- **Monolithic Utility UI**: A premium, "obsidian-terminal" aesthetic for both the user portal and admin dashboard.
- **Secure Authentication**: Integrated TOTP (2FA) with automatic recovery code generation.
- **Automated Payments**: M-Pesa integration for instant ticket generation and session recovery.
- **Radius Infrastructure**: Full integration with FreeRadius for robust network control.
- **Analytics Dashboard**: Real-time monitoring of revenue, active clients, and network latency.

## 📂 Project Structure

- `portal/app/frontend`: React (Vite) application with a bespoke design system.
- `portal/app/backend`: Express.js server handling Radius COA, M-Pesa callbacks, and TOTP logic.
- `portal/infra`: Infrastructure scripts for VPS setup, Nginx configuration, and database migrations.
- `portal/router`: Hotspot templates and Mikrotik configuration scripts.

## 🛠️ Tech Stack

- **Frontend**: React 19, Tailwind CSS, Framer Motion, Lucide Icons.
- **Backend**: Node.js, Express, MySQL.
- **Ops**: Nginx, PM2, Google Cloud Platform.

## 🛡️ Security & Privacy

- **TOTP 2FA**: Mandatory for administrative access.
- **Extensive .gitignore**: Protects all environment secrets and configuration details.
- **Anonymized Commits**: Privacy-safe contributor identity.

---
*Developed for high-scale network access management.*
