const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'turbonet-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'turbonet-refresh-secret-change-in-production';

// Verify JWT Access Token
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Rate limiting middleware
const rateLimiter = async (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;

    try {
        // Clean old attempts
        await db.execute(
            'DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
        );

        // Count recent attempts
        const [rows] = await db.query(
            'SELECT COUNT(*) as count FROM login_attempts WHERE ip_address = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)',
            [ip]
        );

        if (rows[0].count >= maxAttempts) {
            return res.status(429).json({
                error: 'Too many login attempts. Please try again in 15 minutes.',
                retryAfter: 15 * 60
            });
        }

        next();
    } catch (err) {
        console.error('Rate limiter error:', err);
        next(); // Allow request on error
    }
};

// Log admin activity
const logActivity = async (adminId, action, details, ip) => {
    try {
        await db.execute(
            'INSERT INTO activity_log (admin_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
            [adminId, action, JSON.stringify(details), ip]
        );
    } catch (err) {
        console.error('Activity log error:', err);
    }
};

// Generate tokens
const generateTokens = (admin) => {
    const accessToken = jwt.sign(
        { id: admin.id, username: admin.username, role: admin.role },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
        { id: admin.id },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
};

module.exports = {
    verifyToken,
    rateLimiter,
    logActivity,
    generateTokens,
    JWT_SECRET,
    JWT_REFRESH_SECRET
};
