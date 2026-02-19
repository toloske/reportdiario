
import React from 'react';

interface AnalysisSummaryProps {
  onReset: () => void;
}

const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({ onReset }) => {
  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] text-center animate-in fade-in duration-500">
      <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6 scale-in duration-700 delay-200">
         <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-5xl">verified</span>
      </div>
      
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Relatório Enviado!</h2>
      <p className="text-slate-500 dark:text-slate-400 max-w-[280px] mb-10">
        Suas informações de oferta e capacidade foram registradas com sucesso no sistema.
      </p>

      <button 
        onClick={onReset}
        className="w-full max-w-xs h-14 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg"
      >
        <span className="material-symbols-outlined">add</span>
        Fazer Novo Registro
      </button>
      
      <p className="mt-8 text-[11px] text-slate-400 font-medium uppercase tracking-widest">
        Sistema Operacional Logistics
      </p>
    </div>
  );
};

export default AnalysisSummary;
