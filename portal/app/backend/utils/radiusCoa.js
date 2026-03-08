const { spawn } = require('child_process');

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
    if (String(process.env.RADIUS_COA_ENABLED || '').toLowerCase() !== 'true') {
        return { attempted: false, reason: 'RADIUS_COA_ENABLED is not true' };
    }

    const secret = process.env.RADIUS_SECRET || process.env.RADIUS_SHARED_SECRET;
    const hosts = String(process.env.MIKROTIK_COA_HOSTS || '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);

    if (!secret || hosts.length === 0) {
        return { attempted: false, reason: 'Missing RADIUS secret or MIKROTIK_COA_HOSTS' };
    }

    const attrs = [];
    if (username) attrs.push(`User-Name = "${username}"`);
    if (macAddress) attrs.push(`Calling-Station-Id = "${macAddress}"`);
    if (attrs.length === 0) return { attempted: false, reason: 'No session identifiers provided' };

    const results = await Promise.all(hosts.map((host) => execRadclient(host, secret, attrs)));
    const successCount = results.filter((r) => r.code === 0).length;

    return {
        attempted: true,
        hosts,
        successCount,
        failedCount: results.length - successCount,
        results
    };
}

module.exports = {
    disconnectRadiusSession
};
