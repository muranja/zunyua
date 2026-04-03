module.exports = {
    apps: [
        {
            name: 'turbonet-backend',
            script: './app/backend/server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
                DB_HOST: 'localhost',
                DB_USER: 'turbouser',
                DB_PASS: 'turbopass',
                DB_NAME: 'turbonet',
                MPESA_CONSUMER_KEY: 'Y5AfZkyPL6qK6xLQ5ozzMVuAZ23Rp2WuXreKSiiydFqWE1Xe',
                MPESA_CONSUMER_SECRET: '3wPUmNkAzDhLBgAWwLxIKjzqVVUcvsk9dNgF5urfLGYCKevCMEw1BAalunlVFTl2',
                MPESA_PASSKEY: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
                MPESA_SHORTCODE: '174379',
                MPESA_OAUTH_URL: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
                MPESA_STK_URL: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
                MPESA_CALLBACK_URL: 'http://136.109.224.75/api/callback',
                JWT_SECRET: 'supersecretjwtkey',
                MIKROTIK_IP: '192.168.88.1',
                RADIUS_SECRET: 'TurboNetSecret2024'
            }
        }
    ]
};
