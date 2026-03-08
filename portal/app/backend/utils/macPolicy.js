const db = require('../db');
const { normalizeMac } = require('./generators');
const { getDefaultVendorId } = require('./vendorScope');

async function safeExecute(sql) {
    try {
        await db.execute(sql);
    } catch (err) {
        if (![
            'ER_DUP_FIELDNAME',
            'ER_DUP_KEYNAME',
            'ER_TABLE_EXISTS_ERROR',
            'ER_MULTIPLE_PRI_KEY',
            'ER_FK_DUP_NAME',
            'ER_CANT_DROP_FIELD_OR_KEY'
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

async function hasIndex(tableName, indexName) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [tableName, indexName]
    );
    return rows.length > 0;
}

async function ensurePolicyTables() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS blocked_macs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vendor_id INT NULL,
            mac_address VARCHAR(17) NOT NULL,
            reason VARCHAR(255),
            blocked_by INT NULL,
            blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_blocked_mac (mac_address),
            INDEX idx_blocked_vendor (vendor_id),
            UNIQUE KEY uniq_blocked_vendor_mac (vendor_id, mac_address)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS whitelisted_macs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vendor_id INT NULL,
            mac_address VARCHAR(17) NOT NULL,
            note VARCHAR(255),
            added_by INT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_whitelist_mac (mac_address),
            INDEX idx_whitelist_vendor (vendor_id),
            UNIQUE KEY uniq_whitelist_vendor_mac (vendor_id, mac_address)
        )
    `);

    let defaultVendorId = 1;
    try {
        defaultVendorId = await getDefaultVendorId();
    } catch (_) {
        defaultVendorId = 1;
    }
    if (!(await hasColumn('blocked_macs', 'vendor_id'))) {
        await safeExecute('ALTER TABLE blocked_macs ADD COLUMN vendor_id INT NULL');
    }
    if (!(await hasColumn('whitelisted_macs', 'vendor_id'))) {
        await safeExecute('ALTER TABLE whitelisted_macs ADD COLUMN vendor_id INT NULL');
    }

    await safeExecute(`UPDATE blocked_macs SET vendor_id = ${Number(defaultVendorId)} WHERE vendor_id IS NULL`);
    await safeExecute(`UPDATE whitelisted_macs SET vendor_id = ${Number(defaultVendorId)} WHERE vendor_id IS NULL`);

    if (await hasIndex('blocked_macs', 'mac_address')) {
        await safeExecute('ALTER TABLE blocked_macs DROP INDEX mac_address');
    }
    if (await hasIndex('whitelisted_macs', 'mac_address')) {
        await safeExecute('ALTER TABLE whitelisted_macs DROP INDEX mac_address');
    }
    if (!(await hasIndex('blocked_macs', 'uniq_blocked_vendor_mac'))) {
        await safeExecute('ALTER TABLE blocked_macs ADD UNIQUE INDEX uniq_blocked_vendor_mac (vendor_id, mac_address)');
    }
    if (!(await hasIndex('whitelisted_macs', 'uniq_whitelist_vendor_mac'))) {
        await safeExecute('ALTER TABLE whitelisted_macs ADD UNIQUE INDEX uniq_whitelist_vendor_mac (vendor_id, mac_address)');
    }
}

async function getMacPolicy(macAddress, vendorId = null) {
    const normalizedMac = normalizeMac(macAddress);
    if (!normalizedMac) {
        return { normalizedMac: null, blocked: false, whitelisted: false };
    }
    let effectiveVendorId = vendorId;
    if (!effectiveVendorId) {
        try {
            effectiveVendorId = await getDefaultVendorId();
        } catch (_) {
            effectiveVendorId = 1;
        }
    }

    const [blockedRows] = await db.query(
        'SELECT id, reason FROM blocked_macs WHERE vendor_id = ? AND mac_address = ? LIMIT 1',
        [effectiveVendorId, normalizedMac]
    );
    const [whitelistRows] = await db.query(
        'SELECT id, note FROM whitelisted_macs WHERE vendor_id = ? AND mac_address = ? LIMIT 1',
        [effectiveVendorId, normalizedMac]
    );

    return {
        normalizedMac,
        vendorId: effectiveVendorId,
        blocked: blockedRows.length > 0,
        blockReason: blockedRows[0]?.reason || null,
        whitelisted: whitelistRows.length > 0,
        whitelistNote: whitelistRows[0]?.note || null
    };
}

module.exports = {
    ensurePolicyTables,
    getMacPolicy
};
