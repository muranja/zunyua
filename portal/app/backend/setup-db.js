// Script to run database schema
const fs = require('fs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runSchema() {
    console.log('Connecting to database...');

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true
    });

    console.log('Connected! Creating database if not exists...');

    // Create database if not exists
    const dbName = process.env.DB_NAME || 'radius';
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    await connection.query(`USE ${dbName}`);

    console.log(`Using database: ${dbName}`);

    // Read and run schema
    const schema = fs.readFileSync('./schema.sql', 'utf8');

    // Split by semicolon and filter empty statements
    const statements = schema.split(';').filter(s => s.trim());

    for (const stmt of statements) {
        if (stmt.trim()) {
            try {
                await connection.query(stmt);
                console.log('✓ Executed statement');
            } catch (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    console.log('⊘ Entry already exists, skipping...');
                } else if (err.code === 'ER_TABLE_EXISTS_ERROR') {
                    console.log('⊘ Table already exists, skipping...');
                } else {
                    console.error('✗ Error:', err.message);
                }
            }
        }
    }

    console.log('\n✓ Schema setup complete!');
    console.log('\nDefault admin login:');
    console.log('  Username: admin');
    console.log('  Password: admin123');

    await connection.end();
}

runSchema().catch(err => {
    console.error('Failed to run schema:', err.message);
    process.exit(1);
});
