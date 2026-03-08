const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken, logActivity } = require('../middleware/auth');
const { normalizeMac } = require('../utils/generators');
const { ensurePolicyTables } = require('../utils/macPolicy');
const { disconnectRadiusSession } = require('../utils/radiusCoa');
const { getAdminScope, getDefaultVendorId } = require('../utils/vendorScope');

// ==================== LIST ACTIVE USERS ====================
router.get('/', verifyToken, async (req, res) => {
    try {
        const scope = await getAdminScope(req.admin.id);
        const vendorFilter = scope.isSuperAdmin ? '' : ' AND at.vendor_id = ?';
        const params = scope.isSuperAdmin ? [] : [scope.vendorId];
        const [users] = await db.query(`
            SELECT 
                at.id,
                at.token,
                at.phone_number,
                at.mac_address,
                at.status,
                at.expires_at,
                at.created_at,
                p.name as plan_name,
                p.price as plan_price,
                p.speed_limit_down,
                p.speed_limit_up,
                TIMESTAMPDIFF(MINUTE, NOW(), at.expires_at) as minutes_remaining
            FROM access_tokens at
            LEFT JOIN plans p ON at.plan_id = p.id
            WHERE at.status = 'ACTIVE' AND at.expires_at > NOW()${vendorFilter}
            ORDER BY at.created_at DESC
        `, params);

        res.json({
            success: true,
            users,
            total: users.length
        });
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== GET ALL USERS (INCLUDING EXPIRED) ====================
router.get('/all', verifyToken, async (req, res) => {
    const { status, phone, mac, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const scope = await getAdminScope(req.admin.id);
        let query = `
            SELECT 
                at.id,
                at.token,
                at.phone_number,
                at.mac_address,
                at.status,
                at.expires_at,
                at.created_at,
                p.name as plan_name,
                p.speed_limit_down
            FROM access_tokens at
            LEFT JOIN plans p ON at.plan_id = p.id
            WHERE 1=1
        `;
        const params = [];
        if (!scope.isSuperAdmin) {
            query += ' AND at.vendor_id = ?';
            params.push(scope.vendorId);
        }

        if (status) {
            query += ' AND at.status = ?';
            params.push(status);
        }
        if (phone) {
            query += ' AND at.phone_number LIKE ?';
            params.push(`%${phone}%`);
        }
        if (mac) {
            query += ' AND at.mac_address LIKE ?';
            params.push(`%${mac}%`);
        }

        query += ' ORDER BY at.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [users] = await db.query(query, params);

        res.json({ success: true, users });
    } catch (err) {
        console.error('All users error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== DISCONNECT/TERMINATE USER ====================
router.post('/:id/disconnect', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        const scope = await getAdminScope(req.admin.id);
        // Get user info first
        const [users] = await db.query(
            `SELECT * FROM access_tokens WHERE id = ?${scope.isSuperAdmin ? '' : ' AND vendor_id = ?'}`,
            scope.isSuperAdmin ? [id] : [id, scope.vendorId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Revoke the access token
        await db.execute(
            'UPDATE access_tokens SET status = ? WHERE id = ?',
            ['REVOKED', id]
        );

        // Remove from RADIUS (user won't be able to re-authenticate)
        await db.execute('DELETE FROM radcheck WHERE username = ?', [user.phone_number]);
        await db.execute('DELETE FROM radcheck WHERE username = ?', [user.mac_address]);
        await db.execute('DELETE FROM radreply WHERE username = ?', [user.phone_number]);
        await db.execute('DELETE FROM radreply WHERE username = ?', [user.mac_address]);

        const coaResult = await disconnectRadiusSession({
            username: user.phone_number,
            macAddress: user.mac_address
        });

        // Log the action
        await logActivity(req.admin.id, 'USER_DISCONNECT', {
            userId: id,
            phone: user.phone_number,
            mac: user.mac_address
        }, ip);

        res.json({
            success: true,
            message: 'User disconnected successfully',
            coa: coaResult
        });

    } catch (err) {
        console.error('Disconnect user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== EXTEND USER SESSION ====================
router.post('/:id/extend', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { minutes } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!minutes || minutes < 1) {
        return res.status(400).json({ error: 'Valid minutes required' });
    }

    try {
        const scope = await getAdminScope(req.admin.id);
        const [users] = await db.query(
            `SELECT * FROM access_tokens WHERE id = ?${scope.isSuperAdmin ? '' : ' AND vendor_id = ?'}`,
            scope.isSuperAdmin ? [id] : [id, scope.vendorId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        // Calculate new expiry
        const currentExpiry = new Date(user.expires_at);
        const now = new Date();
        const baseTime = currentExpiry > now ? currentExpiry : now;
        const newExpiry = new Date(baseTime.getTime() + minutes * 60 * 1000);

        // Update access token
        await db.execute(
            'UPDATE access_tokens SET expires_at = ?, status = ? WHERE id = ?',
            [newExpiry, 'ACTIVE', id]
        );

        // Update RADIUS session timeout
        const newSessionTimeout = Math.floor((newExpiry - now) / 1000);
        await db.execute(
            'UPDATE radreply SET value = ? WHERE username = ? AND attribute = ?',
            [String(newSessionTimeout), user.phone_number, 'Session-Timeout']
        );

        await logActivity(req.admin.id, 'USER_EXTEND', {
            userId: id,
            phone: user.phone_number,
            addedMinutes: minutes,
            newExpiry: newExpiry.toISOString()
        }, ip);

        res.json({
            success: true,
            message: `Extended by ${minutes} minutes`,
            newExpiry
        });

    } catch (err) {
        console.error('Extend user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== CHANGE USER SPEED ====================
router.post('/:id/speed', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { downloadSpeed, uploadSpeed } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!downloadSpeed) {
        return res.status(400).json({ error: 'Download speed required (e.g., "5M", "10M")' });
    }

    try {
        const scope = await getAdminScope(req.admin.id);
        const [users] = await db.query(
            `SELECT * FROM access_tokens WHERE id = ?${scope.isSuperAdmin ? '' : ' AND vendor_id = ?'}`,
            scope.isSuperAdmin ? [id] : [id, scope.vendorId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const upload = uploadSpeed || downloadSpeed;
        const rateLimit = `${downloadSpeed}/${upload}`;

        // Update RADIUS rate limit
        // First check if it exists
        const [existing] = await db.query(
            'SELECT id FROM radreply WHERE username = ? AND attribute = ?',
            [user.phone_number, 'Mikrotik-Rate-Limit']
        );

        if (existing.length > 0) {
            await db.execute(
                'UPDATE radreply SET value = ? WHERE username = ? AND attribute = ?',
                [rateLimit, user.phone_number, 'Mikrotik-Rate-Limit']
            );
        } else {
            await db.execute(
                'INSERT INTO radreply (username, attribute, op, value) VALUES (?, ?, ?, ?)',
                [user.phone_number, 'Mikrotik-Rate-Limit', '=', rateLimit]
            );
        }

        await logActivity(req.admin.id, 'USER_SPEED_CHANGE', {
            userId: id,
            phone: user.phone_number,
            newSpeed: rateLimit
        }, ip);

        res.json({
            success: true,
            message: `Speed changed to ${rateLimit}`,
            note: 'Speed will apply on next re-connect'
        });

    } catch (err) {
        console.error('Change speed error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== BLOCK MAC ADDRESS ====================
router.post('/block-mac', verifyToken, async (req, res) => {
    const { macAddress, reason } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!macAddress) {
        return res.status(400).json({ error: 'MAC address required' });
    }

    try {
        await ensurePolicyTables();
        const scope = await getAdminScope(req.admin.id);
        const vendorId = scope.isSuperAdmin ? await getDefaultVendorId() : scope.vendorId;
        const mac = normalizeMac(macAddress);
        if (!mac) return res.status(400).json({ error: 'Invalid MAC address' });

        // Add to blocked list
        await db.execute(
            'INSERT INTO blocked_macs (vendor_id, mac_address, reason, blocked_by) VALUES (?, ?, ?, ?)',
            [vendorId, mac, reason || 'Blocked by admin', req.admin.id]
        );

        // Revoke any active tokens for this MAC
        await db.execute(
            'UPDATE access_tokens SET status = ? WHERE vendor_id = ? AND mac_address = ?',
            ['REVOKED', vendorId, mac]
        );

        await db.execute('DELETE FROM radcheck WHERE username = ?', [mac]);
        await db.execute('DELETE FROM radreply WHERE username = ?', [mac]);
        const coaResult = await disconnectRadiusSession({ macAddress: mac });

        await logActivity(req.admin.id, 'MAC_BLOCKED', {
            mac: macAddress,
            reason
        }, ip);

        res.json({
            success: true,
            message: `MAC ${macAddress} has been blocked`,
            coa: coaResult
        });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'MAC address already blocked' });
        }
        console.error('Block MAC error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== UNBLOCK MAC ADDRESS ====================
router.post('/unblock-mac', verifyToken, async (req, res) => {
    const { macAddress } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        await ensurePolicyTables();
        const scope = await getAdminScope(req.admin.id);
        const vendorId = scope.isSuperAdmin ? await getDefaultVendorId() : scope.vendorId;
        const mac = normalizeMac(macAddress);
        if (!mac) return res.status(400).json({ error: 'Invalid MAC address' });
        await db.execute('DELETE FROM blocked_macs WHERE vendor_id = ? AND mac_address = ?', [vendorId, mac]);

        await logActivity(req.admin.id, 'MAC_UNBLOCKED', { mac: macAddress }, ip);

        res.json({
            success: true,
            message: `MAC ${macAddress} has been unblocked`
        });

    } catch (err) {
        console.error('Unblock MAC error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== LIST BLOCKED MACS ====================
router.get('/blocked-macs', verifyToken, async (req, res) => {
    try {
        await ensurePolicyTables();
        const scope = await getAdminScope(req.admin.id);
        const params = [];
        let whereClause = '';
        if (!scope.isSuperAdmin) {
            whereClause = 'WHERE bm.vendor_id = ?';
            params.push(scope.vendorId);
        }
        const [macs] = await db.query(`
            SELECT bm.*, au.username as blocked_by_name
            FROM blocked_macs bm
            LEFT JOIN admin_users au ON bm.blocked_by = au.id
            ${whereClause}
            ORDER BY bm.blocked_at DESC
        `, params);

        res.json({ success: true, blockedMacs: macs });

    } catch (err) {
        console.error('List blocked MACs error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== WHITELIST MAC ADDRESS ====================
router.post('/whitelist-mac', verifyToken, async (req, res) => {
    const { macAddress, note } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!macAddress) {
        return res.status(400).json({ error: 'MAC address required' });
    }

    try {
        await ensurePolicyTables();
        const scope = await getAdminScope(req.admin.id);
        const vendorId = scope.isSuperAdmin ? await getDefaultVendorId() : scope.vendorId;
        const mac = normalizeMac(macAddress);
        if (!mac) return res.status(400).json({ error: 'Invalid MAC address' });

        await db.execute(
            'INSERT INTO whitelisted_macs (vendor_id, mac_address, note, added_by) VALUES (?, ?, ?, ?)',
            [vendorId, mac, note || 'Whitelisted by admin', req.admin.id]
        );

        await logActivity(req.admin.id, 'MAC_WHITELISTED', { mac, note }, ip);

        res.json({
            success: true,
            message: `MAC ${mac} has been whitelisted`
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'MAC address already whitelisted' });
        }
        console.error('Whitelist MAC error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== UNWHITELIST MAC ADDRESS ====================
router.post('/unwhitelist-mac', verifyToken, async (req, res) => {
    const { macAddress } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!macAddress) {
        return res.status(400).json({ error: 'MAC address required' });
    }

    try {
        await ensurePolicyTables();
        const scope = await getAdminScope(req.admin.id);
        const vendorId = scope.isSuperAdmin ? await getDefaultVendorId() : scope.vendorId;
        const mac = normalizeMac(macAddress);
        if (!mac) return res.status(400).json({ error: 'Invalid MAC address' });

        await db.execute('DELETE FROM whitelisted_macs WHERE vendor_id = ? AND mac_address = ?', [vendorId, mac]);
        await logActivity(req.admin.id, 'MAC_UNWHITELISTED', { mac }, ip);

        res.json({
            success: true,
            message: `MAC ${mac} removed from whitelist`
        });
    } catch (err) {
        console.error('Unwhitelist MAC error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== LIST WHITELISTED MACS ====================
router.get('/whitelisted-macs', verifyToken, async (req, res) => {
    try {
        await ensurePolicyTables();
        const scope = await getAdminScope(req.admin.id);
        const params = [];
        let whereClause = '';
        if (!scope.isSuperAdmin) {
            whereClause = 'WHERE wm.vendor_id = ?';
            params.push(scope.vendorId);
        }
        const [macs] = await db.query(`
            SELECT wm.*, au.username as added_by_name
            FROM whitelisted_macs wm
            LEFT JOIN admin_users au ON wm.added_by = au.id
            ${whereClause}
            ORDER BY wm.added_at DESC
        `, params);

        res.json({ success: true, whitelistedMacs: macs });
    } catch (err) {
        console.error('List whitelisted MACs error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== MANUALLY ADD USER ====================
router.post('/add', verifyToken, async (req, res) => {
    const { phoneNumber, macAddress, planId, durationMinutes } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Validation
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!planId && !durationMinutes) {
        return res.status(400).json({ error: 'Plan ID or duration is required' });
    }

    try {
        const scope = await getAdminScope(req.admin.id);
        const vendorId = scope.isSuperAdmin ? await getDefaultVendorId() : scope.vendorId;
        // Get plan details if planId provided
        let duration = durationMinutes;
        let planName = 'Manual';
        let speedLimit = '5M';

        if (planId) {
            const [plans] = await db.query(
                `SELECT * FROM plans WHERE id = ?${scope.isSuperAdmin ? '' : ' AND vendor_id = ?'}`,
                scope.isSuperAdmin ? [planId] : [planId, vendorId]
            );
            if (plans.length === 0) {
                return res.status(404).json({ error: 'Plan not found' });
            }
            duration = plans[0].duration_minutes;
            planName = plans[0].name;
            speedLimit = plans[0].speed_limit_down || '5M';
        }

        // Generate access token
        const token = require('crypto').randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + duration * 60 * 1000);
        const normalizedMac = macAddress ? normalizeMac(macAddress) : null;
        if (macAddress && !normalizedMac) {
            return res.status(400).json({ error: 'Invalid MAC address' });
        }
        const mac = normalizedMac || 'MANUAL-' + Date.now();

        // Check if MAC already has active session
        if (macAddress) {
            const [existing] = await db.query(
                'SELECT id FROM access_tokens WHERE vendor_id = ? AND mac_address = ? AND status = ? AND expires_at > NOW()',
                [vendorId, mac, 'ACTIVE']
            );
            if (existing.length > 0) {
                return res.status(400).json({ error: 'This MAC address already has an active session' });
            }
        }

        // Create access token
        const [result] = await db.execute(
            'INSERT INTO access_tokens (token, phone_number, mac_address, plan_id, expires_at, status, vendor_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [token, phoneNumber, mac, planId || 1, expiresAt, 'ACTIVE', vendorId]
        );

        // Create RADIUS user
        const [userCheck] = await db.query('SELECT id FROM radcheck WHERE username = ?', [phoneNumber]);

        if (userCheck.length === 0) {
            await db.execute(
                "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
                [phoneNumber, phoneNumber]
            );
        }

        // Set session timeout in RADIUS
        await db.execute('DELETE FROM radreply WHERE username = ?', [phoneNumber]);
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', '=', ?)",
            [phoneNumber, String(duration * 60)]
        );

        // Set speed limit
        await db.execute(
            "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)",
            [phoneNumber, `${speedLimit}/${speedLimit}`]
        );

        await logActivity(req.admin.id, 'USER_MANUAL_ADD', {
            phone: phoneNumber,
            mac: mac,
            plan: planName,
            duration: duration,
            expiresAt: expiresAt.toISOString()
        }, ip);

        res.json({
            success: true,
            message: 'User added successfully',
            user: {
                id: result.insertId,
                phone_number: phoneNumber,
                mac_address: mac,
                plan_name: planName,
                expires_at: expiresAt,
                token
            }
        });

    } catch (err) {
        console.error('Add user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== DELETE USER RECORD ====================
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        const scope = await getAdminScope(req.admin.id);
        const [users] = await db.query(
            `SELECT * FROM access_tokens WHERE id = ?${scope.isSuperAdmin ? '' : ' AND vendor_id = ?'}`,
            scope.isSuperAdmin ? [id] : [id, scope.vendorId]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];

        await db.execute('UPDATE access_tokens SET status = ? WHERE id = ?', ['REVOKED', id]);
        await db.execute('DELETE FROM radcheck WHERE username = ?', [user.phone_number]);
        await db.execute('DELETE FROM radcheck WHERE username = ?', [user.mac_address]);
        await db.execute('DELETE FROM radreply WHERE username = ?', [user.phone_number]);
        await db.execute('DELETE FROM radreply WHERE username = ?', [user.mac_address]);
        const coaResult = await disconnectRadiusSession({
            username: user.phone_number,
            macAddress: user.mac_address
        });

        await logActivity(req.admin.id, 'USER_DELETE', {
            userId: id,
            phone: user.phone_number,
            mac: user.mac_address
        }, ip);

        res.json({ success: true, message: 'User revoked and removed from RADIUS', coa: coaResult });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

