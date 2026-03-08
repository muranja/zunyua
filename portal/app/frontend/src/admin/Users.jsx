import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Users, Search, UserX, Clock, Zap, Shield, ShieldOff,
    CheckCircle, Loader2, AlertCircle, Plus, Minus, UserPlus, Trash2, Ticket
} from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin/users' : '/api/admin/users';
const PLANS_URL = import.meta.env.DEV ? 'http://localhost:3000/api/plans' : '/api/plans';

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [actionModal, setActionModal] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [extendMinutes, setExtendMinutes] = useState(60);
    const [newSpeed, setNewSpeed] = useState('5M');
    const [message, setMessage] = useState(null);
    const [policyReason, setPolicyReason] = useState('');
    const [blockedMacs, setBlockedMacs] = useState([]);
    const [whitelistedMacs, setWhitelistedMacs] = useState([]);

    // Add User state
    const [showAddModal, setShowAddModal] = useState(false);
    const [plans, setPlans] = useState([]);
    const [newUser, setNewUser] = useState({ phone: '', mac: '', planId: '' });

    useEffect(() => {
        fetchUsers();
        fetchPlans();
        fetchMacPolicies();
    }, []);

    const getAuthHeader = () => ({
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        'Content-Type': 'application/json'
    });

    const fetchUsers = async () => {
        try {
            const res = await fetch(API_URL, { headers: getAuthHeader() });
            const data = await res.json();
            if (data.success) {
                setUsers(data.users);
            }
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchPlans = async () => {
        try {
            const res = await fetch(PLANS_URL);
            const data = await res.json();
            if (Array.isArray(data)) {
                setPlans(data);
            }
        } catch (err) {
            console.error('Failed to fetch plans:', err);
        }
    };

    const fetchMacPolicies = async () => {
        try {
            const headers = getAuthHeader();
            const [blockedRes, whitelistedRes] = await Promise.all([
                fetch(`${API_URL}/blocked-macs`, { headers }),
                fetch(`${API_URL}/whitelisted-macs`, { headers })
            ]);
            const blockedData = await blockedRes.json();
            const whitelistedData = await whitelistedRes.json();
            if (blockedData.success) setBlockedMacs(blockedData.blockedMacs || []);
            if (whitelistedData.success) setWhitelistedMacs(whitelistedData.whitelistedMacs || []);
        } catch (err) {
            console.error('Failed to fetch MAC policy lists:', err);
        }
    };

    const handleAddUser = async () => {
        if (!newUser.phone || !newUser.planId) {
            showMessage('Phone and plan are required', 'error');
            return;
        }
        setActionLoading(true);

        try {
            const res = await fetch(`${API_URL}/add`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({
                    phoneNumber: newUser.phone,
                    macAddress: newUser.mac || undefined,
                    planId: parseInt(newUser.planId)
                })
            });
            const data = await res.json();

            if (data.success) {
                showMessage('User added successfully');
                fetchUsers();
                setShowAddModal(false);
                setNewUser({ phone: '', mac: '', planId: '' });
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to add user', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 3000);
    };

    const handleDisconnect = async () => {
        if (!selectedUser) return;
        setActionLoading(true);

        try {
            const res = await fetch(`${API_URL}/${selectedUser.id}/disconnect`, {
                method: 'POST',
                headers: getAuthHeader()
            });
            const data = await res.json();

            if (data.success) {
                showMessage('User disconnected successfully');
                fetchUsers();
                fetchMacPolicies();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to disconnect user', 'error');
        } finally {
            setActionLoading(false);
            setActionModal(null);
            setSelectedUser(null);
        }
    };

    const handleBlacklist = async () => {
        if (!selectedUser?.mac_address) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/block-mac`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({
                    macAddress: selectedUser.mac_address,
                    reason: policyReason || 'Blocked by admin'
                })
            });
            const data = await res.json();
            if (data.success) {
                showMessage('MAC blacklisted successfully');
                fetchUsers();
                fetchMacPolicies();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to blacklist MAC', 'error');
        } finally {
            setActionLoading(false);
            setActionModal(null);
            setSelectedUser(null);
            setPolicyReason('');
        }
    };

    const handleWhitelist = async () => {
        if (!selectedUser?.mac_address) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/whitelist-mac`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({
                    macAddress: selectedUser.mac_address,
                    note: policyReason || 'Whitelisted by admin'
                })
            });
            const data = await res.json();
            if (data.success) {
                showMessage('MAC whitelisted successfully');
                fetchMacPolicies();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to whitelist MAC', 'error');
        } finally {
            setActionLoading(false);
            setActionModal(null);
            setSelectedUser(null);
            setPolicyReason('');
        }
    };

    const handleDelete = async () => {
        if (!selectedUser?.id) return;
        setActionLoading(true);
        try {
            const res = await fetch(`${API_URL}/${selectedUser.id}`, {
                method: 'DELETE',
                headers: getAuthHeader()
            });
            const data = await res.json();
            if (data.success) {
                showMessage('User deleted successfully');
                fetchUsers();
                fetchMacPolicies();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to delete user', 'error');
        } finally {
            setActionLoading(false);
            setActionModal(null);
            setSelectedUser(null);
        }
    };

    const handleUnblockMac = async (macAddress) => {
        try {
            const res = await fetch(`${API_URL}/unblock-mac`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({ macAddress })
            });
            const data = await res.json();
            if (data.success) {
                showMessage('MAC removed from blacklist');
                fetchMacPolicies();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to remove blacklist', 'error');
        }
    };

    const handleUnwhitelistMac = async (macAddress) => {
        try {
            const res = await fetch(`${API_URL}/unwhitelist-mac`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({ macAddress })
            });
            const data = await res.json();
            if (data.success) {
                showMessage('MAC removed from whitelist');
                fetchMacPolicies();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to remove whitelist', 'error');
        }
    };

    const handleExtend = async () => {
        if (!selectedUser) return;
        setActionLoading(true);

        try {
            const res = await fetch(`${API_URL}/${selectedUser.id}/extend`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({ minutes: extendMinutes })
            });
            const data = await res.json();

            if (data.success) {
                showMessage(`Extended by ${extendMinutes} minutes`);
                fetchUsers();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to extend session', 'error');
        } finally {
            setActionLoading(false);
            setActionModal(null);
            setSelectedUser(null);
        }
    };

    const handleSpeedChange = async () => {
        if (!selectedUser) return;
        setActionLoading(true);

        try {
            const res = await fetch(`${API_URL}/${selectedUser.id}/speed`, {
                method: 'POST',
                headers: getAuthHeader(),
                body: JSON.stringify({ downloadSpeed: newSpeed })
            });
            const data = await res.json();

            if (data.success) {
                showMessage(`Speed changed to ${newSpeed}`);
                fetchUsers();
            } else {
                showMessage(data.error, 'error');
            }
        } catch (err) {
            showMessage('Failed to change speed', 'error');
        } finally {
            setActionLoading(false);
            setActionModal(null);
            setSelectedUser(null);
        }
    };

    const formatTime = (minutes) => {
        if (minutes < 0) return 'EXPIRED';
        if (minutes < 60) return `${minutes}M`;
        if (minutes < 1440) return `${Math.floor(minutes / 60)}H ${minutes % 60}M`;
        return `${Math.floor(minutes / 1440)}D ${Math.floor((minutes % 1440) / 60)}H`;
    };

    const filteredUsers = users.filter(user =>
        user.phone_number?.includes(searchTerm) ||
        user.mac_address?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 font-mono custom-scrollbar">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2 tracking-widest uppercase">
                        <Users className="w-5 h-5 text-emerald-500" />
                        CLIENT.DB
                    </h2>
                    <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest flex items-center gap-2">
                        SYS: {users.length} ACTIVE_NODES
                        <button
                            onClick={fetchUsers}
                            className="text-zinc-600 hover:text-emerald-400 transition-colors bg-zinc-900 border border-zinc-800 p-0.5"
                            title="REFRESH_DATA"
                        >
                            <Loader2 className={`w-3 h-3 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
                        </button>
                    </p>
                </div>
                <div className="w-full sm:w-auto">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowAddModal(true)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 px-4 py-2 text-xs font-bold tracking-widest uppercase transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                        INVOKE_USER
                    </motion.button>
                </div>
            </div>

            {/* Message Toast */}
            {message && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 border flex items-center gap-2 text-xs tracking-widest uppercase ${message.type === 'error'
                        ? 'bg-rose-500/5 border-rose-500/20 text-rose-500'
                        : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                        }`}
                >
                    {message.type === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                    {message.text}
                </motion.div>
            )}

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                    type="text"
                    placeholder="QUERY_IDENTIFIER_OR_MAC..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#050505] border border-zinc-800 py-3 pl-10 pr-4 text-emerald-400 text-sm placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors uppercase"
                />
            </div>

            {/* Users List */}
            <div className="border border-zinc-800 bg-[#050505] relative">
                {/* Corner Accents */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500/30" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500/30" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500/30" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500/30" />

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mb-4" />
                        <span className="text-[10px] tracking-widest uppercase">AQUIRING_DATA_LINK...</span>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-zinc-600 text-[10px] tracking-widest uppercase">
                        NO_ACTIVE_NODES_FOUND
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-800/50">
                        {filteredUsers.map((user) => (
                            <div key={user.id} className="p-4 hover:bg-zinc-900/50 transition-colors group">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    {/* User Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="font-bold text-zinc-300 text-sm">{user.phone_number}</span>
                                            <span className={`inline-flex px-2 py-0.5 border text-[10px] tracking-widest uppercase ${user.minutes_remaining > 60
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : user.minutes_remaining > 0
                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                    : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                                }`}>
                                                TTL: {formatTime(user.minutes_remaining)}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-zinc-500 tracking-wider uppercase">
                                            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 text-zinc-600" /> {user.mac_address}</span>
                                            <span className="flex items-center gap-1.5"><Ticket className="w-3 h-3 text-zinc-600" /> {user.plan_name}</span>
                                            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-emerald-500/50" /> {user.speed_limit_down}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setSelectedUser(user); setActionModal('blacklist'); }}
                                            className="p-2 border border-zinc-800 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10 transition-colors"
                                            title="BLACKLIST_MAC"
                                        >
                                            <ShieldOff className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedUser(user); setActionModal('whitelist'); }}
                                            className="p-2 border border-zinc-800 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-colors"
                                            title="WHITELIST_MAC"
                                        >
                                            <Shield className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedUser(user); setActionModal('extend'); }}
                                            className="p-2 border border-zinc-800 text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/10 transition-colors"
                                            title="EXTEND_TTL"
                                        >
                                            <Clock className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedUser(user); setActionModal('speed'); }}
                                            className="p-2 border border-zinc-800 text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/10 transition-colors"
                                            title="MOD_BANDWIDTH"
                                        >
                                            <Zap className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedUser(user); setActionModal('disconnect'); }}
                                            className="p-2 border border-zinc-800 text-rose-500 hover:border-rose-500/50 hover:bg-rose-500/10 transition-colors"
                                            title="TERMINATE_NODE"
                                        >
                                            <UserX className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedUser(user); setActionModal('delete'); }}
                                            className="p-2 border border-zinc-800 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-500/10 transition-colors"
                                            title="DELETE_USER"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-zinc-800 bg-[#050505] p-4">
                    <h3 className="text-xs tracking-widest uppercase text-rose-400 mb-3">BLACKLISTED_MACS</h3>
                    <div className="space-y-2 max-h-52 overflow-auto custom-scrollbar">
                        {blockedMacs.length === 0 && <div className="text-[10px] text-zinc-600 tracking-widest uppercase">NONE</div>}
                        {blockedMacs.map((row) => (
                            <div key={row.id} className="flex items-center justify-between border border-zinc-800 p-2">
                                <div className="text-[10px] text-zinc-400 tracking-widest">{row.mac_address}</div>
                                <button
                                    onClick={() => handleUnblockMac(row.mac_address)}
                                    className="text-[10px] px-2 py-1 border border-zinc-700 text-zinc-300 hover:text-emerald-400 hover:border-emerald-500/40"
                                >
                                    REMOVE
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="border border-zinc-800 bg-[#050505] p-4">
                    <h3 className="text-xs tracking-widest uppercase text-emerald-400 mb-3">WHITELISTED_MACS</h3>
                    <div className="space-y-2 max-h-52 overflow-auto custom-scrollbar">
                        {whitelistedMacs.length === 0 && <div className="text-[10px] text-zinc-600 tracking-widest uppercase">NONE</div>}
                        {whitelistedMacs.map((row) => (
                            <div key={row.id} className="flex items-center justify-between border border-zinc-800 p-2">
                                <div className="text-[10px] text-zinc-400 tracking-widest">{row.mac_address}</div>
                                <button
                                    onClick={() => handleUnwhitelistMac(row.mac_address)}
                                    className="text-[10px] px-2 py-1 border border-zinc-700 text-zinc-300 hover:text-amber-400 hover:border-amber-500/40"
                                >
                                    REMOVE
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Action Modals */}
            {actionModal && selectedUser && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#050505] border border-zinc-800 p-6 w-full max-w-md relative"
                    >
                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-500/50" />
                        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-zinc-500/50" />
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-zinc-500/50" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-500/50" />

                        {/* Disconnect Modal */}
                        {actionModal === 'disconnect' && (
                            <>
                                <h3 className="text-sm font-bold text-rose-500 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                                    <UserX className="w-4 h-4" />
                                    CONFIRM_TERMINATION
                                </h3>
                                <div className="text-zinc-400 mb-6 text-xs uppercase tracking-wider bg-rose-500/5 border border-rose-500/20 p-4">
                                    SYS.WARN: ABOUT TO DISCONNECT NODE
                                    <div className="text-rose-400 font-bold mt-2 text-sm">{selectedUser.phone_number}</div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setActionModal(null); setSelectedUser(null); }}
                                        className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors"
                                    >
                                        ABORT
                                    </button>
                                    <button
                                        onClick={handleDisconnect}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 bg-rose-500/10 border border-rose-500/50 text-rose-500 font-bold hover:bg-rose-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                                        EXECUTE
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Extend Modal */}
                        {actionModal === 'extend' && (
                            <>
                                <h3 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                                    <Clock className="w-4 h-4" />
                                    MOD_TTL
                                </h3>
                                <div className="text-zinc-500 mb-4 text-[10px] tracking-widest uppercase">
                                    TARGET: <span className="text-blue-400 font-bold">{selectedUser.phone_number}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4 mb-6 bg-[#000000] border border-zinc-800 p-2">
                                    <button
                                        onClick={() => setExtendMinutes(Math.max(15, extendMinutes - 30))}
                                        className="p-3 bg-zinc-900 text-zinc-400 hover:text-blue-400 transition-colors"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <div className="text-center font-bold text-xl text-blue-400 flex items-baseline gap-1">
                                        {extendMinutes} <span className="text-[10px] text-zinc-600 font-normal tracking-widest uppercase">MIN</span>
                                    </div>
                                    <button
                                        onClick={() => setExtendMinutes(extendMinutes + 30)}
                                        className="p-3 bg-zinc-900 text-zinc-400 hover:text-blue-400 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-5 gap-2 mb-6">
                                    {[30, 60, 120, 360, 1440].map(mins => (
                                        <button
                                            key={mins}
                                            onClick={() => setExtendMinutes(mins)}
                                            className={`py-2 text-[10px] tracking-wider uppercase border transition-colors ${extendMinutes === mins
                                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/50 font-bold'
                                                : 'bg-[#000000] text-zinc-500 border-zinc-800 hover:border-zinc-600'
                                                }`}
                                        >
                                            {mins < 60 ? `${mins}M` : mins < 1440 ? `${mins / 60}H` : '1D'}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setActionModal(null); setSelectedUser(null); }}
                                        className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors"
                                    >
                                        ABORT
                                    </button>
                                    <button
                                        onClick={handleExtend}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 bg-blue-500/10 border border-blue-500/50 text-blue-400 font-bold hover:bg-blue-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                                        APPLY
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Speed Modal */}
                        {actionModal === 'speed' && (
                            <>
                                <h3 className="text-sm font-bold text-amber-500 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                                    <Zap className="w-4 h-4" />
                                    BANDWIDTH_CAP
                                </h3>
                                <div className="text-zinc-500 mb-6 text-[10px] tracking-widest uppercase">
                                    CURRENT_ALLOC: <span className="text-amber-500 font-bold">{selectedUser.speed_limit_down}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mb-6">
                                    {['2M', '3M', '5M', '8M', '10M', '20M'].map(speed => (
                                        <button
                                            key={speed}
                                            onClick={() => setNewSpeed(speed)}
                                            className={`py-3 text-xs tracking-widest uppercase border transition-colors ${newSpeed === speed
                                                ? 'bg-amber-500/20 text-amber-500 border-amber-500/50 font-bold'
                                                : 'bg-[#000000] text-zinc-500 border-zinc-800 hover:border-zinc-600'
                                                }`}
                                        >
                                            {speed}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setActionModal(null); setSelectedUser(null); }}
                                        className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors"
                                    >
                                        ABORT
                                    </button>
                                    <button
                                        onClick={handleSpeedChange}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 bg-amber-500/10 border border-amber-500/50 text-amber-500 font-bold hover:bg-amber-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"
                                    >
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                        APPLY
                                    </button>
                                </div>
                            </>
                        )}

                        {actionModal === 'blacklist' && (
                            <>
                                <h3 className="text-sm font-bold text-rose-500 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                                    <ShieldOff className="w-4 h-4" />
                                    BLACKLIST_MAC
                                </h3>
                                <div className="text-zinc-500 mb-2 text-[10px] tracking-widest uppercase">
                                    TARGET: <span className="text-rose-400 font-bold">{selectedUser.mac_address}</span>
                                </div>
                                <input
                                    type="text"
                                    value={policyReason}
                                    onChange={(e) => setPolicyReason(e.target.value)}
                                    placeholder="REASON (OPTIONAL)"
                                    className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-zinc-300 text-xs placeholder-zinc-700 focus:outline-none focus:border-rose-500/50 uppercase mb-6"
                                />
                                <div className="flex gap-3">
                                    <button onClick={() => { setActionModal(null); setSelectedUser(null); setPolicyReason(''); }} className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors">ABORT</button>
                                    <button onClick={handleBlacklist} disabled={actionLoading} className="flex-1 py-3 bg-rose-500/10 border border-rose-500/50 text-rose-500 font-bold hover:bg-rose-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors">
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />} APPLY
                                    </button>
                                </div>
                            </>
                        )}

                        {actionModal === 'whitelist' && (
                            <>
                                <h3 className="text-sm font-bold text-emerald-400 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                                    <Shield className="w-4 h-4" />
                                    WHITELIST_MAC
                                </h3>
                                <div className="text-zinc-500 mb-2 text-[10px] tracking-widest uppercase">
                                    TARGET: <span className="text-emerald-400 font-bold">{selectedUser.mac_address}</span>
                                </div>
                                <input
                                    type="text"
                                    value={policyReason}
                                    onChange={(e) => setPolicyReason(e.target.value)}
                                    placeholder="NOTE (OPTIONAL)"
                                    className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-zinc-300 text-xs placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 uppercase mb-6"
                                />
                                <div className="flex gap-3">
                                    <button onClick={() => { setActionModal(null); setSelectedUser(null); setPolicyReason(''); }} className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors">ABORT</button>
                                    <button onClick={handleWhitelist} disabled={actionLoading} className="flex-1 py-3 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 font-bold hover:bg-emerald-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors">
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />} APPLY
                                    </button>
                                </div>
                            </>
                        )}

                        {actionModal === 'delete' && (
                            <>
                                <h3 className="text-sm font-bold text-zinc-300 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                                    <Trash2 className="w-4 h-4" />
                                    DELETE_USER
                                </h3>
                                <div className="text-zinc-400 mb-6 text-xs uppercase tracking-wider bg-zinc-900 border border-zinc-800 p-4">
                                    THIS WILL REVOKE ACCESS AND REMOVE RADIUS LOGIN FOR:
                                    <div className="text-zinc-200 font-bold mt-2 text-sm">{selectedUser.phone_number}</div>
                                    <div className="text-zinc-500 text-[10px] mt-1">{selectedUser.mac_address}</div>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => { setActionModal(null); setSelectedUser(null); }} className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors">ABORT</button>
                                    <button onClick={handleDelete} disabled={actionLoading} className="flex-1 py-3 bg-zinc-100/10 border border-zinc-500/50 text-zinc-200 font-bold hover:bg-zinc-100/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors">
                                        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} EXECUTE
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#050505] border border-zinc-800 p-6 w-full max-w-md relative"
                    >
                        {/* Corner Accents */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500/50" />
                        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500/50" />
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500/50" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500/50" />

                        <h3 className="text-sm font-bold text-emerald-500 mb-4 flex items-center gap-2 tracking-widest uppercase border-b border-zinc-800 pb-3">
                            <UserPlus className="w-4 h-4" />
                            SYS.USER_INIT
                        </h3>

                        <div className="space-y-5">
                            {/* Phone Number */}
                            <div>
                                <label className="block text-[10px] tracking-widest uppercase text-zinc-500 mb-2">IDENTIFIER (PHONE) *</label>
                                <input
                                    type="tel"
                                    value={newUser.phone}
                                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                                    placeholder="07XXXXXXXX"
                                    className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-emerald-400 text-sm placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 uppercase"
                                />
                            </div>

                            {/* MAC Address */}
                            <div>
                                <label className="block text-[10px] tracking-widest uppercase text-zinc-500 mb-2">HW_ADDR (OPTIONAL)</label>
                                <input
                                    type="text"
                                    value={newUser.mac}
                                    onChange={(e) => setNewUser({ ...newUser, mac: e.target.value.toUpperCase() })}
                                    placeholder="XX:XX:XX:XX:XX:XX"
                                    className="w-full bg-[#000000] border border-zinc-800 py-3 px-4 text-emerald-400 text-sm placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>

                            {/* Plan Selection */}
                            <div>
                                <label className="block text-[10px] tracking-widest uppercase text-zinc-500 mb-2">SVC_PLAN *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {plans.map(plan => (
                                        <button
                                            key={plan.id}
                                            onClick={() => setNewUser({ ...newUser, planId: plan.id })}
                                            className={`p-3 border text-left transition-colors ${newUser.planId === plan.id
                                                ? 'bg-emerald-500/10 border-emerald-500/50'
                                                : 'bg-[#000000] border-zinc-800 hover:border-zinc-600'
                                                }`}
                                        >
                                            <div className={`text-xs font-bold tracking-wider uppercase ${newUser.planId === plan.id ? 'text-emerald-400' : 'text-zinc-300'}`}>{plan.name}</div>
                                            <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest">KES {plan.price}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => { setShowAddModal(false); setNewUser({ phone: '', mac: '', planId: '' }); }}
                                className="flex-1 py-3 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 text-xs tracking-widest uppercase transition-colors"
                            >
                                ABORT
                            </button>
                            <button
                                onClick={handleAddUser}
                                disabled={actionLoading || !newUser.phone || !newUser.planId}
                                className="flex-1 py-3 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 font-bold hover:bg-emerald-500/20 disabled:opacity-50 text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-colors"
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                EXECUTE
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
