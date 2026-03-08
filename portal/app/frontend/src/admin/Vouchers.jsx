import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Ticket, Plus, Search, Filter, Trash2, Copy,
    CheckCircle, XCircle, Clock, Loader2
} from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function Vouchers() {
    const [vouchers, setVouchers] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [filters, setFilters] = useState({ status: '', code: '' });
    const [newVoucher, setNewVoucher] = useState({ planId: '', count: 1, expiresInDays: 30 });
    const [generatedCodes, setGeneratedCodes] = useState([]);
    const [copiedCode, setCopiedCode] = useState(null);

    useEffect(() => {
        fetchVouchers();
        fetchPlans();
    }, [filters]);

    const getAuthHeader = () => ({
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        'Content-Type': 'application/json'
    });

    const fetchVouchers = async () => {
        try {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.code) params.append('code', filters.code);

            const res = await fetch(`${API_URL}/vouchers?${params}`, {
                headers: getAuthHeader()
            });
            const data = await res.json();
            setVouchers(data.vouchers || []);
        } catch (err) {
            console.error('Failed to fetch vouchers:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPlans = async () => {
        try {
            const res = await fetch(`${API_URL}/plans`, {
                headers: getAuthHeader()
            });
            const data = await res.json();
            setPlans(data);
        } catch (err) {
            console.error('Failed to fetch plans:', err);
        }
    };

    const generateVouchers = async () => {
        if (!newVoucher.planId) return;

        setGenerating(true);
        try {
            const res = await fetch(`${API_URL}/vouchers/generate`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify(newVoucher)
            });
            const data = await res.json();

            if (data.success) {
                setGeneratedCodes(data.vouchers);
                fetchVouchers();
            }
        } catch (err) {
            console.error('Failed to generate vouchers:', err);
        } finally {
            setGenerating(false);
        }
    };

    const revokeVoucher = async (id) => {
        if (!confirm('Are you confirm REVOKE_TOKEN directive?')) return;

        try {
            await fetch(`${API_URL}/vouchers/${id}/revoke`, {
                method: 'POST',
                headers: getAuthHeader()
            });
            fetchVouchers();
        } catch (err) {
            console.error('Failed to revoke voucher:', err);
        }
    };

    const copyToClipboard = (text, id = null) => {
        navigator.clipboard.writeText(text);
        if (id) {
            setCopiedCode(id);
            setTimeout(() => setCopiedCode(null), 2000);
        }
    };

    const statusIcon = {
        ACTIVE: <Clock className="w-3 h-3 text-emerald-400" />,
        REDEEMED: <CheckCircle className="w-3 h-3 text-emerald-400" />,
        EXPIRED: <XCircle className="w-3 h-3 text-zinc-500" />,
        REVOKED: <XCircle className="w-3 h-3 text-red-500" />
    };

    const statusColor = {
        ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        REDEEMED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        EXPIRED: 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50',
        REVOKED: 'bg-red-500/10 text-red-500 border-red-500/20'
    };

    return (
        <div className="space-y-6 font-mono custom-scrollbar">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 tracking-widest uppercase">
                        <Ticket className="w-5 h-5 text-emerald-500" />
                        TOKENS.MGR
                    </h2>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest">
                        SYS: {vouchers.length} RECORDS FOUND
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowModal(true); setGeneratedCodes([]); }}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-4 py-2 text-xs font-bold tracking-widest uppercase transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    GEN_TOKENS
                </motion.button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                    <input
                        type="text"
                        placeholder="SEARCH_QUERY..."
                        value={filters.code}
                        onChange={(e) => setFilters({ ...filters, code: e.target.value })}
                        className="w-full bg-[#050505] border border-zinc-800 py-3 pl-10 pr-4 text-emerald-400 text-sm placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors uppercase"
                    />
                </div>
                <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="bg-[#050505] border border-zinc-800 py-3 px-4 text-zinc-400 text-sm focus:outline-none focus:border-emerald-500/50 uppercase appearance-none"
                    style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                >
                    <option value="">ALL_STATUS</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="REDEEMED">REDEEMED</option>
                    <option value="EXPIRED">EXPIRED</option>
                    <option value="REVOKED">REVOKED</option>
                </select>
            </div>

            {/* Vouchers List */}
            <div className="border border-zinc-800 bg-[#050505] relative">
                {/* Corner Accents */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500/30" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500/30" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500/30" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500/30" />

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-4" />
                        <span className="text-[10px] tracking-widest uppercase">FETCHING_RECORDS...</span>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-zinc-500 text-[10px] tracking-widest border-b border-zinc-800 bg-zinc-900/30 uppercase">
                                        <th className="p-4 font-normal">TOKEN_ID</th>
                                        <th className="p-4 font-normal">PLAN_REF</th>
                                        <th className="p-4 font-normal">STATUS</th>
                                        <th className="p-4 font-normal">TIMESTAMP</th>
                                        <th className="p-4 font-normal">USER_REF</th>
                                        <th className="p-4 font-normal">CMD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vouchers.map((voucher) => (
                                        <tr key={voucher.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-300 font-bold tracking-wider">{voucher.code}</span>
                                                    <button
                                                        onClick={() => copyToClipboard(voucher.code, voucher.id)}
                                                        className="text-zinc-600 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        {copiedCode === voucher.id ? (
                                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="p-4 text-zinc-400 uppercase text-xs">{voucher.plan_name} <span className="text-zinc-600 ml-1">KES {voucher.plan_price}</span></td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] tracking-widest uppercase ${statusColor[voucher.status]}`}>
                                                    {statusIcon[voucher.status]}
                                                    {voucher.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-zinc-500 text-xs">
                                                {new Date(voucher.created_at).toISOString().replace('T', ' ').substring(0, 19)}
                                            </td>
                                            <td className="p-4 text-zinc-400 text-xs">
                                                {voucher.redeemed_by_phone || '---'}
                                            </td>
                                            <td className="p-4">
                                                {voucher.status === 'ACTIVE' && (
                                                    <button
                                                        onClick={() => revokeVoucher(voucher.id)}
                                                        className="text-zinc-600 hover:text-red-500 transition-colors"
                                                        title="REVOKE_TOKEN"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {vouchers.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="p-8 text-center text-zinc-600 text-[10px] tracking-widest uppercase">
                                                NO_RECORDS_FOUND
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile List View */}
                        <div className="lg:hidden divide-y divide-zinc-800">
                            {vouchers.map((voucher) => (
                                <div key={voucher.id} className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-zinc-300 text-sm truncate tracking-wider">{voucher.code}</span>
                                            <button
                                                onClick={() => copyToClipboard(voucher.code, voucher.id)}
                                                className="text-zinc-600 hover:text-emerald-400 flex-shrink-0"
                                            >
                                                {copiedCode === voucher.id ? (
                                                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                                                ) : (
                                                    <Copy className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] tracking-widest uppercase flex-shrink-0 ${statusColor[voucher.status]}`}>
                                            {statusIcon[voucher.status]}
                                            {voucher.status}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-zinc-400 uppercase">
                                        <span>{voucher.plan_name}</span>
                                        <span className="text-emerald-500/70">KES {voucher.plan_price}</span>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-zinc-600">
                                        <span>INIT: {new Date(voucher.created_at).toISOString().substring(0, 10)}</span>
                                        {voucher.redeemed_by_phone && (
                                            <span className="text-zinc-400">USR: {voucher.redeemed_by_phone}</span>
                                        )}
                                    </div>

                                    {voucher.status === 'ACTIVE' && (
                                        <button
                                            onClick={() => revokeVoucher(voucher.id)}
                                            className="w-full mt-3 py-2 text-rose-500 text-[10px] tracking-widest uppercase border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            REVOKE_TOKEN
                                        </button>
                                    )}
                                </div>
                            ))}
                            {vouchers.length === 0 && (
                                <div className="p-8 text-center text-zinc-600 text-[10px] tracking-widest uppercase">
                                    NO_RECORDS_FOUND
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Generate Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#050505] border border-zinc-800 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative"
                    >
                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500/50" />
                        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500/50" />
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500/50" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500/50" />

                        <div className="mb-6 border-b border-zinc-800 pb-4">
                            <h3 className="text-[10px] tracking-widest text-emerald-500 uppercase flex items-center gap-2">
                                <Ticket className="w-4 h-4" /> // TOKEN_GENERATOR
                            </h3>
                        </div>

                        {generatedCodes.length === 0 ? (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] text-zinc-500 mb-2 tracking-widest uppercase">TARGET_PLAN</label>
                                    <select
                                        value={newVoucher.planId}
                                        onChange={(e) => setNewVoucher({ ...newVoucher, planId: e.target.value })}
                                        className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-emerald-400 text-sm focus:outline-none focus:border-emerald-500/50 uppercase appearance-none"
                                        style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                                    >
                                        <option value="">-- SELECT_PLAN --</option>
                                        {plans.map(plan => (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name} // KES {plan.price}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] text-zinc-500 mb-2 tracking-widest uppercase">BATCH_SIZE</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={newVoucher.count}
                                            onChange={(e) => setNewVoucher({ ...newVoucher, count: parseInt(e.target.value) })}
                                            className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-zinc-300 text-sm focus:outline-none focus:border-emerald-500/50 text-center"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] text-zinc-500 mb-2 tracking-widest uppercase">TTL (DAYS)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={newVoucher.expiresInDays}
                                            onChange={(e) => setNewVoucher({ ...newVoucher, expiresInDays: parseInt(e.target.value) })}
                                            className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-zinc-300 text-sm focus:outline-none focus:border-emerald-500/50 text-center"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors"
                                    >
                                        ABORT
                                    </button>
                                    <button
                                        onClick={generateVouchers}
                                        disabled={generating || !newVoucher.planId}
                                        className="flex-1 py-3 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 font-bold hover:bg-emerald-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        EXECUTE
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                                    <div className="text-emerald-400 text-sm uppercase tracking-wider">
                                        BATCH_GENERATION_SUCCESSFUL<br />
                                        <span className="text-[10px] text-emerald-500/70">PRODUCED {generatedCodes.length} TICKETS</span>
                                    </div>
                                </div>

                                <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {generatedCodes.map((v, i) => (
                                        <div key={i} className="flex items-center justify-between bg-[#000000] border border-zinc-800 p-3">
                                            <span className="font-mono font-bold text-zinc-300 tracking-wider text-sm">{v.code}</span>
                                            <button
                                                onClick={() => copyToClipboard(v.code)}
                                                className="text-zinc-600 hover:text-emerald-400 transition-colors"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-3 pt-4 border-t border-zinc-800">
                                    <button
                                        onClick={() => {
                                            const codes = generatedCodes.map(v => v.code).join('\n');
                                            copyToClipboard(codes);
                                        }}
                                        className="w-full py-3 bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 text-xs tracking-widest uppercase transition-colors"
                                    >
                                        COPY_ALL_TO_CLIPBOARD
                                    </button>

                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="w-full py-3 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 text-xs tracking-widest uppercase font-bold transition-colors"
                                    >
                                        ACKNOWLEDGE_&_CLOSE
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </div>
    );
}
