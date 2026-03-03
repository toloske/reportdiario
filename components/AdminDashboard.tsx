import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { getReportsByDate } from '../services/storageService';
import { dataService, SVC } from '../services/dataService';

interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reports, setReports] = useState<any[]>([]);
  const [svcs, setSvcs] = useState<SVC[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [mercadoLivreSvcs, setMercadoLivreSvcs] = useState<string[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const fetchedSvcs = await dataService.fetchSVCs();
      setSvcs(fetchedSvcs);

      // Fetch which SVC IDs are exclusively responsible for "Mercado Livre"
      const { data: mlVehicles } = await supabase
        .from('vehicles')
        .select('svc_id')
        .eq('operation', 'Mercado Livre');

      const uniqueMlSvcIds = Array.from(new Set(mlVehicles?.map(v => v.svc_id) || []));
      setMercadoLivreSvcs(uniqueMlSvcIds);

      const fetchedReports = await getReportsByDate(selectedDate);
      setReports(fetchedReports);
      setLoading(false);
    };
    loadData();
  }, [selectedDate]);

  const reportedSvcIds = reports.map(r => r.svc_id);
  const missingSvcs = svcs.filter(svc =>
    !reportedSvcIds.includes(svc.id) && mercadoLivreSvcs.includes(svc.id)
  );

  const handleExportCSV = () => {
    if (reports.length === 0) return;

    // Header array (added Date)
    const rows = [
      ["Data", "SVC", "Placa", "Motivo"]
    ];

    // Build data rows
    reports.forEach(report => {
      const svc = report.svc_id;
      // In this version, we use selectedDate as the Data column
      const rDate = selectedDate.split('-').reverse().join('/');

      if (report.justifications) {
        const justs = report.justifications.split('; ');
        justs.forEach((just: string) => {
          // just is in format: "PLACA" - MOTIVO
          const match = just.match(/"?([A-Za-z0-9]+)"?\s*-\s*(.*)/);
          if (match) {
            const plate = match[1];
            const reason = match[2];
            rows.push([rDate, svc, plate, reason]);
          } else {
            // fallback if string format is different
            rows.push([rDate, svc, "N/A", just]);
          }
        });
      }
    });

    const csvContent = rows.map(r => r.join(";")).join("\n");
    // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Relatorio_Frota_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '@Torpedo22') {
      setIsAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 font-sans animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-8 rounded-3xl shadow-xl border border-slate-200/60 dark:border-slate-800 text-center relative overflow-hidden">
          {/* Decorative background circle */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-3xl"></div>

          <div className="w-16 h-16 bg-gradient-to-tr from-primary/20 to-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3">
            <span className="material-symbols-outlined text-3xl font-light text-primary -rotate-3">lock</span>
          </div>

          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2 tracking-tight">Acesso Restrito</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Digite a senha para acessar o painel administrativo.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="Senha Master"
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setPasswordError(false);
                }}
                className={`w-full px-4 py-3.5 bg-slate-50 dark:bg-slate-950 border ${passwordError ? 'border-red-400 focus:ring-red-400/20' : 'border-slate-200 dark:border-slate-800 focus:border-primary focus:ring-primary/20'} rounded-xl text-center text-lg tracking-widest text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-4 transition-all placeholder:tracking-normal placeholder:text-sm`}
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-xs font-semibold mt-2 animate-in slide-in-from-top-1">Senha incorreta. Tente novamente.</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-black dark:bg-primary dark:hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-slate-900/20 dark:shadow-primary/20 active:scale-[0.98] transition-all"
            >
              Acessar Painel
            </button>
          </form>

          <button
            onClick={onBack}
            className="mt-6 text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Voltar para o início
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 font-sans">

      {/* Header Section */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-5 py-4 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm sticky top-2 z-10">
        <h2 className="text-xl font-extrabold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Painel Master</h2>
        <button
          onClick={onBack}
          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-400 transition-all active:scale-90"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Date Filter & Export Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/60 dark:border-slate-800/80 space-y-5">
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
            <span className="material-symbols-outlined text-[16px]">calendar_month</span>
            Filtrar por Dia
          </label>
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200 shadow-inner transition-colors"
          />
        </div>

        <button
          onClick={handleExportCSV}
          disabled={loading || reports.length === 0}
          className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-lg shadow-primary/30 disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 disabled:hover:bg-primary"
        >
          <span className="material-symbols-outlined text-[20px]">download</span>
          Exportar Base do Dia (CSV)
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-500 animate-pulse">Sincronizando dados...</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Missing SVCs Section */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              <span className="material-symbols-outlined text-[16px] text-red-500">warning</span>
              Faltam Responder ({missingSvcs.length})
            </h3>

            {missingSvcs.length === 0 ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-xl border border-emerald-200/60 dark:border-emerald-800/50 text-sm font-medium flex items-center gap-2.5 shadow-sm">
                <span className="material-symbols-outlined text-emerald-500">verified</span>
                Fantástico! Todos os SVCs responderam.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 p-1">
                {missingSvcs.map(svc => (
                  <span key={svc.id} className="px-3.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                    {svc.name}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Plates and Justifications Section */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              <span className="material-symbols-outlined text-[16px] text-primary">list_alt</span>
              Justificativas por SVC
            </h3>

            {reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl bg-white/50 dark:bg-slate-900/50">
                <span className="material-symbols-outlined text-4xl mb-3 text-slate-300 dark:text-slate-700">inbox</span>
                <p className="text-sm font-medium">Nenhum relatório logado neste dia.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
                  <div key={report.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800/80 transition-all hover:shadow-md">

                    {/* Card Header */}
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <h4 className="font-extrabold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <span className="material-symbols-outlined text-[18px] text-primary">storefront</span>
                        </div>
                        {report.svc_id}
                      </h4>
                      <span className="text-[10px] uppercase font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-md text-slate-500 border border-slate-200/50 dark:border-slate-700/50">
                        {report.acceptance_type}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-2.5">
                      {report.justifications ? report.justifications.split('; ').map((just: string, i: number) => {
                        const isRodou = just.includes('RODOU');
                        return (
                          <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${isRodou ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40' : 'bg-slate-50 border-slate-100 dark:bg-slate-800/30 dark:border-slate-800/60'}`}>
                            <span className={`material-symbols-outlined mt-0.5 text-[18px] shrink-0 ${isRodou ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {isRodou ? 'check_circle' : 'info'}
                            </span>
                            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                              {just}
                            </span>
                          </div>
                        );
                      }) : (
                        <p className="text-slate-400 italic text-xs text-center py-3">Nenhum histórico detalhado.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
