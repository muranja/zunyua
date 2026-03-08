-- TurboNet WiFi Portal - Database Schema
-- Run this script to set up all required tables

-- Plans table (if not exists)
CREATE TABLE IF NOT EXISTS plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_minutes INT NOT NULL,
    vendor_id INT NULL,
    speed_limit_down VARCHAR(10) DEFAULT '5M',
    speed_limit_up VARCHAR(10) DEFAULT '2M',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default plans
INSERT INTO plans (name, price, duration_minutes, speed_limit_down) VALUES
('6 Hours', 20, 360, '5M'),
('12 Hours', 30, 720, '5M'),
('24 Hours', 40, 1440, '5M'),
('7 Days', 250, 10080, '8M'),
('2 Weeks', 500, 20160, '10M'),
('1 Month', 1000, 43200, '10M')
ON DUPLICATE KEY UPDATE name=name;

CREATE TABLE IF NOT EXISTS vendors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(60) UNIQUE,
    status ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
    domain VARCHAR(255) NULL UNIQUE,
    primary_color VARCHAR(50) DEFAULT '#007bff',
    secondary_color VARCHAR(50) DEFAULT '#6c757d',
    logo_url VARCHAR(255) NULL,
    portal_title VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO vendors (id, name, code, status) VALUES
(1, 'Default Vendor', 'DEFAULT', 'ACTIVE');

CREATE TABLE IF NOT EXISTS vendor_api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    key_hash CHAR(64) UNIQUE NOT NULL,
    key_prefix VARCHAR(24) NOT NULL,
    scopes JSON NULL,
    status ENUM('ACTIVE', 'REVOKED') DEFAULT 'ACTIVE',
    expires_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_vendor_api_keys_vendor (vendor_id),
    INDEX idx_vendor_api_keys_status (status)
);

UPDATE plans SET vendor_id = 1 WHERE vendor_id IS NULL;

-- Access tokens (links ONE MAC address + phone to a purchased package)
CREATE TABLE IF NOT EXISTS access_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(32) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    mac_address VARCHAR(17) NOT NULL,
    plan_id INT NOT NULL,
    vendor_id INT NULL,
    expires_at TIMESTAMP NOT NULL,
    status ENUM('ACTIVE', 'EXPIRED', 'REVOKED') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    INDEX idx_mac (mac_address),
    INDEX idx_token (token),
    INDEX idx_status (status)
);

-- Re-access tokens (for reclaiming access after device/MAC change)
CREATE TABLE IF NOT EXISTS reaccess_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(16) UNIQUE NOT NULL,
    access_token_id INT NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP NULL,
    new_mac_address VARCHAR(17) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (access_token_id) REFERENCES access_tokens(id),
    INDEX idx_code (code)
);

-- Vouchers (pre-paid codes that can be redeemed)
CREATE TABLE IF NOT EXISTS vouchers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(16) UNIQUE NOT NULL,
    plan_id INT NOT NULL,
    vendor_id INT NULL,
    status ENUM('ACTIVE', 'REDEEMED', 'EXPIRED', 'REVOKED') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    redeemed_at TIMESTAMP NULL,
    redeemed_by_phone VARCHAR(20) NULL,
    redeemed_by_mac VARCHAR(17) NULL,
    expires_at TIMESTAMP NULL,
    created_by INT NULL,
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    INDEX idx_voucher_code (code),
    INDEX idx_voucher_status (status)
);

-- Admin users with bcrypt passwords
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff') DEFAULT 'staff',
    vendor_id INT NULL,
    is_super_admin BOOLEAN DEFAULT FALSE,
    totp_enabled BOOLEAN DEFAULT FALSE,
    totp_secret VARCHAR(64) NULL,
    totp_temp_secret VARCHAR(64) NULL,
    totp_backup_codes JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
);

-- JWT refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    INDEX idx_refresh_token (token)
);

-- Activity log for admin actions
CREATE TABLE IF NOT EXISTS activity_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL,
    action VARCHAR(50) NOT NULL,
    details JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
    INDEX idx_activity_date (created_at)
);

-- Login attempts for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    username VARCHAR(50),
    success BOOLEAN DEFAULT FALSE,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ip_time (ip_address, attempted_at)
);

-- Transactions table (for M-Pesa payments)
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id VARCHAR(50) UNIQUE,
    mpesa_receipt VARCHAR(50) NULL,
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    plan_id INT NOT NULL,
    vendor_id INT NULL,
    mac_address VARCHAR(17),
    status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',
    access_token_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    FOREIGN KEY (access_token_id) REFERENCES access_tokens(id),
    INDEX idx_tx_status (status),
    INDEX idx_tx_phone (phone_number),
    UNIQUE KEY uniq_mpesa_receipt (mpesa_receipt)
);

CREATE TABLE IF NOT EXISTS receipt_recovery_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL,
    mac_address VARCHAR(17) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    success BOOLEAN DEFAULT FALSE,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rr_mac_time (mac_address, attempted_at),
    INDEX idx_rr_ip_time (ip_address, attempted_at)
);

-- MAC policy tables
CREATE TABLE IF NOT EXISTS blocked_macs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id INT NULL,
    mac_address VARCHAR(17) NOT NULL,
    reason VARCHAR(255),
    blocked_by INT NULL,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (blocked_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    INDEX idx_blocked_mac (mac_address),
    INDEX idx_blocked_vendor (vendor_id),
    UNIQUE KEY uniq_blocked_vendor_mac (vendor_id, mac_address)
);

CREATE TABLE IF NOT EXISTS whitelisted_macs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_id INT NULL,
    mac_address VARCHAR(17) NOT NULL,
    note VARCHAR(255),
    added_by INT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
    INDEX idx_whitelist_mac (mac_address),
    INDEX idx_whitelist_vendor (vendor_id),
    UNIQUE KEY uniq_whitelist_vendor_mac (vendor_id, mac_address)
);

CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key),
    FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES
('sales_enabled', 'true'),
('maintenance_mode', 'false'),
('allow_receipt_recovery', 'true'),
('max_stk_attempts_10m', '5'),
('notifications_enabled', 'false'),
('telegram_enabled', 'false'),
('telegram_bot_token', ''),
('telegram_chat_id', ''),
('alert_webhook_url', '');

-- Create default admin user
-- Username: MIKDash
-- Password: Jz@7Hbh--@9324
INSERT INTO admin_users (username, password_hash, role) VALUES
('MIKDash', '$2b$12$gjTAijcqoQaagr8ZIbLyPu5mr.KCdwksyKTP0RTQ3yTBDYwekTNkS', 'admin')
ON DUPLICATE KEY UPDATE username=username;

UPDATE admin_users SET is_super_admin = TRUE WHERE username = 'MIKDash';

