const crypto = require('crypto');

// Generate cryptographically secure voucher code (Base32-like, 8 chars)
const generateVoucherCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: 0, O, 1, I
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
};

// Generate access token (32 char hex)
const generateAccessToken = () => {
    return crypto.randomBytes(16).toString('hex');
};

// Generate re-access code (16 char alphanumeric)
const generateReaccessCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(16);
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
};

// Format phone number to 254...
const formatPhoneNumber = (phone) => {
    let cleaned = phone.replace(/\s+/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.slice(1);
    } else if (cleaned.startsWith('+')) {
        cleaned = cleaned.slice(1);
    }
    return cleaned;
};

// Validate MAC address format
const isValidMac = (mac) => {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
};

// Normalize MAC address to uppercase with colons
const normalizeMac = (mac) => {
    if (!mac) return null;
    let decoded = mac;
    try {
        decoded = decodeURIComponent(decoded);
        if (decoded.includes('%')) decoded = decodeURIComponent(decoded);
        if (decoded.includes('%')) decoded = decodeURIComponent(decoded);
    } catch (e) { }
    return decoded.toUpperCase().replace(/-/g, ':');
};

module.exports = {
    generateVoucherCode,
    generateAccessToken,
    generateReaccessCode,
    formatPhoneNumber,
    isValidMac,
    normalizeMac
};
