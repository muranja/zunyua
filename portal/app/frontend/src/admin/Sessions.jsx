import React, { useState, useEffect } from 'react';
import { Activity, Loader2, Search, RefreshCw, Monitor, Clock, Database, ChevronLeft, ChevronRight } from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

function formatDuration(seconds) {
    if (!seconds) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / 1024 / 1024;
    if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
}

export default function Sessions() {
    const [tab, setTab] = useState('live');
    const [liveSessions, setLiveSessions] = useState([]);
    const [history, setHistory] = useState([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [liveLoading, setLiveLoading] = useState(false);
    const pageSize = 25;

    const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json' });

    const fetchLive = async () => {
        setLiveLoading(true);
        try {
            const res = await fetch(`${API_URL}/router/stats`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                if (data.success) setLiveSessions(data.sessions || []);
            }
        } catch (err) { console.error(err); }
        finally { setLiveLoading(false); }
    };

    const fetchHistory = async (p = page, s = search) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: pageSize, offset: p * pageSize });
            if (s) params.set('search', s);
            const res = await fetch(`${API_URL}/sessions/history?${params}`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setHistory(data.sessions || []);
                setHistoryTotal(data.total || 0);
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (tab === 'live') {
            fetchLive();
            const interval = setInterval(fetchLive, 5000);
            return () => clearInterval(interval);
        } else {
            fetchHistory();
        }
    }, [tab]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(0);
        fetchHistory(0, search);
    };

    const handleDisconnect = async (username, mac) => {
        try {
            await fetch(`${API_URL}/router/disconnect`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ username, macAddress: mac })
            });
            fetchLive();
        } catch (err) { console.error(err); }
    };

    const totalPages = Math.ceil(historyTotal / pageSize);

    return (
        <div className="space-y-6 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <h2 className="text-lg text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    SESSION_MONITOR
                </h2>
                <div className="flex gap-2">
                    {['live', 'history'].map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-3 py-2 text-xs border uppercase tracking-widest ${tab === t ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10' : 'border-zinc-700 text-zinc-400'}`}>
                            {t === 'live' ? 'LIVE' : 'HISTORY'}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'live' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500 uppercase tracking-widest">
                            {liveSessions.length} active session(s)
                        </span>
                        <button onClick={fetchLive} disabled={liveLoading}
                            className="flex items-center gap-2 px-3 py-2 border border-zinc-700 text-zinc-400 text-xs hover:text-emerald-400 hover:border-emerald-500/40 transition-colors">
                            <RefreshCw className={`w-3 h-3 ${liveLoading ? 'animate-spin' : ''}`} /> REFRESH
                        </button>
                    </div>

                    {liveSessions.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 text-xs uppercase">No active sessions</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-widest">
                                        <th className="text-left py-3 px-2">USER</th>
                                        <th className="text-left py-3 px-2">MAC</th>
                                        <th className="text-left py-3 px-2">IP</th>
                                        <th className="text-left py-3 px-2">UPTIME</th>
                                        <th className="text-left py-3 px-2">DATA</th>
                                        <th className="text-left py-3 px-2">SPEED</th>
                                        <th className="text-right py-3 px-2">ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {liveSessions.map((s, i) => (
                                        <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                                            <td className="py-2 px-2 text-zinc-300">{s.user || s.username || '-'}</td>
                                            <td className="py-2 px-2 text-zinc-400">{s.mac || s.callingstationid || '-'}</td>
                                            <td className="py-2 px-2 text-emerald-400">{s.ip || s.framedipaddress || '-'}</td>
                                            <td className="py-2 px-2 text-zinc-400">{s.uptime || '-'}</td>
                                            <td className="py-2 px-2 text-zinc-400">{s.bytes_in && s.bytes_out ? `${formatBytes(s.bytes_in)} / ${formatBytes(s.bytes_out)}` : '-'}</td>
                                            <td className="py-2 px-2 text-zinc-400">{s.rate || '-'}</td>
                                            <td className="py-2 px-2 text-right">
                                                <button onClick={() => handleDisconnect(s.user || s.username, s.mac || s.callingstationid)}
                                                    className="px-2 py-1 border border-rose-500/30 text-rose-400 text-[10px] uppercase hover:bg-rose-500/10">
                                                    KICK
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {tab === 'history' && (
                <div className="space-y-4">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by phone, MAC, or IP..."
                                className="w-full bg-black border border-zinc-800 py-2 pl-10 pr-4 text-zinc-300 text-xs" />
                        </div>
                        <button type="submit" className="px-4 py-2 border border-emerald-500/40 text-emerald-400 text-xs uppercase hover:bg-emerald-500/10">
                            Search
                        </button>
                    </form>

                    {loading ? (
                        <div className="p-12 flex items-center justify-center text-zinc-500 text-xs uppercase">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> LOADING
                        </div>
                    ) : (
                        <>
                            <div className="text-xs text-zinc-500">{historyTotal} total sessions</div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-widest">
                                            <th className="text-left py-3 px-2">USERNAME</th>
                                            <th className="text-left py-3 px-2">MAC</th>
                                            <th className="text-left py-3 px-2">IP</th>
                                            <th className="text-left py-3 px-2">STARTED</th>
                                            <th className="text-left py-3 px-2">STOPPED</th>
                                            <th className="text-left py-3 px-2">DURATION</th>
                                            <th className="text-left py-3 px-2">DATA IN</th>
                                            <th className="text-left py-3 px-2">DATA OUT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((s, i) => (
                                            <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30">
                                                <td className="py-2 px-2 text-zinc-300">{s.username}</td>
                                                <td className="py-2 px-2 text-zinc-400">{s.callingstationid}</td>
                                                <td className="py-2 px-2 text-emerald-400">{s.framedipaddress}</td>
                                                <td className="py-2 px-2 text-zinc-400">{s.acctstarttime ? new Date(s.acctstarttime).toLocaleString() : '-'}</td>
                                                <td className="py-2 px-2 text-zinc-400">{s.acctstoptime ? new Date(s.acctstoptime).toLocaleString() : 'Active'}</td>
                                                <td className="py-2 px-2 text-zinc-400">{formatDuration(s.duration_seconds)}</td>
                                                <td className="py-2 px-2 text-zinc-400">{s.data_in_mb} MB</td>
                                                <td className="py-2 px-2 text-zinc-400">{s.data_out_mb} MB</td>
                                            </tr>
                                        ))}
                                        {history.length === 0 && (
                                            <tr><td colSpan={8} className="py-8 text-center text-zinc-600 uppercase">No sessions found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex items-center justify-between text-xs text-zinc-500">
                                    <span>Page {page + 1} of {totalPages}</span>
                                    <div className="flex gap-2">
                                        <button disabled={page === 0} onClick={() => { setPage(p => p - 1); fetchHistory(page - 1); }}
                                            className="p-2 border border-zinc-700 disabled:opacity-30 hover:border-emerald-500/40">
                                            <ChevronLeft className="w-3 h-3" />
                                        </button>
                                        <button disabled={page >= totalPages - 1} onClick={() => { setPage(p => p + 1); fetchHistory(page + 1); }}
                                            className="p-2 border border-zinc-700 disabled:opacity-30 hover:border-emerald-500/40">
                                            <ChevronRight className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
