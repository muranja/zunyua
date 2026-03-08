import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, User, Loader2, AlertCircle, Server, KeyRound } from 'lucide-react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function Login({ onLoginSuccess }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [requireOtp, setRequireOtp] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, otpCode: otpCode.trim() || undefined })
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.code === 'OTP_REQUIRED') {
                    setRequireOtp(true);
                }
                throw new Error(data.error || 'Login failed');
            }

            // Store tokens
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('admin', JSON.stringify(data.admin));

            onLoginSuccess(data.admin);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
            {/* Top scanning line aesthetic */}
            <div className="fixed top-0 left-0 w-full h-[1px] bg-emerald-500/20" />

            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-sm"
            >
                {/* Boot screen text */}
                <div className="font-mono text-[10px] text-zinc-600 mb-4 tracking-widest uppercase">
                    <div>INIT... SECURE_TERMINAL_V2</div>
                    <div>AWAITING AUTH_TOKEN</div>
                </div>

                <div className="bg-[#050505] border border-zinc-800 p-8 relative">
                    {/* Corner accents */}
                    <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500/50" />
                    <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500/50" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500/50" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500/50" />

                    {/* Header */}
                    <div className="mb-8 border-b border-zinc-800 pb-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Server className="w-6 h-6 text-emerald-500" />
                            <h1 className="text-xl font-bold text-zinc-100 font-mono tracking-widest uppercase">TURBONET_</h1>
                        </div>
                        <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest">
                            SYSTEM_ADMIN_ACCESS
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-zinc-500 mb-2">
                                IDENTIFIER
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-[#000000] border border-zinc-800 py-3 pl-10 pr-4 text-emerald-400 font-mono text-sm placeholder-zinc-700 outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors"
                                    placeholder="admin_ID"
                                    required
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-mono tracking-widest uppercase text-zinc-500 mb-2">
                                PASSKEY
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-[#000000] border border-zinc-800 py-3 pl-10 pr-4 text-emerald-400 font-mono text-sm placeholder-zinc-700 outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors"
                                    placeholder="********"
                                    required
                                />
                            </div>
                        </div>

                        {requireOtp && (
                            <div>
                                <label className="block text-[10px] font-mono tracking-widest uppercase text-zinc-500 mb-2">
                                    OTP_CODE
                                </label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                    <input
                                        type="text"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full bg-[#000000] border border-zinc-800 py-3 pl-10 pr-4 text-emerald-400 font-mono text-sm placeholder-zinc-700 outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-colors tracking-[0.2em]"
                                        placeholder="123456"
                                        required={requireOtp}
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-start gap-2 text-rose-500 text-xs font-mono bg-rose-500/5 border border-rose-500/20 p-3"
                            >
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>ERR: {error}</span>
                            </motion.div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-mono text-xs font-bold py-4 tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    VERIFYING...
                                </>
                            ) : (
                                'EXECUTE_LOGIN'
                            )}
                        </button>
                    </form>
                </div>

                <div className="mt-4 text-center font-mono text-[9px] text-zinc-700 tracking-widest uppercase">
                    UNAUTHORIZED ACCESS PROHIBITED
                </div>
            </motion.div>
        </div>
    );
}
