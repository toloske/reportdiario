
import React from 'react';
import { Step, View } from '../../types';

interface NavbarProps {
    view: View;
    step: Step;
    onBack: () => void;
    onAdminClick: () => void;
    title: string;
}

const Navbar: React.FC<NavbarProps> = ({ view, step, onBack, onAdminClick, title }) => {
    return (
        <nav className="sticky top-0 z-40 bg-primary shadow-lg shadow-blue-900/20 backdrop-blur-sm bg-opacity-95 text-white transition-all duration-300">
            <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">

                {/* Left Side: Logo or Back Button */}
                <div className="flex items-center gap-3">
                    {view === View.FORM && step !== Step.OFFER_CAPACITY ? (
                        <button
                            onClick={onBack}
                            className="p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <img src="/logo.png" alt="Transmaná" className="h-8 w-auto object-contain bg-white rounded p-0.5" />
                            {!title.includes('Oferta') && (
                                <span className="font-bold text-lg tracking-tight">Transmaná</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Center: Title (Dynamic) */}
                <div className="absolute left-1/2 -translate-x-1/2 font-semibold text-sm opacity-90 truncate max-w-[120px]">
                    {title}
                </div>

                {/* Right Side: Admin / User Profile */}
                <div className="flex items-center gap-2">
                    {view === View.FORM && (
                        <button
                            onClick={onAdminClick}
                            className="p-2 -mr-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
                            title="Acesso Administrativo"
                        >
                            <span className="material-symbols-outlined">shield_person</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar (Only in Form) */}
            {view === View.FORM && (
                <div className="h-1 bg-blue-800/50 w-full relative overflow-hidden">
                    <div
                        className="absolute top-0 left-0 h-full bg-white transition-all duration-500 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]"
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
