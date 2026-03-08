#!/usr/bin/env node
const axios = require('axios');

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const adminUser = process.env.SMOKE_ADMIN_USER;
const adminPass = process.env.SMOKE_ADMIN_PASS;
const testMac = process.env.SMOKE_TEST_MAC || 'AA:BB:CC:DD:EE:FF';
const checkoutId = process.env.SMOKE_CHECKOUT_ID || '';

async function run() {
    const results = [];
    let adminToken = null;

    async function check(name, fn) {
        try {
            const detail = await fn();
            results.push({ name, ok: true, detail });
            process.stdout.write(`OK   ${name}\n`);
        } catch (err) {
            const detail = err.response?.data || err.message;
            results.push({ name, ok: false, detail });
            process.stdout.write(`FAIL ${name} -> ${JSON.stringify(detail)}\n`);
        }
    }

    await check('public health', async () => {
        const r = await axios.get(`${baseUrl}/api/health`, { timeout: 5000 });
        return r.data;
    });

    await check('public plans', async () => {
        const r = await axios.get(`${baseUrl}/api/plans`, { timeout: 5000 });
        if (!Array.isArray(r.data)) throw new Error('plans_not_array');
        return { count: r.data.length };
    });

    await check('public check-status', async () => {
        const r = await axios.get(`${baseUrl}/api/check-status`, {
            params: { mac: testMac },
            timeout: 5000
        });
        return r.data;
    });

    if (checkoutId) {
        await check('payment-status lookup', async () => {
            const r = await axios.get(`${baseUrl}/api/payment-status/${encodeURIComponent(checkoutId)}`, { timeout: 5000 });
            return r.data;
        });
    }

    if (adminUser && adminPass) {
        await check('admin login', async () => {
            const r = await axios.post(`${baseUrl}/api/admin/login`, {
                username: adminUser,
                password: adminPass
            }, { timeout: 5000 });
            adminToken = r.data.accessToken;
            return { admin: r.data.admin?.username || null };
        });

        const headers = () => ({ Authorization: `Bearer ${adminToken}` });

        await check('admin stats', async () => {
            const r = await axios.get(`${baseUrl}/api/admin/stats`, { headers: headers(), timeout: 5000 });
            return { activeUsers: r.data.activeUsers };
        });

        await check('admin system health', async () => {
            const r = await axios.get(`${baseUrl}/api/admin/system/health`, { headers: headers(), timeout: 5000 });
            return r.data;
        });

        await check('admin settings', async () => {
            const r = await axios.get(`${baseUrl}/api/admin/system/settings`, { headers: headers(), timeout: 5000 });
            return { keys: Object.keys(r.data.settings || {}) };
        });
    } else {
        process.stdout.write('SKIP admin checks (set SMOKE_ADMIN_USER and SMOKE_ADMIN_PASS)\n');
    }

    const failed = results.filter((r) => !r.ok);
    process.stdout.write(`\nSummary: ${results.length - failed.length}/${results.length} checks passed\n`);
    if (failed.length > 0) process.exit(1);
}

run().catch((err) => {
    process.stderr.write(`Fatal smoke-test error: ${err.message}\n`);
    process.exit(1);
});
