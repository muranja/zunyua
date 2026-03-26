const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateAccessToken, generateReaccessCode, formatPhoneNumber, normalizeMac } = require('../utils/generators');
const { getMacPolicy } = require('../utils/macPolicy');
const { getSetting, parseBool } = require('../utils/systemSettings');
const { getDefaultVendorId } = require('../utils/vendorScope');

// ==================== VOUCHER REDEMPTION ====================

router.post('/voucher/redeem', async (req, res) => {
    const { code, phoneNumber, macAddress } = req.body;

    if (!code || !phoneNumber || !macAddress) {
        return res.status(400).json({
            error: 'Code, phone number, and MAC address are required'
        });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const normalizedMac = normalizeMac(macAddress);
    if (!normalizedMac) {
        return res.status(400).json({ error: 'Valid MAC address is required' });
    }

    const salesEnabled = parseBool(await getSetting('sales_enabled', 'true'), true);
    const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
    if (!salesEnabled || maintenanceMode) {
        return res.status(503).json({
            error: maintenanceMode ? 'Service is under maintenance. Please try again shortly.' : 'Voucher redemption is temporarily paused by admin.'
        });
    }

    try {
        // Find voucher
        const [vouchers] = await db.query(
            'SELECT v.*, p.name as plan_name, p.duration_minutes, p.speed_limit_down, p.speed_limit_up FROM vouchers v JOIN plans p ON v.plan_id = p.id WHERE v.code = ?',
            [code.toUpperCase()]
        );

        if (vouchers.length === 0) {
            return res.status(404).json({ error: 'Invalid voucher code' });
        }

        const voucher = vouchers[0];
        const vendorId = voucher.vendor_id || await getDefaultVendorId();
        const macPolicy = await getMacPolicy(normalizedMac, vendorId);
        if (macPolicy.blocked && !macPolicy.whitelisted) {
            return res.status(403).json({ error: macPolicy.blockReason || 'This device is blocked' });
        }

        // Check if MAC already has an active token — inform user instead of blocking
        const [existingMac] = await db.query(
            `SELECT at.*, p.name as plan_name
             FROM access_tokens at
             JOIN plans p ON at.plan_id = p.id
             WHERE at.vendor_id = ? AND at.mac_address = ? AND at.status = "ACTIVE" AND at.expires_at > NOW()`,
            [vendorId, normalizedMac]
        );

        if (existingMac.length > 0) {
            return res.json({
                success: true,
                alreadyActive: true,
                message: 'This device already has an active package',
                plan: existingMac[0].plan_name,
                expiresAt: existingMac[0].expires_at,
                phoneNumber: existingMac[0].phone_number
            });
        }

        // Check voucher status
        if (voucher.status !== 'ACTIVE') {
            return res.status(400).json({
                error: `Voucher has already been ${voucher.status.toLowerCase()}`
            });
        }

        // Check expiry
        if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
            await db.execute('UPDATE vouchers SET status = "EXPIRED" WHERE id = ?', [voucher.id]);
            return res.status(400).json({ error: 'Voucher has expired' });
        }

        // Expire old tokens for this MAC before creating new
        await db.execute(
            'UPDATE access_tokens SET status = "EXPIRED" WHERE mac_address = ? AND status = "ACTIVE"',
            [normalizedMac]
        );

        // Create access token
        const accessToken = generateAccessToken();
        const expiresAt = new Date(Date.now() + voucher.duration_minutes * 60 * 1000);

        await db.execute(
            'INSERT INTO access_tokens (token, phone_number, mac_address, plan_id, expires_at, vendor_id, status, speed_limit_down, speed_limit_up) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [accessToken, formattedPhone, normalizedMac, voucher.plan_id, expiresAt, vendorId, 'ACTIVE', voucher.speed_limit_down, voucher.speed_limit_up]
        );

        // Mark voucher as redeemed
        await db.execute(
            'UPDATE vouchers SET status = "REDEEMED", redeemed_at = NOW(), redeemed_by_phone = ?, redeemed_by_mac = ? WHERE id = ?',
            [formattedPhone, normalizedMac, voucher.id]
        );

        // Create RADIUS user for WiFi access
        await createRadiusUser(formattedPhone, voucher.duration_minutes * 60, voucher.speed_limit_down, voucher.speed_limit_up);

        res.json({
            success: true,
            message: 'Package activated successfully!',
            plan: voucher.plan_name,
            expiresAt,
            accessToken
        });

    } catch (err) {
        console.error('Voucher redemption error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== RE-ACCESS TOKEN ====================

// Generate re-access code (for when user changes device)
router.post('/reaccess/generate', async (req, res) => {
    const { phoneNumber, currentMac } = req.body;

    if (!phoneNumber || !currentMac) {
        return res.status(400).json({ error: 'Phone number and current MAC address required' });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const normalizedMac = normalizeMac(currentMac);
    const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
    if (maintenanceMode) {
        return res.status(503).json({ error: 'Service is under maintenance. Please try again shortly.' });
    }

    try {
        // Find active access token for this phone + MAC
        const [tokens] = await db.query(
            'SELECT * FROM access_tokens WHERE phone_number = ? AND mac_address = ? AND status = "ACTIVE" AND expires_at > NOW()',
            [formattedPhone, normalizedMac]
        );

        if (tokens.length === 0) {
            return res.status(404).json({ error: 'No active package found for this phone and device' });
        }

        const accessToken = tokens[0];

        // Check if re-access code already exists
        const [existingCodes] = await db.query(
            'SELECT * FROM reaccess_tokens WHERE access_token_id = ? AND used = FALSE',
            [accessToken.id]
        );

        if (existingCodes.length > 0) {
            return res.json({
                success: true,
                code: existingCodes[0].code,
                message: 'Use this code to reclaim your package on a new device'
            });
        }

        // Generate new re-access code
        const code = generateReaccessCode();

        await db.execute(
            'INSERT INTO reaccess_tokens (code, access_token_id) VALUES (?, ?)',
            [code, accessToken.id]
        );

        res.json({
            success: true,
            code,
            message: 'Use this code to reclaim your package on a new device'
        });

    } catch (err) {
        console.error('Generate re-access code error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Use re-access code to transfer package to new device
router.post('/reaccess/claim', async (req, res) => {
    const { code, newMacAddress } = req.body;

    if (!code || !newMacAddress) {
        return res.status(400).json({ error: 'Re-access code and new MAC address required' });
    }

    const normalizedNewMac = normalizeMac(newMacAddress);
    if (!normalizedNewMac) {
        return res.status(400).json({ error: 'Valid MAC address is required' });
    }
    const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
    if (maintenanceMode) {
        return res.status(503).json({ error: 'Service is under maintenance. Please try again shortly.' });
    }
    try {
        // Find re-access token
        const [reaccesTokens] = await db.query(
            'SELECT r.*, a.*, p.name as plan_name, p.duration_minutes, p.speed_limit_down, p.speed_limit_up FROM reaccess_tokens r JOIN access_tokens a ON r.access_token_id = a.id JOIN plans p ON a.plan_id = p.id WHERE r.code = ?',
            [code.toUpperCase()]
        );

        if (reaccesTokens.length === 0) {
            return res.status(404).json({ error: 'Invalid re-access code' });
        }

        const reaccess = reaccesTokens[0];
        const vendorId = reaccess.vendor_id || await getDefaultVendorId();
        const macPolicy = await getMacPolicy(normalizedNewMac, vendorId);
        if (macPolicy.blocked && !macPolicy.whitelisted) {
            return res.status(403).json({ error: macPolicy.blockReason || 'This device is blocked' });
        }

        // Check if new MAC already has active package
        const [existingMac] = await db.query(
            'SELECT * FROM access_tokens WHERE vendor_id = ? AND mac_address = ? AND status = "ACTIVE" AND expires_at > NOW()',
            [vendorId, normalizedNewMac]
        );

        if (existingMac.length > 0) {
            return res.status(400).json({ error: 'New device already has an active package' });
        }

        if (reaccess.used) {
            return res.status(400).json({ error: 'Re-access code has already been used' });
        }

        // Check if original access token is still valid
        if (reaccess.status !== 'ACTIVE' || new Date(reaccess.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Original package has expired' });
        }

        const oldMac = reaccess.mac_address;

        // Update access token with new MAC
        await db.execute(
            'UPDATE access_tokens SET mac_address = ? WHERE id = ?',
            [normalizedNewMac, reaccess.access_token_id]
        );

        // Mark re-access code as used
        await db.execute(
            'UPDATE reaccess_tokens SET used = TRUE, used_at = NOW(), new_mac_address = ? WHERE id = ?',
            [normalizedNewMac, reaccess.id]
        );

        // Update RADIUS - remove old MAC, add new one
        await db.execute('DELETE FROM radcheck WHERE username = ?', [reaccess.phone_number]);
        await db.execute('DELETE FROM radreply WHERE username = ?', [reaccess.phone_number]);

        // Calculate remaining time
        const remainingSeconds = Math.floor((new Date(reaccess.expires_at) - new Date()) / 1000);
        await createRadiusUser(reaccess.phone_number, remainingSeconds, reaccess.speed_limit_down, reaccess.speed_limit_up);

        res.json({
            success: true,
            message: 'Package transferred to new device!',
            plan: reaccess.plan_name,
            expiresAt: reaccess.expires_at,
            oldMac,
            newMac: normalizedNewMac
        });

    } catch (err) {
        console.error('Claim re-access error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== HELPER FUNCTIONS ====================

async function createRadiusUser(username, durationSeconds, downloadLimit, uploadLimit) {
    try {
        // Check if user exists
        const [userCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [username]);

        if (userCheck.length === 0) {
            // Create user with phone as password
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [username, username]
            );
        }

        // Set session timeout
        await db.execute('DELETE FROM radreply WHERE username = ?', [username]);
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [username, String(durationSeconds)]
        );

        // Set rate limit if provided
        if (downloadLimit) {
            const up = uploadLimit || downloadLimit;
            await db.execute(
                "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
                [username, `${up}/${downloadLimit}`]
            );
        }
    } catch (err) {
        console.error('RADIUS user creation error:', err);
        throw err;
    }
}

// =====================================================================
// TurboNet — Bundle Routes (monthly KES 1,000 plan, 3 MACs)
// =====================================================================
// ADD THIS BLOCK to your portal/app/backend/routes/customer.js
// Paste it just before the last line: 
//
// New endpoints:
//   POST /api/bundle/redeem   — user enters M-Pesa receipt to bind MAC
//   GET  /api/bundle/status   — check how many devices are bound, expiry
// =====================================================================


// ==================== MONTHLY BUNDLE (M-Pesa receipt redemption) ====================

/**
 * POST /api/bundle/redeem
 *
 * Body: { receiptCode, macAddress, deviceLabel? }
 *
 * Flow:
 *   1. Find bundle by receipt code (must be ACTIVE, amount=1000, not expired)
 *   2. If this MAC is already bound → just re-create RADIUS user and return success
 *   3. If 3 devices already bound → return 403 with list of existing devices
 *   4. Otherwise bind MAC, create RADIUS user, return success
 */
router.post('/bundle/redeem', async (req, res) => {
    const { receiptCode, macAddress, deviceLabel } = req.body;

    if (!receiptCode || !macAddress) {
        return res.status(400).json({ error: 'M-Pesa receipt code and MAC address are required' });
    }

    const normalizedMac = normalizeMac(macAddress);
    if (!normalizedMac) {
        return res.status(400).json({ error: 'Valid MAC address is required' });
    }

    const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
    if (maintenanceMode) {
        return res.status(503).json({ error: 'Service is under maintenance. Please try again shortly.' });
    }

    try {
        // 1. Find the bundle
        const [bundles] = await db.query(
            `SELECT b.*, v.id as vid
             FROM mpesa_monthly_bundles b
             LEFT JOIN vendors v ON b.vendor_id = v.id
             WHERE b.mpesa_receipt = ? AND b.status = 'ACTIVE' AND b.expires_at > NOW()`,
            [receiptCode.trim().toUpperCase()]
        );

        if (bundles.length === 0) {
            return res.status(404).json({
                error: 'Invalid or expired M-Pesa receipt code. Make sure you enter the exact code from your M-Pesa confirmation SMS.'
            });
        }

        const bundle = bundles[0];

        // Enforce KES 1,000 — only monthly plan is eligible
        if (Number(bundle.amount) < 1000) {
            return res.status(400).json({
                error: 'This receipt is not for a monthly plan. Only KES 1,000 payments can be used for the monthly bundle.'
            });
        }

        const vendorId = bundle.vendor_id || await getDefaultVendorId();

        // Check MAC policy (blocked devices)
        const macPolicy = await getMacPolicy(normalizedMac, vendorId);
        if (macPolicy.blocked && !macPolicy.whitelisted) {
            return res.status(403).json({ error: macPolicy.blockReason || 'This device is blocked' });
        }

        // 2. Get all devices already bound to this bundle
        const [boundDevices] = await db.query(
            'SELECT mac_address, device_label, registered_at FROM bundle_devices WHERE bundle_id = ?',
            [bundle.id]
        );

        // Check if THIS MAC is already registered on this bundle → just refresh RADIUS
        const alreadyBound = boundDevices.find(d => d.mac_address === normalizedMac);
        if (alreadyBound) {
            const remainingSeconds = Math.floor((new Date(bundle.expires_at) - new Date()) / 1000);
            await createBundleRadiusUser(bundle.phone_number, normalizedMac, remainingSeconds);
            return res.json({
                success: true,
                alreadyRegistered: true,
                message: 'Device already registered on this bundle. Connecting you now!',
                devicesUsed: boundDevices.length,
                devicesMax: bundle.max_devices,
                expiresAt: bundle.expires_at
            });
        }

        // 3. Enforce 3-device limit
        if (boundDevices.length >= bundle.max_devices) {
            return res.status(403).json({
                error: `This bundle already has all ${bundle.max_devices} device slots filled. No more devices can be added.`,
                limitReached: true,
                devices: boundDevices.map(d => ({
                    label: d.device_label,
                    registeredAt: d.registered_at
                }))
            });
        }

        // 4. Bind this MAC to the bundle
        await db.execute(
            'INSERT INTO bundle_devices (bundle_id, mac_address, device_label) VALUES (?, ?, ?)',
            [bundle.id, normalizedMac, deviceLabel || 'Device']
        );

        // 5. Create RADIUS user so MikroTik allows this device through
        const remainingSeconds = Math.floor((new Date(bundle.expires_at) - new Date()) / 1000);
        await createBundleRadiusUser(bundle.phone_number, normalizedMac, remainingSeconds);

        return res.json({
            success: true,
            message: 'Device registered! You are now connected.',
            devicesUsed: boundDevices.length + 1,
            devicesMax: bundle.max_devices,
            devicesRemaining: bundle.max_devices - boundDevices.length - 1,
            expiresAt: bundle.expires_at,
            phoneNumber: bundle.phone_number
        });

    } catch (err) {
        // Handle duplicate MAC insert race condition gracefully
        if (err.code === 'ER_DUP_ENTRY') {
            return res.json({
                success: true,
                alreadyRegistered: true,
                message: 'Device already registered. Connecting you now!'
            });
        }
        console.error('Bundle redeem error:', err);
        return res.status(500).json({ error: 'Server error. Please try again.' });
    }
});


/**
 * GET /api/bundle/status?receipt=XXXXX
 *
 * Returns bundle info so the UI can show how many slots are used.
 */
router.get('/bundle/status', async (req, res) => {
    const receipt = String(req.query.receipt || '').trim().toUpperCase();
    if (!receipt) {
        return res.status(400).json({ error: 'receipt query param required' });
    }

    try {
        const [bundles] = await db.query(
            'SELECT * FROM mpesa_monthly_bundles WHERE mpesa_receipt = ?',
            [receipt]
        );

        if (bundles.length === 0) {
            return res.status(404).json({ error: 'Bundle not found' });
        }

        const bundle = bundles[0];
        const [devices] = await db.query(
            'SELECT mac_address, device_label, registered_at FROM bundle_devices WHERE bundle_id = ?',
            [bundle.id]
        );

        return res.json({
            status: bundle.status,
            expiresAt: bundle.expires_at,
            devicesUsed: devices.length,
            devicesMax: bundle.max_devices,
            devicesRemaining: Math.max(0, bundle.max_devices - devices.length),
            devices: devices.map(d => ({
                label: d.device_label,
                registeredAt: d.registered_at
            }))
        });
    } catch (err) {
        console.error('Bundle status error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});


// ==================== DEVICE AUTHORIZATION (Smart TV / secondary device) ====================

/**
 * POST /api/authorize-device
 *
 * Body: { macAddress, phoneNumber, receiptCode? }
 *
 * Authorizes a secondary device (e.g. Smart TV) to use an existing active
 * subscription. Works for both regular plan tokens and monthly bundles.
 *
 * Flow:
 *   1. Find active subscription for the phone number (access_tokens or bundle)
 *   2. If receiptCode provided, use bundle flow
 *   3. Otherwise, link the new MAC to the existing active token
 *   4. Create RADIUS entries so the device auto-connects
 */
router.post('/authorize-device', async (req, res) => {
    const { macAddress, phoneNumber, receiptCode } = req.body;

    if (!macAddress || !phoneNumber) {
        return res.status(400).json({ error: 'MAC address and phone number are required' });
    }

    const normalizedMac = normalizeMac(macAddress);
    if (!normalizedMac) {
        return res.status(400).json({ error: 'Valid MAC address is required' });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
    if (maintenanceMode) {
        return res.status(503).json({ error: 'Service is under maintenance. Please try again shortly.' });
    }

    try {
        // If receipt provided, delegate to bundle redeem
        if (receiptCode) {
            // Forward to bundle redeem internally
            req.body = { receiptCode, macAddress: normalizedMac, deviceLabel: 'Authorized Device' };
            return router.handle({ ...req, url: '/bundle/redeem', method: 'POST', body: req.body }, res);
        }

        // Find active subscription for this phone number
        const [activeTokens] = await db.query(
            `SELECT at.*, p.name as plan_name, p.speed_limit_down, p.speed_limit_up
             FROM access_tokens at
             JOIN plans p ON at.plan_id = p.id
             WHERE at.phone_number = ? AND at.status = "ACTIVE" AND at.expires_at > NOW()
             ORDER BY at.expires_at DESC LIMIT 1`,
            [formattedPhone]
        );

        if (activeTokens.length === 0) {
            return res.status(404).json({
                error: 'No active subscription found for this phone number. Please purchase a plan first.'
            });
        }

        const token = activeTokens[0];
        const vendorId = token.vendor_id || await getDefaultVendorId();

        // Check MAC policy
        const macPolicy = await getMacPolicy(normalizedMac, vendorId);
        if (macPolicy.blocked && !macPolicy.whitelisted) {
            return res.status(403).json({ error: macPolicy.blockReason || 'This device is blocked' });
        }

        // Check if MAC is already authorized on this token
        const [existingMac] = await db.query(
            'SELECT id FROM access_tokens WHERE mac_address = ? AND status = "ACTIVE" AND expires_at > NOW()',
            [normalizedMac]
        );

        if (existingMac.length > 0) {
            return res.json({
                success: true,
                alreadyAuthorized: true,
                message: 'This device is already authorized'
            });
        }

        // Calculate remaining time
        const remainingSeconds = Math.floor((new Date(token.expires_at) - new Date()) / 1000);

        // Create RADIUS user for the new MAC
        const [macCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [normalizedMac]);
        if (macCheck.length === 0) {
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [normalizedMac, normalizedMac]
            );
        }

        await db.execute('DELETE FROM radreply WHERE username = ?', [normalizedMac]);
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [normalizedMac, String(remainingSeconds)]
        );

        if (token.speed_limit_down) {
            const up = token.speed_limit_up || '2M';
            await db.execute(
                "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
                [normalizedMac, `${up}/${token.speed_limit_down}`]
            );
        }

        // Record the authorized device in access_tokens so check-status picks it up
        const newAccessToken = generateAccessToken();
        await db.execute(
            'INSERT INTO access_tokens (token, phone_number, mac_address, plan_id, expires_at, vendor_id, status, speed_limit_down, speed_limit_up) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newAccessToken, formattedPhone, normalizedMac, token.plan_id, token.expires_at, vendorId, 'ACTIVE', token.speed_limit_down, token.speed_limit_up]
        );

        res.json({
            success: true,
            message: 'Device authorized successfully!',
            plan: token.plan_name,
            expiresAt: token.expires_at,
            macAddress: normalizedMac
        });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.json({ success: true, alreadyAuthorized: true, message: 'Device already authorized' });
        }
        console.error('Device authorization error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


// ---- Helper: create RADIUS entries for a bundle device ----
// Bundle uses phone number as the RADIUS username (shared across all 3 devices).
// This means all bound devices share a single RADIUS session identity.
async function createBundleRadiusUser(phoneNumber, macAddress, durationSeconds) {
    try {
        // Ensure phone-based RADIUS user exists
        const [phoneCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [phoneNumber]);
        if (phoneCheck.length === 0) {
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [phoneNumber, phoneNumber]
            );
        }

        // Set session timeout for phone identity
        await db.execute('DELETE FROM radreply WHERE username = ?', [phoneNumber]);
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [phoneNumber, String(durationSeconds)]
        );

        // Also register MAC address as its own RADIUS user
        // This lets the hotspot auto-login the device even without entering phone
        const [macCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [macAddress]);
        if (macCheck.length === 0) {
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [macAddress, macAddress]
            );
        }

        await db.execute('DELETE FROM radreply WHERE username = ?', [macAddress]);
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [macAddress, String(durationSeconds)]
        );

        // Monthly plan gets 10M down / 5M up
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
            [phoneNumber, '5M/10M']
        );
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
            [macAddress, '5M/10M']
        );

    } catch (err) {
        console.error('Bundle RADIUS user creation error:', err);
        throw err;
    }
}
module.exports = router;
