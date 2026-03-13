const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const db = require('./db');
const dotenv = require('dotenv');

// Import routes
const adminRoutes = require('./routes/admin');
const customerRoutes = require('./routes/customer');
const usersRoutes = require('./routes/users');
const vendorRoutes = require('./routes/vendor');

// Import utilities
const { generateAccessToken, formatPhoneNumber, normalizeMac } = require('./utils/generators');
const { ensurePolicyTables, getMacPolicy } = require('./utils/macPolicy');
const { ensureSystemSettingsTable, getSetting, parseBool } = require('./utils/systemSettings');
const { ensureVendorSchema, getDefaultVendorId } = require('./utils/vendorScope');

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Trust proxy for rate limiting
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

async function safeExecute(sql) {
    try {
        await db.execute(sql);
    } catch (err) {
        if (!['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR', 'ER_MULTIPLE_PRI_KEY'].includes(err.code)) throw err;
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

async function hasTable(tableName) {
    const [rows] = await db.query(
        `SELECT 1 FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
        [tableName]
    );
    return rows.length > 0;
}

async function ensureRuntimeSchema() {
    await ensureVendorSchema();
    await ensurePolicyTables();
    await ensureSystemSettingsTable();
    if (!(await hasColumn('transactions', 'mpesa_receipt'))) {
        await safeExecute('ALTER TABLE transactions ADD COLUMN mpesa_receipt VARCHAR(50) NULL');
    }
    if (!(await hasIndex('transactions', 'uniq_mpesa_receipt'))) {
        await safeExecute('ALTER TABLE transactions ADD UNIQUE INDEX uniq_mpesa_receipt (mpesa_receipt)');
    }
    if (!(await hasColumn('admin_users', 'totp_enabled'))) {
        await safeExecute('ALTER TABLE admin_users ADD COLUMN totp_enabled BOOLEAN DEFAULT FALSE');
    }
    if (!(await hasColumn('admin_users', 'totp_secret'))) {
        await safeExecute('ALTER TABLE admin_users ADD COLUMN totp_secret VARCHAR(64) NULL');
    }
    if (!(await hasColumn('admin_users', 'totp_temp_secret'))) {
        await safeExecute('ALTER TABLE admin_users ADD COLUMN totp_temp_secret VARCHAR(64) NULL');
    }
    // Drop legacy UNIQUE index on access_tokens.mac_address to allow re-purchases on same device.
    if (await hasIndex('access_tokens', 'mac_address')) {
        await safeExecute('ALTER TABLE access_tokens DROP INDEX mac_address');
    }
    if (!(await hasColumn('access_tokens', 'speed_limit_down'))) {
        await safeExecute('ALTER TABLE access_tokens ADD COLUMN speed_limit_down VARCHAR(10) NULL');
    }
    if (!(await hasColumn('access_tokens', 'speed_limit_up'))) {
        await safeExecute('ALTER TABLE access_tokens ADD COLUMN speed_limit_up VARCHAR(10) NULL');
    }
    if (!(await hasIndex('access_tokens', 'idx_mac'))) {
        await safeExecute('ALTER TABLE access_tokens ADD INDEX idx_mac (mac_address)');
    }
    if (await hasTable('radacct')) {
        if (!(await hasIndex('radacct', 'idx_radacct_ip_time'))) {
            await safeExecute('CREATE INDEX idx_radacct_ip_time ON radacct (framedipaddress, acctstarttime)');
        }
        if (!(await hasIndex('radacct', 'idx_radacct_user_time'))) {
            await safeExecute('CREATE INDEX idx_radacct_user_time ON radacct (username, acctstarttime)');
        }
        if (!(await hasIndex('radacct', 'idx_radacct_mac_time'))) {
            await safeExecute('CREATE INDEX idx_radacct_mac_time ON radacct (callingstationid, acctstarttime)');
        }
    }
    await safeExecute(`
        CREATE TABLE IF NOT EXISTS receipt_recovery_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            receipt_number VARCHAR(50) NOT NULL,
            mac_address VARCHAR(17) NOT NULL,
            ip_address VARCHAR(45) NOT NULL,
            success BOOLEAN DEFAULT FALSE,
            attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_rr_mac_time (mac_address, attempted_at),
            INDEX idx_rr_ip_time (ip_address, attempted_at)
        )
    `);
}

ensureRuntimeSchema().catch((err) => {
    console.error('Runtime schema initialization failed:', err.message);
});

// ==================== ROUTES ====================

// Admin routes (JWT protected)
app.use('/api/admin', adminRoutes);

// User management routes (JWT protected)
app.use('/api/admin/users', usersRoutes);

// Customer routes (vouchers, re-access)
app.use('/api', customerRoutes);

// Vendor integration routes (API key protected)
app.use('/api/vendor', vendorRoutes);

// ==================== EXISTING MPESA ROUTES ====================

// Helper: Get M-Pesa Access Token
async function getAccessToken() {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const url = process.env.MPESA_OAUTH_URL;
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Basic ${auth}`
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error("M-Pesa Auth Error", error);
        throw error;
    }
}

// Get Branding Endpoint
app.get('/api/branding', async (req, res) => {
    try {
        const domain = String(req.query.domain || req.hostname).trim();
        const vendorCode = String(req.query.vendor || '').trim().toUpperCase();

        let query = 'SELECT id, name, code, domain, primary_color, secondary_color, logo_url, portal_title FROM vendors WHERE status = "ACTIVE"';
        let params = [];

        if (vendorCode) {
            query += ' AND code = ?';
            params.push(vendorCode);
        } else if (domain && domain !== 'localhost' && domain !== '127.0.0.1') {
            query += ' AND domain = ?';
            params.push(domain);
        } else {
            query += ' ORDER BY id ASC';
        }
        query += ' LIMIT 1';

        let [rows] = await db.query(query, params);
        if (rows.length === 0 && (domain || vendorCode)) {
            // Fallback to default vendor
            [rows] = await db.query('SELECT id, name, code, domain, primary_color, secondary_color, logo_url, portal_title FROM vendors WHERE status = "ACTIVE" ORDER BY id ASC LIMIT 1');
        }
        res.json(rows[0] || {});
    } catch (err) {
        console.error('Branding fetch error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get Plans Endpoint
app.get('/api/plans', async (req, res) => {
    try {
        const vendorCode = String(req.query.vendor || '').trim().toUpperCase();
        const domain = String(req.query.domain || req.hostname).trim();
        let vendorId = await getDefaultVendorId();

        if (vendorCode) {
            const [vendors] = await db.query(
                'SELECT id FROM vendors WHERE code = ? AND status = "ACTIVE" LIMIT 1',
                [vendorCode]
            );
            if (vendors.length > 0) vendorId = vendors[0].id;
        } else if (domain && domain !== 'localhost' && domain !== '127.0.0.1') {
            const [vendors] = await db.query(
                'SELECT id FROM vendors WHERE domain = ? AND status = "ACTIVE" LIMIT 1',
                [domain]
            );
            if (vendors.length > 0) vendorId = vendors[0].id;
        }

        const [rows] = await db.query(
            'SELECT * FROM plans WHERE vendor_id = ? ORDER BY price ASC',
            [vendorId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// STK Push Endpoint
app.post('/api/stkpush', async (req, res) => {
    const { phoneNumber, amount, planId, macAddress } = req.body;

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const normalizedMac = normalizeMac(macAddress);
    const salesEnabled = parseBool(await getSetting('sales_enabled', 'true'), true);
    const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);

    if (!salesEnabled || maintenanceMode) {
        return res.status(503).json({
            success: false,
            error: maintenanceMode ? 'Service is under maintenance. Please try again shortly.' : 'Sales are temporarily paused by admin.'
        });
    }

    if (!normalizedMac) {
        return res.status(400).json({ success: false, error: 'Valid MAC address is required' });
    }

    let selectedPlan;
    let vendorId;
    try {
        const [planRows] = await db.query('SELECT * FROM plans WHERE id = ?', [planId]);
        if (planRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Plan not found' });
        }
        selectedPlan = planRows[0];
        vendorId = selectedPlan.vendor_id || await getDefaultVendorId();
    } catch (err) {
        console.error('Plan lookup error:', err);
        return res.status(500).json({ success: false, error: 'Failed to load selected plan' });
    }

    const macPolicy = await getMacPolicy(normalizedMac, vendorId);
    if (macPolicy.blocked && !macPolicy.whitelisted) {
        return res.status(403).json({
            success: false,
            error: macPolicy.blockReason || 'This device is blocked. Contact admin.'
        });
    }

    // Check if MAC already has active package — return info instead of blocking
    try {
        const [existingMac] = await db.query(
            'SELECT * FROM access_tokens WHERE vendor_id = ? AND mac_address = ? AND status = "ACTIVE" AND expires_at > NOW()',
            [vendorId, normalizedMac]
        );

        if (existingMac.length > 0) {
            return res.json({
                success: true,
                alreadyActive: true,
                message: 'You already have an active package',
                expiresAt: existingMac[0].expires_at,
                phoneNumber: existingMac[0].phone_number
            });
        }
    } catch (err) {
        console.error('MAC check error:', err);
    }

    // Prevent concurrent STK pushes for the same device
    try {
        const [pendingTx] = await db.query(
            'SELECT * FROM transactions WHERE vendor_id = ? AND mac_address = ? AND status = "PENDING" AND created_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE)',
            [vendorId, normalizedMac]
        );
        if (pendingTx.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'A payment is already in progress. Please check your phone for the M-Pesa prompt.'
            });
        }
    } catch (err) {
        console.error('Pending TX check error:', err);
    }

    // Anti-fraud: throttle high-frequency purchase attempts by MAC and phone
    try {
        const [macRateRows] = await db.query(
            'SELECT COUNT(*) as c FROM transactions WHERE vendor_id = ? AND mac_address = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)',
            [vendorId, normalizedMac]
        );
        const [phoneRateRows] = await db.query(
            'SELECT COUNT(*) as c FROM transactions WHERE vendor_id = ? AND phone_number = ? AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)',
            [vendorId, formattedPhone]
        );

        const maxAttempts = Number(await getSetting('max_stk_attempts_10m', '5')) || 5;
        if (macRateRows[0].c >= maxAttempts || phoneRateRows[0].c >= maxAttempts) {
            return res.status(429).json({
                success: false,
                error: 'Too many payment attempts. Please wait 10 minutes before trying again.'
            });
        }
    } catch (err) {
        console.error('STK anti-fraud check error:', err);
    }

    try {
        const expectedAmount = Number(selectedPlan.price);
        if (Math.round(Number(amount)) !== Math.round(expectedAmount)) {
            return res.status(400).json({ success: false, error: 'Amount does not match selected plan' });
        }

        const token = await getAccessToken();
        const date = new Date();
        const timestamp = date.getFullYear() +
            ("0" + (date.getMonth() + 1)).slice(-2) +
            ("0" + date.getDate()).slice(-2) +
            ("0" + date.getHours()).slice(-2) +
            ("0" + date.getMinutes()).slice(-2) +
            ("0" + date.getSeconds()).slice(-2);

        const shortCode = process.env.MPESA_SHORTCODE;
        const passkey = process.env.MPESA_PASSKEY;
        const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

        const stkUrl = process.env.MPESA_STK_URL;

        const payload = {
            "BusinessShortCode": shortCode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": Math.round(amount),
            "PartyA": formattedPhone,
            "PartyB": shortCode,
            "PhoneNumber": formattedPhone,
            "CallBackURL": process.env.MPESA_CALLBACK_URL,
            "AccountReference": "TurboNet",
            "TransactionDesc": `WiFi Plan ${planId}`
        };

        const response = await axios.post(stkUrl, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const checkoutReqId = response.data.CheckoutRequestID;

        // Save transaction with MAC address
        await db.execute(
            'INSERT INTO transactions (transaction_id, phone_number, amount, plan_id, mac_address, status, vendor_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [checkoutReqId, formattedPhone, amount, planId, normalizedMac, 'PENDING', vendorId]
        );

        res.json({ success: true, message: "STK Push Sent", checkoutRequestId: checkoutReqId });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check Payment Status Endpoint (Auto-polling)
app.get('/api/payment-status/:checkoutRequestId', async (req, res) => {
    const { checkoutRequestId } = req.params;

    try {
        const [rows] = await db.query(
            'SELECT status, access_token_id, phone_number, mac_address FROM transactions WHERE transaction_id = ?',
            [checkoutRequestId]
        );

        if (rows.length === 0) {
            return res.json({ status: 'PENDING' });
        }

        const tx = rows[0];

        if (tx.status === 'COMPLETED' && tx.access_token_id) {
            // Get the expiration time and final assigned phone/mac to show on the success screen
            const [accessRows] = await db.query(
                'SELECT expires_at, phone_number, mac_address FROM access_tokens WHERE id = ?',
                [tx.access_token_id]
            );
            
            return res.json({
                status: 'COMPLETED',
                expiresAt: accessRows.length > 0 ? accessRows[0].expires_at : null,
                phoneNumber: accessRows.length > 0 ? accessRows[0].phone_number : tx.phone_number,
                macAddress: accessRows.length > 0 ? accessRows[0].mac_address : tx.mac_address,
                loginIdentity: accessRows.length > 0 ? accessRows[0].mac_address : tx.mac_address
            });
        }

        res.json({ status: tx.status });

    } catch (err) {
        console.error("Payment status check error:", err);
        res.status(500).json({ error: 'Server error check' });
    }
});

// M-Pesa Callback Endpoint
app.post('/api/callback', async (req, res) => {
    console.log("Callback Received:", JSON.stringify(req.body));

    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData?.CheckoutRequestID) {
        return res.status(400).json({ result: 'invalid_callback_payload' });
    }

    const allowedIps = String(process.env.MPESA_CALLBACK_ALLOWLIST || '')
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean);
    const requestIp = String(req.ip || req.connection.remoteAddress || '').replace('::ffff:', '');
    if (allowedIps.length > 0 && !allowedIps.includes(requestIp)) {
        console.warn(`Rejected callback from non-allowlisted IP: ${requestIp}`);
        return res.status(403).json({ result: 'forbidden' });
    }

    const checkoutReqId = callbackData.CheckoutRequestID;
    const resultCode = Number(callbackData.ResultCode);
    console.log(`Callback parsed: checkout=${checkoutReqId} result=${resultCode}`);

    if (resultCode !== 0) {
        await db.execute('UPDATE transactions SET status = ? WHERE transaction_id = ? AND status = "PENDING"', ['FAILED', checkoutReqId]);
        return res.json({ result: "ok" });
    }

    const metadata = Array.isArray(callbackData.CallbackMetadata?.Item) ? callbackData.CallbackMetadata.Item : [];
    const getMeta = (name) => metadata.find((o) => o.Name === name)?.Value;
    const mpesaReceiptNumber = String(getMeta('MpesaReceiptNumber') || '').trim().toUpperCase();
    const phoneNumber = String(getMeta('PhoneNumber') || '').trim();

    if (!mpesaReceiptNumber || !phoneNumber) {
        console.error('Callback missing required metadata:', checkoutReqId);
        return res.json({ result: 'ok' });
    }
    console.log(`Callback metadata: checkout=${checkoutReqId} receipt=${mpesaReceiptNumber} phone=${phoneNumber}`);

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [txRows] = await conn.query(
            'SELECT * FROM transactions WHERE transaction_id = ? FOR UPDATE',
            [checkoutReqId]
        );

        if (txRows.length === 0) {
            await conn.rollback();
            return res.json({ result: 'ok' });
        }

        const tx = txRows[0];
        console.log(`Callback tx locked: id=${tx.id} status=${tx.status} mac=${tx.mac_address} plan=${tx.plan_id} vendor=${tx.vendor_id || 'default'}`);
        if (tx.status === 'COMPLETED' && tx.access_token_id) {
            await conn.commit();
            return res.json({ result: 'ok' });
        }

        const [duplicateReceipt] = await conn.query(
            'SELECT id FROM transactions WHERE mpesa_receipt = ? AND id <> ? LIMIT 1',
            [mpesaReceiptNumber, tx.id]
        );
        if (duplicateReceipt.length > 0) {
            await conn.rollback();
            return res.json({ result: 'ok' });
        }

        const [planRows] = await conn.query('SELECT * FROM plans WHERE id = ?', [tx.plan_id]);
        const plan = planRows[0];
        const durationSeconds = plan ? plan.duration_minutes * 60 : 3600;
        const expiresAt = new Date(Date.now() + durationSeconds * 1000);
        console.log(`Callback plan resolved: plan=${tx.plan_id} duration=${durationSeconds}s expires=${expiresAt.toISOString()}`);

        await conn.execute(
            'UPDATE access_tokens SET status = "EXPIRED" WHERE mac_address = ? AND status = "ACTIVE"',
            [tx.mac_address]
        );

        const accessToken = generateAccessToken();
        console.log(`Callback access token generated: token=${accessToken} mac=${tx.mac_address}`);
        const [result] = await conn.execute(
            'INSERT INTO access_tokens (token, phone_number, mac_address, plan_id, expires_at, status, vendor_id, speed_limit_down, speed_limit_up) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [accessToken, phoneNumber, tx.mac_address, tx.plan_id, expiresAt, 'ACTIVE', tx.vendor_id || (await getDefaultVendorId()), plan.speed_limit_down, plan.speed_limit_up]
        );
        console.log(`Callback access token inserted: access_token_id=${result.insertId}`);

        await conn.execute(
            'UPDATE transactions SET status = ?, mpesa_receipt = ?, completed_at = NOW(), access_token_id = ? WHERE id = ?',
            ['COMPLETED', mpesaReceiptNumber, result.insertId, tx.id]
        );
        console.log(`Callback transaction completed: tx_id=${tx.id} receipt=${mpesaReceiptNumber}`);

        const [userCheck] = await conn.query('SELECT id FROM radcheck WHERE username = ?', [phoneNumber]);
        if (userCheck.length === 0) {
            await conn.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [phoneNumber, phoneNumber]
            );
            console.log(`RADIUS user created: username=${phoneNumber}`);
        }

        const [macCheck] = await conn.query('SELECT id FROM radcheck WHERE username = ?', [tx.mac_address]);
        if (macCheck.length === 0) {
            await conn.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [tx.mac_address, tx.mac_address]
            );
            console.log(`RADIUS MAC user created: username=${tx.mac_address}`);
        }

        await conn.execute('DELETE FROM radreply WHERE username = ?', [phoneNumber]);
        await conn.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [phoneNumber, String(durationSeconds)]
        );

        await conn.execute('DELETE FROM radreply WHERE username = ?', [tx.mac_address]);
        await conn.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [tx.mac_address, String(durationSeconds)]
        );
        console.log(`RADIUS session timeout set: username=${phoneNumber} mac=${tx.mac_address} seconds=${durationSeconds}`);

        if (plan && plan.speed_limit_down) {
            const uploadLimit = plan.speed_limit_up || '2M';
            const limitValue = `${uploadLimit}/${plan.speed_limit_down}`;
            await conn.execute(
                "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
                [phoneNumber, limitValue]
            );
            await conn.execute(
                "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
                [tx.mac_address, limitValue]
            );
            console.log(`RADIUS rate limit set: username=${phoneNumber} mac=${tx.mac_address} limit=${limitValue}`);
        }

        await conn.commit();
        console.log(`Access granted for ${phoneNumber}, expires ${expiresAt.toISOString()}`);
    } catch (err) {
        await conn.rollback();
        console.error("Database Update Error:", err);
    } finally {
        conn.release();
    }

    return res.json({ result: "ok" });
});

// Basic health endpoint for uptime checks/load balancers
app.get('/api/health', async (req, res) => {
    try {
        const [dbNow] = await db.query('SELECT NOW() as now');
        res.json({
            ok: true,
            service: 'turbonet-backend',
            time: new Date().toISOString(),
            dbTime: dbNow?.[0]?.now || null
        });
    } catch (err) {
        console.error('Health check error:', err);
        res.status(500).json({ ok: false, error: 'health_check_failed' });
    }
});

// ==================== STATUS CHECK (for auto-login) ====================

app.get('/api/check-status', async (req, res) => {
    const mac = normalizeMac(req.query.mac);
    if (!mac) return res.json({ active: false });

    try {
        const vendorCode = String(req.query.vendor || '').trim().toUpperCase();
        let vendorId = await getDefaultVendorId();
        if (vendorCode) {
            const [vendors] = await db.query(
                'SELECT id FROM vendors WHERE code = ? AND status = "ACTIVE" LIMIT 1',
                [vendorCode]
            );
            if (vendors.length === 0) {
                return res.json({ active: false, vendorNotFound: true });
            }
            vendorId = vendors[0].id;
        }

        const macPolicy = await getMacPolicy(mac, vendorId);
        if (macPolicy.blocked && !macPolicy.whitelisted) {
            return res.json({ active: false, blocked: true, reason: macPolicy.blockReason || 'Device blocked' });
        }

        // Expire stale tokens while checking
        await db.execute(
            'UPDATE access_tokens SET status = "EXPIRED" WHERE status = "ACTIVE" AND expires_at <= NOW()'
        );

        // Also expire stale PENDING transactions (older than 5 minutes)
        await db.execute(
            'UPDATE transactions SET status = "FAILED" WHERE status = "PENDING" AND created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)'
        );

        const [rows] = await db.query(
            'SELECT at.*, p.name as plan_name FROM access_tokens at JOIN plans p ON at.plan_id = p.id WHERE at.vendor_id = ? AND at.mac_address = ? AND at.status = "ACTIVE" AND at.expires_at > NOW() ORDER BY at.expires_at DESC LIMIT 1',
            [vendorId, mac]
        );

        if (rows.length > 0) {
            return res.json({
                active: true,
                expiresAt: rows[0].expires_at,
                phoneNumber: rows[0].phone_number,
                planName: rows[0].plan_name,
                loginIdentity: rows[0].mac_address
            });
        }

        const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
        res.json({ active: false, maintenanceMode });
    } catch (err) {
        console.error('Status check error:', err);
        res.json({ active: false });
    }
});

// M-Pesa Receipt Recovery Endpoint
app.post('/api/recover', async (req, res) => {
    const { receiptNumber, macAddress } = req.body;

    if (!receiptNumber || !macAddress) {
        return res.status(400).json({ success: false, error: 'Receipt number and MAC address required' });
    }

    const normalizedMac = normalizeMac(macAddress);

    if (!normalizedMac) {
        return res.status(400).json({ success: false, error: 'Valid MAC address is required' });
    }

    try {
        const recoveryEnabled = parseBool(await getSetting('allow_receipt_recovery', 'true'), true);
        if (!recoveryEnabled) {
            return res.status(403).json({ success: false, error: 'Receipt recovery is temporarily disabled by admin.' });
        }

        const requestIp = String(req.ip || req.connection.remoteAddress || '').replace('::ffff:', '');
        const receiptCode = receiptNumber.trim().toUpperCase();

        const [recentRecoveryAttempts] = await db.query(
            `SELECT COUNT(*) as c FROM receipt_recovery_attempts
             WHERE success = FALSE
             AND (mac_address = ? OR ip_address = ?)
             AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
            [normalizedMac, requestIp]
        );
        if (recentRecoveryAttempts[0].c >= 6) {
            return res.status(429).json({ success: false, error: 'Too many recovery attempts. Please wait 15 minutes.' });
        }

        // Find transaction by M-Pesa Receipt Number (stored in mpesa_receipt column)
        const [txRows] = await db.query(
            'SELECT * FROM transactions WHERE mpesa_receipt = ? AND status = "COMPLETED"',
            [receiptCode]
        );

        if (txRows.length === 0) {
            await db.execute(
                'INSERT INTO receipt_recovery_attempts (receipt_number, mac_address, ip_address, success) VALUES (?, ?, ?, FALSE)',
                [receiptCode, normalizedMac, requestIp]
            );
            return res.status(404).json({ success: false, error: 'Valid completed payment not found for this receipt. Note: If you just paid, please wait a minute for Safaricom to process it.' });
        }

        const tx = txRows[0];
        const txVendorId = tx.vendor_id || await getDefaultVendorId();
        const macPolicy = await getMacPolicy(normalizedMac, txVendorId);
        if (macPolicy.blocked && !macPolicy.whitelisted) {
            await db.execute(
                'INSERT INTO receipt_recovery_attempts (receipt_number, mac_address, ip_address, success) VALUES (?, ?, ?, FALSE)',
                [receiptCode, normalizedMac, requestIp]
            );
            return res.status(403).json({ success: false, error: macPolicy.blockReason || 'This device is blocked' });
        }

        // Check if this payment is already actively being used by a DIFFERENT MAC address
        if (tx.mac_address !== normalizedMac) {
            const [activeCheck] = await db.query(
                'SELECT id FROM access_tokens WHERE mac_address = ? AND status = "ACTIVE" AND expires_at > NOW()',
                [tx.mac_address]
            );

            if (activeCheck.length > 0) {
                await db.execute(
                    'INSERT INTO receipt_recovery_attempts (receipt_number, mac_address, ip_address, success) VALUES (?, ?, ?, FALSE)',
                    [receiptCode, normalizedMac, requestIp]
                );
                return res.status(403).json({ success: false, error: 'This receipt has already been claimed and is currently active on another device.' });
            }
        }

        // Generate new token and bind to new MAC
        const [planRows] = await db.query('SELECT * FROM plans WHERE id = ?', [tx.plan_id]);
        const plan = planRows[0];
        const durationSeconds = plan ? plan.duration_minutes * 60 : 3600;

        // Expire any existing active tokens for this MAC
        await db.execute(
            'UPDATE access_tokens SET status = "EXPIRED" WHERE vendor_id = ? AND mac_address = ? AND status = "ACTIVE"',
            [txVendorId, normalizedMac]
        );

        const accessToken = generateAccessToken();
        const expiresAt = new Date(Date.now() + durationSeconds * 1000);

        const [result] = await db.execute(
            'INSERT INTO access_tokens (token, phone_number, mac_address, plan_id, expires_at, status, vendor_id, speed_limit_down, speed_limit_up) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [accessToken, String(tx.phone_number), normalizedMac, tx.plan_id, expiresAt, 'ACTIVE', tx.vendor_id || (await getDefaultVendorId()), plan.speed_limit_down, plan.speed_limit_up]
        );

        // Update the transaction to map to the new MAC and access_token_id
        await db.execute(
            'UPDATE transactions SET mac_address = ?, access_token_id = ? WHERE id = ?',
            [normalizedMac, result.insertId, tx.id]
        );

        // --- FreeRADIUS Integration ---
        const phoneNumberStr = String(tx.phone_number);

        // Add phone
        const [userCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [phoneNumberStr]);
        if (userCheck.length === 0) {
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [phoneNumberStr, phoneNumberStr]
            );
        }

        // Add MAC
        const [macCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [normalizedMac]);
        if (macCheck.length === 0) {
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [normalizedMac, normalizedMac]
            );
        }

        // Limits
        await db.execute('DELETE FROM radreply WHERE username = ?', [phoneNumberStr]);
        await db.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)", [phoneNumberStr, String(durationSeconds)]);

        await db.execute('DELETE FROM radreply WHERE username = ?', [normalizedMac]);
        await db.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)", [normalizedMac, String(durationSeconds)]);

        if (plan && plan.speed_limit_down) {
            const uploadLimit = plan.speed_limit_up || '2M';
            const limitValue = `${uploadLimit}/${plan.speed_limit_down}`;
            await db.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)", [phoneNumberStr, limitValue]);
            await db.execute("INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)", [normalizedMac, limitValue]);
        }

        console.log(`Manual recovery granted for receipt ${receiptNumber} on MAC ${normalizedMac}`);
        await db.execute(
            'INSERT INTO receipt_recovery_attempts (receipt_number, mac_address, ip_address, success) VALUES (?, ?, ?, TRUE)',
            [receiptCode, normalizedMac, requestIp]
        );

        // Return same structure as polling endpoint so React can connect
        res.json({
            success: true,
            status: 'COMPLETED',
            expiresAt: expiresAt
        });

    } catch (err) {
        console.error("Recovery Error:", err);
        res.status(500).json({ success: false, error: 'Failed to process recovery' });
    }
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
    console.log(`🚀 TurboNet Server running on port ${PORT}`);
    console.log(`📊 Admin API: http://localhost:${PORT}/api/admin`);
    console.log(`👤 Customer API: http://localhost:${PORT}/api`);
});
