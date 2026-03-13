const { RouterOSAPI } = require('node-routeros');

async function applyStrictPolicies() {
    const client = new RouterOSAPI({
        host: '10.10.10.2',
        user: 'admin',
        password: '', 
        port: 8728,
        keepalive: true
    });

    try {
        console.log('Connecting to MikroTik...');
        await client.connect();
        console.log('Connected.');

        // 1. Remove 8.8.8.8 from Walled Garden
        console.log('Removing 8.8.8.8 from Walled Garden...');
        const walledGarden = await client.write('/ip/hotspot/walled-garden/ip/print', ['?dst-address=8.8.8.8']);
        for (const rule of walledGarden) {
            await client.write('/ip/hotspot/walled-garden/ip/remove', ['=.id=' + rule['.id']]);
            console.log(`Removed Walled Garden rule: ${rule['.id']}`);
        }

        // 2. Enable DNS remote requests and set upstream servers
        console.log('Configuring DNS...');
        await client.write('/ip/dns/set', [
            '=allow-remote-requests=yes',
            '=servers=8.8.8.8,1.1.1.1'
        ]);

        // 3. Add DNS Hijacking (NAT Rules)
        console.log('Adding DNS Hijacking NAT rules...');
        const existingNAT = await client.write('/ip/firewall/nat/print', ['?comment=Force_DNS']);
        if (existingNAT.length === 0) {
            await client.write('/ip/firewall/nat/add', [
                '=chain=dstnat',
                '=protocol=udp',
                '=dst-port=53',
                '=action=redirect',
                '=to-ports=53',
                '=comment=Force_DNS',
                '=place-before=0'
            ]);
            await client.write('/ip/firewall/nat/add', [
                '=chain=dstnat',
                '=protocol=tcp',
                '=dst-port=53',
                '=action=redirect',
                '=to-ports=53',
                '=comment=Force_DNS_TCP',
                '=place-before=0'
            ]);
            console.log('NAT rules added at the top.');
        } else {
            console.log('NAT rules already exist, skipping.');
        }

        // 4. Update Hotspot Profile DNS Name
        console.log('Updating Hotspot Profile DNS name...');
        const profiles = await client.write('/ip/hotspot/profile/print', ['?name=turbonet']);
        if (profiles.length > 0) {
            await client.write('/ip/hotspot/profile/set', [
                '=.id=' + profiles[0]['.id'],
                '=dns-name=login.turbowifi.local'
            ]);
            console.log('Hotspot profile updated.');
        } else {
            console.log('Profile "turbonet" not found.');
        }

        console.log('All policies applied successfully!');
    } catch (err) {
        console.error('Error applying policies:', err.message);
    } finally {
        if (client) client.close();
    }
}

applyStrictPolicies();
