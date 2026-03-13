const { spawn } = require('child_process');
const { disconnectHotspotUser } = require('./mikrotik');

function execRadclient(host, secret, attrs = []) {
    return new Promise((resolve) => {
        const child = spawn('radclient', ['-x', `${host}:3799`, 'disconnect', secret], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        const payload = attrs.filter(Boolean).join('\n') + '\n';
        child.stdin.write(payload);
        child.stdin.end();

        child.on('close', (code) => resolve({ host, code, stdout, stderr }));
        child.on('error', (err) => resolve({ host, code: 1, stdout: '', stderr: err.message }));
    });
}

async function disconnectRadiusSession({ username, macAddress }) {
    const result = { coaAttempted: false, mikrotikApi: null };

    // 1. Try RADIUS CoA (Packet of Disconnect) if enabled
    if (String(process.env.RADIUS_COA_ENABLED || '').toLowerCase() === 'true') {
        const secret = process.env.RADIUS_SECRET || process.env.RADIUS_SHARED_SECRET;
        const hosts = String(process.env.MIKROTIK_COA_HOSTS || '')
            .split(',')
            .map((h) => h.trim())
            .filter(Boolean);

        if (secret && hosts.length > 0) {
            const attrs = [];
            if (username) attrs.push(`User-Name = "${username}"`);
            if (macAddress) attrs.push(`Calling-Station-Id = "${macAddress}"`);

            if (attrs.length > 0) {
                const results = await Promise.all(hosts.map((host) => execRadclient(host, secret, attrs)));
                const successCount = results.filter((r) => r.code === 0).length;
                result.coaAttempted = true;
                result.coaResults = { hosts, successCount, failedCount: results.length - successCount, results };
            }
        }
    }

    // 2. Always try MikroTik API as a reliable fallback
    try {
        result.mikrotikApi = await disconnectHotspotUser({ username, macAddress });
        console.log(`[CoA] MikroTik API disconnect result:`, JSON.stringify(result.mikrotikApi));
    } catch (err) {
        console.error('[CoA] MikroTik API disconnect failed:', err.message);
        result.mikrotikApi = { success: false, error: err.message };
    }

    result.attempted = result.coaAttempted || (result.mikrotikApi && result.mikrotikApi.success);
    return result;
}

module.exports = {
    disconnectRadiusSession
};

