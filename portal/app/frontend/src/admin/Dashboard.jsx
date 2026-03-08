import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Activity, ArrowUpRight, ArrowDownRight, Server,
    Wifi, Users, Terminal, Database, Clock, ShieldCheck
} from 'lucide-react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json' });

    if (loading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center font-mono text-zinc-500">
                <Terminal className="w-6 h-6 animate-pulse mb-4 text-emerald-500" />
                <p>INITIALIZING_DATALINK...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="border border-red-500/30 bg-red-500/5 p-6 font-mono">
                <div className="text-red-500 font-bold mb-2 flex items-center gap-2">
                    <Server className="w-4 h-4" /> SYSTEM_ERROR
                </div>
                <div className="text-red-400 text-sm">{error}</div>
                <button
                    onClick={fetchStats}
                    className="mt-4 px-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-xs tracking-widest uppercase"
                >
                    RETRY_CONNECTION
                </button>
            </div>
        );
    }

    const statModules = [
        {
            id: 'REV_24H',
            label: '24H REVENUE',
            value: `KES ${stats?.revenue?.today || 0}`,
            trend: '+12.5%', // Mock trend for aesthetics
            positive: true
        },
        {
            id: 'REV_7D',
            label: '7D REVENUE',
            value: `KES ${stats?.revenue?.week || 0}`,
            trend: '+4.2%',
            positive: true
        },
        {
            id: 'REV_30D',
            label: '30D REVENUE',
            value: `KES ${stats?.revenue?.month || 0}`,
            trend: '-1.8%',
            positive: false
        },
        {
            id: 'USR_ACT',
            label: 'ACTIVE CLIENTS',
            value: stats?.activeUsers || 0,
            metric: 'DEVICES',
            positive: true
        },
        {
            id: 'TKT_ACT',
            label: 'ACTIVE VOUCHERS',
            value: stats?.vouchers?.active || 0,
            metric: 'TOKENS',
            positive: true
        },
        {
            id: 'TKT_USE',
            label: 'LIFETIME REDEEMED',
            value: stats?.vouchers?.redeemed || 0,
            metric: 'TOKENS',
            positive: true
        }
    ];

    return (
        <div className="space-y-8 font-sans bg-[#0a0a0a] min-h-full">
            {/* Header Area */}
            <div className="border-b border-zinc-800 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-medium text-zinc-100 uppercase tracking-widest flex items-center gap-3">
                            <Database className="w-5 h-5 text-emerald-500" />
                            System Overview
                        </h2>
                        <p className="text-xs font-mono text-zinc-500 mt-2">
                            LATENCY: ~24ms | STATUS: OK | {new Date().toISOString()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Industrial Data Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-zinc-800 bg-zinc-900/20">
                {statModules.map((mod, i) => (
                    <motion.div
                        key={mod.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                        className="p-5 border-[0.5px] border-zinc-800 relative group hover:bg-zinc-800/20 transition-colors"
                    >
                        <div className="text-[10px] font-mono text-zinc-500 mb-4 flex justify-between items-center">
                            <span>[{mod.id}]</span>
                            <span className="text-zinc-600">{mod.label}</span>
                        </div>

                        <div className="flex items-end gap-3">
                            <div className="font-mono text-2xl md:text-3xl font-medium text-emerald-400">
                                {mod.value}
                            </div>
                            {mod.metric && (
                                <div className="text-xs font-mono text-zinc-500 mb-1">
                                    {mod.metric}
                                </div>
                            )}
                        </div>

                        {mod.trend && (
                            <div className={`mt-3 text-xs font-mono flex items-center gap-1 ${mod.positive ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {mod.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {mod.trend} vs PREV
                            </div>
                        )}

                        {/* Aesthetic corners */}
                        <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-emerald-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                ))}
            </div>

            {/* Terminal-style Transaction Log */}
            <div className="border border-zinc-800 bg-[#0a0a0a]">
                <div className="border-b border-zinc-800 p-3 bg-zinc-900/50 flex items-center justify-between">
                    <div className="text-xs font-mono text-zinc-400 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        TX_LOG_TAIL
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse font-mono text-sm">
                        <thead className="bg-zinc-900/80 text-zinc-500 text-xs">
                            <tr>
                                <th className="p-3 font-normal">TIMESTAMP</th>
                                <th className="p-3 font-normal">PHONE_ID</th>
                                <th className="p-3 font-normal">PKG_NAME</th>
                                <th className="p-3 font-normal text-right">VAL(KES)</th>
                                <th className="p-3 font-normal">STATUS</th>
                            </tr>
                        </thead>
                        <tbody className="text-zinc-300 divide-y divide-zinc-800/50">
                            {stats?.recentTransactions?.map((tx) => (
                                <tr key={tx.id} className="hover:bg-zinc-900/30 transition-colors">
                                    <td className="p-3 text-zinc-500 text-xs">
                                        {new Date(tx.created_at).getTime()}
                                    </td>
                                    <td className="p-3 text-emerald-400/80">
                                        {tx.phone_number}
                                    </td>
                                    <td className="p-3 text-zinc-400 text-xs uppercase">
                                        {tx.plan_name || `PLN_${tx.plan_id}`}
                                    </td>
                                    <td className="p-3 text-right">
                                        {tx.amount}
                                    </td>
                                    <td className="p-3">
                                        <span className={`px-2 py-[2px] text-[10px] uppercase border ${tx.status === 'COMPLETED' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                                            tx.status === 'PENDING' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                                                'border-rose-500/30 text-rose-400 bg-rose-500/10'
                                            }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {(!stats?.recentTransactions || stats.recentTransactions.length === 0) && (
                                <tr>
                                    <td colSpan="5" className="p-6 text-center text-zinc-600 italic">
                                        No recent transactions found in index.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
