import React, { useState, useEffect } from 'react';
import { ShieldCheck, KeyRound, Loader2, AlertCircle, Save } from 'lucide-react';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const API_URL = import.meta.env.DEV ? 'http://localhost:3000/api/admin' : '/api/admin';

export default function Security() {
    // Password Change State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [pwdOtpCode, setPwdOtpCode] = useState('');
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdMsg, setPwdMsg] = useState('');
    const [pwdErr, setPwdErr] = useState('');

    // 2FA State
    const [twoFactor, setTwoFactor] = useState({ enabled: false, setupPending: false });
    const [twoFactorSecret, setTwoFactorSecret] = useState('');
    const [twoFactorUri, setTwoFactorUri] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [twoFactorMsg, setTwoFactorMsg] = useState('');
    const [backupCodes, setBackupCodes] = useState([]);

    useEffect(() => {
        fetch2faStatus();
    }, []);

    const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('accessToken')}`, 'Content-Type': 'application/json' });

    const fetch2faStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/2fa/status`, { headers: authHeaders() });
            const data = await res.json();
            if (data.success) setTwoFactor({ enabled: data.twoFactorEnabled, setupPending: data.setupPending });
        } catch (err) {
            console.error('2FA status error:', err);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPwdLoading(true);
        setPwdErr('');
        setPwdMsg('');
        try {
            const res = await fetch(`${API_URL}/password/change`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    otpCode: pwdOtpCode || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to change password');
            setPwdMsg(data.message || 'Password changed');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('admin');
            setTimeout(() => window.location.reload(), 1000);
        } catch (e2) {
            setPwdErr(e2.message);
        } finally {
            setPwdLoading(false);
        }
    };

    const start2faSetup = async () => {
        setTwoFactorMsg('');
        setBackupCodes([]);
        const res = await fetch(`${API_URL}/2fa/setup`, { method: 'POST', headers: authHeaders() });
        const data = await res.json();
        if (!res.ok || !data.success) {
            setTwoFactorMsg(data.error || 'Failed to start 2FA setup');
            return;
        }
        setTwoFactorSecret(data.secret);
        setTwoFactorUri(data.otpauthUri);
        setTwoFactor({ enabled: false, setupPending: true });
    };

    const enable2fa = async () => {
        setTwoFactorMsg('');
        const res = await fetch(`${API_URL}/2fa/enable`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ otpCode })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            setTwoFactorMsg(data.error || 'Failed to enable 2FA');
            return;
        }

        setTwoFactorMsg('2FA enabled successfully');
        setTwoFactorSecret('');
        setTwoFactorUri('');
        setOtpCode('');

        // If the backend generated backup codes during enable, capture them
        if (data.backupCodes) {
            setBackupCodes(data.backupCodes);
        }

        fetch2faStatus();
    };

    const disable2fa = async () => {
        setTwoFactorMsg('');
        const res = await fetch(`${API_URL}/2fa/disable`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ otpCode })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            setTwoFactorMsg(data.error || 'Failed to disable 2FA');
            return;
        }
        setTwoFactorMsg('2FA disabled');
        setOtpCode('');
        setBackupCodes([]);
        fetch2faStatus();
    };

    const downloadBackupCodes = () => {
        const text = `TurboNet 2FA Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${backupCodes.join('\n')}\n\nKeep these secure. Each code can only be used once.`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'turbonet_backup_codes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Password Management */}
            <div className="font-mono p-6 border border-zinc-800 bg-zinc-900/20">
                <h2 className="text-lg text-zinc-300 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    PASSWORD MANAGMENT
                </h2>
                <form className="space-y-4" onSubmit={handleChangePassword}>
                    <input
                        type="password"
                        placeholder="CURRENT_PASSWORD"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-black border border-zinc-800 py-3 px-3 text-zinc-300 text-sm"
                        required
                    />
                    <input
                        type="password"
                        placeholder="NEW_PASSWORD"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-black border border-zinc-800 py-3 px-3 text-zinc-300 text-sm"
                        required
                    />
                    <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                        <input
                            type="text"
                            placeholder="OTP_IF_2FA_ENABLED"
                            value={pwdOtpCode}
                            onChange={(e) => setPwdOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full bg-black border border-zinc-800 py-3 pl-10 pr-3 text-zinc-300 text-sm tracking-[0.2em]"
                        />
                    </div>
                    {pwdErr && <div className="text-rose-400 text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4" />{pwdErr}</div>}
                    {pwdMsg && <div className="text-emerald-400 text-xs">{pwdMsg}</div>}
                    <button
                        type="submit"
                        disabled={pwdLoading}
                        className="px-4 py-3 border border-emerald-500/40 text-emerald-400 text-xs tracking-widest uppercase disabled:opacity-50 flex items-center gap-2"
                    >
                        {pwdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        CHANGE_PASSWORD
                    </button>
                </form>
            </div>

            {/* 2FA Configuration */}
            <div className="border border-zinc-800 bg-[#0a0a0a] p-6 font-mono">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-mono text-zinc-300 tracking-widest uppercase flex items-center gap-2">
                        <KeyRound className="w-5 h-5 text-emerald-500" />
                        TWO-FACTOR AUTHENTICATION
                    </h3>
                    <span className={`text-xs font-mono tracking-widest uppercase ${twoFactor.enabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {twoFactor.enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                </div>

                <p className="text-zinc-500 mb-6 text-sm">
                    Enhance your account security by requiring a second authentication step using an Authenticator app.
                </p>

                {!twoFactor.enabled && !twoFactor.setupPending && (
                    <button
                        onClick={start2faSetup}
                        className="px-4 py-3 border border-emerald-500/40 text-emerald-400 text-xs font-mono tracking-widest uppercase hover:bg-emerald-500/10 transition-colors"
                    >
                        START_SETUP
                    </button>
                )}

                {(twoFactor.setupPending || twoFactor.enabled) && (
                    <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">

                        {/* Backup Codes Display (Only shown immediately after setup) */}
                        {backupCodes.length > 0 && (
                            <div className="border border-amber-500/40 bg-amber-500/5 p-4 mb-6">
                                <h4 className="text-amber-400 text-sm mb-2 font-bold flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    EMERGENCY BACKUP CODES
                                </h4>
                                <p className="text-amber-500/80 text-xs mb-4">
                                    Print or save these codes now. They will only be shown once. If you lose your authenticator app, you can use these to sign in.
                                </p>
                                <div className="grid grid-cols-2 gap-2 mb-4 text-zinc-300 font-bold tracking-widest bg-black p-4 border border-zinc-800">
                                    {backupCodes.map((bc, idx) => (
                                        <div key={idx}>{bc}</div>
                                    ))}
                                </div>
                                <button
                                    onClick={downloadBackupCodes}
                                    className="px-3 py-2 border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs flex items-center gap-2 transition-colors uppercase tracking-widest"
                                >
                                    <Save className="w-4 h-4" />
                                    DOWNLOAD CODES
                                </button>
                            </div>
                        )}

                        {twoFactorSecret && (
                            <div className="text-[11px] font-mono text-zinc-500 break-all border border-zinc-800 p-4 bg-black flex flex-col md:flex-row gap-6">
                                {twoFactorUri && (
                                    <div className="flex flex-col items-start gap-2">
                                        <div className="text-zinc-600 mb-1">SCAN WITH APP:</div>
                                        <div className="bg-white p-2 rounded-md">
                                            <QRCode value={twoFactorUri} size={150} level="H" />
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-col justify-center">
                                    <div className="text-zinc-600 mb-2">OR MANUAL ENTRY CODE:</div>
                                    <div className="text-emerald-400 font-bold bg-zinc-900 border border-zinc-800 p-3 select-all tracking-wider text-sm">{twoFactorSecret}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 mt-6">
                            <input
                                type="text"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="ENTER_6_DIGIT_OTP"
                                className="w-full sm:w-64 bg-black border border-zinc-800 py-3 px-3 text-emerald-400 text-sm font-mono tracking-[0.2em] outline-none focus:border-emerald-500/50"
                            />
                            {!twoFactor.enabled && (
                                <button
                                    onClick={enable2fa}
                                    className="px-4 py-3 border border-emerald-500/40 text-emerald-400 text-xs font-mono tracking-widest uppercase hover:bg-emerald-500/10 transition-colors whitespace-nowrap"
                                >
                                    VERIFY & ENABLE
                                </button>
                            )}
                            {twoFactor.enabled && (
                                <button
                                    onClick={disable2fa}
                                    className="px-4 py-3 border border-rose-500/40 text-rose-400 text-xs font-mono tracking-widest uppercase hover:bg-rose-500/10 transition-colors whitespace-nowrap"
                                >
                                    DISABLE_2FA
                                </button>
                            )}
                        </div>
                        {twoFactorMsg && <div className="text-zinc-500 text-xs uppercase tracking-widest mt-2">{twoFactorMsg}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
