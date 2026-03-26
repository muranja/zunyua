// =====================================================================
// TurboNet — Bundle Routes (monthly KES 1,000 plan, 3 MACs)
// =====================================================================
// ADD THIS BLOCK to your portal/app/backend/routes/customer.js
// Paste it just before the last line: module.exports = router;
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
