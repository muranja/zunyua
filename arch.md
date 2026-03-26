# TurboNet System Architecture

This document describes the end-to-end architecture of the TurboNet system, detailing the purchase flow for internet access and the necessary network configurations.

## 🏗️ System Components

The system is split between an on-premise **MikroTik Router** and a **Cloud VPS**.

### 1. MikroTik Router (NAS - Network Access Server)
- **Hotspot**: Captures user traffic and redirects unauthenticated users to the portal.
- **RADIUS Client**: Authenticates users against the remote RADIUS server.
- **Walled Garden**: Allows access to the Portal and M-Pesa domains before authentication.

### 2. VPS Server (Google Cloud / Ubuntu)
- **Nginx**: High-performance reverse proxy handling SSL termination and routing.
- **Portal (Frontend)**: React 19 / Vite application providing the user interface.
- **Backend (Node.js/Express)**: 
    - Handles M-Pesa STK Push and Callbacks.
    - Manages user sessions and "Access Tokens".
    - Interacts with MySQL for persistent storage.
    - Updates RADIUS tables for dynamic user provisioning.
- **MySQL (MariaDB)**: Stores transactions, plans, and RADIUS data (`radcheck`, `radreply`).
- **FreeRADIUS**: The authentication engine that validates MikroTik requests against the MySQL database.

---

## 💸 Internet Access Purchase Flow

The following describes the step-by-step process of a customer purchasing data:

### 1. Discovery & Selection
- **User Action**: Connects to the "TurboNet_Free_WiFi" SSID.
- **Redirection**: MikroTik detects no active session and redirects the browser to the Portal URL (e.g., `https://portal.turbonet.co.ke`).
- **Plan Selection**: User selects a package (e.g., "1 Hour - 20 KES") and enters their Phone Number.

### 2. Payment Initiation (STK Push)
- **Request**: Portal sends a request to the Backend `/api/stkpush`.
- **M-Pesa API**: Backend requests an STK Push from Safaricom Daraja API using the provided phone number and plan price.
- **Database**: A transaction is created with status `PENDING`.
- **User Action**: Receives an M-Pesa prompt on their phone and enters their PIN.

### 3. Payment Confirmation (Callback)
- **Safaricom Callback**: Safaricom sends a POST request to the Backend `/api/callback` with the transaction result.
- **Validation**: Backend verifies the `ResultCode` and `MpesaReceiptNumber`.
- **Provisioning**: 
    1. Transaction status is updated to `COMPLETED`.
    2. An `access_token` is generated for the user.
    3. **RADIUS Entry**: User credentials (phone number and MAC address) are inserted into `radcheck` table.
    4. **Attributes**: `Session-Timeout` (based on plan duration) and `Mikrotik-Rate-Limit` are set in `radreply`.

### 4. Access Grant
- **Auto-Login**: The Portal (polling for payment status) detects completion and tells the user.
- **Authentication**: The user's device (or the portal via redirection) attempts to log in to the MikroTik Hotspot using the Phone Number or MAC Address.
- **RADIUS Auth**: MikroTik sends an Access-Request to the VPS (Port 1812).
- **Session Start**: RADIUS returns an Access-Accept with speed limits and timeout. MikroTik allows internet traffic.

---

## 🔒 Network & Port Requirements

Consistent connectivity between the Router and the VPS is critical.

### VPS (Server Side) Incoming Ports
| Port | Protocol | Usage | Source |
| :--- | :--- | :--- | :--- |
| **80 / 443** | TCP | HTTP/HTTPS for Portal & M-Pesa Callbacks | Global (0.0.0.0/0) |
| **1812** | UDP | RADIUS Authentication | MikroTik WAN IP |
| **1813** | UDP | RADIUS Accounting | MikroTik WAN IP |
| **22** | TCP | SSH Management | Admin IP Only |

### MikroTik (Router Side) Incoming Ports
| Port | Protocol | Usage | Source |
| :--- | :--- | :--- | :--- |
| **3799** | UDP | RADIUS CoA (Change of Authorization) | VPS IP |
| **8291** | TCP | WinBox Management | Admin IP Only |

### Essential Internal Flows (Loopback/Local)
- **3000 (TCP)**: Express Backend (Nginx proxies to this).
- **3306 (TCP)**: MySQL Database (Node.js and FreeRADIUS connect here).

---

## 🛠️ Key Technical Details

- **Walled Garden**: The MikroTik must permit traffic to the VPS IP and `*.safaricom.co.ke` so users can pay before they are authenticated.
- **Rate Limiting**: Speed limits are enforced by MikroTik via the `Mikrotik-Rate-Limit` RADIUS attribute (e.g., `2M/2M`).
- **Session Recovery**: Users can reclaim active sessions on new devices using a "Re-access Code" provided by the portal, which re-binds the remaining time to the new MAC address in RADIUS.

## 🔄 Receipt & Session Recovery

The system includes mechanisms to protect user purchases in case of connectivity drops or device changes:

### 1. Manual Receipt Recovery
If a user pays but the auto-redirection fails (e.g., phone browser closes), they can enter their **M-Pesa Receipt Number** manually.
- **Backend Flow**: `/api/recover`
- **Validation**: System checks the `transactions` table for a completed payment with that receipt.
- **Binding**: If found and not active elsewhere, it generates a new access token and updates the RADIUS tables with the user's current MAC address.

### 2. Device Transfer (Re-access)
Allows a user to move their active internet package to a second device.
- **Backend Flow**: 
    1. `/api/reaccess/generate` (on original device) -> Returns a unique code.
    2. `/api/reaccess/claim` (on new device) -> Re-binds the phone number and remaining time to the new device's MAC in RADIUS.
- **Security**: The old MAC is automatically expired in the system to prevent sharing.

---

## 👮 Regulatory Compliance & IP Tracking

To comply with law enforcement requirements, the system maintains a detailed and searchable log of every internet session.

### 1. The Legal Requirement
We must be able to answer: *"Which phone number was using IP 192.168.88.254 on 2024-03-10 at 15:00?"*

### 2. Implementation via RADIUS Accounting
- **Data Capture**: The `radacct` table in the MySQL database stores the primary records for compliance.
- **Fields Logged**:
    - `username`: The Phone Number used for payment.
    - `callingstationid`: The hardware MAC address of the device.
    - `framedipaddress`: Official IP assigned by the MikroTik.
    - `acctstarttime` & `acctstoptime`: Exact duration of the lease.
- **Frequency**: MikroTik is configured with an `Interim-Update` interval of 5 minutes to ensure the database stays updated even if a connection is lost.

### 3. Session Enforcement (IP Release)
- Once the `Session-Timeout` is reached, MikroTik sends a "Stop" packet and releases the IP from its active pool.
- The user is immediately blocked and redirected to the Portal to re-purchase access.

---

## ⚡ Auto-Login Mechanism

To provide a seamless experience, the user is NOT required to manually enter credentials after paying.

1.  **Polling**: The Portal polls the Backend for payment status.
2.  **Trigger**: Once the status transitions to `COMPLETED`, the Portal receives the MAC-based credentials.
3.  **Submission**: The Portal dynamically generates an HTML form and submits it to the MikroTik Hotspot Login servlet (`http://192.168.88.1/login`) using the MAC address as the username.
4.  **Result**: The user is connected and redirected to the internet with zero additional clicks.

---

## 📈 Monitoring & Logs

- **Backend Logs**: Check PM2 or systemd logs for `turbonet-backend`.
- **RADIUS Logs**: Located at `/var/log/freeradius/radius.log`.
- **Database**: The `radacct` table provides a detailed history of all sessions, including data usage (bytes in/out) and session duration.
- **Compliance Search**: Queries should target `radacct` filtered by `framedipaddress` and a timestamp range.
