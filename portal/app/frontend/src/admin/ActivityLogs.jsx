import React, { useEffect, useState } from 'react';
import { Activity, Download, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function ActivityLogs() {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const limit = 50;

    const fetchActivity = async (nextPage = page) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch(`${API_URL}/activity?page=${nextPage}&limit=${limit}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setActivities(data.activities || []);
                setTotal(data.pagination?.total || 0);
                setPage(nextPage);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity(1);
    }, []);

    const exportCsv = () => {
        const header = ['timestamp', 'admin', 'action', 'ip', 'details'];
        const rows = activities.map((row) => [
            new Date(row.created_at).toISOString(),
            row.username || '',
            row.action || '',
            row.ip_address || '',
            JSON.stringify(row.details || {})
        ]);
        const csv = [header, ...rows]
            .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-page-${page}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return (
        <div className="font-mono p-6 border border-zinc-800 bg-zinc-900/20 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    EVENT.LOGS
                </h2>
                <button
                    onClick={exportCsv}
                    className="px-3 py-2 border border-zinc-700 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-400 text-xs tracking-widest uppercase flex items-center gap-2"
                >
                    <Download className="w-4 h-4" />
                    EXPORT_CSV
                </button>
            </div>

            <div className="overflow-x-auto border border-zinc-800">
                {loading ? (
                    <div className="p-8 flex items-center justify-center text-zinc-500 text-xs tracking-widest uppercase">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> LOADING_LOGS
                    </div>
                ) : (
                    <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900 text-zinc-500 uppercase tracking-widest">
                            <tr>
                                <th className="p-3">Timestamp</th>
                                <th className="p-3">Admin</th>
                                <th className="p-3">Action</th>
                                <th className="p-3">IP</th>
                                <th className="p-3">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {activities.map((row) => (
                                <tr key={row.id} className="hover:bg-zinc-900/40">
                                    <td className="p-3 text-zinc-500">{new Date(row.created_at).toLocaleString()}</td>
                                    <td className="p-3 text-emerald-400">{row.username || '-'}</td>
                                    <td className="p-3 text-zinc-300">{row.action}</td>
                                    <td className="p-3 text-zinc-500">{row.ip_address || '-'}</td>
                                    <td className="p-3 text-zinc-600 break-all">{typeof row.details === 'string' ? row.details : JSON.stringify(row.details || {})}</td>
                                </tr>
                            ))}
                            {activities.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-6 text-center text-zinc-600 uppercase tracking-widest">NO_LOGS</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="flex items-center justify-between text-xs">
                <button
                    onClick={() => fetchActivity(Math.max(1, page - 1))}
                    disabled={page <= 1 || loading}
                    className="px-3 py-2 border border-zinc-700 text-zinc-400 disabled:opacity-40"
                >
                    PREV
                </button>
                <span className="text-zinc-500 uppercase tracking-widest">PAGE {page} / {totalPages}</span>
                <button
                    onClick={() => fetchActivity(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || loading}
                    className="px-3 py-2 border border-zinc-700 text-zinc-400 disabled:opacity-40"
                >
                    NEXT
                </button>
            </div>
        </div>
    );
}
