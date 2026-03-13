const { RouterOSClient } = require('node-routeros');
const { getSetting } = require('./systemSettings');

let clientInstance = null;
let lastUsed = null;

async function getMikroTikClient() {
    // If instance exists and was used within last 5 mins, reuse
    if (clientInstance && lastUsed && (Date.now() - lastUsed < 300000)) {
        lastUsed = Date.now();
        return clientInstance;
    }

    const host = await getSetting('router_api_host', process.env.MIKROTIK_IP || '192.168.88.1');
    const port = await getSetting('router_api_port', '8728');
    const user = await getSetting('router_api_user', 'admin');
    const pass = await getSetting('router_api_pass', '');
    const tls = await getSetting('router_api_tls', 'false') === 'true';

    try {
        const client = new RouterOSClient({
            host,
            user,
            password: pass,
            port: parseInt(port),
            tls: tls ? {} : undefined
        });

        await client.connect();
        clientInstance = client;
        lastUsed = Date.now();

        // Auto-close on error/end
        client.on('error', (err) => {
            console.error('MikroTik Client Error:', err);
            clientInstance = null;
        });

        return client;
    } catch (err) {
        console.error('Failed to connect to MikroTik:', err);
        throw err;
    }
}

async function fetchActiveSessions() {
    const client = await getMikroTikClient();
    try {
        // Fetch active hotspot users
        const active = await client.write('/ip/hotspot/active/print');
        
        // Fetch simple queues to get real-time traffic
        const queues = await client.write('/queue/simple/print');

        // Map speeds to active users
        return active.map(session => {
            const queue = queues.find(q => q.name.includes(session.user) || q.target.includes(session.address));
            return {
                id: session['.id'],
                user: session.user,
                address: session.address,
                mac: session['mac-address'],
                uptime: session.uptime,
                bytesIn: session['bytes-in'],
                bytesOut: session['bytes-out'],
                rate: queue ? queue.rate : '0/0',
                limit: queue ? queue['max-limit'] : '0/0'
            };
        });
    } catch (err) {
        clientInstance = null;
        throw err;
    }
}

async function updateGlobalQueue(downloadLimit, uploadLimit) {
    const client = await getMikroTikClient();
    try {
        const name = 'TURBONET_GLOBAL';
        const target = '192.168.88.0/24'; // Should ideally be configurable
        const limitStr = `${uploadLimit}/${downloadLimit}`;

        const existing = await client.write('/queue/simple/print', ['?name=' + name]);
        
        if (existing.length > 0) {
            await client.write('/queue/simple/set', [
                '=.id=' + existing[0]['.id'],
                '=max-limit=' + limitStr
            ]);
        } else {
            await client.write('/queue/simple/add', [
                '=name=' + name,
                '=target=' + target,
                '=max-limit=' + limitStr
            ]);
        }
        return { success: true };
    } catch (err) {
        clientInstance = null;
        throw err;
    }
}

async function disconnectHotspotUser({ username, macAddress }) {
    try {
        const client = await getMikroTikClient();
        const removed = { activeSessions: 0, cookies: 0 };

        // 1. Remove active hotspot sessions matching username or MAC
        const active = await client.write('/ip/hotspot/active/print');
        for (const session of active) {
            const matchUser = username && session.user === username;
            const matchMac = macAddress && session['mac-address'] &&
                session['mac-address'].toUpperCase() === macAddress.toUpperCase();
            if (matchUser || matchMac) {
                try {
                    await client.write('/ip/hotspot/active/remove', ['=.id=' + session['.id']]);
                    removed.activeSessions++;
                    console.log(`[MikroTik] Removed active session: user=${session.user} mac=${session['mac-address']}`);
                } catch (removeErr) {
                    console.error(`[MikroTik] Failed to remove active session ${session['.id']}:`, removeErr.message);
                }
            }
        }

        // 2. Remove hotspot cookies so the device can't auto-reconnect
        const cookies = await client.write('/ip/hotspot/cookie/print');
        for (const cookie of cookies) {
            const matchUser = username && cookie.user === username;
            const matchMac = macAddress && cookie['mac-address'] &&
                cookie['mac-address'].toUpperCase() === macAddress.toUpperCase();
            if (matchUser || matchMac) {
                try {
                    await client.write('/ip/hotspot/cookie/remove', ['=.id=' + cookie['.id']]);
                    removed.cookies++;
                    console.log(`[MikroTik] Removed cookie: user=${cookie.user} mac=${cookie['mac-address']}`);
                } catch (removeErr) {
                    console.error(`[MikroTik] Failed to remove cookie ${cookie['.id']}:`, removeErr.message);
                }
            }
        }

        return { success: true, ...removed };
    } catch (err) {
        console.error('[MikroTik] disconnectHotspotUser error:', err.message);
        clientInstance = null;
        return { success: false, error: err.message };
    }
}

module.exports = {
    fetchActiveSessions,
    updateGlobalQueue,
    getMikroTikClient,
    disconnectHotspotUser
};
