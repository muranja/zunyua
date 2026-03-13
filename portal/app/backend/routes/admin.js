const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { verifyToken, rateLimiter, logActivity, generateTokens, JWT_REFRESH_SECRET } = require('../middleware/auth');
const { generateVoucherCode } = require('../utils/generators');
const { generateSecret, verifyTotp, buildOtpAuthUri } = require('../utils/totp');
const { disconnectRadiusSession } = require('../utils/radiusCoa');
const { ensureSystemSettingsTable, getSettingsMap } = require('../utils/systemSettings');
const { notifyAdmin } = require('../utils/notifier');
const { getAdminScope } = require('../utils/vendorScope');
const { fetchActiveSessions, updateGlobalQueue, getMikroTikClient } = require('../utils/mikrotik');
const jwt = require('jsonwebtoken');

function validateStrongPassword(password) {
    const value = String(password || '');
    if (value.length < 12) return 'Password must be at least 12 characters';
    if (!/[A-Z]/.test(value)) return 'Password must include an uppercase letter';
    if (!/[a-z]/.test(value)) return 'Password must include a lowercase letter';
    if (!/[0-9]/.test(value)) return 'Password must include a number';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Password must include a special character';
    return null;
}

async function scopeFilter(req, alias = '') {
    const scope = await getAdminScope(req.admin.id);
    const prefix = alias ? `${alias}.` : '';
    if (scope.isSuperAdmin) {
        return { scope, clause: '', params: [] };
    }
    return { scope, clause: ` AND ${prefix}vendor_id = ?`, params: [scope.vendorId] };
}

async function assertSuperAdmin(req, res) {
    const scope = await getAdminScope(req.admin.id);
    if (!scope.isSuperAdmin) {
        res.status(403).json({ error: 'Super admin only' });
        return null;
    }
    return scope;
}

// ==================== AUTH ROUTES ====================

// Admin Login
router.post('/login', rateLimiter, async (req, res) => {
    const { username, password, otpCode } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        // Record login attempt
        await db.execute(
            'INSERT INTO login_attempts (ip_address, username) VALUES (?, ?)',
            [ip, username]
        );

        // Find admin
        const [admins] = await db.query(
            'SELECT * FROM admin_users WHERE username = ?',
            [username]
        );

        if (admins.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const admin = admins[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, admin.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (admin.totp_enabled) {
            if (!otpCode) {
                return res.status(401).json({ error: 'OTP code required', code: 'OTP_REQUIRED' });
            }
            const validOtp = verifyTotp(String(otpCode), admin.totp_secret);
            if (!validOtp) {
                return res.status(401).json({ error: 'Invalid OTP code', code: 'OTP_INVALID' });
            }
        }

        // Generate tokens
        const tokens = generateTokens(admin);

        // Store refresh token
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.execute(
            'INSERT INTO refresh_tokens (admin_id, token, expires_at) VALUES (?, ?, ?)',
            [admin.id, tokens.refreshToken, expiresAt]
        );

        // Update last login
        await db.execute(
            'UPDATE admin_users SET last_login = NOW() WHERE id = ?',
            [admin.id]
        );

        // Mark login success
        await db.execute(
            'UPDATE login_attempts SET success = TRUE WHERE ip_address = ? AND username = ? ORDER BY id DESC LIMIT 1',
            [ip, username]
        );

        // Log activity
        await logActivity(admin.id, 'LOGIN', { username }, ip);

        res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            admin: {
                id: admin.id,
                username: admin.username,
                role: admin.role,
                twoFactorEnabled: Boolean(admin.totp_enabled),
                vendorId: admin.vendor_id || null,
                isSuperAdmin: Boolean(admin.is_super_admin)
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/2fa/status', verifyToken, async (req, res) => {
    try {
        const [admins] = await db.query(
            'SELECT id, username, totp_enabled, totp_temp_secret FROM admin_users WHERE id = ?',
            [req.admin.id]
        );
        if (admins.length === 0) return res.status(404).json({ error: 'Admin not found' });

        return res.json({
            success: true,
            twoFactorEnabled: Boolean(admins[0].totp_enabled),
            setupPending: Boolean(admins[0].totp_temp_secret)
        });
    } catch (err) {
        console.error('2FA status error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/2fa/setup', verifyToken, async (req, res) => {
    try {
        const [admins] = await db.query(
            'SELECT id, username, totp_enabled FROM admin_users WHERE id = ?',
            [req.admin.id]
        );
        if (admins.length === 0) return res.status(404).json({ error: 'Admin not found' });

        if (admins[0].totp_enabled) {
            return res.status(400).json({ error: '2FA already enabled. Disable first to reconfigure.' });
        }

        const secret = generateSecret();
        const otpauthUri = buildOtpAuthUri({
            secret,
            accountName: admins[0].username,
            issuer: 'TurboNet'
        });

        await db.execute(
            'UPDATE admin_users SET totp_temp_secret = ? WHERE id = ?',
            [secret, req.admin.id]
        );

        return res.json({
            success: true,
            secret,
            otpauthUri
        });
    } catch (err) {
        console.error('2FA setup error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/2fa/enable', verifyToken, async (req, res) => {
    const { otpCode } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!otpCode) {
        return res.status(400).json({ error: 'OTP code required' });
    }

    try {
        const [admins] = await db.query(
            'SELECT id, username, totp_temp_secret FROM admin_users WHERE id = ?',
            [req.admin.id]
        );
        if (admins.length === 0) return res.status(404).json({ error: 'Admin not found' });
        if (!admins[0].totp_temp_secret) {
            return res.status(400).json({ error: '2FA setup not initialized. Start setup first.' });
        }

        const validOtp = verifyTotp(String(otpCode), admins[0].totp_temp_secret);
        if (!validOtp) return res.status(400).json({ error: 'Invalid OTP code' });

        await db.execute(
            'UPDATE admin_users SET totp_enabled = TRUE, totp_secret = totp_temp_secret, totp_temp_secret = NULL WHERE id = ?',
            [req.admin.id]
        );

        await logActivity(req.admin.id, '2FA_ENABLED', { username: admins[0].username }, ip);
        return res.json({ success: true, message: '2FA enabled' });
    } catch (err) {
        console.error('2FA enable error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/2fa/disable', verifyToken, async (req, res) => {
    const { otpCode } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!otpCode) {
        return res.status(400).json({ error: 'OTP code required' });
    }

    try {
        const [admins] = await db.query(
            'SELECT id, username, totp_enabled, totp_secret FROM admin_users WHERE id = ?',
            [req.admin.id]
        );
        if (admins.length === 0) return res.status(404).json({ error: 'Admin not found' });
        if (!admins[0].totp_enabled || !admins[0].totp_secret) {
            return res.status(400).json({ error: '2FA is not enabled' });
        }

        const validOtp = verifyTotp(String(otpCode), admins[0].totp_secret);
        if (!validOtp) return res.status(400).json({ error: 'Invalid OTP code' });

        await db.execute(
            'UPDATE admin_users SET totp_enabled = FALSE, totp_secret = NULL, totp_temp_secret = NULL WHERE id = ?',
            [req.admin.id]
        );
        await logActivity(req.admin.id, '2FA_DISABLED', { username: admins[0].username }, ip);

        return res.json({ success: true, message: '2FA disabled' });
    } catch (err) {
        console.error('2FA disable error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/password/change', verifyToken, async (req, res) => {
    const { currentPassword, newPassword, otpCode } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const passwordError = validateStrongPassword(newPassword);
    if (passwordError) {
        return res.status(400).json({ error: passwordError });
    }

    try {
        const [admins] = await db.query(
            'SELECT id, username, password_hash, totp_enabled, totp_secret FROM admin_users WHERE id = ?',
            [req.admin.id]
        );
        if (admins.length === 0) return res.status(404).json({ error: 'Admin not found' });

        const admin = admins[0];
        const validCurrent = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!validCurrent) return res.status(401).json({ error: 'Current password is invalid' });

        if (admin.totp_enabled) {
            if (!otpCode) {
                return res.status(400).json({ error: 'OTP code required for password change' });
            }
            const validOtp = verifyTotp(String(otpCode), admin.totp_secret);
            if (!validOtp) return res.status(401).json({ error: 'Invalid OTP code' });
        }

        const samePassword = await bcrypt.compare(newPassword, admin.password_hash);
        if (samePassword) {
            return res.status(400).json({ error: 'New password must be different from current password' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await db.execute('UPDATE admin_users SET password_hash = ? WHERE id = ?', [newHash, req.admin.id]);

        // Optional: revoke other sessions by clearing all refresh tokens for this admin.
        await db.execute('DELETE FROM refresh_tokens WHERE admin_id = ?', [req.admin.id]);

        await logActivity(req.admin.id, 'PASSWORD_CHANGE', { username: admin.username }, ip);
        return res.json({ success: true, message: 'Password updated. Please login again.' });
    } catch (err) {
        console.error('Password change error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Refresh Token
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required' });
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

        // Check if token exists in DB
        const [tokens] = await db.query(
            'SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
            [refreshToken]
        );

        if (tokens.length === 0) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        // Get admin
        const [admins] = await db.query(
            'SELECT * FROM admin_users WHERE id = ?',
            [decoded.id]
        );

        if (admins.length === 0) {
            return res.status(401).json({ error: 'Admin not found' });
        }

        // Generate new access token
        const newTokens = generateTokens(admins[0]);

        res.json({
            accessToken: newTokens.accessToken
        });

    } catch (err) {
        console.error('Refresh error:', err);
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// Logout
router.post('/logout', verifyToken, async (req, res) => {
    const { refreshToken } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        // Delete refresh token
        await db.execute('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

        await logActivity(req.admin.id, 'LOGOUT', {}, ip);

        res.json({ success: true });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== STATS ROUTES ====================

router.get('/stats', verifyToken, async (req, res) => {
    try {
        const scoped = await scopeFilter(req);
        // Today's revenue
        const [todayRevenue] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions 
            WHERE status = 'COMPLETED' AND DATE(completed_at) = CURDATE()${scoped.clause}
        `, scoped.params);

        // This week's revenue
        const [weekRevenue] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions 
            WHERE status = 'COMPLETED' AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)${scoped.clause}
        `, scoped.params);

        // This month's revenue
        const [monthRevenue] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM transactions 
            WHERE status = 'COMPLETED' AND MONTH(completed_at) = MONTH(NOW()) AND YEAR(completed_at) = YEAR(NOW())${scoped.clause}
        `, scoped.params);

        // Active users (access tokens not expired)
        const [activeUsers] = await db.query(`
            SELECT COUNT(*) as count 
            FROM access_tokens 
            WHERE status = 'ACTIVE' AND expires_at > NOW()${scoped.clause}
        `, scoped.params);

        // Voucher stats
        const [voucherStats] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'REDEEMED' THEN 1 ELSE 0 END) as redeemed
            FROM vouchers
            WHERE 1=1${scoped.clause}
        `, scoped.params);

        // Recent transactions
        const [recentTx] = await db.query(`
            SELECT t.*, p.name as plan_name 
            FROM transactions t
            LEFT JOIN plans p ON t.plan_id = p.id
            WHERE 1=1${scoped.clause ? scoped.clause.replace('vendor_id', 't.vendor_id') : ''}
            ORDER BY t.created_at DESC 
            LIMIT 10
        `, scoped.params);

        res.json({
            revenue: {
                today: todayRevenue[0].total,
                week: weekRevenue[0].total,
                month: monthRevenue[0].total
            },
            activeUsers: activeUsers[0].count,
            vouchers: {
                total: voucherStats[0].total || 0,
                active: voucherStats[0].active || 0,
                redeemed: voucherStats[0].redeemed || 0
            },
            recentTransactions: recentTx
        });

    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== ADVANCED ANALYTICS ====================

router.get('/analytics/overview', verifyToken, async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
    try {
        const scoped = await scopeFilter(req, 't');
        const [kpiRows] = await db.query(
            `
            SELECT
                COALESCE(SUM(CASE WHEN t.status='COMPLETED' THEN t.amount ELSE 0 END), 0) as revenue,
                SUM(CASE WHEN t.status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx,
                SUM(CASE WHEN t.status='FAILED' THEN 1 ELSE 0 END) as failed_tx,
                SUM(CASE WHEN t.status='PENDING' THEN 1 ELSE 0 END) as pending_tx
            FROM transactions t
            WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${scoped.clause}
            `,
            [days, ...scoped.params]
        );

        const [activeRows] = await db.query(
            `SELECT COUNT(*) as active_users FROM access_tokens WHERE status='ACTIVE' AND expires_at > NOW()${scoped.clause ? scoped.clause.replace('t.', '') : ''}`,
            scoped.params
        );
        const [policyRows] = await db.query(
            `
            SELECT
                (SELECT COUNT(*) FROM blocked_macs${scoped.scope.isSuperAdmin ? '' : ' WHERE vendor_id = ?'}) as blocked_macs,
                (SELECT COUNT(*) FROM whitelisted_macs${scoped.scope.isSuperAdmin ? '' : ' WHERE vendor_id = ?'}) as whitelisted_macs
            `,
            scoped.scope.isSuperAdmin ? [] : [scoped.scope.vendorId, scoped.scope.vendorId]
        );
        const [attemptRows] = await db.query(
            `
            SELECT
                SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful_recovery,
                SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END) as failed_recovery
            FROM receipt_recovery_attempts
            WHERE attempted_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            `,
            [days]
        );

        const completed = Number(kpiRows[0]?.completed_tx || 0);
        const failed = Number(kpiRows[0]?.failed_tx || 0);
        const totalFinalized = completed + failed;
        const conversionRate = totalFinalized > 0 ? (completed / totalFinalized) * 100 : 0;
        const arpu = completed > 0 ? Number(kpiRows[0]?.revenue || 0) / completed : 0;

        res.json({
            days,
            kpis: {
                revenue: Number(kpiRows[0]?.revenue || 0),
                completedTx: completed,
                failedTx: failed,
                pendingTx: Number(kpiRows[0]?.pending_tx || 0),
                activeUsers: Number(activeRows[0]?.active_users || 0),
                conversionRate: Number(conversionRate.toFixed(2)),
                arpu: Number(arpu.toFixed(2)),
                blockedMacs: Number(policyRows[0]?.blocked_macs || 0),
                whitelistedMacs: Number(policyRows[0]?.whitelisted_macs || 0),
                recoverySuccess: Number(attemptRows[0]?.successful_recovery || 0),
                recoveryFailed: Number(attemptRows[0]?.failed_recovery || 0)
            }
        });
    } catch (err) {
        console.error('Analytics overview error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/analytics/revenue-series', verifyToken, async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
    try {
        const scoped = await scopeFilter(req);
        const [rows] = await db.query(
            `
            SELECT DATE(created_at) as day,
                   COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END),0) as revenue,
                   SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx
            FROM transactions
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${scoped.clause}
            GROUP BY DATE(created_at)
            ORDER BY day ASC
            `,
            [days, ...scoped.params]
        );
        res.json({ days, series: rows });
    } catch (err) {
        console.error('Analytics revenue series error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/analytics/plan-performance', verifyToken, async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
    try {
        const scoped = await scopeFilter(req, 't');
        const planScope = scoped.scope.isSuperAdmin ? '' : ' WHERE p.vendor_id = ?';
        const [rows] = await db.query(
            `
            SELECT
                p.id,
                p.name,
                p.price,
                COUNT(t.id) as tx_count,
                COALESCE(SUM(CASE WHEN t.status='COMPLETED' THEN t.amount ELSE 0 END),0) as revenue,
                SUM(CASE WHEN t.status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx
            FROM plans p
            LEFT JOIN transactions t
                ON t.plan_id = p.id
               AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${scoped.clause}
            ${planScope}
            GROUP BY p.id, p.name, p.price
            ORDER BY revenue DESC, tx_count DESC
            `,
            [days, ...scoped.params, ...(scoped.scope.isSuperAdmin ? [] : [scoped.scope.vendorId])]
        );
        res.json({ days, plans: rows });
    } catch (err) {
        console.error('Analytics plan performance error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/analytics/device-insights', verifyToken, async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
    try {
        const scoped = await scopeFilter(req);
        const [rows] = await db.query(
            `
            SELECT
                mac_address,
                COUNT(*) as purchases,
                COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END), 0) as revenue
            FROM transactions
            WHERE mac_address IS NOT NULL
              AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${scoped.clause}
            GROUP BY mac_address
            ORDER BY purchases DESC, revenue DESC
            LIMIT 20
            `,
            [days, ...scoped.params]
        );
        res.json({ days, devices: rows });
    } catch (err) {
        console.error('Analytics device insights error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/analytics/reconciliation', verifyToken, async (req, res) => {
    const date = req.query.date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
        const scoped = await scopeFilter(req);
        const [txRows] = await db.query(
            `
            SELECT
                COUNT(*) as total_tx,
                SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx,
                SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as failed_tx,
                COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END), 0) as completed_revenue
            FROM transactions
            WHERE DATE(created_at) = ?${scoped.clause}
            `,
            [date, ...scoped.params]
        );
        const [tokenRows] = await db.query(
            `SELECT COUNT(*) as tokens_created FROM access_tokens WHERE DATE(created_at) = ?${scoped.clause}`,
            [date, ...scoped.params]
        );
        const result = {
            date,
            totalTx: Number(txRows[0]?.total_tx || 0),
            completedTx: Number(txRows[0]?.completed_tx || 0),
            failedTx: Number(txRows[0]?.failed_tx || 0),
            completedRevenue: Number(txRows[0]?.completed_revenue || 0),
            tokensCreated: Number(tokenRows[0]?.tokens_created || 0)
        };
        result.mismatch = result.completedTx !== result.tokensCreated;
        result.mismatchDelta = result.completedTx - result.tokensCreated;

        res.json({ success: true, report: result });
    } catch (err) {
        console.error('Analytics reconciliation error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/analytics/vendors-performance', verifyToken, async (req, res) => {
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
        const [rows] = await db.query(
            `
            SELECT
                v.id,
                v.name,
                v.code,
                COUNT(DISTINCT t.id) as tx_count,
                COALESCE(SUM(CASE WHEN t.status='COMPLETED' THEN t.amount ELSE 0 END), 0) as revenue,
                (SELECT COUNT(*) FROM access_tokens at WHERE at.vendor_id = v.id AND at.status = 'ACTIVE' AND at.expires_at > NOW()) as active_users
            FROM vendors v
            LEFT JOIN transactions t
                ON t.vendor_id = v.id
               AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY v.id, v.name, v.code
            ORDER BY revenue DESC, tx_count DESC
            `,
            [days]
        );
        res.json({ success: true, days, vendors: rows });
    } catch (err) {
        console.error('Vendors performance error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== VOUCHER ROUTES ====================

// List vouchers with filters
router.get('/vouchers', verifyToken, async (req, res) => {
    const { status, code, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const scoped = await scopeFilter(req, 'v');
        let query = `
            SELECT v.*, p.name as plan_name, p.price as plan_price
            FROM vouchers v
            LEFT JOIN plans p ON v.plan_id = p.id
            WHERE 1=1
        `;
        const params = [...scoped.params];
        query += scoped.clause;

        if (status) {
            query += ' AND v.status = ?';
            params.push(status);
        }

        if (code) {
            query += ' AND v.code LIKE ?';
            params.push(`%${code}%`);
        }

        if (startDate) {
            query += ' AND v.created_at >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND v.created_at <= ?';
            params.push(endDate);
        }

        // Get total count
        const countQuery = query.replace('SELECT v.*, p.name as plan_name, p.price as plan_price', 'SELECT COUNT(*) as total');
        const [countResult] = await db.query(countQuery, params);

        // Add pagination
        query += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [vouchers] = await db.query(query, params);

        res.json({
            vouchers,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(countResult[0].total / limit)
            }
        });

    } catch (err) {
        console.error('Vouchers list error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Generate vouchers
router.post('/vouchers/generate', verifyToken, async (req, res) => {
    const { planId, count = 1, expiresInDays, vendorId } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!planId) {
        return res.status(400).json({ error: 'Plan ID required' });
    }

    if (count > 100) {
        return res.status(400).json({ error: 'Maximum 100 vouchers at a time' });
    }

    try {
        const scoped = await scopeFilter(req);
        const targetVendorId = scoped.scope.isSuperAdmin ? (vendorId || null) : scoped.scope.vendorId;
        // Verify plan exists in caller scope
        const [plans] = await db.query(
            `SELECT * FROM plans WHERE id = ?${scoped.clause ? scoped.clause.replace('vendor_id', 'plans.vendor_id') : ''}`,
            [planId, ...scoped.params]
        );
        if (plans.length === 0) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        const vouchers = [];
        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null;

        for (let i = 0; i < count; i++) {
            const code = generateVoucherCode();

            await db.execute(
                'INSERT INTO vouchers (code, plan_id, vendor_id, expires_at, created_by) VALUES (?, ?, ?, ?, ?)',
                [code, planId, targetVendorId, expiresAt, req.admin.id]
            );

            vouchers.push({
                code,
                planName: plans[0].name,
                planPrice: plans[0].price,
                expiresAt
            });
        }

        // Log activity
        await logActivity(req.admin.id, 'VOUCHER_GENERATE', {
            planId,
            count,
            codes: vouchers.map(v => v.code)
        }, ip);

        res.json({
            success: true,
            vouchers
        });

    } catch (err) {
        console.error('Generate vouchers error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Revoke voucher
router.post('/vouchers/:id/revoke', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ip = req.ip || req.connection.remoteAddress;

    try {
        const scoped = await scopeFilter(req);
        const [vouchers] = await db.query(
            `SELECT * FROM vouchers WHERE id = ?${scoped.clause}`,
            [id, ...scoped.params]
        );

        if (vouchers.length === 0) {
            return res.status(404).json({ error: 'Voucher not found' });
        }

        if (vouchers[0].status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Can only revoke active vouchers' });
        }

        await db.execute('UPDATE vouchers SET status = ? WHERE id = ?', ['REVOKED', id]);

        await logActivity(req.admin.id, 'VOUCHER_REVOKE', {
            voucherId: id,
            code: vouchers[0].code
        }, ip);

        res.json({ success: true });

    } catch (err) {
        console.error('Revoke voucher error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== ACTIVITY LOG ====================

router.get('/activity', verifyToken, async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    try {
        const scope = await getAdminScope(req.admin.id);
        const activityWhere = scope.isSuperAdmin ? '' : 'WHERE u.vendor_id = ?';
        const activityParams = scope.isSuperAdmin ? [] : [scope.vendorId];
        const [activities] = await db.query(`
            SELECT a.*, u.username 
            FROM activity_log a
            LEFT JOIN admin_users u ON a.admin_id = u.id
            ${activityWhere}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        `, [...activityParams, parseInt(limit), offset]);

        const [countResult] = await db.query(
            `
            SELECT COUNT(*) as total
            FROM activity_log a
            LEFT JOIN admin_users u ON a.admin_id = u.id
            ${scope.isSuperAdmin ? '' : 'WHERE u.vendor_id = ?'}
            `,
            scope.isSuperAdmin ? [] : [scope.vendorId]
        );

        res.json({
            activities,
            pagination: {
                total: countResult[0].total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (err) {
        console.error('Activity log error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== PLANS ====================

router.get('/plans', verifyToken, async (req, res) => {
    try {
        const scoped = await scopeFilter(req);
        const [plans] = await db.query(
            `SELECT * FROM plans WHERE 1=1${scoped.clause} ORDER BY price ASC`,
            scoped.params
        );
        res.json(plans);
    } catch (err) {
        console.error('Plans error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/plans', verifyToken, async (req, res) => {
    const { name, price, durationMinutes, speedLimitDown = '3M', speedLimitUp = '2M', vendorId } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!name || !price || !durationMinutes) {
        return res.status(400).json({ error: 'name, price and durationMinutes are required' });
    }

    try {
        const scope = await getAdminScope(req.admin.id);
        const targetVendorId = scope.isSuperAdmin ? (vendorId || 1) : scope.vendorId;
        const [result] = await db.execute(
            `INSERT INTO plans (name, price, duration_minutes, speed_limit_down, speed_limit_up, vendor_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, Number(price), Number(durationMinutes), speedLimitDown, speedLimitUp, targetVendorId]
        );
        await logActivity(req.admin.id, 'PLAN_CREATE', { planId: result.insertId, name }, ip);
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Create plan error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/plans/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { name, price, durationMinutes, speedLimitDown, speedLimitUp } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const scoped = await scopeFilter(req);
        await db.execute(
            `UPDATE plans
             SET name = COALESCE(?, name),
                 price = COALESCE(?, price),
                 duration_minutes = COALESCE(?, duration_minutes),
                 speed_limit_down = COALESCE(?, speed_limit_down),
                 speed_limit_up = COALESCE(?, speed_limit_up)
             WHERE id = ?${scoped.clause}`,
            [
                name || null,
                price !== undefined ? Number(price) : null,
                durationMinutes !== undefined ? Number(durationMinutes) : null,
                speedLimitDown || null,
                speedLimitUp || null,
                id,
                ...scoped.params
            ]
        );
        await logActivity(req.admin.id, 'PLAN_UPDATE', { planId: id }, ip);
        res.json({ success: true });
    } catch (err) {
        console.error('Update plan error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/plans/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const scoped = await scopeFilter(req);
        const [usageRows] = await db.query(
            `SELECT COUNT(*) as c FROM access_tokens WHERE plan_id = ?${scoped.clause}`,
            [id, ...scoped.params]
        );
        if (usageRows[0].c > 0) {
            return res.status(400).json({ error: 'Cannot delete plan that has usage history' });
        }

        await db.execute(
            `DELETE FROM plans WHERE id = ?${scoped.clause}`,
            [id, ...scoped.params]
        );
        await logActivity(req.admin.id, 'PLAN_DELETE', { planId: id }, ip);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete plan error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/vendors', verifyToken, async (req, res) => {
    try {
        const scope = await getAdminScope(req.admin.id);
        if (!scope.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
        const [rows] = await db.query('SELECT * FROM vendors ORDER BY created_at DESC');
        res.json({ success: true, vendors: rows });
    } catch (err) {
        console.error('List vendors error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/vendors', verifyToken, async (req, res) => {
    const { name, code, domain, primaryColor, secondaryColor, logoUrl, portalTitle } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    if (!name) return res.status(400).json({ error: 'Vendor name is required' });
    try {
        const scope = await getAdminScope(req.admin.id);
        if (!scope.isSuperAdmin) return res.status(403).json({ error: 'Super admin only' });
        const [result] = await db.execute(
            'INSERT INTO vendors (name, code, status, domain, primary_color, secondary_color, logo_url, portal_title) VALUES (?, ?, "ACTIVE", ?, ?, ?, ?, ?)',
            [name, code || null, domain || null, primaryColor || '#007bff', secondaryColor || '#6c757d', logoUrl || null, portalTitle || null]
        );
        await logActivity(req.admin.id, 'VENDOR_CREATE', { vendorId: result.insertId, name }, ip);
        res.json({ success: true, vendorId: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Vendor code or domain already exists' });
        console.error('Create vendor error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/vendors/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { name, code, status, domain, primaryColor, secondaryColor, logoUrl, portalTitle } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const scope = await getAdminScope(req.admin.id);
        if (!scope.isSuperAdmin && String(scope.vendorId) !== String(id)) {
            return res.status(403).json({ error: 'Not authorized for this vendor' });
        }
        await db.execute(
            'UPDATE vendors SET name=?, code=?, status=COALESCE(?, status), domain=?, primary_color=?, secondary_color=?, logo_url=?, portal_title=? WHERE id=?',
            [name, code || null, status || null, domain || null, primaryColor || '#007bff', secondaryColor || '#6c757d', logoUrl || null, portalTitle || null, id]
        );
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Vendor code or domain already exists' });
        console.error('Update vendor error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/vendor/me', verifyToken, async (req, res) => {
    try {
        const scope = await getAdminScope(req.admin.id);
        const [rows] = await db.query('SELECT * FROM vendors WHERE id = ?', [scope.vendorId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
        res.json({ success: true, vendor: rows[0] });
    } catch (err) {
        console.error('Get my vendor error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/vendors/:id/admins', verifyToken, async (req, res) => {
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT id, username, role, vendor_id, is_super_admin, created_at, last_login
             FROM admin_users
             WHERE vendor_id = ?
             ORDER BY created_at DESC`,
            [id]
        );
        res.json({ success: true, admins: rows });
    } catch (err) {
        console.error('List vendor admins error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/vendors/:id/admins', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { username, password, role = 'staff' } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required' });
    }
    const roleSafe = ['admin', 'staff'].includes(role) ? role : 'staff';

    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;

        const [vendors] = await db.query('SELECT id FROM vendors WHERE id = ? LIMIT 1', [id]);
        if (vendors.length === 0) return res.status(404).json({ error: 'Vendor not found' });

        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await db.execute(
            `INSERT INTO admin_users (username, password_hash, role, vendor_id, is_super_admin)
             VALUES (?, ?, ?, ?, FALSE)`,
            [username, passwordHash, roleSafe, id]
        );

        await logActivity(req.admin.id, 'VENDOR_ADMIN_CREATE', {
            vendorId: Number(id),
            adminId: result.insertId,
            username,
            role: roleSafe
        }, ip);

        res.json({
            success: true,
            admin: { id: result.insertId, username, role: roleSafe, vendorId: Number(id), isSuperAdmin: false }
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Username already exists' });
        console.error('Create vendor admin error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== SYSTEM CONTROL ====================

router.get('/system/settings', verifyToken, async (req, res) => {
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        await ensureSystemSettingsTable();
        const settings = await getSettingsMap();
        res.json({ success: true, settings });
    } catch (err) {
        console.error('System settings error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/system/settings', verifyToken, async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const allowedKeys = [
        'sales_enabled',
        'maintenance_mode',
        'allow_receipt_recovery',
        'max_stk_attempts_10m',
        'notifications_enabled',
        'telegram_enabled',
        'telegram_bot_token',
        'telegram_chat_id',
        'alert_webhook_url'
    ];
    const updates = req.body || {};

    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        await ensureSystemSettingsTable();
        for (const [key, rawValue] of Object.entries(updates)) {
            if (!allowedKeys.includes(key)) continue;
            await db.execute(
                `INSERT INTO system_settings (setting_key, setting_value, updated_by)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
                [key, String(rawValue), req.admin.id]
            );
        }
        await logActivity(req.admin.id, 'SYSTEM_SETTINGS_UPDATE', updates, ip);
        await notifyAdmin('SYSTEM_SETTINGS_UPDATED', {
            by: req.admin.username,
            keys: Object.keys(updates || {})
        });
        const settings = await getSettingsMap();
        res.json({ success: true, settings });
    } catch (err) {
        console.error('Update system settings error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/system/cleanup', verifyToken, async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const [expireResult] = await db.execute(
            'UPDATE access_tokens SET status = "EXPIRED" WHERE status = "ACTIVE" AND expires_at <= NOW()'
        );
        const [pendingResult] = await db.execute(
            'UPDATE transactions SET status = "FAILED" WHERE status = "PENDING" AND created_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)'
        );

        const summary = {
            expiredTokens: expireResult.affectedRows || 0,
            failedPendingTransactions: pendingResult.affectedRows || 0
        };
        await logActivity(req.admin.id, 'SYSTEM_CLEANUP', summary, ip);
        await notifyAdmin('SYSTEM_CLEANUP_EXECUTED', {
            by: req.admin.username,
            ...summary
        });
        res.json({ success: true, summary });
    } catch (err) {
        console.error('System cleanup error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/system/disconnect-all', verifyToken, async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const [users] = await db.query(
            'SELECT id, phone_number, mac_address FROM access_tokens WHERE status="ACTIVE" AND expires_at > NOW() LIMIT 1000'
        );

        await db.execute('UPDATE access_tokens SET status = "REVOKED" WHERE status="ACTIVE" AND expires_at > NOW()');

        let coaAttempts = 0;
        let coaSuccess = 0;
        for (const user of users) {
            await db.execute('DELETE FROM radcheck WHERE username = ?', [user.phone_number]);
            await db.execute('DELETE FROM radcheck WHERE username = ?', [user.mac_address]);
            await db.execute('DELETE FROM radreply WHERE username = ?', [user.phone_number]);
            await db.execute('DELETE FROM radreply WHERE username = ?', [user.mac_address]);

            const coa = await disconnectRadiusSession({
                username: user.phone_number,
                macAddress: user.mac_address
            });
            if (coa.attempted) {
                coaAttempts += 1;
                if (coa.successCount > 0) coaSuccess += 1;
            }
        }

        const summary = { usersProcessed: users.length, coaAttempts, coaSuccess };
        await logActivity(req.admin.id, 'SYSTEM_DISCONNECT_ALL', summary, ip);
        await notifyAdmin('SYSTEM_DISCONNECT_ALL_EXECUTED', {
            by: req.admin.username,
            ...summary
        });
        res.json({ success: true, summary });
    } catch (err) {
        console.error('Disconnect all error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/system/test-alert', verifyToken, async (req, res) => {
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const result = await notifyAdmin('TEST_ALERT', {
            by: req.admin.username,
            at: new Date().toISOString()
        });
        res.json({ success: true, result });
    } catch (err) {
        console.error('Test alert error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/system/run-reconciliation', verifyToken, async (req, res) => {
    const date = req.body?.date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const scoped = await scopeFilter(req);
        const [txRows] = await db.query(
            `
            SELECT
                COUNT(*) as total_tx,
                SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx,
                SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as failed_tx,
                COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END), 0) as completed_revenue
            FROM transactions
            WHERE DATE(created_at) = ?${scoped.clause}
            `,
            [date, ...scoped.params]
        );
        const [tokenRows] = await db.query(
            `SELECT COUNT(*) as tokens_created FROM access_tokens WHERE DATE(created_at) = ?${scoped.clause}`,
            [date, ...scoped.params]
        );
        const report = {
            date,
            totalTx: Number(txRows[0]?.total_tx || 0),
            completedTx: Number(txRows[0]?.completed_tx || 0),
            failedTx: Number(txRows[0]?.failed_tx || 0),
            completedRevenue: Number(txRows[0]?.completed_revenue || 0),
            tokensCreated: Number(tokenRows[0]?.tokens_created || 0)
        };
        report.mismatch = report.completedTx !== report.tokensCreated;
        report.mismatchDelta = report.completedTx - report.tokensCreated;

        await logActivity(req.admin.id, 'RECONCILIATION_RUN', report, ip);
        await notifyAdmin('MANUAL_RECONCILIATION_RUN', { by: req.admin.username, ...report });

        res.json({ success: true, report });
    } catch (err) {
        console.error('Run reconciliation error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/system/health', verifyToken, async (req, res) => {
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const [dbNow] = await db.query('SELECT NOW() as now');
        const [tableChecks] = await db.query(
            `
            SELECT
                (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'transactions') as has_transactions,
                (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'access_tokens') as has_access_tokens,
                (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'system_settings') as has_system_settings,
                (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'blocked_macs') as has_blocked_macs
            `
        );
        const settings = await getSettingsMap();
        res.json({
            success: true,
            checks: {
                db: true,
                dbTime: dbNow?.[0]?.now || null,
                tables: tableChecks?.[0] || {},
                coaEnabled: String(process.env.RADIUS_COA_ENABLED || '').toLowerCase() === 'true',
                coaHostsConfigured: Boolean(String(process.env.MIKROTIK_COA_HOSTS || '').trim()),
                mpesaConfigured: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_STK_URL),
                salesEnabled: String(settings.sales_enabled) === 'true',
                maintenanceMode: String(settings.maintenance_mode) === 'true'
            }
        });
    } catch (err) {
        console.error('System health error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/vendor/api-keys', verifyToken, async (req, res) => {
    try {
        const scope = await getAdminScope(req.admin.id);
        const [rows] = await db.query(
            `SELECT id, vendor_id, name, key_prefix, scopes, status, expires_at, last_used_at, created_at
             FROM vendor_api_keys
             WHERE vendor_id = ?
             ORDER BY created_at DESC`,
            [scope.vendorId]
        );
        res.json({ success: true, apiKeys: rows });
    } catch (err) {
        console.error('List vendor api keys error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/vendors/:id/api-keys', verifyToken, async (req, res) => {
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;
        const { id } = req.params;
        const [rows] = await db.query(
            `SELECT id, vendor_id, name, key_prefix, scopes, status, expires_at, last_used_at, created_at
             FROM vendor_api_keys
             WHERE vendor_id = ?
             ORDER BY created_at DESC`,
            [id]
        );
        res.json({ success: true, apiKeys: rows });
    } catch (err) {
        console.error('List vendor api keys (super) error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/vendors/:id/api-keys', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { name, scopes = ['status:read'], expiresAt = null } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;

        const [vendors] = await db.query('SELECT id FROM vendors WHERE id = ? LIMIT 1', [id]);
        if (vendors.length === 0) return res.status(404).json({ error: 'Vendor not found' });

        const rawKey = `vnd_${crypto.randomBytes(24).toString('hex')}`;
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const keyPrefix = rawKey.slice(0, 14);

        const [result] = await db.execute(
            `INSERT INTO vendor_api_keys (vendor_id, name, key_hash, key_prefix, scopes, expires_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, keyHash, keyPrefix, JSON.stringify(scopes), expiresAt || null, req.admin.id]
        );

        await logActivity(req.admin.id, 'VENDOR_API_KEY_CREATE', {
            vendorId: Number(id),
            keyId: result.insertId,
            name
        }, ip);

        res.json({
            success: true,
            apiKey: rawKey,
            keyMeta: {
                id: result.insertId,
                vendorId: Number(id),
                name,
                keyPrefix,
                scopes,
                expiresAt: expiresAt || null
            }
        });
    } catch (err) {
        console.error('Create vendor api key error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/vendors/:id/api-keys/:keyId', verifyToken, async (req, res) => {
    const { id, keyId } = req.params;
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const superScope = await assertSuperAdmin(req, res);
        if (!superScope) return;

        await db.execute(
            `UPDATE vendor_api_keys
             SET status = 'REVOKED'
             WHERE id = ? AND vendor_id = ?`,
            [keyId, id]
        );

        await logActivity(req.admin.id, 'VENDOR_API_KEY_REVOKE', {
            vendorId: Number(id),
            keyId: Number(keyId)
        }, ip);

        res.json({ success: true });
    } catch (err) {
        console.error('Revoke vendor api key error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
 
 // ==================== MIKROTIK ROUTER ROUTES ====================
 
 router.get('/router/settings', verifyToken, async (req, res) => {
     try {
         await assertSuperAdmin(req, res);
         const settings = await getSettingsMap();
         res.json({
             success: true,
             settings: {
                 host: settings.router_api_host || '',
                 port: settings.router_api_port || '8728',
                 user: settings.router_api_user || '',
                 tls: settings.router_api_tls === 'true',
                 globalLimitDown: settings.router_global_limit_down || '12M',
                 globalLimitUp: settings.router_global_limit_up || '12M',
                 dynamicLimiting: settings.router_dynamic_limiting === 'true'
             }
         });
     } catch (err) {
         console.error('Get router settings error:', err);
         res.status(500).json({ error: 'Server error' });
     }
 });
 
 router.put('/router/settings', verifyToken, async (req, res) => {
     try {
         await assertSuperAdmin(req, res);
         const { host, port, user, pass, tls, globalLimitDown, globalLimitUp, dynamicLimiting } = req.body;
 
         const queries = [];
         if (host !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_api_host', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [host, host]));
         if (port !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_api_port', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [port, port]));
         if (user !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_api_user', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [user, user]));
         if (pass !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_api_pass', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [pass, pass]));
         if (tls !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_api_tls', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [String(tls), String(tls)]));
         if (globalLimitDown !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_global_limit_down', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [globalLimitDown, globalLimitDown]));
         if (globalLimitUp !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_global_limit_up', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [globalLimitUp, globalLimitUp]));
         if (dynamicLimiting !== undefined) queries.push(db.execute("INSERT INTO system_settings (setting_key, setting_value) VALUES ('router_dynamic_limiting', ?) ON DUPLICATE KEY UPDATE setting_value = ?", [String(dynamicLimiting), String(dynamicLimiting)]));
 
         await Promise.all(queries);
 
         // If global limits changed, update MikroTik
         if (globalLimitDown || globalLimitUp) {
             try {
                 const settings = await getSettingsMap();
                 await updateGlobalQueue(
                     globalLimitDown || settings.router_global_limit_down || '12M',
                     globalLimitUp || settings.router_global_limit_up || '12M'
                 );
             } catch (mikrotikErr) {
                 console.warn('Settings saved but MikroTik update failed:', mikrotikErr.message);
             }
         }
 
         res.json({ success: true, message: 'Router settings updated' });
     } catch (err) {
         console.error('Update router settings error:', err);
         res.status(500).json({ error: 'Server error' });
     }
 });
 
 router.post('/router/test', verifyToken, async (req, res) => {
     try {
         await assertSuperAdmin(req, res);
         const client = await getMikroTikClient();
         await client.write('/system/identity/print');
         res.json({ success: true, message: 'Connection successful' });
     } catch (err) {
         res.status(500).json({ error: err.message || 'Connection failed' });
     }
 });
 
 router.get('/router/stats', verifyToken, async (req, res) => {
     try {
         const scope = await assertSuperAdmin(req, res);
         if (!scope) return;
 
         const sessions = await fetchActiveSessions();
         res.json({ success: true, sessions });
     } catch (err) {
         console.error('Fetch router stats error:', err);
         res.status(500).json({ error: 'Failed to fetch live stats from router' });
     }
 });

 router.post('/router/disconnect', verifyToken, async (req, res) => {
     try {
         const scope = await assertSuperAdmin(req, res);
         if (!scope) return;
         
         const { username, macAddress } = req.body;
         if (!username && !macAddress) {
             return res.status(400).json({ success: false, error: 'Username or MAC address is required' });
         }

         // Update DB token status if username provided
         if (username) {
             await db.execute(
                 "UPDATE access_tokens SET status = 'REVOKED' WHERE value = ? AND status = 'ACTIVE'",
                 [username]
             );
         }

         // Call MikroTik API directly
         const { disconnectHotspotUser } = require('../utils/mikrotik');
         const routerRes = await disconnectHotspotUser({ username, macAddress });

         if (routerRes && routerRes.success) {
             res.json({ success: true, message: 'User disconnected from network', ...routerRes });
         } else {
             // If we failed to talk to router but revoked in DB, we still "succeeded" partially
             res.json({ success: true, message: 'Token revoked, but router disconnect failed: ' + (routerRes ? routerRes.error : 'Unknown'), partiallyFailed: true });
         }
     } catch (err) {
         console.error('Router disconnect error:', err);
         res.status(500).json({ success: false, error: 'Failed to disconnect user from router' });
     }
 });
 
module.exports = router;
