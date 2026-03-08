import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Smartphone, CheckCircle, AlertCircle, Loader2, Ticket, ChevronRight, RotateCcw, ShieldCheck, Activity } from 'lucide-react';
import './index.css';

// Configure Base URL
const API_URL = import.meta.env.DEV ? 'http://192.168.100.16:3000/api' : '/api';

function App() {
    const [plans, setPlans] = useState([]);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [macAddress, setMacAddress] = useState('');
    const [error, setError] = useState('');
    const [voucherCode, setVoucherCode] = useState('');
    const [showVoucherModal, setShowVoucherModal] = useState(false);
    const [voucherSuccess, setVoucherSuccess] = useState(null);
    const [checkoutRequestId, setCheckoutRequestId] = useState(null);
    const [loginUrl, setLoginUrl] = useState('');
    const [showRecoveryModal, setShowRecoveryModal] = useState(false);
    const [receiptNumber, setReceiptNumber] = useState('');
    const [branding, setBranding] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const mac = params.get('mac') || params.get('mac_esc');
        const lUrl = params.get('login_url');
        if (mac) {
            setMacAddress(mac);
            checkExistingSubscription(mac, lUrl);
        }
        if (lUrl) setLoginUrl(lUrl);
        fetchBranding();
        fetchPlans();
    }, []);

    const fetchBranding = async () => {
        try {
            const params = new URLSearchParams(window.location.search);
            const vendorCode = params.get('vendor');
            const url = vendorCode ? `${API_URL}/branding?vendor=${vendorCode}` : `${API_URL}/branding`;
            const res = await axios.get(url);
            if (res.data && res.data.id) {
                setBranding(res.data);
                if (res.data.portal_title) document.title = res.data.portal_title;
            }
        } catch (err) {
            console.error('Branding error:', err);
        }
    };

    const checkExistingSubscription = async (mac, lUrl) => {
        try {
            const res = await axios.get(`${API_URL}/check-status?mac=${encodeURIComponent(mac)}`);
            if (res.data.active) {
                setPhoneNumber(res.data.phoneNumber);
                setVoucherSuccess({
                    plan: res.data.planName || 'WiFi',
                    expiresAt: res.data.expiresAt
                });
                setStep(5);
            }
        } catch (err) {
            console.error('Status check error:', err);
        }
    };

    const fetchPlans = async () => {
        try {
            const res = await axios.get(`${API_URL}/plans`);
            if (Array.isArray(res.data)) {
                setPlans(res.data);
            }
        } catch (err) {
            // Fallback
            setPlans([
                { id: 1, name: '6 Hours', price: 20, speed_limit_down: '5M' },
                { id: 2, name: '12 Hours', price: 30, speed_limit_down: '5M' },
                { id: 3, name: '24 Hours', price: 40, speed_limit_down: '5M' },
                { id: 4, name: '7 Days', price: 250, speed_limit_down: '8M' },
            ]);
        }
    };

    const handlePlanSelect = (plan) => {
        setSelectedPlan(plan);
        setStep(2);
        setError('');
    };

    const handlePay = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        let phone = phoneNumber.replace(/\s+/g, '');
        if (!/^(07|01)\d{8}$/.test(phone)) {
            setError('Please enter a valid Safaricom number (e.g., 0712345678)');
            setLoading(false);
            return;
        }

        try {
            const res = await axios.post(`${API_URL}/stkpush`, {
                phoneNumber: phone,
                amount: selectedPlan.price,
                planId: selectedPlan.id,
                macAddress
            });

            if (res.data.success) {
                if (res.data.alreadyActive) {
                    setPhoneNumber(res.data.phoneNumber);
                    setVoucherSuccess({
                        plan: selectedPlan?.name || 'WiFi',
                        expiresAt: res.data.expiresAt
                    });
                    setStep(5);
                } else {
                    setCheckoutRequestId(res.data.checkoutRequestId);
                    setStep(3);
                }
            } else {
                setError(res.data.message || "Payment failed to start.");
            }
        } catch (err) {
            setError(err.response?.data?.error || "Connection error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let interval;
        if (step === 3 && checkoutRequestId) {
            interval = setInterval(async () => {
                try {
                    const res = await axios.get(`${API_URL}/payment-status/${checkoutRequestId}`);
                    if (res.data.status === 'COMPLETED') {
                        clearInterval(interval);
                        setVoucherSuccess({
                            plan: selectedPlan.name,
                            expiresAt: res.data.expiresAt || new Date(Date.now() + selectedPlan.duration_minutes * 60000).toISOString()
                        });
                        setStep(5);
                    } else if (res.data.status === 'FAILED') {
                        clearInterval(interval);
                        setError("Payment failed or was cancelled.");
                        setStep(2);
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 4000);
        }
        return () => clearInterval(interval);
    }, [step, checkoutRequestId, selectedPlan]);

    const handleRedeemVoucher = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!voucherCode.trim()) {
            setError('Please enter a voucher code');
            setLoading(false);
            return;
        }

        try {
            const res = await axios.post(`${API_URL}/voucher/redeem`, {
                code: voucherCode.toUpperCase(),
                phoneNumber: phoneNumber || '0700000000',
                macAddress: macAddress || 'AA:BB:CC:DD:EE:FF'
            });

            if (res.data.success) {
                if (res.data.alreadyActive) {
                    setPhoneNumber(res.data.phoneNumber);
                }
                setVoucherSuccess(res.data);
                setShowVoucherModal(false);
                setStep(5);
            } else {
                setError(res.data.error || 'Failed to redeem voucher');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRecoverPayment = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!receiptNumber.trim()) {
            setError('Please enter your M-Pesa receipt number');
            setLoading(false);
            return;
        }

        try {
            const res = await axios.post(`${API_URL}/recover`, {
                receiptNumber: receiptNumber.trim().toUpperCase(),
                macAddress
            });

            if (res.data.success) {
                setVoucherSuccess({
                    plan: selectedPlan?.name || 'WiFi',
                    expiresAt: res.data.expiresAt
                });
                setShowRecoveryModal(false);
                setStep(5);
            } else {
                setError(res.data.error || 'Recovery failed');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#04070D] text-slate-200 font-sans flex items-center justify-center p-4 md:p-8 overflow-hidden relative selection:bg-blue-500/30">
            {branding?.primary_color && (
                <style dangerouslySetInnerHTML={{
                    __html: `
                    .text-blue-500 { color: ${branding.primary_color} !important; }
                    .text-blue-400 { color: ${branding.primary_color} !important; }
                    .bg-blue-600 { background-color: ${branding.primary_color} !important; }
                    .bg-blue-500 { background-color: ${branding.primary_color} !important; }
                    .bg-blue-500\\/10 { background-color: ${branding.primary_color}1A !important; }
                    .bg-blue-500\\/5 { background-color: ${branding.primary_color}0D !important; }
                    .border-blue-500\\/20 { border-color: ${branding.primary_color}33 !important; }
                    .border-blue-500\\/50 { border-color: ${branding.primary_color}80 !important; }
                    .from-blue-600 { --tw-gradient-from: ${branding.primary_color} var(--tw-gradient-from-position) !important; }
                    .from-blue-500 { --tw-gradient-from: ${branding.primary_color} var(--tw-gradient-from-position) !important; }
                    .from-blue-400 { --tw-gradient-from: ${branding.primary_color} var(--tw-gradient-from-position) !important; }
                    .to-blue-400 { --tw-gradient-to: ${branding.primary_color} var(--tw-gradient-to-position) !important; }
                    .ring-blue-500 { --tw-ring-color: ${branding.primary_color} !important; }
                    .group-hover\\:bg-blue-600:hover { background-color: ${branding.primary_color} !important; }
                    .group-hover\\:text-blue-400:hover { color: ${branding.primary_color} !important; }
                    .group-hover\\:border-blue-500:hover { border-color: ${branding.primary_color} !important; }
                    .group-hover\\:border-blue-500\\/50:hover { border-color: ${branding.primary_color}80 !important; }
                `}} />
            )}

            {/* Cinematic Ambient Glows */}
            <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none mix-blend-screen" />

            {/* Split Screen Container */}
            <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row bg-[#0B1120]/80 backdrop-blur-2xl border border-slate-800/80 rounded-[28px] md:rounded-[36px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative z-10 min-h-[600px]">

                {/* Left Panel: Branding & System Status */}
                <div className="md:w-[45%] lg:w-2/5 bg-gradient-to-br from-[#060A13] to-[#0A0F1C] p-8 md:p-12 flex flex-col relative border-b md:border-b-0 md:border-r border-slate-800/80 overflow-hidden">
                    <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-500 opacity-80"></div>
                    <div className="absolute -left-32 -top-32 w-96 h-96 bg-blue-600/5 rounded-full blur-[80px] pointer-events-none"></div>

                    <div className="relative z-10">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0F172A] mb-8 border border-slate-700/80 shadow-[0_0_30px_rgba(37,99,235,0.15)] relative" style={branding?.primary_color ? { boxShadow: `0 0 30px ${branding.primary_color}40`, borderColor: branding.primary_color } : {}}>
                            <Wifi className="w-8 h-8 text-blue-500" style={branding?.primary_color ? { color: branding.primary_color } : {}} />
                            <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_12px_rgba(34,197,94,1)] animate-pulse"></div>
                        </div>

                        {branding?.logo_url ? (
                            <img src={branding.logo_url} alt={branding.portal_title || 'WiFi Portal'} className="h-12 mb-6 object-contain" />
                        ) : (
                            <h1 className="text-3xl md:text-[40px] font-black tracking-tight text-white mb-3 leading-none">
                                {branding?.portal_title ? branding.portal_title : <>Turbo<span className="text-blue-500" style={branding?.primary_color ? { color: branding.primary_color } : {}}>Net</span></>}
                            </h1>
                        )}
                        <p className="text-sm text-slate-400 font-medium flex items-center gap-2 mb-10 tracking-wide uppercase">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" /> SECURED PORTAL
                        </p>
                    </div>

                    <div className="mt-auto space-y-4 relative z-10">
                        {/* Device Info Card */}
                        <div className="bg-[#0F172A]/50 rounded-xl p-4 border border-slate-800/80 flex items-start gap-4">
                            <div className="p-2 bg-slate-800/50 rounded-lg text-slate-400">
                                <Activity className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Device Signature</div>
                                <div className="font-mono text-sm text-slate-200 tracking-wider">
                                    {macAddress || 'WAITING_SIG'}
                                </div>
                            </div>
                        </div>

                        {/* Connection Flow Card */}
                        <div className="bg-blue-900/10 rounded-xl p-4 border border-blue-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Link Status</div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> LIVE
                                </div>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-1000 ease-out bg-gradient-to-r from-blue-500 w-${step === 1 ? '1/4' : step === 2 ? '1/2' : step === 3 ? '3/4' : 'full'} ${step === 5 ? 'to-emerald-400' : 'to-blue-400'}`}></div>
                            </div>
                        </div>
                    </div>

                    <div className="hidden md:block mt-8 text-[10px] text-slate-600 font-mono tracking-widest uppercase">
                        SYS.VER 2.4.1 // TURBONET_OS
                    </div>
                </div>

                {/* Right Panel: Interactive Flow */}
                <div className="md:w-[55%] lg:w-3/5 p-6 md:p-10 lg:p-12 relative flex flex-col bg-[#0B1120]">
                    <AnimatePresence mode='wait' initial={false}>
                        {/* Step 1: Packages */}
                        {step === 1 && (
                            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="flex-1 flex flex-col h-full">
                                <div className="flex items-center justify-between mb-8">
                                    <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3">
                                        <span className="w-1.5 h-6 bg-blue-500 rounded-full inline-block"></span> Select Access Plan
                                    </h2>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-max overflow-y-auto pr-2 custom-scrollbar">
                                    {plans.map((plan, i) => (
                                        <motion.div
                                            key={plan.id}
                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                            onClick={() => handlePlanSelect(plan)}
                                            className="group relative flex flex-col p-5 rounded-2xl bg-[#131E32]/40 border border-[#1E293B] hover:border-blue-500/50 hover:bg-[#1A2844] transition-all cursor-pointer overflow-hidden min-h-[140px]"
                                        >
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                            <div className="flex justify-between items-start mb-auto">
                                                <div>
                                                    <span className="font-bold text-slate-200 text-lg group-hover:text-white transition-colors block">{plan.name}</span>
                                                    <span className="text-[11px] text-blue-300/80 font-bold tracking-wider uppercase inline-block mt-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">{plan.speed_limit_down} Limit</span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-[#0B1120] group-hover:bg-blue-600 flex items-center justify-center transition-colors border border-slate-700 group-hover:border-blue-500 shrink-0 shadow-inner">
                                                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors translate-x-px" />
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                <div className="flex items-end gap-1.5">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">KES</span>
                                                    <span className="text-[28px] font-bold text-white leading-none tracking-tight">{plan.price}</span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
                                    <button onClick={() => setShowVoucherModal(true)} className="w-full py-4 rounded-xl border border-slate-700/80 bg-[#0F172A]/50 text-slate-300 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/10 flex items-center justify-center gap-2.5 text-xs font-bold uppercase tracking-widest transition-all group">
                                        <Ticket className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" /> Use Voucher
                                    </button>
                                    <button onClick={() => { setShowRecoveryModal(true); setError(''); }} className="w-full py-4 rounded-xl border border-slate-700/80 bg-[#0F172A]/50 text-slate-300 hover:text-white hover:border-orange-500/50 hover:bg-orange-500/10 flex items-center justify-center gap-2.5 text-xs font-bold uppercase tracking-widest transition-all group">
                                        <RotateCcw className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" /> Recover Pack
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Pay */}
                        {step === 2 && (
                            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="flex flex-col h-full justify-center">
                                <button onClick={() => setStep(1)} className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white mb-8 flex items-center gap-2 transition-colors w-max group">
                                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition-colors border border-slate-700">
                                        <ChevronRight className="w-3 h-3 rotate-180" />
                                    </div>
                                    Change Plan
                                </button>

                                <div className="bg-gradient-to-r from-blue-900/30 to-[#0F172A] rounded-2xl p-6 border border-blue-500/20 mb-10 flex items-center justify-between relative overflow-hidden backdrop-blur-sm">
                                    <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-40 h-40 bg-blue-500/10 rounded-full blur-[30px]"></div>
                                    <div className="z-10">
                                        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            Checkout <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
                                        </div>
                                        <div className="text-2xl font-bold text-white">{selectedPlan.name}</div>
                                    </div>
                                    <div className="z-10 text-right">
                                        <div className="text-3xl font-black text-white tracking-tight">
                                            <span className="text-sm font-bold text-slate-400 mr-1.5 uppercase tracking-widest">KES</span>
                                            {selectedPlan.price}
                                        </div>
                                    </div>
                                </div>

                                <form onSubmit={handlePay} className="space-y-8 flex-1">
                                    <div>
                                        <label className="block text-xs font-bold tracking-widest text-slate-400 mb-4 uppercase">M-Pesa Mobile Number</label>
                                        <div className="relative group">
                                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-[2px]"></div>
                                            <div className="relative flex items-center bg-[#060A13] border border-slate-700 rounded-2xl overflow-hidden focus-within:border-transparent transition-colors shadow-inner">
                                                <div className="pl-6 py-4 flex items-center justify-center border-r border-slate-800 pr-4 bg-[#0B1120]">
                                                    <Smartphone className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <input type="tel" placeholder="07XX XXX XXX" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full bg-transparent py-5 px-6 text-white font-bold tracking-wider placeholder-slate-600 focus:outline-none text-xl lg:text-2xl" autoFocus />
                                            </div>
                                        </div>
                                        {error && (
                                            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mt-4 text-red-400 text-sm font-bold tracking-wide bg-red-900/20 p-4 rounded-xl border border-red-500/20">
                                                <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" /> {error}
                                            </motion.div>
                                        )}
                                    </div>

                                    <button type="submit" disabled={loading} className="w-full bg-white hover:bg-slate-200 text-slate-900 font-black py-5 rounded-2xl shadow-[0_4px_30px_rgba(255,255,255,0.15)] flex items-center justify-center gap-3 disabled:opacity-50 transition-all uppercase tracking-widest text-sm relative overflow-hidden group">
                                        <div className="relative flex items-center justify-center gap-3">
                                            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> VERIFYING...</> : <><img src="https://upload.wikimedia.org/wikipedia/commons/1/15/M-PESA_LOGO-01.svg" alt="M-Pesa" className="h-[24px] w-auto" /> AUTHORIZE PAYMENT</>}
                                        </div>
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {/* Step 3: Wait */}
                        {step === 3 && (
                            <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10 flex flex-col items-center justify-center h-full">
                                <div className="relative mb-12">
                                    <div className="w-28 h-28 bg-[#060A13] rounded-full flex items-center justify-center relative z-10 border border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                                        <Smartphone className="w-12 h-12 text-blue-500" />
                                    </div>
                                    <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140px] h-[140px] animate-[spin_3s_linear_infinite]" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" className="text-blue-500/10" />
                                        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="30 270" className="text-blue-500 drop-shadow-[0_0_8px_rgba(37,99,235,1)]" />
                                    </svg>
                                </div>

                                <h2 className="text-3xl font-black text-white mb-4 tracking-tight">Confirm on Device</h2>
                                <p className="text-slate-400 mb-10 font-medium text-base leading-relaxed">
                                    An M-Pesa prompt has been dispatched to <br /><span className="text-white font-mono bg-[#0F172A] px-3 py-1 rounded-lg border border-slate-700/80 inline-block mt-3 tracking-widest shadow-inner relative"><span className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-lg"></span>{phoneNumber}</span>
                                </p>

                                <div className="bg-[#0F172A]/80 rounded-full py-3.5 px-6 text-xs font-bold tracking-widest uppercase text-slate-300 border border-slate-700/80 flex items-center backdrop-blur-md">
                                    <Loader2 className="w-4 h-4 mr-3 animate-spin text-blue-500" /> Awaiting Secure Handshake...
                                </div>
                            </motion.div>
                        )}

                        {/* Step 5: Success */}
                        {step === 5 && voucherSuccess && (
                            <motion.div key="step5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col h-full justify-center">
                                <div className="flex items-center gap-6 mb-8">
                                    <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(52,211,153,0.15)] relative shrink-0">
                                        <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl animate-ping opacity-20"></div>
                                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-white mb-1 tracking-tight">Authorization <br />Complete</h2>
                                    </div>
                                </div>

                                <div className="bg-[#060A13] rounded-2xl p-6 border border-slate-800 text-left mb-10 shadow-inner">
                                    <div className="flex justify-between items-center mb-5">
                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Active Plan</span>
                                        <span className="text-white text-sm font-bold tracking-wide">{voucherSuccess.plan}</span>
                                    </div>
                                    <div className="h-px bg-slate-800/80 w-full mb-5"></div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">Valid Until</span>
                                        <span className="text-emerald-400 text-sm font-mono tracking-wider bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 shadow-inner inline-flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                            {new Date(voucherSuccess.expiresAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                </div>

                                {/* Mikrotik Auto-Login Form */}
                                <form name="login" action={loginUrl || "http://192.168.88.1/login"} method="post" id="mikrotik-login-form" className="mt-auto">
                                    <input type="hidden" name="username" value={phoneNumber} />
                                    <input type="hidden" name="password" value={phoneNumber} />
                                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-[0_10px_40px_rgba(37,99,235,0.4)] transition-all flex justify-center items-center gap-3 uppercase tracking-widest text-sm relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <span className="relative z-10">Connect To Network</span>
                                        <Wifi className="w-5 h-5 relative z-10" />
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modals remain mostly the same but updated to match aesthetics... */}
            {showVoucherModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0B1120] border border-slate-700/80 rounded-3xl p-8 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl mb-6 flex items-center justify-center border border-blue-500/20">
                            <Ticket className="w-6 h-6 text-blue-400" />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2 tracking-tight">
                            Redeem Key
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mb-6">Enter your 8-character network access voucher.</p>

                        <form onSubmit={handleRedeemVoucher} className="space-y-6">
                            <div>
                                <input type="text" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" className="w-full bg-[#060A13] border border-slate-700 rounded-xl py-4 px-4 text-white text-center text-xl font-mono tracking-[0.2em] uppercase placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner" autoFocus />
                            </div>
                            {error && <div className="text-red-400 text-xs font-bold leading-relaxed bg-red-900/20 p-3 rounded-lg border border-red-500/20 flex gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</div>}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setShowVoucherModal(false); setError(''); }} className="flex-1 py-4 bg-[#0F172A] border border-slate-800 text-slate-400 font-bold tracking-widest text-xs uppercase rounded-xl hover:bg-slate-800 hover:text-white transition-colors">Abort</button>
                                <button type="submit" disabled={loading} className="flex-1 py-4 bg-blue-600 text-white font-bold tracking-widest text-xs uppercase rounded-xl hover:bg-blue-500 disabled:opacity-50 transition-colors flex justify-center items-center gap-2">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Receipt Recovery Modal */}
            {showRecoveryModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0B1120] border border-slate-700/80 rounded-3xl p-8 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
                        <div className="w-12 h-12 bg-orange-500/10 rounded-2xl mb-6 flex items-center justify-center border border-orange-500/20">
                            <RotateCcw className="w-6 h-6 text-orange-400" />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2 tracking-tight">
                            Session Recovery
                        </h3>
                        <p className="text-xs text-slate-400 font-medium mb-6 leading-relaxed">Enter the precise M-Pesa receipt number from your confirmation SMS.</p>

                        <form onSubmit={handleRecoverPayment} className="space-y-6">
                            <div>
                                <input type="text" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value.toUpperCase())} placeholder="UC4E48DRB5" className="w-full bg-[#060A13] border border-slate-700 rounded-xl py-4 px-4 text-white text-center text-xl font-mono tracking-widest uppercase placeholder-slate-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all shadow-inner" autoFocus />
                            </div>
                            {error && <div className="text-red-400 text-xs font-bold leading-relaxed bg-red-900/20 p-3 rounded-lg border border-red-500/20 flex gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}</div>}

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setShowRecoveryModal(false); setError(''); }} className="flex-1 py-4 bg-[#0F172A] border border-slate-800 text-slate-400 font-bold tracking-widest text-xs uppercase rounded-xl hover:bg-slate-800 hover:text-white transition-colors">Abort</button>
                                <button type="submit" disabled={loading} className="flex-1 py-4 bg-orange-500 text-white font-bold tracking-widest text-xs uppercase rounded-xl hover:bg-orange-400 disabled:opacity-50 transition-colors flex justify-center items-center gap-2">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Recover"}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Custom scrollbar styles for plans list */}
            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
            `}} />
        </div>
    );
}

export default App;
