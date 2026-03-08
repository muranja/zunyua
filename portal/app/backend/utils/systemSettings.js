const db = require('../db');

const DEFAULT_SETTINGS = {
    sales_enabled: 'true',
    maintenance_mode: 'false',
    allow_receipt_recovery: 'true',
    max_stk_attempts_10m: '5',
    notifications_enabled: 'false',
    telegram_enabled: 'false',
    telegram_bot_token: '',
    telegram_chat_id: '',
    alert_webhook_url: ''
};

async function ensureSystemSettingsTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS system_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) UNIQUE NOT NULL,
            setting_value VARCHAR(255) NOT NULL,
            updated_by INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_setting_key (setting_key)
        )
    `);

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await db.execute(
            'INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
            [key, value]
        );
    }
}

async function getSettingsMap() {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
    const map = {};
    rows.forEach((row) => { map[row.setting_key] = row.setting_value; });
    return { ...DEFAULT_SETTINGS, ...map };
}

async function getSetting(key, fallback = null) {
    const [rows] = await db.query(
        'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
        [key]
    );
    return rows.length > 0 ? rows[0].setting_value : (DEFAULT_SETTINGS[key] ?? fallback);
}

function parseBool(value, fallback = false) {
    if (value === null || value === undefined) return fallback;
    return String(value).toLowerCase() === 'true';
}

module.exports = {
    ensureSystemSettingsTable,
    getSettingsMap,
    getSetting,
    parseBool,
    DEFAULT_SETTINGS
};
