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
            'SELECT v.*, p.name as plan_name, p.duration_minutes, p.speed_limit_down FROM vouchers v JOIN plans p ON v.plan_id = p.id WHERE v.code = ?',
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
            'INSERT INTO access_tokens (token, phone_number, mac_address, plan_id, expires_at, vendor_id) VALUES (?, ?, ?, ?, ?, ?)',
            [accessToken, formattedPhone, normalizedMac, voucher.plan_id, expiresAt, vendorId]
        );

        // Mark voucher as redeemed
        await db.execute(
            'UPDATE vouchers SET status = "REDEEMED", redeemed_at = NOW(), redeemed_by_phone = ?, redeemed_by_mac = ? WHERE id = ?',
            [formattedPhone, normalizedMac, voucher.id]
        );

        // Create RADIUS user for WiFi access
        await createRadiusUser(formattedPhone, voucher.duration_minutes * 60, voucher.speed_limit_down);

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
            'SELECT r.*, a.*, p.name as plan_name, p.duration_minutes, p.speed_limit_down FROM reaccess_tokens r JOIN access_tokens a ON r.access_token_id = a.id JOIN plans p ON a.plan_id = p.id WHERE r.code = ?',
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
        await createRadiusUser(reaccess.phone_number, remainingSeconds, reaccess.speed_limit_down);

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

async function createRadiusUser(username, durationSeconds, speedLimit) {
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
        if (speedLimit) {
            await db.execute(
                "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
                [username, `${speedLimit}/${speedLimit}`]
            );
        }
    } catch (err) {
        console.error('RADIUS user creation error:', err);
        throw err;
    }
}

module.exports = router;
