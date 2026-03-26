# TurboNet — Full Diagnostic & Fix Guide
## PC / Smart TV Captive Portal + Monthly Bundle (3 MACs)

---

## PART 1: WHY PC & SMART TV DON'T SHOW THE PORTAL

### The core problem: each OS uses a different probe URL

When a device joins a Wi-Fi network, it immediately sends a silent background
HTTP request to test connectivity. Each OS uses a different URL for this:

| OS / Device       | Probe URL                                      |
|-------------------|------------------------------------------------|
| Windows 10/11     | http://www.msftconnecttest.com/connecttest.txt |
| Windows (legacy)  | http://www.msftncsi.com/ncsi.txt               |
| macOS / iOS       | http://captive.apple.com/hotspot-detect.html   |
| Apple TV          | http://gsp1.apple.com                          |
| Android           | http://connectivitycheck.gstatic.com/generate_204 |
| Samsung Smart TV  | http://www.samsung.com (connectivity check)    |
| LG Smart TV       | http://www.lgtvsdp.com                         |
| Linux GNOME       | http://nmcheck.gnome.org                       |

**Why Android works:**
Android's probe domain (connectivitycheck.gstatic.com) happened to resolve or
MikroTik's hotspot intercepted the HTTP GET before it could fail, so the redirect
chain worked and the captive portal intent fired.

**Why Windows/PC fails — the exact chain of failure:**

```
1. PC connects to TurboNet WiFi
2. Windows immediately sends:
       DNS query → www.msftconnecttest.com
3. MikroTik's own DNS resolver gets the query.
   It has no static entry for www.msftconnecttest.com.
   It tries to forward to 8.8.8.8 — but wait:
4. MikroTik's hs-unauth firewall BLOCKS unauthenticated users
   from reaching 8.8.8.8 on port 443 (DoH block rule).
   The DNS UDP port 53 request to 8.8.8.8 may also be
   intercepted/blocked depending on exact rule order.
5. The DNS query times out or returns NXDOMAIN.
6. Windows gets a DNS failure for its probe URL.
7. Windows shows: "No Internet" or "Could not connect to DNS"
   — NO captive portal popup appears.
```

**Why Smart TVs fail:**
Same reason — Samsung/LG TVs use their own probe domains that MikroTik has
no static DNS record for, so the DNS lookup fails and the TV's network
checker never gets redirected to the portal.

---

## PART 2: THE FIX — 2 FILES TO DEPLOY

### Fix File 1: `mikrotik_pc_tv_fix.rsc` (run on MikroTik)

**What it does:**
Adds `/ip dns static` entries that point all OS probe domains to your VPS IP
(136.117.23.173). When a PC/TV tries to reach its probe URL:

```
DNS query for www.msftconnecttest.com
         ↓
MikroTik DNS returns: 136.117.23.173   ← static override
         ↓
PC makes HTTP GET to 136.117.23.173/connecttest.txt
         ↓
Nginx (catch-all block) returns: 302 → http://136.117.23.173/
         ↓
PC/TV detects redirect → shows "Sign in to network" popup
         ↓
User clicks popup → portal page opens
```

**How to run:**
```
# SSH into MikroTik:
ssh admin@192.168.88.1

# Paste the contents of mikrotik_pc_tv_fix.rsc into the terminal
# OR copy it to the router via Files and run:
/import file=mikrotik_pc_tv_fix.rsc
```

---

### Fix File 2: `nginx_captive_portal.conf` (deploy on VPS)

**What it does:**
Adds a `default_server` catch-all nginx block that handles requests from any
hostname. This is what intercepts the OS probe requests and returns 302 redirects
to trigger the captive portal popup on each OS.

**How to deploy:**
```bash
# On your VPS (136.117.23.173):

# 1. Copy the file
sudo cp nginx_captive_portal.conf /etc/nginx/sites-available/turbonet

# 2. Enable it
sudo ln -sf /etc/nginx/sites-available/turbonet /etc/nginx/sites-enabled/turbonet

# 3. Remove the old config if it's in sites-enabled
sudo rm -f /etc/nginx/sites-enabled/nginx_turbowifi_http.conf

# 4. Open port 80 (IMPORTANT — this must be open)
sudo ufw allow 80/tcp
sudo ufw reload

# 5. Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

**CRITICAL NOTE:** The captive portal MUST be served over plain HTTP (port 80),
not HTTPS. Unauthenticated users cannot verify SSL certificates because they
can't reach the real internet yet. If you redirect to HTTPS, you'll get SSL errors.

---

## PART 3: HOW TO VERIFY THE FIX WORKS

### Test from Windows PC:
1. Connect to TurboNet WiFi
2. Should see "Sign in to TurboNet_Free_WiFi" notification in taskbar
3. Click it → portal opens
4. If no notification, open browser and go to: `http://136.117.23.173`

### Test from MikroTik terminal:
```routeros
# Check DNS static entries were added:
/ip dns static print where comment~"probe"

# Should show entries for www.msftconnecttest.com, captive.apple.com, etc.
# All pointing to 136.117.23.173
```

### Test the nginx catch-all from VPS:
```bash
curl -v http://136.117.23.173/connecttest.txt
# Should return: HTTP/1.1 302 Found
# Location: http://136.117.23.173/

curl -v http://136.117.23.173/hotspot-detect.html
# Should return: HTTP/1.1 302 Found
```

---

## PART 4: MONTHLY BUNDLE (KES 1,000 → 3 DEVICES)

### How it works end-to-end:

```
Customer pays KES 1,000 via M-Pesa
         ↓
Gets M-Pesa SMS: "...Confirmed. KES1000.00 sent to TURBONET. Ref: RBK7X2Y3Z1..."
         ↓
Admin sees payment, goes to dashboard → creates bundle using receipt "RBK7X2Y3Z1"
(POST /api/admin/bundles)
         ↓
Customer connects Laptop:
  - Opens portal, goes to "Monthly Plan" tab
  - Enters receipt: RBK7X2Y3Z1
  - Labels device: "Laptop"
  - POST /api/bundle/redeem → MAC saved, RADIUS user created
  - Device auto-connected ✓

Customer connects Smart TV:
  - Same flow, enters same receipt: RBK7X2Y3Z1
  - Labels device: "Smart TV"
  - POST /api/bundle/redeem → MAC saved, RADIUS user created
  - Slot 2/3 used ✓

Customer connects PC:
  - Same flow → Slot 3/3 used ✓

Customer tries to add 4th device:
  - POST /api/bundle/redeem → returns 403: "All 3 slots filled"
  - Shows which devices are registered ✓
```

### Files to deploy:

#### 1. Run `bundle_schema.sql` on your database:
```bash
mysql -u your_user -p your_database < bundle_schema.sql
```

#### 2. Add bundle routes to `customer.js`:
Open `portal/app/backend/routes/customer.js`.
Paste the entire content of `bundle_routes.js` just before the last line:
```javascript
module.exports = router;
```

#### 3. Update `check-status` in `server.js`:
Replace the existing `/api/check-status` handler with the one in
`check_status_and_admin_bundle.js`. The new one adds a bundle lookup
so all 3 bound MACs auto-login on the hotspot.

#### 4. Add admin bundle creation route to `admin.js`:
Paste the commented-out `router.post('/bundles', ...)` block from
`check_status_and_admin_bundle.js` into your `routes/admin.js`,
uncommented, inside your existing router.

---

## PART 5: DEPLOYMENT ORDER CHECKLIST

```
[ ] 1. SSH into MikroTik, run mikrotik_pc_tv_fix.rsc
[ ] 2. SSH into VPS, deploy nginx_captive_portal.conf
[ ] 3. Confirm: sudo ufw allow 80/tcp is set
[ ] 4. Confirm: sudo nginx -t passes with no errors
[ ] 5. Reload nginx: sudo systemctl reload nginx
[ ] 6. Run bundle_schema.sql on your MySQL database
[ ] 7. Add bundle_routes.js content to routes/customer.js
[ ] 8. Replace check-status handler in server.js
[ ] 9. Add admin bundle route to routes/admin.js
[ ] 10. Restart the Node backend: pm2 restart all
[ ] 11. Test Windows PC → should show "Sign in" popup
[ ] 12. Test Samsung/LG TV → should detect portal
[ ] 13. Create a test bundle with a fake receipt, redeem on 3 devices, verify 4th is blocked
```

---

## SUMMARY TABLE

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| Windows PC shows DNS error | www.msftconnecttest.com DNS times out | Static DNS → 136.117.23.173 |
| macOS portal never shown | captive.apple.com DNS fails | Static DNS → 136.117.23.173 |
| Smart TV no portal | Samsung/LG probe DNS fails | Static DNS → 136.117.23.173 |
| Probe redirect not served | nginx only responds to 136.117.23.173 | Add catch-all default_server block |
| KES 1,000 multi-device plan | No feature exists yet | mpesa_monthly_bundles + bundle_devices tables |
| 3-device binding | No feature exists yet | /api/bundle/redeem endpoint |
| Auto-login all bound MACs | check-status only checks access_tokens | Add bundle_devices lookup to check-status |
