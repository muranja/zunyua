#!/usr/bin/env node
const db = require('../db');
const { notifyAdmin } = require('../utils/notifier');

async function run() {
    const date = process.env.RECON_DATE || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [txRows] = await db.query(
        `
        SELECT
            COUNT(*) as total_tx,
            SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed_tx,
            SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as failed_tx,
            COALESCE(SUM(CASE WHEN status='COMPLETED' THEN amount ELSE 0 END), 0) as completed_revenue
        FROM transactions
        WHERE DATE(created_at) = ?
        `,
        [date]
    );

    const [tokenRows] = await db.query(
        `
        SELECT COUNT(*) as tokens_created
        FROM access_tokens
        WHERE DATE(created_at) = ?
        `,
        [date]
    );

    const summary = {
        date,
        totalTx: Number(txRows[0]?.total_tx || 0),
        completedTx: Number(txRows[0]?.completed_tx || 0),
        failedTx: Number(txRows[0]?.failed_tx || 0),
        completedRevenue: Number(txRows[0]?.completed_revenue || 0),
        tokensCreated: Number(tokenRows[0]?.tokens_created || 0)
    };

    const mismatch = summary.completedTx !== summary.tokensCreated;
    const report = {
        ...summary,
        mismatch,
        mismatchDelta: summary.completedTx - summary.tokensCreated
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    await notifyAdmin('DAILY_RECONCILIATION_REPORT', report);
    await db.end();
}

run().catch(async (err) => {
    process.stderr.write(`Reconciliation failed: ${err.message}\n`);
    try { await db.end(); } catch {}
    process.exit(1);
});
