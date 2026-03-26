// =====================================================================
// TurboNet — check-status update + admin bundle creation
// =====================================================================
// TWO CHANGES needed in server.js:
//
// CHANGE 1: Update /api/check-status to also detect bundle devices
//           (so all 3 bound MACs auto-login on the hotspot login.html)
//
// CHANGE 2: New admin route POST /api/admin/bundles to create a bundle
//           when KES 1,000 M-Pesa payment is confirmed manually.
//           (Later you can replace this with an automatic Daraja callback.)
// =====================================================================


// =====================================================================
// CHANGE 1: Replace your existing /api/check-status handler with this.
// The only addition is the bundle_devices lookup at the bottom.
// =====================================================================

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

        // Expire stale tokens
        await db.execute(
            'UPDATE access_tokens SET status = "EXPIRED" WHERE status = "ACTIVE" AND expires_at <= NOW()'
        );
        await db.execute(
            'UPDATE transactions SET status = "FAILED" WHERE status = "PENDING" AND created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)'
        );

        // --- EXISTING: check normal access_tokens ---
        const [rows] = await db.query(
            'SELECT at.*, p.name as plan_name FROM access_tokens at JOIN plans p ON at.plan_id = p.id WHERE at.vendor_id = ? AND at.mac_address = ? AND at.status = "ACTIVE" AND at.expires_at > NOW() ORDER BY at.expires_at DESC LIMIT 1',
            [vendorId, mac]
        );
        if (rows.length > 0) {
            return res.json({
                active: true,
                expiresAt: rows[0].expires_at,
                planName: rows[0].plan_name,
                loginIdentity: rows[0].phone_number
            });
        }

        // --- NEW: check monthly bundle devices ---
        // If this MAC is registered in bundle_devices AND the bundle is active,
        // return active=true so login.html auto-logs them in.
        const [bundleRows] = await db.query(
            `SELECT b.phone_number, b.expires_at
             FROM bundle_devices bd
             JOIN mpesa_monthly_bundles b ON bd.bundle_id = b.id
             WHERE bd.mac_address = ?
               AND b.status = 'ACTIVE'
               AND b.expires_at > NOW()
             LIMIT 1`,
            [mac]
        );
        if (bundleRows.length > 0) {
            return res.json({
                active: true,
                expiresAt: bundleRows[0].expires_at,
                planName: 'Monthly Bundle',
                loginIdentity: bundleRows[0].phone_number
            });
        }

        const maintenanceMode = parseBool(await getSetting('maintenance_mode', 'false'), false);
        res.json({ active: false, maintenanceMode });

    } catch (err) {
        console.error('Status check error:', err);
        res.json({ active: false });
    }
});


// =====================================================================
// CHANGE 2: Add this admin route to server.js (or admin.js router)
// to create a monthly bundle when you confirm a KES 1,000 M-Pesa payment.
//
// This is a manually triggered endpoint — you call it from your admin
// dashboard when you see the M-Pesa payment come in.
//
// POST /api/admin/bundles
// Headers: Authorization: Bearer <admin-jwt>
// Body: { mpesaReceipt, phoneNumber, amount, vendorId? }
// =====================================================================

// NOTE: paste this inside your adminRoutes (routes/admin.js), protected
// by your existing JWT auth middleware. Example:

/*

router.post('/bundles', requireAuth, async (req, res) => {
    const { mpesaReceipt, phoneNumber, amount, vendorId } = req.body;

    if (!mpesaReceipt || !phoneNumber || !amount) {
        return res.status(400).json({ error: 'mpesaReceipt, phoneNumber, and amount are required' });
    }

    // Only KES 1,000 qualifies for the monthly bundle
    if (Number(amount) !== 1000) {
        return res.status(400).json({ error: 'Monthly bundle requires exactly KES 1,000' });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    const receiptCode = mpesaReceipt.trim().toUpperCase();
    const effectiveVendorId = vendorId || await getDefaultVendorId();

    try {
        // Check for duplicate receipt
        const [existing] = await db.query(
            'SELECT id FROM mpesa_monthly_bundles WHERE mpesa_receipt = ?',
            [receiptCode]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'A bundle with this receipt already exists' });
        }

        // expires_at = 30 days from now
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await db.execute(
            'INSERT INTO mpesa_monthly_bundles (mpesa_receipt, phone_number, amount, max_devices, vendor_id, status, expires_at) VALUES (?, ?, ?, 3, ?, "ACTIVE", ?)',
            [receiptCode, formattedPhone, amount, effectiveVendorId, expiresAt]
        );

        return res.json({
            success: true,
            message: 'Monthly bundle created. User can now redeem with their M-Pesa receipt code.',
            receipt: receiptCode,
            phone: formattedPhone,
            expiresAt,
            maxDevices: 3
        });

    } catch (err) {
        console.error('Admin bundle create error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

*/
