import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Smartphone, CheckCircle, AlertCircle, Loader2, Ticket, RotateCcw, ShieldCheck, Zap, ArrowRight, Shield, ChevronRight, Monitor, Tv } from 'lucide-react';
import './index.css';

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
    const [checkoutRequestId, setCheckoutRequestId] = useState(null);
    const [loginUrl, setLoginUrl] = useState('');
    const [loginIdentity, setLoginIdentity] = useState('');
    const [branding, setBranding] = useState(null);
    const [isAutoConnecting, setIsAutoConnecting] = useState(false);
    const [showVoucherModal, setShowVoucherModal] = useState(false);
    const [showRecoveryModal, setShowRecoveryModal] = useState(false);
    const [showDeviceModal, setShowDeviceModal] = useState(false);
    const [deviceMac, setDeviceMac] = useState('');
    const [deviceLoading, setDeviceLoading] = useState(false);
    const [deviceResult, setDeviceResult] = useState(null);
    const [voucherSuccess, setVoucherSuccess] = useState(null);
    const [receiptCode, setReceiptCode] = useState('');
    const [recoveryLoading, setRecoveryLoading] = useState(false);
    const [recoveryError, setRecoveryError] = useState('');
    const [backgroundCheckDone, setBackgroundCheckDone] = useState(false);
    const [activeSubscription, setActiveSubscription] = useState(null);

    const [mpesaMessage, setMpesaMessage] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const mac = params.get('mac') ||
            params.get('mac_esc') ||
            params.get('macaddr') ||
            params.get('mac_address') ||
            params.get('client_mac') ||
            params.get('clientMac');
        const lUrl = params.get('login_url');
        if (mac) setMacAddress(mac);
        if (lUrl) setLoginUrl(lUrl);

        // Clean the URL bar after reading params
        window.history.replaceState({}, '', window.location.pathname);

        fetchBranding();
        fetchPlans();
    }, []);

    useEffect(() => {
        if (macAddress && step === 1 && !backgroundCheckDone) {
            setBackgroundCheckDone(true);
            checkExistingSubscription(macAddress);
        }
    }, [macAddress, step, backgroundCheckDone]);

    const fetchBranding = async () => {
        try {
            const params = new URLSearchParams(window.location.search);
            const vendorCode = params.get('vendor');
            const url = vendorCode ? `${API_URL}/branding?vendor=${vendorCode}` : `${API_URL}/branding`;
            const res = await axios.get(url);
            if (res.data && res.data.id) setBranding(res.data);
        } catch (err) { console.error('Branding error:', err); }
    };

    const checkExistingSubscription = async (mac) => {
        try {
            const res = await axios.get(`${API_URL}/check-status?mac=${encodeURIComponent(mac)}`);
            if (res.data.active) {
                setActiveSubscription({
                    phoneNumber: res.data.phoneNumber || res.data.loginIdentity || '',
                    loginIdentity: res.data.loginIdentity || res.data.phoneNumber || '',
                    planName: res.data.planName || 'WiFi',
                    expiresAt: res.data.expiresAt
                });
            }
        } catch (err) { console.error('Status check error:', err); }
    };

    const fetchPlans = async () => {
        try {
            const res = await axios.get(`${API_URL}/plans`);
            if (Array.isArray(res.data)) setPlans(res.data);
        } catch (err) {
            setPlans([
                { id: 1, name: '6 Hours', price: 20, speed_limit_down: '3M', duration_minutes: 360 },
                { id: 2, name: '12 Hours', price: 30, speed_limit_down: '3M', duration_minutes: 720 },
                { id: 3, name: '24 Hours', price: 40, speed_limit_down: '3M', duration_minutes: 1440 },
                { id: 4, name: '7 Days', price: 250, speed_limit_down: '8M', duration_minutes: 10080 },
            ]);
        }
    };

    const handlePlanSelect = (plan) => {
        setSelectedPlan(plan);
        setStep(2);
        setError('');
    };

    const handleActivateExisting = () => {
        if (activeSubscription) {
            setPhoneNumber(activeSubscription.phoneNumber);
            setLoginIdentity(activeSubscription.loginIdentity);
            setVoucherSuccess({ plan: activeSubscription.planName, expiresAt: activeSubscription.expiresAt });
            setStep(5);
        }
    };

    const handlePay = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        let phone = phoneNumber.replace(/\s+/g, '');
        if (!/^(07|01)\d{8}$/.test(phone)) {
            setError('Please enter a valid Safaricom number');
            setLoading(false); return;
        }
        if (!macAddress) {
            setError('Device not detected. Please connect to the WiFi hotspot and open the portal from that device.');
            setLoading(false); return;
        }
        try {
            const res = await axios.post(`${API_URL}/stkpush`, {
                phoneNumber: phone, amount: selectedPlan.price, planId: selectedPlan.id, macAddress
            });
            if (res.data.success) {
                if (res.data.alreadyActive) {
                    setPhoneNumber(res.data.phoneNumber);
                    setVoucherSuccess({ plan: selectedPlan.name, expiresAt: res.data.expiresAt });
                    setStep(5);
                } else {
                    setCheckoutRequestId(res.data.checkoutRequestId);
                    setStep(3);
                }
            } else setError(res.data.message || "Payment request failed");
        } catch (err) { setError(err.response?.data?.error || "Connection error. Please try again."); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        let interval;
        if (step === 3 && checkoutRequestId) {
            interval = setInterval(async () => {
                try {
                    const res = await axios.get(`${API_URL}/payment-status/${checkoutRequestId}`);
                    if (res.data.status === 'COMPLETED') {
                        clearInterval(interval);
                        if (res.data.phoneNumber) setPhoneNumber(res.data.phoneNumber);
                        if (res.data.loginIdentity || res.data.macAddress || res.data.phoneNumber) {
                            setLoginIdentity(res.data.loginIdentity || res.data.macAddress || res.data.phoneNumber);
                        }
                        setVoucherSuccess({
                            plan: selectedPlan.name,
                            expiresAt: res.data.expiresAt || new Date(Date.now() + 3600000).toISOString()
                        });
                        setStep(5);
                    } else if (res.data.status === 'FAILED') {
                        clearInterval(interval);
                        setError("Payment was cancelled or failed.");
                        setStep(2);
                    }
                } catch (err) { console.error("Polling error", err); }
            }, 4000);
        }
        return () => clearInterval(interval);
    }, [step, checkoutRequestId, selectedPlan]);

    useEffect(() => {
        if (step === 5 && voucherSuccess) {
            setIsAutoConnecting(true);
            const timer = setTimeout(() => {
                const form = document.getElementById('mikrotik-login-form');
                if (form) form.submit();
            }, 2500);
            return () => clearTimeout(timer);
        }
    }, [step, voucherSuccess]);

    const handleAuthorizeDevice = async (e) => {
        e.preventDefault();
        setDeviceLoading(true);
        setDeviceResult(null);
        try {
            const res = await axios.post(`${API_URL}/authorize-device`, {
                macAddress: deviceMac,
                phoneNumber: loginIdentity || phoneNumber
            });
            if (res.data.success) {
                setDeviceResult({ success: true, message: res.data.message || 'Device authorized!' });
            } else {
                setDeviceResult({ success: false, message: res.data.error || 'Authorization failed' });
            }
        } catch (err) {
            setDeviceResult({ success: false, message: err.response?.data?.error || 'Connection error' });
        } finally {
            setDeviceLoading(false);
        }
    };

    // Extract M-Pesa receipt code from a full SMS message
    // Format: "UCUE4B05DS Confirmed. Fuliza M-PESA amount is Ksh 26.00..."
    // The receipt code is the first word — 8-12 alphanumeric characters
    const extractReceiptCode = (text) => {
        if (!text) return '';
        const trimmed = text.trim();
        // Try to find a standalone 8-12 char alphanumeric code
        const match = trimmed.match(/\b([A-Z0-9]{8,12})\b/i);
        if (match) return match[1].toUpperCase();
        // Fallback: first word if it looks like a code
        const firstWord = trimmed.split(/\s/)[0];
        if (firstWord && /^[A-Z0-9]{4,}$/i.test(firstWord)) return firstWord.toUpperCase();
        return '';
    };

    const handleRecoverySubmit = async (e) => {
        e.preventDefault();
        setRecoveryLoading(true);
        setRecoveryError('');

        // Extract code from either the receipt input or the full M-Pesa message
        let code = receiptCode.trim();
        if (!code && mpesaMessage.trim()) {
            code = extractReceiptCode(mpesaMessage);
        }

        if (!code || code.length < 5) {
            setRecoveryError('Could not find a valid receipt code. Please paste your M-Pesa confirmation message.');
            setRecoveryLoading(false);
            return;
        }
        
        if (!macAddress) {
            setRecoveryError('Device MAC address not detected. Please connect via WiFi.');
            setRecoveryLoading(false);
            return;
        }
        
        try {
            const res = await axios.post(`${API_URL}/recover`, {
                receiptNumber: code.toUpperCase(),
                macAddress: macAddress
            });
            
            if (res.data.success) {
                setShowRecoveryModal(false);
                setPhoneNumber(res.data.phoneNumber || '');
                setLoginIdentity(res.data.loginIdentity || res.data.phoneNumber || code.toUpperCase());
                setVoucherSuccess({
                    plan: res.data.planName || 'WiFi',
                    expiresAt: res.data.expiresAt || new Date(Date.now() + 3600000).toISOString()
                });
                setStep(5);
            } else {
                setRecoveryError(res.data.error || 'Recovery failed. Please check your receipt code.');
            }
        } catch (err) {
            setRecoveryError(err.response?.data?.error || 'Connection error. Please try again.');
        } finally {
            setRecoveryLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden selection:bg-blue-500/30">
            {branding?.primary_color && (
                <style dangerouslySetInnerHTML={{ __html: `
                    :root { --accent: ${branding.primary_color}; }
                    .accent-text { color: ${branding.primary_color}; }
                    .accent-bg { background-color: ${branding.primary_color}; }
                `}} />
            )}

            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="w-full max-w-md flex flex-col gap-6 relative z-10">
                
                <header className="flex flex-col items-center justify-center text-center px-4 pt-4">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-16 h-16 rounded-2xl glass-panel flex items-center justify-center mb-4 shadow-blue-500/10 shadow-2xl border-white/20">
                        <Wifi className="w-8 h-8 text-blue-400" />
                    </motion.div>
                    <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-3xl font-extrabold text-white tracking-tight">
                        {branding?.portal_title || 'TurboNet WiFi'}
                    </motion.h1>
                    <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="text-slate-400 text-sm mt-2">
                        Fast, reliable internet access.
                    </motion.p>
                </header>

                <main className="min-h-[420px] glass-panel rounded-3xl p-6 md:p-8 flex flex-col relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        
                        {step === 1 && (
                            <motion.div key="plans" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-5 h-full">

                                {/* Active subscription banner — shows when background check finds active plan */}
                                {activeSubscription && (
                                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer" onClick={handleActivateExisting}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-emerald-400">Active Plan Found</p>
                                                    <p className="text-xs text-slate-400">{activeSubscription.planName} — expires {new Date(activeSubscription.expiresAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                                </div>
                                            </div>
                                            <button className="premium-button bg-emerald-500 hover:bg-emerald-400 text-white text-xs py-1.5 px-4 shadow-emerald-500/20">
                                                Connect
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* M-Pesa Message Paste — primary way to activate */}
                                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                    <div className="text-center mb-3">
                                        <p className="text-sm font-semibold text-emerald-400">Already paid via M-Pesa?</p>
                                        <p className="text-xs text-slate-400 mt-1">Paste your M-Pesa confirmation message below</p>
                                    </div>
                                    <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-3">
                                        <textarea
                                            className="premium-input text-sm resize-none"
                                            rows={3}
                                            placeholder="Paste your M-Pesa message here...&#10;e.g. UCUE4B05DS Confirmed. Ksh 40.00 sent to TURBONET..."
                                            value={mpesaMessage}
                                            onChange={(e) => {
                                                setMpesaMessage(e.target.value);
                                                const code = extractReceiptCode(e.target.value);
                                                if (code) setReceiptCode(code);
                                            }}
                                        />
                                        {receiptCode && (
                                            <div className="text-xs text-emerald-400 font-mono text-center bg-emerald-500/10 p-2 rounded-lg">
                                                Receipt code: <span className="font-bold">{receiptCode}</span>
                                            </div>
                                        )}
                                        {recoveryError && (
                                            <div className="text-xs font-bold text-red-400 flex items-center gap-2 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                                                <AlertCircle className="w-3 h-3 flex-shrink-0" /> {recoveryError}
                                            </div>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={recoveryLoading || (!receiptCode && !mpesaMessage)}
                                            className="premium-button bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20 text-sm py-2.5"
                                        >
                                            {recoveryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Connected'}
                                        </button>
                                    </form>
                                </div>

                                <div className="text-center text-xs text-slate-500 uppercase tracking-widest">or buy a new plan</div>

                                <h2 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
                                    Choose a plan
                                </h2>
                                
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto custom-scrollbar pr-1 pb-2">
                                    {plans.map((plan) => (
                                        <div key={plan.id} onClick={() => handlePlanSelect(plan)} className="ticket-card group flex flex-col items-center justify-center text-center p-4">
                                            <h3 className="text-lg font-bold text-slate-100 group-hover:text-blue-400 transition-colors mb-1">{plan.name}</h3>
                                            
                                            <div className="flex items-center justify-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity mb-3">
                                                <Zap className="w-3.5 h-3.5 text-blue-400" />
                                                <span className="text-[11px] font-medium text-slate-300">Up to {plan.speed_limit_down}</span>
                                            </div>
                                            
                                            <div className="mt-auto">
                                                <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">KES</div>
                                                <div className="text-2xl font-extrabold text-white tracking-tight flex items-center justify-center gap-1">
                                                    {plan.price}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="mt-auto pt-4 grid grid-cols-2 gap-3 border-t border-white/5">
                                    <button onClick={() => setShowVoucherModal(true)} className="glass-pill text-sm text-slate-300">
                                        <Ticket className="w-4 h-4" /> Voucher
                                    </button>
                                    <button onClick={() => setShowRecoveryModal(true)} className="glass-pill text-sm text-slate-300">
                                        <Smartphone className="w-4 h-4" /> Enter Code
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div key="checkout" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-6 h-full">
                                <button onClick={() => setStep(1)} className="w-fit text-sm font-medium text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
                                    <RotateCcw className="w-4 h-4" /> Change Plan
                                </button>
                                
                                <div className="bg-white/5 border border-white/10 p-5 rounded-2xl flex items-center justify-between shadow-inner">
                                    <div>
                                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Selected Plan</div>
                                        <div className="text-xl font-bold text-white flex items-center gap-2">
                                            {selectedPlan.name}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Total</div>
                                        <div className="text-2xl font-extrabold text-blue-400">KES {selectedPlan.price}</div>
                                    </div>
                                </div>

                                <form onSubmit={handlePay} className="flex flex-col gap-5 mt-2">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-semibold text-slate-300 ml-1">M-Pesa Number</label>
                                        <div className="relative">
                                            <input 
                                                type="tel" 
                                                placeholder="07XX XXX XXX" 
                                                value={phoneNumber} 
                                                onChange={(e) => setPhoneNumber(e.target.value)} 
                                                className="premium-input pl-12" 
                                                autoFocus 
                                            />
                                            <Smartphone className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                        </div>
                                        {error && <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-bold text-red-400 flex items-center gap-2 mt-2 bg-red-500/10 p-3 rounded-lg border border-red-500/20"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</motion.div>}
                                    </div>

                                    <button type="submit" disabled={loading} className="mt-4 premium-button bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/25">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 
                                        <>Pay with M-Pesa <ArrowRight className="w-5 h-5" /></>}
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div key="pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-8">
                                <div className="relative">
                                    <div className="w-24 h-24 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center relative z-10">
                                        <Smartphone className="w-10 h-10 text-blue-400" />
                                    </div>
                                    <div className="absolute inset-0 rounded-full border border-blue-400/50 animate-[ping_2s_ease-out_infinite]" />
                                    <div className="absolute inset-0 rounded-full border border-blue-400/30 animate-[ping_2.5s_ease-out_infinite]" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-3">Check your phone</h2>
                                    <p className="text-slate-300 text-sbase leading-relaxed max-w-[280px] mx-auto mb-8">
                                          Enter your M-Pesa PIN on the prompt sent to <span className="font-bold text-white block mt-1">{phoneNumber}</span>
                                    </p>
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-slate-300 animate-pulse">
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> Waiting for payment...
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 5 && voucherSuccess && (
                            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center py-6 gap-6">
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1, transition: { type: "spring", stiffness: 200, damping: 20 } }} className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                    <CheckCircle className="w-12 h-12 text-emerald-400" />
                                </motion.div>
                                <div className="w-full">
                                    <h2 className="text-3xl font-extrabold text-white mb-4">You're Online!</h2>
                                    <div className="bg-white/5 p-5 rounded-2xl border border-white/10 mb-8 text-left space-y-3 w-full shadow-inner">
                                        <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                            <span className="text-sm font-medium text-slate-400">Plan</span> 
                                            <span className="text-sbase font-bold text-white">{voucherSuccess.plan}</span>
                                          </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-400">Expires at</span> 
                                            <span className="text-base font-bold text-emerald-400">
                                                {new Date(voucherSuccess.expiresAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <form name="login" action={loginUrl || "http://192.168.88.1/login"} method="post" id="mikrotik-login-form" className="w-full">
                                    <input type="hidden" name="username" value={loginIdentity || phoneNumber} />
                                    <input type="hidden" name="password" value={loginIdentity || phoneNumber} />
                                    <input type="hidden" name="dst" value="http://connectivitycheck.gstatic.com/generate_204" />
                                    
                                    <button type="submit" disabled={isAutoConnecting} className="w-full premium-button bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/25">
                                        {isAutoConnecting ? <><Loader2 className="w-5 h-5 animate-spin" /> Connecting Device...</> : <>Tap to Connect Now</>}
                                    </button>
                                </form>

                                <button onClick={() => { setShowDeviceModal(true); setDeviceResult(null); setDeviceMac(''); }} className="w-full glass-pill text-sm text-slate-300 mt-2">
                                    <Tv className="w-4 h-4" /> Connect a Smart TV or another device
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                <p className="text-center text-xs font-medium text-slate-500 flex items-center justify-center gap-1.5 opacity-60">
                    <Shield className="w-3.5 h-3.5" /> Secured by TurboNet
                </p>
            </div>

            <AnimatePresence>
            {showVoucherModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="glass-panel w-full max-w-sm p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
                         <div className="text-center">
                             <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-blue-500/20">
                                 <Ticket className="w-6 h-6 text-blue-400" />
                             </div>
                             <h3 className="text-xl font-bold text-white">Redeem Voucher</h3>
                             <p className="text-sm text-slate-400 mt-1">Enter your 8-digit access code.</p>
                         </div>
                         
                         <input 
                            type="text" 
                            className="premium-input text-center text-2xl tracking-[0.2em] uppercase font-mono" 
                            placeholder="XXXX-XXXX"
                            value={voucherCode}
                            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                         />
                         
                         <div className="flex flex-col gap-3 mt-2">
                            <button className="premium-button bg-blue-500 hover:bg-blue-400 text-white">
                                Activate Access
                            </button>
                            <button onClick={() => setShowVoucherModal(false)} className="premium-button bg-white/5 hover:bg-white/10 text-white border border-white/10">
                                Cancel
                            </button>
                         </div>
                    </motion.div>
                </div>
            )}
            </AnimatePresence>

            <AnimatePresence>
            {showRecoveryModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="glass-panel w-full max-w-sm p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
                         <div className="text-center">
                             <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-500/20">
                                 <Smartphone className="w-6 h-6 text-emerald-400" />
                             </div>
                             <h3 className="text-xl font-bold text-white">Enter M-Pesa Code</h3>
                             <p className="text-sm text-slate-400 mt-1">Paste your M-Pesa confirmation message or enter the receipt code.</p>
                         </div>
                         
                         <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-4">
                             <textarea
                                className="premium-input text-sm resize-none"
                                rows={3}
                                placeholder="Paste your M-Pesa message here...&#10;e.g. UCUE4B05DS Confirmed. Ksh 40.00..."
                                value={mpesaMessage}
                                onChange={(e) => {
                                    setMpesaMessage(e.target.value);
                                    const code = extractReceiptCode(e.target.value);
                                    if (code) setReceiptCode(code);
                                }}
                             />
                             <input 
                                type="text" 
                                className="premium-input text-center font-mono tracking-wider" 
                                placeholder="Or enter code directly (e.g. UCUE4B05DS)"
                                value={receiptCode}
                                onChange={(e) => setReceiptCode(e.target.value.toUpperCase())}
                             />
                             
                             {recoveryError && (
                                <div className="text-sm font-bold text-red-400 flex items-center gap-2 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {recoveryError}
                                </div>
                             )}
                             
                             <div className="flex flex-col gap-3 mt-2">
                                <button type="submit" disabled={recoveryLoading || (!receiptCode && !mpesaMessage)} className="premium-button bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20">
                                    {recoveryLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Get Connected'}
                                </button>
                                <button type="button" onClick={() => { setShowRecoveryModal(false); setRecoveryError(''); setReceiptCode(''); setMpesaMessage(''); }} className="premium-button bg-white/5 hover:bg-white/10 text-white border border-white/10">
                                    Cancel
                                </button>
                             </div>
                         </form>
                    </motion.div>
                </div>
            )}
             </AnimatePresence>

            <AnimatePresence>
            {showDeviceModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="glass-panel w-full max-w-sm p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
                         <div className="text-center">
                             <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-500/20">
                                 <Tv className="w-6 h-6 text-emerald-400" />
                             </div>
                             <h3 className="text-xl font-bold text-white">Connect Another Device</h3>
                             <p className="text-sm text-slate-400 mt-1">Enter the MAC address of your Smart TV or other device. Find it in your TV&apos;s Settings &gt; Network &gt; MAC Address.</p>
                         </div>

                         <form onSubmit={handleAuthorizeDevice} className="flex flex-col gap-4">
                             <input
                                type="text"
                                className="premium-input text-center font-mono tracking-wider"
                                placeholder="AA:BB:CC:DD:EE:FF"
                                value={deviceMac}
                                onChange={(e) => setDeviceMac(e.target.value)}
                             />

                             {deviceResult && (
                                <div className={`text-sm font-bold flex items-center gap-2 p-3 rounded-lg border ${deviceResult.success ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                                    {deviceResult.success ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                                    {deviceResult.message}
                                </div>
                             )}

                             <div className="flex flex-col gap-3 mt-2">
                                <button type="submit" disabled={deviceLoading || !deviceMac} className="premium-button bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20">
                                    {deviceLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authorize Device'}
                                </button>
                                <button type="button" onClick={() => setShowDeviceModal(false)} className="premium-button bg-white/5 hover:bg-white/10 text-white border border-white/10">
                                    Close
                                </button>
                             </div>
                         </form>
                    </motion.div>
                </div>
            )}
            </AnimatePresence>
        </div>
    );
}

export default App;
