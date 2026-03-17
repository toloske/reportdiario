import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { getReportsByDate, getReportsByDateRange, saveDailyRoutes, getDailyRoutesByDate } from '../services/storageService';
import { dataService, SVC } from '../services/dataService';
import { INITIAL_CATEGORIES } from '../constants';
import Papa from 'papaparse';

interface AdminDashboardProps {
  onBack: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [reports, setReports] = useState<any[]>([]);
  const [svcs, setSvcs] = useState<SVC[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'daily'|'utilization'|'audit'>('daily');
  const [startDate, setStartDate] = useState<string>(
    getLocalDateString(new Date(new Date().setDate(new Date().getDate() - 7)))
  );
  const [endDate, setEndDate] = useState<string>(getLocalDateString());
  const [utilizationData, setUtilizationData] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [mercadoLivreSvcs, setMercadoLivreSvcs] = useState<string[]>([]);
  
  // States for Import Route
  const [importDate, setImportDate] = useState<string>(getLocalDateString());
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedPlateCol, setSelectedPlateCol] = useState<string>('');
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // States for Audit Query
  const [auditQueryDate, setAuditQueryDate] = useState<string>(getLocalDateString());
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResults, setAuditResults] = useState<any[] | null>(null);

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

      if (activeTab === 'daily') {
        const fetchedReports = await getReportsByDate(selectedDate);
        setReports(fetchedReports);
      }
      setLoading(false);
    };
    loadData();
  }, [selectedDate, activeTab]);

  useEffect(() => {
    const loadUtilization = async () => {
      // Ensure svcs are loaded so we can filter them by name/operation
      if (activeTab === 'utilization' && svcs.length > 0) {
        setLoading(true);
        const fetchedReports = await getReportsByDateRange(startDate, endDate);
        
        // Find valid SVCs for ML (excluding FIRST MILE)
        const validSvcIds = svcs
          .filter(svc => mercadoLivreSvcs.includes(svc.id) && svc.name !== 'FIRST MILE')
          .map(svc => svc.id);

        const grouped: Record<string, any[]> = {};
        fetchedReports.forEach(r => {
          if (validSvcIds.includes(r.svc_id)) {
            if (!grouped[r.date]) grouped[r.date] = [];
            grouped[r.date].push(r);
          }
        });

        const utilData = Object.keys(grouped).sort((a,b) => b.localeCompare(a)).map(date => {
          const dayReports = grouped[date];
          let totalPlates = 0;
          let maintenance = 0;
          let ran = 0;

          dayReports.forEach(rep => {
            if (rep.justifications) {
              const justs = rep.justifications.split('; ');
              totalPlates += justs.length;
              justs.forEach((j: string) => {
                if (j.toLowerCase().includes('manutenção')) {
                  maintenance++;
                }
                if (j.includes('RODOU')) {
                  ran++;
                }
              });
            }
          });

          const available = totalPlates - maintenance;
          const adjustedRan = ran * 1.162790698;
          let utilizationPerc = 0;
          let utilizationTotalPerc = 0;
          
          if (available > 0) {
            utilizationPerc = (adjustedRan / available) * 100;
          }
          if (totalPlates > 0) {
            utilizationTotalPerc = (adjustedRan / totalPlates) * 100;
          }

          return {
            date,
            totalPlates,
            maintenance,
            available,
            ranAmount: ran,
            adjustedRan,
            utilizationPerc,
            utilizationTotalPerc
          };
        });

        setUtilizationData(utilData);
        setLoading(false);
      }
    };
    loadUtilization();
  }, [startDate, endDate, activeTab, svcs, mercadoLivreSvcs]);

  const reportedSvcIds = reports.map(r => r.svc_id);
  const missingSvcs = svcs.filter(svc =>
    !reportedSvcIds.includes(svc.id) &&
    mercadoLivreSvcs.includes(svc.id) &&
    svc.name !== 'FIRST MILE'
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

  const handleExportOfferCapacityCSV = () => {
    if (reports.length === 0) return;

    const rows = [
      ["Data", "SVC", "Modal", "Oferta", "Capacidade"]
    ];

    const rDate = selectedDate.split('-').reverse().join('/');
    reports.forEach(report => {
      const svc = report.svc_id;
      
      INITIAL_CATEGORIES.forEach(cat => {
         const key = cat.id.replace(/-/g, '_');
         const offer = report[`offer_${key}`];
         const capacity = report[`capacity_${key}`];
         
         if (offer != null || capacity != null) {
           rows.push([rDate, svc, cat.name, (offer || 0).toString(), (capacity || 0).toString()]);
         }
      });
    });

    const csvContent = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Oferta_Capacidade_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setImportSuccess(false);
    
    // Auto-detect columns
    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        if (results.meta.fields) {
          setCsvHeaders(results.meta.fields);
          // Try auto select Route_ID column specifically
          const routeMatch = results.meta.fields.find(f => f.toLowerCase().includes('route_id') || f.toLowerCase().includes('route'));
          if (routeMatch) setSelectedPlateCol(routeMatch);
        }
      }
    });
  };

  const handleImportRoutes = async () => {
    if (!csvFile || !selectedPlateCol) return;
    setImportLoading(true);
    setImportSuccess(false);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const payloadToInsert: any[] = [];
        
        results.data.forEach((row: any) => {
          const routeIdCol = selectedPlateCol; // We now use this as Route_ID selector
          const rawRouteId = row[routeIdCol] || row['Route_ID'];
          
          // Assuming plate can be found in 'Placa'
          const rawPlate = row['Placa'] || row['Plate'] || row['placa'];
          const rawDriverId = row['Driver_ID'] || row['Driver ID'] || '';
          const rawVehicle = row['Veículo'] || row['Vehicle'] || '';
          
          if (rawRouteId && typeof rawRouteId === 'string' && rawPlate) {
            const cleanedPlate = rawPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            if (cleanedPlate.length > 4) {
              payloadToInsert.push({
                 route_id: rawRouteId.trim(),
                 date: importDate,
                 plate: cleanedPlate,
                 driver_id: rawDriverId.trim(),
                 vehicle_type: rawVehicle.trim()
              });
            }
          }
        });

        if (payloadToInsert.length > 0) {
          try {
            await saveDailyRoutes(payloadToInsert);
            setImportSuccess(true);
            setCsvFile(null); // reset UI for import
            setCsvHeaders([]);
            setSelectedPlateCol('');
            // Automatically switch audit date to the one just imported to make it easy
            setAuditQueryDate(importDate); 
          } catch(e) {
            console.error("Failed to save routes:", e);
            alert("Erro ao salvar no banco de dados.");
          }
        }
        setImportLoading(false);
      },
      error: (error) => {
        console.error("PapaParse Error:", error);
        setImportLoading(false);
        alert("Erro ao ler o arquivo CSV.");
      }
    });
  };

  const runAudit = async () => {
    setAuditLoading(true);

    const routes = await getDailyRoutesByDate(auditQueryDate);
    setAuditResults(routes);
    
    setAuditLoading(false);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 font-sans">
      {/* Header Section */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800 backdrop-blur-sm sticky top-2 z-10 w-full overflow-hidden">
        <h2 className="text-xl font-extrabold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Painel Master</h2>
        <button
          onClick={onBack}
          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-400 transition-all active:scale-90"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Tabs Row */}
      <div className="flex flex-col md:flex-row gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800 mb-8">
        <button 
          onClick={() => setActiveTab('daily')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'daily' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          Visão Diária
        </button>
        <button 
          onClick={() => setActiveTab('utilization')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'utilization' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          Dashboard Utilização
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${activeTab === 'audit' ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
        >
          Auditoria de Rotas (Planilha)
        </button>
      </div>

      {activeTab === 'daily' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/60 dark:border-slate-800/80 space-y-5">
          <div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>
              Data do Relatório
            </label>
            <input
              type="date"
              value={selectedDate}
              max={getLocalDateString()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200 shadow-inner transition-colors"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              onClick={handleExportCSV}
              disabled={loading || reports.length === 0}
              className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:active:scale-100"
            >
              <span className="material-symbols-outlined text-[18px]">list_alt</span>
              Exportar Frota
            </button>
            <button
              onClick={handleExportOfferCapacityCSV}
              disabled={loading || reports.length === 0}
              className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-lg shadow-primary/30 disabled:opacity-50 disabled:active:scale-100 disabled:hover:bg-primary"
            >
              <span className="material-symbols-outlined text-[18px]">local_shipping</span>
              Exportar Oferta/Cap.
            </button>
          </div>
        </div>
      )}

      {activeTab === 'utilization' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/60 dark:border-slate-800/80 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Data Inicial</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 text-sm focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200 shadow-inner transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Data Final</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 text-sm focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200 shadow-inner transition-colors" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-6">
          
          {/* IMPORT SECTION */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/60 dark:border-slate-800/80 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-500">upload_file</span>
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">1. Alimentar Histórico de Rotas (Planilha)</h3>
                <p className="text-xs text-slate-500">Faça o upload da rota diária para salvar de forma permanente no banco de dados.</p>
              </div>
            </div>

            {importSuccess && (
               <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-xl border border-emerald-200/60 dark:border-emerald-800/50 text-sm font-medium flex items-center gap-2.5 shadow-sm">
                 <span className="material-symbols-outlined text-emerald-500">cloud_done</span>
                 Rotas importadas e salvas com sucesso no banco de dados para o dia {importDate.split('-').reverse().join('/')}!
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Data Referente à Planilha</label>
                <input type="date" value={importDate} onChange={e => {setImportDate(e.target.value); setImportSuccess(false);}} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 text-sm focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Arquivo CSV de Rotas</label>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="w-full text-sm text-slate-500 file:mr-4 file:py-3.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 focus:outline-none" />
              </div>
            </div>

            {csvHeaders.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/30 flex flex-col md:flex-row gap-4 items-center justify-between">
                 <div className="w-full md:w-1/2">
                   <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 mb-2">Selecione a Coluna de Route ID na Planilha:</label>
                   <select value={selectedPlateCol} onChange={e => setSelectedPlateCol(e.target.value)} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-primary">
                     <option value="" disabled>--- Escolha a coluna ---</option>
                     {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                   </select>
                 </div>
                 
                 <button onClick={handleImportRoutes} disabled={!selectedPlateCol || importLoading} className="w-full md:w-auto mt-4 md:mt-0 px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 disabled:opacity-50 flex items-center justify-center gap-2">
                   {importLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-outlined">save</span>}
                   Importar e Salvar no Banco
                 </button>
              </div>
            )}
          </div>

          {/* AUDIT SECTION */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/60 dark:border-slate-800/80 space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">analytics</span>
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">2. Visualizar Rotas do Dia</h3>
                <p className="text-xs text-slate-500">Veja as rotas salvas no banco de dados para a data informada.</p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="w-full md:w-1/3">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Data da Consulta</label>
                <input type="date" value={auditQueryDate} onChange={e => {setAuditQueryDate(e.target.value); setAuditResults(null);}} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 text-sm focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200" />
              </div>

              <div className="w-full md:w-auto">
                 <button onClick={runAudit} disabled={auditLoading} className="w-full md:w-auto px-8 py-3.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 disabled:opacity-50 flex items-center justify-center gap-2">
                   {auditLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-outlined">search</span>}
                   Buscar e Analisar Banco
                 </button>
              </div>
            </div>
            
            {/* If no data found at all hint */}
            {auditResults && auditResults.length === 0 && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-xl border border-amber-200/60 dark:border-amber-800/50 text-sm font-medium flex items-start gap-2.5 shadow-sm">
                 <span className="material-symbols-outlined text-amber-500">info</span>
                 Parece que você ainda não importou o arquivo CSV contendo a rota do dia {auditQueryDate}. Volte ao passo 1 e suba a planilha com as rotas desta data primeiro.
              </div>
            )}
          </div>
        </div>
      )}

      {loading && activeTab !== 'audit' ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-500 animate-pulse">Sincronizando dados...</p>
        </div>
      ) : activeTab === 'daily' ? (
        <div className="space-y-6">
          {/* Missing SVCs Section */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              <span className="material-symbols-outlined text-[18px] text-red-500">warning</span>
              Faltam Responder ({missingSvcs.length})
            </h3>

            {missingSvcs.length === 0 ? (
              <div className="p-5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-xl border border-emerald-200/60 dark:border-emerald-800/50 text-sm font-medium flex items-center gap-3 shadow-sm">
                <span className="material-symbols-outlined text-emerald-500 scale-110">verified</span>
                Fantástico! Todos os SVCs responderam o relatório diário.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2.5 p-1">
                {missingSvcs.map(svc => (
                  <span key={svc.id} className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    {svc.name}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Plates and Justifications Section */}
          <section className="space-y-4 mt-8">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
              <span className="material-symbols-outlined text-[18px] text-primary">list_alt</span>
              Justificativas Reportadas por SVC
            </h3>

            {reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-3xl bg-white/50 dark:bg-slate-900/50">
                <span className="material-symbols-outlined text-5xl mb-4 text-slate-300 dark:text-slate-700">inbox</span>
                <p className="text-base font-medium">Nenhum relatório logado neste dia.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {reports.map((report) => (
                  <div key={report.id} className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200/60 dark:border-slate-800/80 transition-all hover:shadow-lg flex flex-col max-h-[500px]">
                    {/* Card Header */}
                    <div className="flex justify-between items-center mb-5 pb-5 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 z-10 backdrop-blur">
                      <h4 className="font-extrabold text-xl text-slate-800 dark:text-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px] text-primary">storefront</span>
                        </div>
                        <span className="truncate">{report.svc_id}</span>
                      </h4>
                      <span className="text-[11px] uppercase font-bold bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-slate-500 border border-slate-200/50 dark:border-slate-700/50">
                        {report.acceptance_type}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
                      {report.justifications ? report.justifications.split('; ').map((just: string, i: number) => {
                        const isRodou = just.includes('RODOU');
                        return (
                          <div key={i} className={`flex items-start gap-3 p-3.5 rounded-2xl border ${isRodou ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40' : 'bg-slate-50 border-slate-100 dark:bg-slate-800/30 dark:border-slate-800/60'}`}>
                            <span className={`material-symbols-outlined mt-0.5 text-[20px] shrink-0 ${isRodou ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {isRodou ? 'check_circle' : 'info'}
                            </span>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed word-break-all">
                              {just}
                            </span>
                          </div>
                        );
                      }) : (
                        <p className="text-slate-400 italic text-sm text-center py-6">Nenhum histórico detalhado.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : activeTab === 'utilization' ? (
        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-medium text-slate-500 md:hidden flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">swipe_left</span>
              Arraste para ver mais colunas
            </span>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] relative">
            
            {/* Right gradient hint for overflow on mobile */}
            <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent dark:from-slate-900 pointer-events-none md:hidden z-10"></div>
            
            <div className="overflow-x-auto pb-2">
              <table className="w-full text-left text-xs md:text-sm text-slate-600 dark:text-slate-300 min-w-[700px] md:min-w-0">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] md:text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700">Data</th>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center">T. Placas</th>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-amber-600 dark:text-amber-500">Manutenção</th>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-blue-600 dark:text-blue-500">Disponíveis</th>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-emerald-600 dark:text-emerald-500">Rodaram (Aj.)</th>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-right">% Útil. (Disp.)</th>
                    <th className="px-2 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-right text-indigo-600 dark:text-indigo-400">% Útil. (Total)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {utilizationData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-400 italic">Nenhum dado encontrado no período.</td>
                    </tr>
                  ) : (
                    utilizationData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-2 md:px-5 py-3 md:py-4 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          {row.date.split('-').reverse().join('/')}
                        </td>
                        <td className="px-2 md:px-5 py-3 md:py-4 text-center font-medium">{row.totalPlates}</td>
                        <td className="px-2 md:px-5 py-3 md:py-4 text-center text-amber-600 dark:text-amber-500 bg-amber-50/30 dark:bg-amber-900/10 font-bold">{row.maintenance}</td>
                        <td className="px-2 md:px-5 py-3 md:py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10 font-bold">{row.available}</td>
                        <td className="px-2 md:px-5 py-3 md:py-4 text-center text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10 font-bold">
                          <span title={`${row.ranAmount} veículos reais`}>
                            {row.adjustedRan.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-2 md:px-5 py-3 md:py-4 text-right font-extrabold text-slate-800 dark:text-slate-100">
                          {row.utilizationPerc.toFixed(1)}%
                        </td>
                        <td className="px-2 md:px-5 py-3 md:py-4 text-right font-extrabold text-indigo-700 dark:text-indigo-300">
                          {row.utilizationTotalPerc.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'audit' && auditResults && auditResults.dbRouteCount > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800">
               <span className="text-emerald-600 block text-sm font-bold mb-1">Total Confirmado (Match)</span>
               <span className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{auditResults.matchCount}</span>
               <p className="text-xs text-emerald-600/70 mt-1">Reportou "Rodou" e Planilha confirma.</p>
             </div>
             <div className="bg-red-50 dark:bg-red-900/20 p-5 rounded-2xl border border-red-200 dark:border-red-800">
               <span className="text-red-600 block text-sm font-bold mb-1">Falsos Positivos</span>
               <span className="text-3xl font-black text-red-700 dark:text-red-400">{auditResults.falsePositives.length}</span>
               <p className="text-xs text-red-600/70 mt-1">Reportou "Rodou", mas não está na Planilha.</p>
             </div>
             <div className="bg-amber-50 dark:bg-amber-900/20 p-5 rounded-2xl border border-amber-200 dark:border-amber-800">
               <span className="text-amber-600 block text-sm font-bold mb-1">Falsos Negativos / Ausentes</span>
               <span className="text-3xl font-black text-amber-700 dark:text-amber-400">{auditResults.falseNegatives.length}</span>
               <p className="text-xs text-amber-600/70 mt-1">Tem Rota na planilha, mas reportou folga/manut.</p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
             {/* False Positives Grid */}
             <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
               <div className="bg-red-500 text-white p-4">
                 <h4 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined">gpp_bad</span> Falsos Positivos ({auditResults.falsePositives.length})</h4>
                 <p className="text-xs text-red-100">Disseram que rodou, mas sistema não encontrou roteirização.</p>
               </div>
               <div className="p-0">
                 <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                   {auditResults.falsePositives.map((item, idx) => (
                     <li key={idx} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between items-center">
                       <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{item.plate}</span>
                       <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-600 dark:text-slate-400">{item.svc}</span>
                     </li>
                   ))}
                   {auditResults.falsePositives.length === 0 && <p className="text-sm p-8 text-center text-slate-400">Nenhum falso positivo encontrado.</p>}
                 </ul>
               </div>
             </div>

             {/* False Negatives Grid */}
             <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
               <div className="bg-amber-500 text-white p-4">
                 <h4 className="font-bold flex items-center gap-2"><span className="material-symbols-outlined">assignment_late</span> Falsos Negativos ({auditResults.falseNegatives.length})</h4>
                 <p className="text-xs text-amber-100">Rodaram segundo a planilha, mas relataram como parados.</p>
               </div>
               <div className="p-0">
                 <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                   {auditResults.falseNegatives.map((item, idx) => (
                     <li key={idx} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex justify-between items-center">
                       <div>
                         <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{item.plate}</span>
                         <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Report. App: {item.reason_reported}</p>
                       </div>
                       <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-slate-600 dark:text-slate-400">{item.svc}</span>
                     </li>
                   ))}
                   {auditResults.falseNegatives.length === 0 && <p className="text-sm p-8 text-center text-slate-400">Nenhum falso negativo encontrado.</p>}
                 </ul>
               </div>
             </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminDashboard;
