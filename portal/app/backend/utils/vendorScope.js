const db = require('../db');

async function safeExecute(sql) {
    try {
        await db.execute(sql);
    } catch (err) {
        if (![
            'ER_DUP_FIELDNAME',
            'ER_DUP_KEYNAME',
            'ER_TABLE_EXISTS_ERROR',
            'ER_CANT_CREATE_TABLE',
            'ER_MULTIPLE_PRI_KEY',
            'ER_FK_DUP_NAME'
        ].includes(err.code)) {
            throw err;
        }
    }
}

async function hasColumn(tableName, columnName) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [tableName, columnName]
    );
    return rows.length > 0;
}

async function ensureVendorSchema() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS vendors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            code VARCHAR(60) UNIQUE,
            status ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(
        `INSERT IGNORE INTO vendors (id, name, code, status) VALUES (1, 'Default Vendor', 'DEFAULT', 'ACTIVE')`
    );

    await db.execute(`
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
        )
    `);

    if (!(await hasColumn('admin_users', 'vendor_id'))) {
        await safeExecute(`ALTER TABLE admin_users ADD COLUMN vendor_id INT NULL`);
        await safeExecute(`ALTER TABLE admin_users ADD CONSTRAINT fk_admin_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL`);
    }
    if (!(await hasColumn('admin_users', 'is_super_admin'))) {
        await safeExecute(`ALTER TABLE admin_users ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE`);
        await safeExecute(`UPDATE admin_users SET is_super_admin = TRUE WHERE role = 'admin'`);
    }
    await safeExecute(`UPDATE admin_users SET vendor_id = 1 WHERE vendor_id IS NULL`);
    if (!(await hasColumn('transactions', 'vendor_id'))) {
        await safeExecute(`ALTER TABLE transactions ADD COLUMN vendor_id INT NULL`);
        await safeExecute(`ALTER TABLE transactions ADD CONSTRAINT fk_tx_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL`);
    }
    await safeExecute(`UPDATE transactions SET vendor_id = 1 WHERE vendor_id IS NULL`);
    if (!(await hasColumn('plans', 'vendor_id'))) {
        await safeExecute(`ALTER TABLE plans ADD COLUMN vendor_id INT NULL`);
        await safeExecute(`ALTER TABLE plans ADD CONSTRAINT fk_plan_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL`);
    }
    await safeExecute(`UPDATE plans SET vendor_id = 1 WHERE vendor_id IS NULL`);
    if (!(await hasColumn('access_tokens', 'vendor_id'))) {
        await safeExecute(`ALTER TABLE access_tokens ADD COLUMN vendor_id INT NULL`);
        await safeExecute(`ALTER TABLE access_tokens ADD CONSTRAINT fk_access_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL`);
    }
    await safeExecute(`UPDATE access_tokens SET vendor_id = 1 WHERE vendor_id IS NULL`);
    if (!(await hasColumn('vouchers', 'vendor_id'))) {
        await safeExecute(`ALTER TABLE vouchers ADD COLUMN vendor_id INT NULL`);
        await safeExecute(`ALTER TABLE vouchers ADD CONSTRAINT fk_voucher_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL`);
    }
    await safeExecute(`UPDATE vouchers SET vendor_id = 1 WHERE vendor_id IS NULL`);

    if (!(await hasColumn('vendors', 'domain'))) {
        await safeExecute(`ALTER TABLE vendors ADD COLUMN domain VARCHAR(255) NULL UNIQUE`);
        await safeExecute(`ALTER TABLE vendors ADD COLUMN primary_color VARCHAR(50) DEFAULT '#007bff'`);
        await safeExecute(`ALTER TABLE vendors ADD COLUMN secondary_color VARCHAR(50) DEFAULT '#6c757d'`);
        await safeExecute(`ALTER TABLE vendors ADD COLUMN logo_url VARCHAR(255) NULL`);
        await safeExecute(`ALTER TABLE vendors ADD COLUMN portal_title VARCHAR(255) NULL`);
    }
}

async function getDefaultVendorId() {
    const [rows] = await db.query(`SELECT id FROM vendors WHERE status='ACTIVE' ORDER BY id ASC LIMIT 1`);
    return rows.length > 0 ? rows[0].id : 1;
}

async function getAdminScope(adminId) {
    const [rows] = await db.query(
        `SELECT id, vendor_id, is_super_admin FROM admin_users WHERE id = ? LIMIT 1`,
        [adminId]
    );
    if (rows.length === 0) return { isSuperAdmin: false, vendorId: await getDefaultVendorId() };

    const admin = rows[0];
    return {
        isSuperAdmin: Boolean(admin.is_super_admin),
        vendorId: admin.vendor_id || await getDefaultVendorId()
    };
}

module.exports = {
    ensureVendorSchema,
    getDefaultVendorId,
    getAdminScope
};
