import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, Smartphone, CheckCircle, AlertCircle, Loader2, Ticket, ChevronRight, RotateCcw, ShieldCheck, Activity, Info } from 'lucide-react';
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
    const [receiptNumber, setReceiptNumber] = useState('');
    const [branding, setBranding] = useState(null);
    const [isAutoConnecting, setIsAutoConnecting] = useState(false);
    const [showSystemInfo, setShowSystemInfo] = useState(false);
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
        setLoading(true); setError('');
        let phone = phoneNumber.replace(/\s+/g, '');
        if (!/^(07|01)\d{8}$/.test(phone)) {
            setError('Enter a valid Safaricom number');
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
            } else setError(res.data.message || "Payment failed");
        } catch (err) { setError("Connection error. Try again."); }
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
                        setVoucherSuccess({
                            plan: selectedPlan.name,
                            expiresAt: res.data.expiresAt || new Date(Date.now() + 3600000).toISOString()
                        });
                        setStep(5);
                    } else if (res.data.status === 'FAILED') {
                        clearInterval(interval);
                        setError("Payment failed.");
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
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4 sm:p-6 lg:p-12 overflow-x-hidden">
            {/* Design System Injection */}
            {branding?.primary_color && (
                <style dangerouslySetInnerHTML={{ __html: `
                    :root { --accent: ${branding.primary_color}; }
                    .accent-border { border-color: ${branding.primary_color}; }
                    .accent-bg { background-color: ${branding.primary_color}; }
                    .accent-text { color: ${branding.primary_color}; }
                `}} />
            )}

            <div className="w-full max-w-lg flex flex-col gap-6 relative z-10 transition-all duration-500">
                {/* Header Section */}
                <header className="flex items-end justify-between px-2">
                    <div className="flex flex-col">
                        <div className="mono-label text-muted mb-1">Network Node Access</div>
                        <h1 className="text-3xl text-white flex items-center gap-2">
                            {branding?.portal_title ? branding.portal_title : <>Turbo<span className="accent-text">Net</span></>}
                        </h1>
                    </div>
                    <button onClick={() => setShowSystemInfo(!showSystemInfo)} className="p-2 text-muted hover:text-white transition-colors">
                        <Info className="w-5 h-5" />
                    </button>
                </header>

                {/* System Info Panel (Authentic hidden detail) */}
                <AnimatePresence>
                    {showSystemInfo && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="bg-[#141415] border border-border-subtle p-4 rounded-lg flex flex-col gap-2">
                                <div className="flex justify-between items-center text-[10px] mono-label text-muted">
                                    <span>Client MAC</span>
                                    <span className="text-secondary font-mono tracking-widest">{macAddress || 'UNREGISTERED'}</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] mono-label text-muted">
                                    <span>Server ID</span>
                                    <span className="text-secondary font-mono">TN-NODE-01-VPS</span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] mono-label text-muted">
                                    <span>Auth Protocol</span>
                                    <span className="text-secondary font-mono">RADIUS / MPESA-STK</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content Area */}
                <main className="min-h-[400px] flex flex-col relative">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div key="plans" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-4">
                                <div className="mono-label text-muted px-2">Available Sessions</div>
                                <div className="grid grid-cols-1 gap-3">
                                    {plans.map((plan) => (
                                        <div key={plan.id} onClick={() => handlePlanSelect(plan)} className="ticket-card group">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <h3 className="text-lg text-white group-hover:accent-text transition-colors">{plan.name}</h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="status-badge border-border-subtle text-muted group-hover:border-accent group-hover:text-accent transition-all">{plan.speed_limit_down}</span>
                                                        <span className="text-[10px] text-muted mono-label">Reliable Access</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] mono-label text-muted mb-1">KES</div>
                                                    <div className="text-2xl font-bold text-white tracking-tight">{plan.price}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <button onClick={() => setShowVoucherModal(true)} className="flex items-center justify-center gap-2 py-4 bg-[#141415] border border-border-subtle rounded-lg text-xs font-bold uppercase tracking-widest hover:border-active transition-all group">
                                        <Ticket className="w-4 h-4 text-muted group-hover:text-accent" /> Voucher
                                    </button>
                                    <button onClick={() => setShowRecoveryModal(true)} className="flex items-center justify-center gap-2 py-4 bg-[#141415] border border-border-subtle rounded-lg text-xs font-bold uppercase tracking-widest hover:border-active transition-all group">
                                        <RotateCcw className="w-4 h-4 text-muted group-hover:text-amber-500" /> Recovery
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div key="checkout" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                                <button onClick={() => setStep(1)} className="text-[10px] mono-label text-muted hover:text-white flex items-center gap-2 transition-colors">
                                    <RotateCcw className="w-3 h-3" /> Back to Plans
                                </button>
                                
                                <div className="bg-[#141415] border border-border-subtle p-6 rounded-xl flex items-center justify-between">
                                    <div>
                                        <div className="mono-label text-muted mb-1">Selected Access</div>
                                        <div className="text-xl font-bold text-white">{selectedPlan.name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="mono-label text-muted mb-1">Total Due</div>
                                        <div className="text-2xl font-bold accent-text">KES {selectedPlan.price}</div>
                                    </div>
                                </div>

                                <form onSubmit={handlePay} className="flex flex-col gap-6">
                                    <div className="flex flex-col gap-3">
                                        <label className="mono-label text-muted px-1">M-Pesa Number</label>
                                        <input 
                                            type="tel" 
                                            placeholder="07XX XXX XXX" 
                                            value={phoneNumber} 
                                            onChange={(e) => setPhoneNumber(e.target.value)} 
                                            className="w-full bg-[#111112] border border-border-subtle py-5 px-6 text-xl font-bold tracking-widest text-white focus:outline-none focus:border-accent transition-all placeholder:text-muted/50" 
                                            autoFocus 
                                        />
                                        {error && <div className="text-xs font-bold text-red-500 flex items-center gap-2 mt-1"><AlertCircle className="w-4 h-4" /> {error}</div>}
                                    </div>

                                    <button type="submit" disabled={loading} className="accent-bg text-white font-black py-5 rounded-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-sm">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Initialize Payment</>}
                                    </button>
                                </form>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div key="pending" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#141415] border border-border-subtle rounded-3xl gap-6">
                                <div className="relative">
                                    <div className="w-20 h-20 rounded-full border border-accent/20 flex items-center justify-center animate-[pulse_2s_infinite]">
                                        <Smartphone className="w-8 h-8 accent-text" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-2xl text-white mb-2 underline underline-offset-8 decoration-accent/30">Action Required</h2>
                                    <p className="text-secondary text-sm leading-relaxed max-w-[240px] mx-auto mb-6">Enter your M-Pesa PIN on the prompt sent to <span className="font-bold text-white">{phoneNumber}</span></p>
                                    <div className="status-badge border-accent/20 accent-text animate-pulse">Waiting for network callback</div>
                                </div>
                            </motion.div>
                        )}

                        {step === 5 && voucherSuccess && (
                            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#141415] border border-[#16A34A33] rounded-3xl gap-6">
                                <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-green-500" />
                                </div>
                                <div>
                                    <h2 className="text-2xl text-white mb-2">Access Granted</h2>
                                    <div className="bg-[#0A0A0B] p-4 rounded-lg border border-border-subtle mb-8 text-left space-y-2">
                                        <div className="flex justify-between text-[10px] mono-label text-muted"><span>Plan</span> <span className="text-white">{voucherSuccess.plan}</span></div>
                                        <div className="flex justify-between text-[10px] mono-label text-muted"><span>Expires</span> <span className="text-green-500 font-mono">{new Date(voucherSuccess.expiresAt).toLocaleTimeString()}</span></div>
                                    </div>
                                </div>

                                <form name="login" action={loginUrl || "http://192.168.88.1/login"} method="post" id="mikrotik-login-form" className="w-full">
                                    <input type="hidden" name="username" value={phoneNumber} />
                                    <input type="hidden" name="password" value={phoneNumber} />
                                    <input type="hidden" name="dst" value="http://connectivitycheck.gstatic.com/generate_204" />
                                    
                                    <button type="submit" disabled={isAutoConnecting} className="w-full accent-bg text-white font-black py-5 rounded-lg shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex justify-center items-center gap-3 uppercase tracking-widest text-sm">
                                        {isAutoConnecting ? <><Loader2 className="w-5 h-5 animate-spin" /> Synchronizing...</> : <>Connect Successful</>}
                                    </button>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>

                {/* Footer Credits (Authentic minimal style) */}
                <footer className="mt-auto pt-6 border-t border-border-subtle flex items-center justify-between px-2 text-[8px] mono-label text-muted opacity-50">
                    <div>© 2026 TURBONET SYSTEMS</div>
                    <div className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> VERIFIED_NODE_ID_8832</div>
                </footer>
            </div>

            {/* Modals and other UI helpers (minimal versions) */}
            {showVoucherModal && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#141415] border border-border-subtle p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6">
                         <div className="mono-label text-muted">Voucher Redemption</div>
                         <input 
                            type="text" 
                            className="w-full bg-[#0A0A0B] border border-border-subtle p-4 text-center font-mono tracking-widest text-xl rounded-lg text-white" 
                            placeholder="XXXX-XXXX"
                            value={voucherCode}
                            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                         />
                         <div className="flex gap-2">
                            <button onClick={() => setShowVoucherModal(false)} className="flex-1 py-3 text-muted mono-label">Cancel</button>
                            <button className="flex-1 py-3 accent-bg text-white rounded-md font-bold text-xs uppercase tracking-widest">Verify</button>
                         </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

export default App;
