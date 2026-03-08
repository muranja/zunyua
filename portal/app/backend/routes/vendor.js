const express = require('express');
const router = express.Router();
const db = require('../db');
const { vendorApiKeyAuth } = require('../middleware/vendorApiKeyAuth');
const { normalizeMac } = require('../utils/generators');

router.get('/health', vendorApiKeyAuth('status:read'), async (req, res) => {
    res.json({
        success: true,
        vendorId: req.vendorId,
        key: req.vendorApiKey.keyPrefix,
        time: new Date().toISOString()
    });
});

router.get('/plans', vendorApiKeyAuth('status:read'), async (req, res) => {
    try {
        const [plans] = await db.query(
            'SELECT id, name, price, duration_minutes, speed_limit_down, speed_limit_up FROM plans WHERE vendor_id = ? ORDER BY price ASC',
            [req.vendorId]
        );
        res.json({ success: true, plans });
    } catch (err) {
        console.error('Vendor plans error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/status', vendorApiKeyAuth('status:read'), async (req, res) => {
    const mac = normalizeMac(req.query.mac);
    if (!mac) return res.status(400).json({ error: 'Valid MAC address required' });

    try {
        const [rows] = await db.query(
            `
            SELECT at.id, at.phone_number, at.expires_at, p.name as plan_name
            FROM access_tokens at
            LEFT JOIN plans p ON at.plan_id = p.id
            WHERE at.vendor_id = ?
              AND at.mac_address = ?
              AND at.status = 'ACTIVE'
              AND at.expires_at > NOW()
            ORDER BY at.expires_at DESC
            LIMIT 1
            `,
            [req.vendorId, mac]
        );
        if (rows.length === 0) {
            return res.json({ success: true, active: false });
        }
        res.json({
            success: true,
            active: true,
            session: rows[0]
        });
    } catch (err) {
        console.error('Vendor status error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/analytics/overview', vendorApiKeyAuth('analytics:read'), async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days || '30', 10), 1), 365);
    try {
        const [txRows] = await db.query(
            `
            SELECT
                COUNT(*) as total_tx,
                SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx,
                SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as failed_tx,
                COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END), 0) as revenue
            FROM transactions
            WHERE vendor_id = ?
              AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            `,
            [req.vendorId, days]
        );
        const [activeRows] = await db.query(
            `SELECT COUNT(*) as active_users
             FROM access_tokens
             WHERE vendor_id = ?
               AND status = 'ACTIVE'
               AND expires_at > NOW()`,
            [req.vendorId]
        );

        res.json({
            success: true,
            vendorId: req.vendorId,
            days,
            metrics: {
                totalTx: Number(txRows[0]?.total_tx || 0),
                completedTx: Number(txRows[0]?.completed_tx || 0),
                failedTx: Number(txRows[0]?.failed_tx || 0),
                revenue: Number(txRows[0]?.revenue || 0),
                activeUsers: Number(activeRows[0]?.active_users || 0)
            }
        });
    } catch (err) {
        console.error('Vendor analytics overview error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
