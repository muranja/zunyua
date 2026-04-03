import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Terminal, Ticket, Activity, LogOut, Menu, X, Server, Users, ShieldCheck, BarChart3, SlidersHorizontal, Monitor
} from 'lucide-react';

import Login from './Login';
import Dashboard from './Dashboard';
import Vouchers from './Vouchers';
import UsersPage from './Users';
import ActivityLogs from './ActivityLogs';
import Security from './Security';
import Analytics from './Analytics';
import ControlCenter from './ControlCenter';
import Sessions from './Sessions';

export default function AdminApp() {
    const [admin, setAdmin] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const storedAdmin = localStorage.getItem('admin');
        const accessToken = localStorage.getItem('accessToken');
        if (storedAdmin && accessToken) {
            setAdmin(JSON.parse(storedAdmin));
        }
    }, []);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSidebarOpen(true);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('admin');
        setAdmin(null);
    };

    const handleNavClick = (tabId) => {
        setActiveTab(tabId);
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    };

    if (!admin) {
        return <Login onLoginSuccess={setAdmin} />;
    }

    const navItems = [
        { id: 'dashboard', label: 'SYS.OVERVIEW', icon: Terminal },
        { id: 'users', label: 'CLIENT.DB', icon: Users },
        { id: 'vouchers', label: 'TOKENS.MGR', icon: Ticket },
        { id: 'sessions', label: 'SESSIONS', icon: Monitor },
        { id: 'analytics', label: 'ANALYTICS', icon: BarChart3 },
        ...(admin?.isSuperAdmin ? [{ id: 'control', label: 'CONTROL_CENTER', icon: SlidersHorizontal }] : []),
        { id: 'activity', label: 'EVENT.LOGS', icon: Activity },
        { id: 'security', label: 'SECURITY', icon: ShieldCheck },
    ];

    return (
        <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans flex flex-col md:flex-row selection:bg-emerald-500/30 selection:text-emerald-200 cursor-default">

            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-[#050505] sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <Server className="w-5 h-5 text-emerald-500" />
                    <div>
                        <h1 className="font-mono font-bold text-zinc-100 text-sm tracking-widest uppercase">TURBONET_CORE</h1>
                        <p className="font-mono text-[10px] text-zinc-500">v2.0.4-STABLE</p>
                    </div>
                </div>
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 text-zinc-500 hover:text-emerald-400 border border-transparent hover:border-zinc-800 transition-colors"
                    aria-label="Toggle menu"
                >
                    {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {/* Mobile Backdrop */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSidebarOpen(false)}
                        className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
                        style={{ top: '65px' }}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <AnimatePresence>
                {(sidebarOpen || window.innerWidth >= 768) && (
                    <motion.aside
                        initial={{ x: -280 }}
                        animate={{ x: 0 }}
                        exit={{ x: -280 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed md:sticky top-[65px] md:top-0 left-0 h-[calc(100vh-65px)] md:h-screen w-64 bg-[#0a0a0a] border-r border-zinc-800 flex flex-col z-50 md:z-auto"
                    >
                        {/* Desktop Logo */}
                        <div className="hidden md:flex p-5 border-b border-zinc-800 items-start gap-3">
                            <Server className="w-5 h-5 text-emerald-500 mt-1" />
                            <div>
                                <h1 className="font-mono font-bold text-zinc-100 text-sm tracking-widest uppercase">TURBONET_</h1>
                                <p className="font-mono text-[10px] text-zinc-500 mt-1">ADMIN.TERM // ONLINE</p>
                            </div>
                        </div>

                        {/* Navigation */}
                        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                            <div className="px-5 mb-2 font-mono text-[10px] text-zinc-600 tracking-widest uppercase">
                                MODULES
                            </div>
                            {navItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleNavClick(item.id)}
                                    className={`w-full flex items-center gap-3 px-5 py-3 transition-colors font-mono text-xs tracking-wider uppercase border-l-2 ${activeTab === item.id
                                        ? 'border-emerald-500 bg-emerald-500/5 text-emerald-400'
                                        : 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                                        }`}
                                >
                                    <item.icon className="w-4 h-4" />
                                    {item.label}
                                </button>
                            ))}
                        </nav>

                        {/* User & Logout */}
                        <div className="p-5 border-t border-zinc-800 bg-zinc-900/20">
                            <div className="mb-4">
                                <p className="font-mono text-xs text-zinc-400">AUTH: <span className="text-emerald-400">{admin.username}</span></p>
                                <p className="font-mono text-[10px] text-zinc-600 mt-1 uppercase">LVL: {admin.role}</p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-2 border border-zinc-800 hover:border-red-500/50 text-zinc-500 hover:text-red-400 hover:bg-red-500/5 transition-all font-mono text-xs uppercase tracking-widest"
                            >
                                <LogOut className="w-4 h-4" />
                                TERMINATE_SESS
                            </button>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-8 overflow-auto min-h-0 bg-[#000000] custom-scrollbar">
                {activeTab === 'dashboard' && <Dashboard />}
                {activeTab === 'users' && <UsersPage />}
                {activeTab === 'vouchers' && <Vouchers />}
                {activeTab === 'sessions' && <Sessions />}
                {activeTab === 'analytics' && <Analytics />}
                {activeTab === 'control' && <ControlCenter />}
                {activeTab === 'activity' && <ActivityLogs />}
                {activeTab === 'security' && <Security />}
            </main>
        </div>
    );
}
