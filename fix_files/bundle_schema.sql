-- =====================================================================
-- TurboNet — Monthly Bundle Schema (M-Pesa KES 1,000 → 3 devices)
-- =====================================================================
-- ADD THESE TABLES to your existing schema.sql / run on your live DB.
--
-- How it works:
--   1. Admin (or Daraja callback) creates a row in mpesa_monthly_bundles
--      when a KES 1,000 M-Pesa payment is confirmed. The mpesa_receipt
--      is the M-Pesa transaction code (e.g. "RBK7X2Y3Z1").
--   2. User enters their M-Pesa receipt on the portal.
--   3. Backend validates: receipt exists, amount = 1000, bundle ACTIVE,
--      not expired, device count < max_devices (3).
--   4. Their MAC is saved in bundle_devices and a RADIUS user is created.
--   5. All 3 bound MACs auto-login via the existing check-status flow.
--   6. Once 3 devices are bound, no more can be added (error shown).
-- =====================================================================


-- Monthly bundles table
-- One row per KES 1,000 M-Pesa payment
CREATE TABLE IF NOT EXISTS mpesa_monthly_bundles (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    mpesa_receipt     VARCHAR(20) UNIQUE NOT NULL,     -- e.g. "RBK7X2Y3Z1"  (the M-Pesa ref)
    phone_number      VARCHAR(20) NOT NULL,             -- buyer's phone: 2547XXXXXXXX
    amount            DECIMAL(10,2) NOT NULL,           -- must be 1000.00
    max_devices       INT NOT NULL DEFAULT 3,           -- hard limit = 3
    vendor_id         INT NULL,
    status            ENUM('ACTIVE','EXPIRED','REVOKED') DEFAULT 'ACTIVE',
    expires_at        TIMESTAMP NOT NULL,               -- +30 days from created_at
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Prevent double-creation of same receipt
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    INDEX idx_bundle_receipt  (mpesa_receipt),
    INDEX idx_bundle_phone    (phone_number),
    INDEX idx_bundle_status   (status, expires_at)
);

-- Bundle devices table
-- One row per device bound to a bundle (max 3 per bundle)
CREATE TABLE IF NOT EXISTS bundle_devices (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    bundle_id        INT NOT NULL,
    mac_address      VARCHAR(17) NOT NULL,               -- normalised: AA:BB:CC:DD:EE:FF
    device_label     VARCHAR(50) DEFAULT 'Device',       -- "Laptop", "Phone", "Smart TV"
    registered_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- One MAC can only appear once per bundle
    UNIQUE KEY uniq_bundle_mac  (bundle_id, mac_address),
    FOREIGN KEY (bundle_id) REFERENCES mpesa_monthly_bundles(id) ON DELETE CASCADE,
    INDEX idx_bd_mac    (mac_address),
    INDEX idx_bd_bundle (bundle_id)
);

-- =====================================================================
-- Verify tables were created
-- =====================================================================
SELECT 'mpesa_monthly_bundles created' AS status
FROM   information_schema.TABLES
WHERE  TABLE_SCHEMA = DATABASE()
AND    TABLE_NAME   = 'mpesa_monthly_bundles';

SELECT 'bundle_devices created' AS status
FROM   information_schema.TABLES
WHERE  TABLE_SCHEMA = DATABASE()
AND    TABLE_NAME   = 'bundle_devices';
