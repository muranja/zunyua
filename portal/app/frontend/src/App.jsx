import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Smartphone, CheckCircle, AlertCircle, Loader2, Ticket, RotateCcw, ShieldCheck, Zap, ArrowRight, Shield, ChevronRight } from 'lucide-react';
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
    const [voucherSuccess, setVoucherSuccess] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const mac = params.get('mac') || params.get('mac_esc');
        const lUrl = params.get('login_url');
        if (mac) {
            setMacAddress(mac);
            checkExistingSubscription(mac);
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
            if (res.data && res.data.id) setBranding(res.data);
        } catch (err) { console.error('Branding error:', err); }
    };

    const checkExistingSubscription = async (mac) => {
        try {
            const res = await axios.get(`${API_URL}/check-status?mac=${encodeURIComponent(mac)}`);
            if (res.data.active) {
                setPhoneNumber(res.data.phoneNumber);
                setLoginIdentity(res.data.loginIdentity || res.data.phoneNumber || '');
                setVoucherSuccess({ plan: res.data.planName || 'WiFi', expiresAt: res.data.expiresAt });
                setStep(5);
            }
        } catch (err) { console.error('Status check error:', err); }
    };

    const fetchPlans = async () => {
        try {
            const res = await axios.get(`${API_URL}/plans`);
            if (Array.isArray(res.data)) setPlans(res.data);
        } catch (err) {
            // Fallback
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

    const handlePay = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        let phone = phoneNumber.replace(/\s+/g, '');
        if (!/^(07|01)\d{8}$/.test(phone)) {
            setError('Please enter a valid Safaricom number');
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
        } catch (err) { setError("Connection error. Please try again."); }
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

    return (
        <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden selection:bg-blue-500/30">
            {branding?.primary_color && (
                <style dangerouslySetInnerHTML={{ __html: `
                    :root { --accent: ${branding.primary_color}; }
                    .accent-text { color: ${branding.primary_color}; }
                    .accent-bg { background-color: ${branding.primary_color}; }
                `}} />
            )}

            {/* Glowing orbs for background depth */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="w-full max-w-md flex flex-col gap-6 relative z-10">
                
                {/* Header Section */}
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

                {/* Main Glass Panel Area */}
                <main className="min-h-[420px] glass-panel rounded-3xl p-6 md:p-8 flex flex-col relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        
                        {/* Step 1: Select Plan */}
                        {step === 1 && (
                            <motion.div key="plans" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-5 h-full">
                                <h2 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
                                    Choose exactly what you need
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
                                        <RotateCcw className="w-4 h-4" /> Restore
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Checkout Form */}
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

                        {/* Step 3: Pending M-Pesa Prompt */}
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
                                    <p className="text-slate-300 text-base leading-relaxed max-w-[280px] mx-auto mb-8">
                                        Enter your M-Pesa PIN on the prompt sent to <span className="font-bold text-white block mt-1">{phoneNumber}</span>
                                    </p>
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-slate-300 animate-pulse">
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> Waiting for payment...
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 5: Success & Auto-Connect */}
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
                                            <span className="text-base font-bold text-white">{voucherSuccess.plan}</span>
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
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                <p className="text-center text-xs font-medium text-slate-500 flex items-center justify-center gap-1.5 opacity-60">
                    <Shield className="w-3.5 h-3.5" /> Secured by TurboNet
                </p>
            </div>

            {/* Premium Voucher Modal */}
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

            {/* Premium Recovery Modal */}
            <AnimatePresence>
            {showRecoveryModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="glass-panel w-full max-w-sm p-6 sm:p-8 rounded-3xl flex flex-col gap-6">
                         <div className="text-center">
                             <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-amber-500/20">
                                 <RotateCcw className="w-6 h-6 text-amber-400" />
                             </div>
                             <h3 className="text-xl font-bold text-white">Restore Session</h3>
                             <p className="text-sm text-slate-400 mt-1">Provide your phone number to restore an active session.</p>
                         </div>
                         
                         <input 
                            type="tel" 
                            className="premium-input text-center" 
                            placeholder="07XX XXX XXX"
                         />
                         
                         <div className="flex flex-col gap-3 mt-2">
                            <button className="premium-button bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/20">
                                Find Session
                            </button>
                            <button onClick={() => setShowRecoveryModal(false)} className="premium-button bg-white/5 hover:bg-white/10 text-white border border-white/10">
                                Cancel
                            </button>
                         </div>
                    </motion.div>
                </div>
            )}
            </AnimatePresence>
        </div>
    );
}

export default App;

