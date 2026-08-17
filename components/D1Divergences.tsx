import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { dataService } from '../services/dataService';
import { getPreviousDayDateStr } from '../services/corteSummaryService';
import { JUSTIFICATION_OPTIONS } from '../constants';

interface D1DivergencesProps {
  date: string;
  svcId: string;
  onSuccess: () => void;
}

interface DivergenceError {
  plate: string;
  svc: string;
  reason: string; // The error reason
  originalJustification?: string;
  isFixed: boolean;
  newJustification?: string;
  otherText?: string;
}

const D1Divergences: React.FC<D1DivergencesProps> = ({ date, svcId, onSuccess }) => {
  const [loading, setLoading] = useState(true);
  const [errorsList, setErrorsList] = useState<DivergenceError[]>([]);
  const [prevDateStr, setPrevDateStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [originalReport, setOriginalReport] = useState<any | null>(null);

  // Helper to extract reserve plate
  const extractReservePlate = (justificationStr: string, originalPlate: string): string | null => {
    if (!justificationStr) return null;
    const candidates = justificationStr.match(/[A-Z0-9]{5,8}/gi) || [];
    const origUpper = (originalPlate || '').toUpperCase();
    for (const cand of candidates) {
      const uCand = cand.toUpperCase();
      if (uCand !== 'CARRO' && uCand !== 'RESERVA' && uCand !== 'FALTA' && uCand !== 'FOLGA' && uCand !== origUpper) {
        return uCand;
      }
    }
    return null;
  };

  const checkDivergences = async () => {
    setLoading(true);
    try {
      const prevDate = getPreviousDayDateStr(date);
      setPrevDateStr(prevDate);

      // 1. Fetch D-1 Report
      let reportQuery = supabase
        .from('daily_reports')
        .select('*')
        .eq('date', prevDate);

      if (svcId === 'SSP40') {
        reportQuery = reportQuery.in('svc_id', ['SSP40', 'SSP49', 'SSP57']);
      } else {
        reportQuery = reportQuery.eq('svc_id', svcId);
      }

      // Fetch the latest report if duplicates exist
      const { data: reports, error: rErr } = await reportQuery.order('created_at', { ascending: false });

      if (rErr) throw rErr;

      const report = reports && reports.length > 0 ? reports[0] : null;
      setOriginalReport(report);
      setReportId(report ? report.id : null);

      // Parse justifications map: plate -> justification
      const justificationsMap: Record<string, string> = {};
      if (report && report.justifications) {
        const items = report.justifications.split('; ');
        items.forEach((item: string) => {
          const match = item.match(/"?([A-Za-z0-9-]+)"?\s*-\s*(.*)/);
          if (match) {
            justificationsMap[match[1]] = match[2].trim();
          }
        });
      }

      // 2. Fetch D-1 Routes
      const { data: routes, error: routeErr } = await supabase
        .from('daily_routes')
        .select('plate, route_id, svc_id, xpt')
        .eq('date', prevDate);

      if (routeErr) throw routeErr;

      const routedPlates = new Set((routes || []).map(r => r.plate));

      // 3. Fetch Active Fixed Fleet Vehicles
      const fixedVehicles = await dataService.fetchFixedFleetVehicles();
      const relevantVehicles = fixedVehicles.filter(v => {
        if (svcId === 'SSP40') {
          return ['SSP40', 'SSP49', 'SSP57'].includes(v.svc_id);
        }
        return v.svc_id === svcId;
      });

      const errors: DivergenceError[] = [];

      // Check fixed vehicles
      relevantVehicles.forEach(vehicle => {
        const hasRoute = routedPlates.has(vehicle.plate);
        const justification = justificationsMap[vehicle.plate];

        if (!hasRoute) {
          if (justification) {
            const justUpper = justification.toUpperCase();
            if (justUpper.includes('RODOU')) {
              errors.push({
                plate: vehicle.plate,
                svc: vehicle.svc_id,
                reason: 'Veículo marcado como "RODOU" mas não teve rota no sistema',
                originalJustification: justification,
                isFixed: false
              });
            } else if (justUpper.includes('RESERVA')) {
              const reservePlate = extractReservePlate(justification, vehicle.plate);
              if (reservePlate) {
                const reserveHasRoute = routedPlates.has(reservePlate);
                if (!reserveHasRoute) {
                  errors.push({
                    plate: vehicle.plate,
                    svc: vehicle.svc_id,
                    reason: `Carro reserva (${reservePlate}) não teve rota identificada no sistema`,
                    originalJustification: justification,
                    isFixed: false
                  });
                }
              } else {
                errors.push({
                  plate: vehicle.plate,
                  svc: vehicle.svc_id,
                  reason: 'Carro reserva sem placa do reserva informada',
                  originalJustification: justification,
                  isFixed: false
                });
              }
            }
          } else {
            errors.push({
              plate: vehicle.plate,
              svc: vehicle.svc_id,
              reason: 'Sem justificativa preenchida (Frota Fixa)',
              originalJustification: '',
              isFixed: false
            });
          }
        }
      });

      // Check third-party (Próprio) justifications
      const fixedPlatesSet = new Set(relevantVehicles.map(v => v.plate));
      Object.keys(justificationsMap).forEach(plate => {
        if (fixedPlatesSet.has(plate)) return; // already checked

        const hasRoute = routedPlates.has(plate);
        const justification = justificationsMap[plate];

        if (!hasRoute && justification && justification.toUpperCase().includes('RODOU')) {
          errors.push({
            plate,
            svc: svcId,
            reason: 'Veículo Próprio/Terceiro marcado como "RODOU" mas sem rota no sistema',
            originalJustification: justification,
            isFixed: false
          });
        }
      });

      setErrorsList(errors);
      if (errors.length === 0) {
        onSuccess();
      }
    } catch (e) {
      console.error('Error checking D-1 divergences:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkDivergences();
  }, [date, svcId]);

  const handleJustificationChange = (plate: string, just: string) => {
    setErrorsList(prev => prev.map(err => {
      if (err.plate === plate) {
        return {
          ...err,
          newJustification: just,
          otherText: just === 'Outros' || just.includes('Reserva') ? err.otherText || '' : '',
          isFixed: just !== '' && (just !== 'Outros' && !just.includes('Reserva') ? true : !!err.otherText?.trim())
        };
      }
      return err;
    }));
  };

  const handleOtherTextChange = (plate: string, text: string) => {
    setErrorsList(prev => prev.map(err => {
      if (err.plate === plate) {
        const just = err.newJustification || '';
        return {
          ...err,
          otherText: text,
          isFixed: just !== '' && (just !== 'Outros' && !just.includes('Reserva') ? true : !!text.trim())
        };
      }
      return err;
    }));
  };

  const handleSaveCorrections = async () => {
    const unfixed = errorsList.filter(e => !e.isFixed);
    if (unfixed.length > 0) {
      alert('Por favor, preencha a nova justificativa para todas as placas listadas.');
      return;
    }

    setSaving(true);
    try {
      // Build justificationsMap for update
      const justificationsMap: Record<string, string> = {};
      if (originalReport && originalReport.justifications) {
        const items = originalReport.justifications.split('; ');
        items.forEach((item: string) => {
          const match = item.match(/"?([A-Za-z0-9-]+)"?\s*-\s*(.*)/);
          if (match) {
            justificationsMap[match[1]] = match[2].trim();
          }
        });
      }

      // Merge corrections
      errorsList.forEach(err => {
        let finalJust = err.newJustification || '';
        if (finalJust === 'Outros') {
          finalJust = err.otherText || '';
        } else if (finalJust.includes('Reserva')) {
          finalJust = `Carro Reserva - Placa ${err.otherText?.toUpperCase().trim()}`;
        }
        justificationsMap[err.plate] = finalJust;
      });

      // Stringify justifications map
      const justificationsStr = Object.entries(justificationsMap)
        .map(([p, j]) => `"${p}" - ${j}`)
        .join('; ');

      if (reportId) {
        // Update report
        const { error } = await supabase
          .from('daily_reports')
          .update({ justifications: justificationsStr })
          .eq('id', reportId);
        if (error) throw error;
      } else {
        // Insert report
        const { error } = await supabase
          .from('daily_reports')
          .insert([{
            date: prevDateStr,
            svc_id: svcId,
            justifications: justificationsStr,
            acceptance_type: 'Correção de Anomalia'
          }]);
        if (error) throw error;
      }

      // Recheck divergences
      await checkDivergences();
    } catch (e: any) {
      console.error('Error saving D-1 corrections:', e);
      alert(`Erro ao salvar correções: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh] text-slate-500">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">Analisando dados do dia anterior (D-1)...</p>
      </div>
    );
  }

  const prevDateFormatted = prevDateStr.split('-').reverse().join('/');

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <div className="bg-red-50 dark:bg-rose-950/20 border border-red-200 dark:border-rose-900/50 p-4 rounded-xl flex items-start gap-3 shadow-sm">
        <span className="material-symbols-outlined text-red-600 dark:text-red-500 text-3xl shrink-0">report</span>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-red-800 dark:text-rose-400">
            Pendências de Preenchimento Detectadas ({prevDateFormatted})
          </h3>
          <p className="text-xs text-red-700 dark:text-rose-300/80 leading-relaxed">
            Identificamos incoerências no preenchimento de ontem. Por regras operacionais, você deve corrigir estas placas antes de liberar o envio do relatório de hoje.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {errorsList.map((err) => (
          <div key={err.plate} className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-mono font-bold bg-slate-100 dark:bg-slate-900 rounded px-2.5 py-1 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm">
                  {err.plate}
                </span>
                <p className="text-xs font-semibold text-red-600 dark:text-rose-400 mt-2">
                  Divergência: {err.reason}
                </p>
                {err.originalJustification && (
                  <p className="text-[11px] font-medium text-slate-400">
                    Justificativa Anterior: <span className="italic">"{err.originalJustification}"</span>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-50 dark:border-slate-700/50 pt-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Corrigir Justificativa
                </span>
                <select
                  className="custom-select w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  value={err.newJustification || ''}
                  onChange={(e) => handleJustificationChange(err.plate, e.target.value)}
                >
                  <option value="">Selecione a justificativa correta...</option>
                  {JUSTIFICATION_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value="RODOU">RODOU (Identificado via Rota)</option>
                </select>
              </label>

              {(err.newJustification === 'Outros' || err.newJustification?.includes('Reserva')) && (
                <label className="block animate-in slide-in-from-top-2 duration-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    {err.newJustification === 'Outros' ? 'Descreva o motivo:' : 'Placa do veículo reserva:'}
                  </span>
                  <input
                    type="text"
                    className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none uppercase"
                    value={err.otherText || ''}
                    onChange={(e) => handleOtherTextChange(err.plate, e.target.value)}
                    placeholder={err.newJustification === 'Outros' ? 'Descreva o motivo...' : 'Ex: ABC1D23'}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 h-24"></div>

      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 z-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={handleSaveCorrections}
            disabled={saving || errorsList.some(e => !e.isFixed)}
            className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-all"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span>Salvar Correções de Ontem</span>
                <span className="material-symbols-outlined">done_all</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default D1Divergences;
