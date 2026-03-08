import React, { useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function Analytics() {
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState(null);
    const [series, setSeries] = useState([]);
    const [plans, setPlans] = useState([]);
    const [devices, setDevices] = useState([]);
    const [vendors, setVendors] = useState([]);
    const isSuperAdmin = JSON.parse(localStorage.getItem('admin') || '{}')?.isSuperAdmin;

    const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` });

    const loadData = async (rangeDays = days) => {
        setLoading(true);
        try {
            const requests = [
                fetch(`${API_URL}/analytics/overview?days=${rangeDays}`, { headers: authHeaders() }).then((r) => r.json()),
                fetch(`${API_URL}/analytics/revenue-series?days=${rangeDays}`, { headers: authHeaders() }).then((r) => r.json()),
                fetch(`${API_URL}/analytics/plan-performance?days=${rangeDays}`, { headers: authHeaders() }).then((r) => r.json()),
                fetch(`${API_URL}/analytics/device-insights?days=${rangeDays}`, { headers: authHeaders() }).then((r) => r.json())
            ];
            if (isSuperAdmin) {
                requests.push(fetch(`${API_URL}/analytics/vendors-performance?days=${rangeDays}`, { headers: authHeaders() }).then((r) => r.json()));
            }
            const [o, s, p, d, vp] = await Promise.all(requests);
            setOverview(o.kpis || null);
            setSeries(s.series || []);
            setPlans(p.plans || []);
            setDevices(d.devices || []);
            if (isSuperAdmin) setVendors(vp?.vendors || []);
            setDays(rangeDays);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(30);
    }, []);

    const maxRevenue = Math.max(1, ...series.map((x) => Number(x.revenue || 0)));

    return (
        <div className="space-y-6 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <h2 className="text-lg text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-emerald-500" />
                    ADVANCED_ANALYTICS
                </h2>
                <div className="flex gap-2">
                    {[7, 30, 90].map((d) => (
                        <button
                            key={d}
                            onClick={() => loadData(d)}
                            className={`px-3 py-2 text-xs border uppercase tracking-widest ${days === d ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10' : 'border-zinc-700 text-zinc-400'}`}
                        >
                            {d}D
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="p-12 flex items-center justify-center text-zinc-500 text-xs uppercase tracking-widest">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    LOADING_ANALYTICS
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        {[
                            ['Revenue', `KES ${overview?.revenue ?? 0}`],
                            ['Completed', overview?.completedTx ?? 0],
                            ['Failed', overview?.failedTx ?? 0],
                            ['Conversion', `${overview?.conversionRate ?? 0}%`],
                            ['Active Users', overview?.activeUsers ?? 0],
                            ['ARPU', `KES ${overview?.arpu ?? 0}`],
                            ['Blocked MACs', overview?.blockedMacs ?? 0],
                            ['Whitelisted', overview?.whitelistedMacs ?? 0],
                            ['Recover Success', overview?.recoverySuccess ?? 0],
                            ['Recover Failed', overview?.recoveryFailed ?? 0]
                        ].map(([label, val]) => (
                            <div key={label} className="border border-zinc-800 bg-zinc-900/20 p-3">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{label}</div>
                                <div className="text-lg text-emerald-400 mt-2">{val}</div>
                            </div>
                        ))}
                    </div>

                    <div className="border border-zinc-800 p-4 bg-zinc-900/20">
                        <div className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Revenue Trend</div>
                        <div className="space-y-2">
                            {series.map((row) => {
                                const rev = Number(row.revenue || 0);
                                const widthPct = Math.max(1, Math.round((rev / maxRevenue) * 100));
                                return (
                                    <div key={row.day} className="flex items-center gap-2">
                                        <div className="w-28 text-[10px] text-zinc-500">{String(row.day).slice(0, 10)}</div>
                                        <div className="flex-1 bg-zinc-900 border border-zinc-800 h-4 relative">
                                            <div className="h-full bg-emerald-500/50" style={{ width: `${widthPct}%` }} />
                                        </div>
                                        <div className="w-24 text-right text-[10px] text-emerald-400">KES {rev}</div>
                                    </div>
                                );
                            })}
                            {series.length === 0 && <div className="text-xs text-zinc-600 uppercase">No data</div>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="border border-zinc-800 p-4 bg-zinc-900/20">
                            <div className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Plan Performance</div>
                            <div className="space-y-2">
                                {plans.slice(0, 10).map((p) => (
                                    <div key={p.id} className="flex justify-between text-xs border-b border-zinc-800 pb-1">
                                        <span className="text-zinc-300">{p.name}</span>
                                        <span className="text-emerald-400">KES {Number(p.revenue || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="border border-zinc-800 p-4 bg-zinc-900/20">
                            <div className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Top Devices</div>
                            <div className="space-y-2">
                                {devices.slice(0, 10).map((d) => (
                                    <div key={d.mac_address} className="flex justify-between text-xs border-b border-zinc-800 pb-1">
                                        <span className="text-zinc-300">{d.mac_address}</span>
                                        <span className="text-emerald-400">{d.purchases} tx</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {isSuperAdmin && (
                        <div className="border border-zinc-800 p-4 bg-zinc-900/20">
                            <div className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Vendor Performance</div>
                            <div className="space-y-2">
                                {vendors.slice(0, 20).map((v) => (
                                    <div key={v.id} className="flex justify-between text-xs border-b border-zinc-800 pb-1">
                                        <span className="text-zinc-300">{v.name}</span>
                                        <span className="text-emerald-400">KES {Number(v.revenue || 0)} | {v.active_users} active</span>
                                    </div>
                                ))}
                                {vendors.length === 0 && <div className="text-xs text-zinc-600 uppercase">No vendors</div>}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
