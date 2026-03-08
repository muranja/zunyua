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
                PORT: 3000
            }
        }
    ]
};
