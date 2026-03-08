# TurboNet Reseller Business Plan

## Product Vision
TurboNet should evolve from a single-operator hotspot system into a multi-tenant WiFi monetization platform that can be sold to other vendors (resellers) who each run their own branded internet business.

Core objective:
- One platform
- Many vendors
- Each vendor can sell internet packages independently
- Platform owner has central control, analytics, and revenue visibility

---

## Reseller Packaging Strategy

### 1. Build True Multi-Tenant Architecture
To sell to multiple vendors safely and cleanly, all core data must be tenant-scoped.

Required data model direction:
- `vendors` table
- `vendor_id` on:
  - users/access tokens
  - transactions
  - vouchers
  - plans
  - settings
  - activity logs
- Row-level enforcement in every admin and customer API route

Outcome:
- Each vendor sees only their own data
- Platform owner can see all vendors globally
- No cross-vendor leakage risk

### 2. Define Commercial Packages
Use clear tiers that map to customer maturity and willingness to pay.

Recommended tiers:

1. Starter
- 1 site/router
- Basic captive portal
- M-Pesa + voucher sales
- Basic dashboard

2. Growth
- Multi-site support
- White-label branding
- Advanced analytics
- Telegram/Webhook alerts
- Staff accounts

3. Enterprise
- Sub-reseller support
- API access
- Custom domain
- SLA + priority support
- Dedicated onboarding

### 3. Pricing Model
Use a hybrid model so revenue scales with vendor success.

Recommended options:
- Base subscription per vendor/site/AP
- Optional transaction fee per completed payment
- Add-on pricing for premium features:
  - custom domain
  - advanced reporting
  - messaging integrations
  - reconciliation automation

### 4. Fast Vendor Onboarding
Add a guided setup flow in admin:
- Create vendor account
- Brand setup (logo, colors, portal text)
- Default packages and rates
- Payment configuration (M-Pesa details)
- Router profile assignment
- Optional notification setup (Telegram/webhook)

Goal: activate a new vendor in under 15 minutes.

### 5. Vendor Finance Controls
For resale, platform-level finance controls are critical.

Add:
- Vendor wallet/float
- Commission or revenue-share settings
- Payout schedule and payout history
- Vendor statement exports
- Tax-ready reports

---

## Market Patterns: What Other Players Are Doing

The market leaders generally follow these patterns:

### 1. White-Label + Reseller Positioning
- IronWiFi explicitly supports white-label for partners/resellers and enterprise.

### 2. Tiered Product-Led Packaging
- Purple offers tiered guest WiFi products (Connect/Capture/Engage style evolution).

### 3. Analytics as Core Value
- Platforms like Aislelabs position around visitor analytics + captive portal data intelligence.

### 4. Open Integration Surfaces
- Ecosystems like UniFi expose external API-based hotspot authorization integrations.

### 5. ISP-grade Operations Stack
- Splynx-style offerings combine billing, operational controls, and reseller enablement.

### 6. Router + RADIUS Foundation
- MikroTik ecosystem still centers on Hotspot + RADIUS (+ User Manager package availability).

Strategic takeaway:
To compete, TurboNet must combine:
- monetization
- reseller controls
- analytics
- integrations
- operational reliability

---

## Compliance and Risk Controls (Kenya)

### 1. Data Protection Compliance
For a multi-vendor internet access platform, enforce:
- Data controller/processor obligations under Kenya’s data protection regime
- Registration and handling compliance where required
- Data retention and deletion policy
- Access control and audit trails

### 2. Telecom/Service Licensing Awareness
As you scale resale, licensing and regulatory classification can change. Validate continuously with CAK framework requirements for your operating model.

### 3. Security Baseline for Commercial Deployment
Mandatory baseline:
- HTTPS only (no plaintext payment flows)
- Strong admin auth with 2FA
- Callback idempotency and fraud throttling
- Backup + restore drills
- Alerting and incident response

---

## Platform Features Already Added in This Iteration

### Security and Reliability
- M-Pesa callback idempotency + duplicate protection
- Anti-fraud throttles for STK and receipt recovery attempts
- MAC blacklist/whitelist enforcement
- Optional immediate disconnect via RADIUS CoA
- Admin 2FA (TOTP) support
- Secure admin password change flow

### Operations and Control
- Activity logs with CSV export
- Security tab in admin
- Advanced analytics endpoints and UI
- Control Center with global switches and emergency actions
- Plan management (create/delete/update APIs)

### Optional Notifications (Admin-configurable)
- Notification settings in Control Center
- Telegram bot token + chat ID configuration
- Optional webhook URL configuration
- Test alert endpoint
- Critical action alert hooks (settings change, cleanup, disconnect-all)

---

## Next Productization Milestones

### Phase 1: Multi-Tenant Foundation (Highest Priority)
- Add vendor model and `vendor_id` isolation end-to-end
- Introduce owner admin vs vendor admin roles
- Enforce vendor scoping in all APIs and UI queries

### Phase 2: Billing and Reseller Economics
- Vendor subscriptions and invoicing
- Commission/revenue-sharing engine
- Wallet and payout automation

### Phase 3: Vendor Self-Service
- Vendor onboarding wizard
- White-label portal configurator
- API keys and integration hub

### Phase 4: Enterprise Readiness
- SLA monitoring dashboard
- Automated reconciliation reports
- Advanced fraud scoring and anomaly detection
- Multi-region resilience roadmap

---

## Commercial Positioning Statement
TurboNet should be positioned as:

“An operator-grade, reseller-ready WiFi monetization platform for ISP entrepreneurs and hotspot vendors, combining M-Pesa payments, MikroTik automation, real-time analytics, and centralized control in one white-label system.”

