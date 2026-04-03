const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config({ path: '/etc/turbonet/turbonet.env', override: true });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'radius',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();
