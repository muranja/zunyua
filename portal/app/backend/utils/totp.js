const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';

    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
}

function base32Decode(input) {
    const clean = String(input || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];

    for (const char of clean) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
}

function generateSecret(length = 20) {
    return base32Encode(crypto.randomBytes(length));
}

function hotp(secret, counter, digits = 6) {
    const key = base32Decode(secret);
    const ctr = Buffer.alloc(8);
    ctr.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    ctr.writeUInt32BE(counter & 0xffffffff, 4);
    const hmac = crypto.createHmac('sha1', key).update(ctr).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % (10 ** digits)).padStart(digits, '0');
}

function totp(secret, timeStep = 30, digits = 6, when = Date.now()) {
    const counter = Math.floor(Math.floor(when / 1000) / timeStep);
    return hotp(secret, counter, digits);
}

function verifyTotp(code, secret, { window = 1, timeStep = 30, digits = 6 } = {}) {
    const normalizedCode = String(code || '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) return false;

    const nowCounter = Math.floor(Math.floor(Date.now() / 1000) / timeStep);
    for (let i = -window; i <= window; i++) {
        if (hotp(secret, nowCounter + i, digits) === normalizedCode) {
            return true;
        }
    }
    return false;
}

function buildOtpAuthUri({ secret, accountName, issuer = 'TurboNet' }) {
    const label = encodeURIComponent(`${issuer}:${accountName}`);
    const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: '6',
        period: '30'
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}

function generateBackupCodes(count = 10, length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const codes = [];
    for (let i = 0; i < count; i++) {
        let code = '';
        const bytes = crypto.randomBytes(length);
        for (let j = 0; j < length; j++) {
            code += chars[bytes[j] % chars.length];
        }
        // Format as XXXX-XXXX for readability
        if (length === 8) {
            code = code.substring(0, 4) + '-' + code.substring(4);
        }
        codes.push(code);
    }
    return codes;
}

module.exports = {
    generateSecret,
    totp,
    verifyTotp,
    buildOtpAuthUri,
    generateBackupCodes
};
