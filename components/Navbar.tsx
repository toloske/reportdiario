import React, { useState, useEffect } from 'react';
import { Step, View } from '../types';

interface NavbarProps {
    view: View;
    step: Step;
    onBack: () => void;
    onAdminClick: () => void;
    title: string;
}

const Navbar: React.FC<NavbarProps> = ({ view, step, onBack, onAdminClick, title }) => {
    const [isDark, setIsDark] = useState(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark') || localStorage.getItem('theme') === 'dark';
        }
        return false;
    });

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark(!isDark);

    return (
        <nav className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 shadow-md backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 transition-all duration-300">
            <div className={`mx-auto h-16 flex items-center justify-between ${view === View.ADMIN ? 'w-full px-6' : 'max-w-md px-4'}`}>

                {/* Left Side: Logo or Back Button */}
                <div className="flex items-center gap-3">
                    {view === View.FORM && step !== Step.OFFER_CAPACITY ? (
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <img src="/logo.png" alt="Transmaná" className="h-8 w-auto object-contain bg-white rounded p-0.5" />
                            {!title.includes('Oferta') && (
                                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-primary to-blue-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">Transmaná</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Center: Title (Dynamic) */}
                <div className="absolute left-1/2 -translate-x-1/2 font-bold text-sm tracking-wide opacity-90 hidden sm:block text-slate-600 dark:text-slate-300">
                    {title}
                </div>

                {/* Right Side: Admin / Theme Toggle */}
                <div className="flex items-center gap-1 sm:gap-2">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-all duration-300 ease-out"
                        title="Alternar Tema Escuro"
                    >
                        <span className="material-symbols-outlined text-[20px] transition-transform hover:rotate-12">
                            {isDark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    {view === View.FORM && (
                        <button
                            onClick={onAdminClick}
                            className="p-2 rounded-full text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-blue-400 transition-all duration-300"
                            title="Acesso Administrativo"
                        >
                            <span className="material-symbols-outlined text-[20px]">shield_person</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar (Only in Form) */}
            {view === View.FORM && (
                <div className="h-1 bg-slate-100 dark:bg-slate-800 w-full relative overflow-hidden">
                    <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out"
                        style={{
                            width: step === Step.OFFER_CAPACITY ? '50%' : '100%'
                        }}
                    />
                </div>
            )}
        </nav>
    );
};

export default Navbar;
