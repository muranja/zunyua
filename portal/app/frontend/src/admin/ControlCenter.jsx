import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Loader2, Power, Wrench, ShieldAlert, Plus, Trash2, Save, Send } from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function ControlCenter() {
    const [settings, setSettings] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [newPlan, setNewPlan] = useState({ name: '', price: '', durationMinutes: '', speedLimitDown: '5M', speedLimitUp: '2M' });
    const [health, setHealth] = useState(null);
    const [reconDate, setReconDate] = useState(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [reconReport, setReconReport] = useState(null);
    const [vendors, setVendors] = useState([]);
    const [vendorName, setVendorName] = useState('');
    const [vendorCode, setVendorCode] = useState('');
    const [selectedVendor, setSelectedVendor] = useState('');
    const [vendorAdmins, setVendorAdmins] = useState([]);
    const [newVendorAdmin, setNewVendorAdmin] = useState({ username: '', password: '', role: 'staff' });
    const [vendorApiKeys, setVendorApiKeys] = useState([]);
    const [newApiKeyName, setNewApiKeyName] = useState('');
    const [issuedApiKey, setIssuedApiKey] = useState('');

    const authHeaders = () => ({
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        'Content-Type': 'application/json'
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const [sRes, pRes] = await Promise.all([
                fetch(`${API_URL}/system/settings`, { headers: authHeaders() }).then((r) => r.json()),
                fetch(`${API_URL}/plans`, { headers: authHeaders() }).then((r) => r.json())
            ]);
            if (sRes.success) setSettings(sRes.settings);
            if (Array.isArray(pRes)) setPlans(pRes);
            const vendorsRes = await fetch(`${API_URL}/vendors`, { headers: authHeaders() }).then((r) => r.json());
            if (vendorsRes.success) {
                setVendors(vendorsRes.vendors || []);
                if (!selectedVendor && vendorsRes.vendors?.length) setSelectedVendor(String(vendorsRes.vendors[0].id));
            }
            const hRes = await fetch(`${API_URL}/system/health`, { headers: authHeaders() }).then((r) => r.json());
            if (hRes.success) setHealth(hRes.checks);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const updateSettings = async (patch) => {
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/system/settings`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify(patch)
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update settings');
            setSettings(data.settings);
            setMsg('Settings updated');
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const runAction = async (path, successMsg) => {
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: authHeaders() });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
            setMsg(successMsg);
            loadData();
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const testAlert = async () => {
        await runAction('/system/test-alert', 'Test alert dispatched');
    };

    const runReconciliation = async () => {
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/system/run-reconciliation`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ date: reconDate })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Reconciliation failed');
            setReconReport(data.report);
            setMsg('Reconciliation complete');
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const loadVendorAdmins = async (vendorId) => {
        if (!vendorId) return;
        const res = await fetch(`${API_URL}/vendors/${vendorId}/admins`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.success) setVendorAdmins(data.admins || []);
    };

    const loadVendorApiKeys = async (vendorId) => {
        if (!vendorId) return;
        const res = await fetch(`${API_URL}/vendors/${vendorId}/api-keys`, { headers: authHeaders() });
        const data = await res.json();
        if (res.ok && data.success) setVendorApiKeys(data.apiKeys || []);
    };

    const createVendor = async () => {
        if (!vendorName.trim()) return;
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/vendors`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ name: vendorName.trim(), code: vendorCode.trim() || undefined })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create vendor');
            setVendorName('');
            setVendorCode('');
            setMsg('Vendor created');
            await loadData();
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const createVendorAdmin = async () => {
        if (!selectedVendor || !newVendorAdmin.username || !newVendorAdmin.password) return;
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/vendors/${selectedVendor}/admins`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(newVendorAdmin)
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create vendor admin');
            setNewVendorAdmin({ username: '', password: '', role: 'staff' });
            setMsg('Vendor admin created');
            await loadVendorAdmins(selectedVendor);
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const createVendorApiKey = async () => {
        if (!selectedVendor || !newApiKeyName.trim()) return;
        setBusy(true);
        setMsg('');
        setIssuedApiKey('');
        try {
            const res = await fetch(`${API_URL}/vendors/${selectedVendor}/api-keys`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ name: newApiKeyName.trim(), scopes: ['status:read'] })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create API key');
            setIssuedApiKey(data.apiKey || '');
            setNewApiKeyName('');
            setMsg('Vendor API key created');
            await loadVendorApiKeys(selectedVendor);
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const revokeVendorApiKey = async (keyId) => {
        if (!selectedVendor || !keyId) return;
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/vendors/${selectedVendor}/api-keys/${keyId}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to revoke API key');
            setMsg('Vendor API key revoked');
            await loadVendorApiKeys(selectedVendor);
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (selectedVendor) {
            loadVendorAdmins(selectedVendor);
            loadVendorApiKeys(selectedVendor);
        }
    }, [selectedVendor]);

    const savePlan = async () => {
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/plans`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    name: newPlan.name,
                    price: Number(newPlan.price),
                    durationMinutes: Number(newPlan.durationMinutes),
                    speedLimitDown: newPlan.speedLimitDown,
                    speedLimitUp: newPlan.speedLimitUp
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create plan');
            setMsg('Plan created');
            setNewPlan({ name: '', price: '', durationMinutes: '', speedLimitDown: '5M', speedLimitUp: '2M' });
            loadData();
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    const deletePlan = async (id) => {
        setBusy(true);
        setMsg('');
        try {
            const res = await fetch(`${API_URL}/plans/${id}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete plan');
            setMsg('Plan deleted');
            loadData();
        } catch (err) {
            setMsg(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (loading || !settings) {
        return (
            <div className="p-8 text-zinc-500 text-xs uppercase tracking-widest font-mono flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> LOADING_CONTROL_CENTER
            </div>
        );
    }

    return (
        <div className="space-y-6 font-mono">
            <div className="border-b border-zinc-800 pb-4">
                <h2 className="text-lg text-zinc-300 uppercase tracking-widest flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-emerald-500" />
                    CONTROL_CENTER
                </h2>
            </div>

            {msg && <div className="text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 p-2">{msg}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-zinc-800 p-4 bg-zinc-900/20 space-y-3">
                    <div className="text-xs text-zinc-400 uppercase tracking-widest">Global Switches</div>
                    <label className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300">Sales Enabled</span>
                        <input type="checkbox" checked={String(settings.sales_enabled) === 'true'} onChange={(e) => updateSettings({ sales_enabled: e.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300">Maintenance Mode</span>
                        <input type="checkbox" checked={String(settings.maintenance_mode) === 'true'} onChange={(e) => updateSettings({ maintenance_mode: e.target.checked })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300">Receipt Recovery</span>
                        <input type="checkbox" checked={String(settings.allow_receipt_recovery) === 'true'} onChange={(e) => updateSettings({ allow_receipt_recovery: e.target.checked })} />
                    </label>
                    <div className="text-xs text-zinc-500">Max STK attempts / 10m</div>
                    <input
                        type="number"
                        className="w-full bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300"
                        value={settings.max_stk_attempts_10m}
                        onChange={(e) => setSettings({ ...settings, max_stk_attempts_10m: e.target.value })}
                    />
                    <button
                        onClick={() => updateSettings({ max_stk_attempts_10m: Number(settings.max_stk_attempts_10m || 5) })}
                        className="px-3 py-2 border border-zinc-700 text-zinc-300 text-xs uppercase tracking-widest flex items-center gap-2"
                        disabled={busy}
                    >
                        <Save className="w-4 h-4" />
                        SAVE_LIMIT
                    </button>
                </div>

                <div className="border border-zinc-800 p-4 bg-zinc-900/20 space-y-3">
                    <div className="text-xs text-zinc-400 uppercase tracking-widest">Emergency Actions</div>
                    <button onClick={() => runAction('/system/disconnect-all', 'All active users disconnected')} disabled={busy} className="w-full px-3 py-2 border border-rose-500/40 text-rose-400 text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                        <Power className="w-4 h-4" />
                        DISCONNECT_ALL_NOW
                    </button>
                    <button onClick={() => runAction('/system/cleanup', 'Cleanup complete')} disabled={busy} className="w-full px-3 py-2 border border-amber-500/40 text-amber-400 text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                        <Wrench className="w-4 h-4" />
                        RUN_CLEANUP
                    </button>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        These actions affect all customers immediately.
                    </div>
                </div>
            </div>

            {health && (
                <div className="border border-zinc-800 p-4 bg-zinc-900/20">
                    <div className="text-xs text-zinc-400 uppercase tracking-widest mb-3">System Health</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="border border-zinc-800 p-2 text-zinc-300">DB: {health.db ? 'OK' : 'FAIL'}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">M-Pesa: {health.mpesaConfigured ? 'CONFIGURED' : 'MISSING'}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">CoA: {health.coaEnabled ? 'ON' : 'OFF'}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">Maint: {health.maintenanceMode ? 'ON' : 'OFF'}</div>
                    </div>
                </div>
            )}

            <div className="border border-zinc-800 p-4 bg-zinc-900/20 space-y-3">
                <div className="text-xs text-zinc-400 uppercase tracking-widest">Notifications (Optional)</div>
                <label className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">Notifications Enabled</span>
                    <input type="checkbox" checked={String(settings.notifications_enabled) === 'true'} onChange={(e) => updateSettings({ notifications_enabled: e.target.checked })} />
                </label>
                <label className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">Telegram Enabled</span>
                    <input type="checkbox" checked={String(settings.telegram_enabled) === 'true'} onChange={(e) => updateSettings({ telegram_enabled: e.target.checked })} />
                </label>
                <input
                    type="text"
                    placeholder="TELEGRAM_BOT_TOKEN"
                    className="w-full bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300"
                    value={settings.telegram_bot_token || ''}
                    onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                />
                <input
                    type="text"
                    placeholder="TELEGRAM_CHAT_ID"
                    className="w-full bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300"
                    value={settings.telegram_chat_id || ''}
                    onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                />
                <input
                    type="text"
                    placeholder="ALERT_WEBHOOK_URL (OPTIONAL)"
                    className="w-full bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300"
                    value={settings.alert_webhook_url || ''}
                    onChange={(e) => setSettings({ ...settings, alert_webhook_url: e.target.value })}
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => updateSettings({
                            telegram_bot_token: settings.telegram_bot_token || '',
                            telegram_chat_id: settings.telegram_chat_id || '',
                            alert_webhook_url: settings.alert_webhook_url || ''
                        })}
                        disabled={busy}
                        className="px-3 py-2 border border-zinc-700 text-zinc-300 text-xs uppercase tracking-widest flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        SAVE_CHANNELS
                    </button>
                    <button
                        onClick={testAlert}
                        disabled={busy}
                        className="px-3 py-2 border border-emerald-500/40 text-emerald-400 text-xs uppercase tracking-widest flex items-center gap-2"
                    >
                        <Send className="w-4 h-4" />
                        TEST_ALERT
                    </button>
                </div>
            </div>

            <div className="border border-zinc-800 p-4 bg-zinc-900/20">
                <div className="text-xs text-zinc-400 uppercase tracking-widest mb-3">Plan Manager</div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                    <input placeholder="NAME" className="bg-black border border-zinc-800 p-2 text-xs text-zinc-300" value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} />
                    <input placeholder="PRICE" type="number" className="bg-black border border-zinc-800 p-2 text-xs text-zinc-300" value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })} />
                    <input placeholder="DURATION_MIN" type="number" className="bg-black border border-zinc-800 p-2 text-xs text-zinc-300" value={newPlan.durationMinutes} onChange={(e) => setNewPlan({ ...newPlan, durationMinutes: e.target.value })} />
                    <input placeholder="DOWN (e.g 5M)" className="bg-black border border-zinc-800 p-2 text-xs text-zinc-300" value={newPlan.speedLimitDown} onChange={(e) => setNewPlan({ ...newPlan, speedLimitDown: e.target.value })} />
                    <input placeholder="UP (e.g 2M)" className="bg-black border border-zinc-800 p-2 text-xs text-zinc-300" value={newPlan.speedLimitUp} onChange={(e) => setNewPlan({ ...newPlan, speedLimitUp: e.target.value })} />
                </div>
                <button onClick={savePlan} disabled={busy} className="px-3 py-2 border border-emerald-500/40 text-emerald-400 text-xs uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Plus className="w-4 h-4" />
                    CREATE_PLAN
                </button>

                <div className="space-y-2">
                    {plans.map((p) => (
                        <div key={p.id} className="flex items-center justify-between border border-zinc-800 p-2 text-xs">
                            <div className="text-zinc-300">
                                {p.name} | KES {p.price} | {p.duration_minutes}m | {p.speed_limit_down}/{p.speed_limit_up}
                            </div>
                            <button onClick={() => deletePlan(p.id)} disabled={busy} className="px-2 py-1 border border-zinc-700 text-zinc-400 hover:text-rose-400 hover:border-rose-500/40">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border border-zinc-800 p-4 bg-zinc-900/20 space-y-3">
                <div className="text-xs text-zinc-400 uppercase tracking-widest">Reconciliation</div>
                <div className="flex gap-2 items-center">
                    <input
                        type="date"
                        value={reconDate}
                        onChange={(e) => setReconDate(e.target.value)}
                        className="bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300"
                    />
                    <button
                        onClick={runReconciliation}
                        disabled={busy}
                        className="px-3 py-2 border border-emerald-500/40 text-emerald-400 text-xs uppercase tracking-widest"
                    >
                        RUN_RECON
                    </button>
                </div>
                {reconReport && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                        <div className="border border-zinc-800 p-2 text-zinc-300">Tx: {reconReport.totalTx}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">Completed: {reconReport.completedTx}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">Tokens: {reconReport.tokensCreated}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">Revenue: KES {reconReport.completedRevenue}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">Mismatch: {reconReport.mismatch ? 'YES' : 'NO'}</div>
                        <div className="border border-zinc-800 p-2 text-zinc-300">Delta: {reconReport.mismatchDelta}</div>
                    </div>
                )}
            </div>

            <div className="border border-zinc-800 p-4 bg-zinc-900/20 space-y-3">
                <div className="text-xs text-zinc-400 uppercase tracking-widest">Vendor Onboarding</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="VENDOR_NAME" className="bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300" />
                    <input value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} placeholder="VENDOR_CODE (OPTIONAL)" className="bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300" />
                    <button onClick={createVendor} disabled={busy} className="px-3 py-2 border border-emerald-500/40 text-emerald-400 text-xs uppercase tracking-widest">CREATE_VENDOR</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <select value={selectedVendor} onChange={(e) => setSelectedVendor(e.target.value)} className="bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300">
                        <option value="">SELECT_VENDOR</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    <input value={newVendorAdmin.username} onChange={(e) => setNewVendorAdmin({ ...newVendorAdmin, username: e.target.value })} placeholder="ADMIN_USERNAME" className="bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300" />
                    <input type="password" value={newVendorAdmin.password} onChange={(e) => setNewVendorAdmin({ ...newVendorAdmin, password: e.target.value })} placeholder="TEMP_PASSWORD" className="bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300" />
                    <button onClick={createVendorAdmin} disabled={busy || !selectedVendor} className="px-3 py-2 border border-zinc-700 text-zinc-300 text-xs uppercase tracking-widest">CREATE_VENDOR_ADMIN</button>
                </div>
                <div className="space-y-1">
                    {vendorAdmins.map((a) => (
                        <div key={a.id} className="text-xs border border-zinc-800 p-2 text-zinc-300">
                            {a.username} | {a.role} | {a.is_super_admin ? 'SUPER' : 'VENDOR'}
                        </div>
                    ))}
                    {selectedVendor && vendorAdmins.length === 0 && <div className="text-xs text-zinc-600 uppercase">NO_VENDOR_ADMINS</div>}
                </div>

                <div className="border-t border-zinc-800 pt-3 space-y-2">
                    <div className="text-xs text-zinc-400 uppercase tracking-widest">Vendor API Keys</div>
                    <div className="flex gap-2">
                        <input
                            value={newApiKeyName}
                            onChange={(e) => setNewApiKeyName(e.target.value)}
                            placeholder="KEY_NAME"
                            className="flex-1 bg-black border border-zinc-800 py-2 px-3 text-xs text-zinc-300"
                        />
                        <button
                            onClick={createVendorApiKey}
                            disabled={busy || !selectedVendor}
                            className="px-3 py-2 border border-emerald-500/40 text-emerald-400 text-xs uppercase tracking-widest"
                        >
                            CREATE_KEY
                        </button>
                    </div>
                    {issuedApiKey && (
                        <div className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/5 p-2 break-all">
                            NEW KEY (shown once): {issuedApiKey}
                        </div>
                    )}
                    <div className="space-y-1">
                        {vendorApiKeys.map((k) => (
                            <div key={k.id} className="text-xs border border-zinc-800 p-2 text-zinc-300 flex items-center justify-between gap-2">
                                <span>{k.name} | {k.key_prefix}*** | {k.status}</span>
                                {k.status === 'ACTIVE' && (
                                    <button
                                        onClick={() => revokeVendorApiKey(k.id)}
                                        className="px-2 py-1 border border-rose-500/40 text-rose-400 text-[10px] uppercase tracking-widest"
                                    >
                                        REVOKE
                                    </button>
                                )}
                            </div>
                        ))}
                        {selectedVendor && vendorApiKeys.length === 0 && <div className="text-xs text-zinc-600 uppercase">NO_VENDOR_API_KEYS</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
