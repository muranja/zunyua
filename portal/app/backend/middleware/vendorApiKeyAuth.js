const crypto = require('crypto');
const db = require('../db');

function readApiKey(req) {
    const headerKey = req.headers['x-api-key'];
    if (headerKey) return String(headerKey).trim();

    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        return auth.slice(7).trim();
    }
    return null;
}

function normalizeScopes(scopesRaw) {
    if (!scopesRaw) return [];
    if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s));
    if (typeof scopesRaw === 'string') {
        try {
            const parsed = JSON.parse(scopesRaw);
            if (Array.isArray(parsed)) return parsed.map((s) => String(s));
        } catch (_) {
            return scopesRaw.split(',').map((s) => s.trim()).filter(Boolean);
        }
    }
    return [];
}

function vendorApiKeyAuth(requiredScope = null) {
    return async (req, res, next) => {
        try {
            const rawKey = readApiKey(req);
            if (!rawKey) return res.status(401).json({ error: 'API key required' });

            const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
            const [rows] = await db.query(
                `SELECT *
                 FROM vendor_api_keys
                 WHERE key_hash = ?
                   AND status = 'ACTIVE'
                   AND (expires_at IS NULL OR expires_at > NOW())
                 LIMIT 1`,
                [keyHash]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired API key' });
            }

            const key = rows[0];
            const scopes = normalizeScopes(key.scopes);
            if (requiredScope && !scopes.includes('*') && !scopes.includes(requiredScope)) {
                return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
            }

            req.vendorId = key.vendor_id;
            req.vendorApiKey = {
                id: key.id,
                name: key.name,
                keyPrefix: key.key_prefix,
                scopes
            };

            await db.execute(
                'UPDATE vendor_api_keys SET last_used_at = NOW() WHERE id = ?',
                [key.id]
            );

            next();
        } catch (err) {
            console.error('Vendor API key auth error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    };
}

module.exports = {
    vendorApiKeyAuth
};
