
import React, { useEffect, useState } from 'react';
import { getReports, exportToCSV } from '../services/storageService';
import { SavedReport } from '../types';

interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [reports, setReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    setReports(getReports());
  }, []);

  return (
    <div className="p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-primary dark:text-white">Painel Master</h2>
        <button
          onClick={onBack}
          className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <span className="material-symbols-outlined text-primary">database</span>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Registros Totais</p>
            <p className="text-2xl font-black text-primary dark:text-white">{reports.length}</p>
          </div>
        </div>

        <button
          onClick={exportToCSV}
          disabled={reports.length === 0}
          className="w-full h-14 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg disabled:opacity-50 disabled:active:scale-100"
        >
          <span className="material-symbols-outlined">download</span>
          Exportar Base Completa (CSV)
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-500 uppercase px-1">Últimos Lançamentos</h3>
        {reports.length === 0 ? (
          <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            Nenhum registro encontrado no banco local.
          </div>
        ) : (
          <div className="space-y-2">
            {reports.slice().reverse().slice(0, 5).map(report => (
              <div key={report.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold">{report.svc}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{report.date} • {report.acceptanceType}</p>
                </div>
                <span className="material-symbols-outlined text-slate-300">chevron_right</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
