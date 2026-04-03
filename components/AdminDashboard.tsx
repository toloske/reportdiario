import React, { useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import { supabase } from '../services/supabaseClient';
import { getReportsByDate, getReportsByDateRange, saveDailyRoutes, getDailyRoutesByDate, getDailyRoutesByDateRange, updateReportJustifications, updateReportOffer } from '../services/storageService';
import { dataService, SVC, Vehicle } from '../services/dataService';
import { INITIAL_CATEGORIES, JUSTIFICATION_OPTIONS } from '../constants';
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
  const [fixedVehicles, setFixedVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'daily'|'utilization'|'audit'|'export'|'director'|'summary'>('daily');
  const [startDate, setStartDate] = useState<string>(
    getLocalDateString(new Date(new Date().setDate(new Date().getDate() - 7)))
  );
  const [endDate, setEndDate] = useState<string>(getLocalDateString());
  const [exportStartDate, setExportStartDate] = useState<string>(
    getLocalDateString(new Date(new Date().setDate(new Date().getDate() - 7)))
  );
  const [exportEndDate, setExportEndDate] = useState<string>(getLocalDateString());
  const [exportLoading, setExportLoading] = useState(false);
  const [utilizationData, setUtilizationData] = useState<any[]>([]);
  const [justificationStats, setJustificationStats] = useState<{reason: string, count: number}[]>([]);
  const [dailyIdleStats, setDailyIdleStats] = useState<{date: string, idle: number}[]>([]);
  const [topSvcStats, setTopSvcStats] = useState<{svc: string, count: number}[]>([]);
  const [topPlateStats, setTopPlateStats] = useState<{plate: string, count: number, reason: string}[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const [mercadoLivreSvcs, setMercadoLivreSvcs] = useState<string[]>([]);
  
  // States for Import Route
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedPlateCol, setSelectedPlateCol] = useState<string>('');
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // States for Audit Query
  const [auditQueryDate, setAuditQueryDate] = useState<string>(getLocalDateString());
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResults, setAuditResults] = useState<any[] | null>(null);

  // Dashboard Diretoria States
  const [dirStartDate, setDirStartDate] = useState(getLocalDateString());
  const [dirEndDate, setDirEndDate] = useState(getLocalDateString());
  const [dirSvcFilter, setDirSvcFilter] = useState('');
  const [dirModalFilter, setDirModalFilter] = useState('');
  const [dirConsolidateModals, setDirConsolidateModals] = useState(true);
  const [dirData, setDirData] = useState<any[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [detailedUtilizationData, setDetailedUtilizationData] = useState<any[]>([]);
  const [detSvcFilter, setDetSvcFilter] = useState('');
  const [detStatusFilter, setDetStatusFilter] = useState<'all'|'ran'|'idle'>('all');
  const [detPlateFilter, setDetPlateFilter] = useState('');
  const [detSortConfig, setDetSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [utilActiveTab, setUtilActiveTab] = useState<'overview'|'details'>('overview');
  const [editingPlateKey, setEditingPlateKey] = useState<string | null>(null);
  const [editingPlateJust, setEditingPlateJust] = useState('');
  const [isSavingJust, setIsSavingJust] = useState(false);
  
  const [editingOfferKey, setEditingOfferKey] = useState<string | null>(null);
  const [editingOfferValue, setEditingOfferValue] = useState<number | ''>('');
  const [isSavingOffer, setIsSavingOffer] = useState(false);

  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const handleSaveJustification = async (date: string, plate: string, reportId: string, fullJustifications: string) => {
    if (!reportId) return;
    setIsSavingJust(true);
    try {
      let newJustsArray = fullJustifications.split('; ').map(j => j.trim());
      const prefix = `"${plate}" -`;
      let found = false;
      for (let i = 0; i < newJustsArray.length; i++) {
        if (newJustsArray[i].startsWith(prefix)) {
          newJustsArray[i] = `"${plate}" - ${editingPlateJust}`;
          found = true;
          break;
        }
      }
      if (!found) {
        newJustsArray.push(`"${plate}" - ${editingPlateJust}`);
      }

      const updatedStr = newJustsArray.join('; ');
      await updateReportJustifications(reportId, updatedStr);
      setEditingPlateKey(null);

      // Local update detailedData to avoid heavy reload
      setDetailedUtilizationData(prev => prev.map(d => {
         if (d.date === date && d.plate === plate) {
            return { ...d, reason: editingPlateJust, fullJustifications: updatedStr };
         }
         return d;
      }));
    } catch (e) {
      alert("Erro ao salvar a justificativa.");
    } finally {
      setIsSavingJust(false);
    }
  };

  const handleSaveOffer = async (date: string, svc: string, modal: string) => {
    if (editingOfferValue === '' || typeof editingOfferValue !== 'number') return;
    setIsSavingOffer(true);
    try {
      const cat = INITIAL_CATEGORIES.find(c => c.name.toUpperCase() === modal);
      if (!cat) throw new Error("Categoria não encontrada.");
      const columnKey = `offer_${cat.id.replace(/-/g, '_')}`;

      await updateReportOffer(date, svc, columnKey, editingOfferValue);
      setEditingOfferKey(null);

      setDirData(prev => prev.map(d => {
         if (d.date === date && d.svc === svc && d.modal === modal) {
            return { ...d, offer: editingOfferValue };
         }
         return d;
      }));
    } catch (e) {
      alert("Erro ao salvar a oferta.");
    } finally {
      setIsSavingOffer(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const fetchedSvcs = await dataService.fetchSVCs();
      setSvcs(fetchedSvcs);
      const fv = await dataService.fetchFixedFleetVehicles();
      setFixedVehicles(fv);

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
      if (activeTab === 'utilization' && svcs.length > 0) {
        setLoading(true);
        const [fetchedReports, fetchedRoutes] = await Promise.all([
          getReportsByDateRange(startDate, endDate),
          getDailyRoutesByDateRange(startDate, endDate)
        ]);
        
        const validSvcIds = svcs
          .filter(svc => mercadoLivreSvcs.includes(svc.id) && svc.name !== 'FIRST MILE')
          .map(svc => svc.id);

        const validFixedPlates = fixedVehicles
          .filter(v => validSvcIds.includes(v.svc_id))
          .map(v => v.plate);
          
        const totalFixedPlates = validFixedPlates.length;

        const grouped: Record<string, any[]> = {};
        fetchedReports.forEach(r => {
          if (validSvcIds.includes(r.svc_id)) {
            if (!grouped[r.date]) grouped[r.date] = [];
            grouped[r.date].push(r);
          }
        });

        const utilData: any[] = [];
        const reasonCounts: Record<string, number> = {};
        const dailyIdleList: {date: string, idle: number}[] = [];
        const svcOffenderCounts: Record<string, number> = {};
        const plateOffenderCounts: Record<string, {count: number, reasons: Set<string>}> = {};

        Object.keys(grouped).sort((a,b) => b.localeCompare(a)).forEach(date => {
          const dayReports = grouped[date];
          let maintenance = 0;
          let ran = 0;
          let dailyIdle = 0;

          dayReports.forEach(rep => {
            if (rep.justifications) {
              const justs = rep.justifications.split('; ');
              justs.forEach((j: string) => {
                const match = j.match(/"?([A-Za-z0-9]+)"?\s*-\s*(.*)/);
                if (match) {
                    const plate = match[1];
                    const reason = match[2];
                    
                    if (validFixedPlates.includes(plate)) {
                        if (reason.toLowerCase().includes('manutenção')) {
                          maintenance++;
                        }
                        if (reason.includes('RODOU')) {
                          ran++;
                        }
                        
                        if (!reason.includes('RODOU')) {
                            let simpleReason = reason.split(' - ')[0].trim();
                            if (simpleReason.toLowerCase().startsWith('sem driver')) {
                                simpleReason = 'Sem Driver';
                            }
                            reasonCounts[simpleReason] = (reasonCounts[simpleReason] || 0) + 1;
                            
                            dailyIdle++;
                            svcOffenderCounts[rep.svc_id] = (svcOffenderCounts[rep.svc_id] || 0) + 1;
                            
                            if (!plateOffenderCounts[plate]) {
                                plateOffenderCounts[plate] = { count: 0, reasons: new Set() };
                            }
                            plateOffenderCounts[plate].count++;
                            plateOffenderCounts[plate].reasons.add(simpleReason);
                        }
                    }
                }
              });
            }
          });

          const available = totalFixedPlates - maintenance;
          const adjustedRan = ran * 1.162790698;
          let utilizationPerc = 0;
          let utilizationTotalPerc = 0;
          let utilizationPurePerc = 0;
          let utilizationPureTotalPerc = 0;
          
          if (available > 0) {
            utilizationPerc = (adjustedRan / available) * 100;
            utilizationPurePerc = (ran / available) * 100;
          }
          if (totalFixedPlates > 0) {
            utilizationTotalPerc = (adjustedRan / totalFixedPlates) * 100;
            utilizationPureTotalPerc = (ran / totalFixedPlates) * 100;
          }

          utilData.push({
            date,
            totalPlates: totalFixedPlates,
            maintenance,
            available,
            ranAmount: ran,
            adjustedRan,
            utilizationPerc,
            utilizationTotalPerc,
            utilizationPurePerc,
            utilizationPureTotalPerc
          });
          
          dailyIdleList.push({ date, idle: dailyIdle });
        });

        setUtilizationData(utilData);
        setDailyIdleStats(dailyIdleList.reverse());
        
        const statsArray = Object.keys(reasonCounts)
            .map(reason => ({ reason, count: reasonCounts[reason] }))
            .sort((a,b) => b.count - a.count);
        setJustificationStats(statsArray);
        
        const svcArray = Object.keys(svcOffenderCounts)
            .map(svc => ({ svc, count: svcOffenderCounts[svc] }))
            .sort((a,b) => b.count - a.count).slice(0, 10);
        setTopSvcStats(svcArray);
        
        const plateArray = Object.keys(plateOffenderCounts)
            .map(plate => ({ 
                plate, 
                count: plateOffenderCounts[plate].count,
                reason: Array.from(plateOffenderCounts[plate].reasons).join(', ')
            }))
            .sort((a,b) => b.count - a.count).slice(0, 15);
        setTopPlateStats(plateArray);
        
        // --- DETAILED PLATE-BY-PLATE LOGIC ---
        const routesByDateAndPlate: Record<string, boolean> = {};
        fetchedRoutes.forEach(r => {
            routesByDateAndPlate[`${r.date}|${r.plate}`] = true;
        });

        const reportCache: Record<string, {reason: string, reportId: string, fullJustifications: string}> = {};
        fetchedReports.forEach(rep => {
            if (validSvcIds.includes(rep.svc_id) && rep.justifications) {
                const justs = rep.justifications.split('; ');
                justs.forEach((j: string) => {
                    const match = j.match(/"?([A-Za-z0-9]+)"?\s*-\s*(.*)/);
                    if (match) {
                        reportCache[`${rep.date}|${match[1]}`] = {
                            reason: match[2].trim(),
                            reportId: rep.id,
                            fullJustifications: rep.justifications
                        };
                    }
                });
            }
        });

        const detailedData: any[] = [];
        const validFixedVehicles = fixedVehicles.filter(v => validSvcIds.includes(v.svc_id));
        const allDates = Array.from(new Set([...Object.keys(grouped), ...fetchedRoutes.filter(r => validSvcIds.includes(r.svc_id) || r.svc_id === 'XPT').map(r => r.date)])).sort((a,b) => b.localeCompare(a));
        
        allDates.forEach(date => {
            if (date >= startDate && date <= endDate) {
                validFixedVehicles.forEach(v => {
                    const plate = v.plate;
                    const svc = v.svc_id;
                    const didRun = routesByDateAndPlate[`${date}|${plate}`] || false;
                    const cacheEntry = reportCache[`${date}|${plate}`];
                    let reason = cacheEntry ? cacheEntry.reason : '';
                    const reportId = cacheEntry ? cacheEntry.reportId : null;
                    const fullJustifications = cacheEntry ? cacheEntry.fullJustifications : null;
                    
                    if (didRun && !reason) {
                        reason = 'RODOU (Identificado via Rota)';
                    } else if (didRun && !reason.includes('RODOU')) {
                        reason = `[RODOU] ${reason}`;
                    } else if (!didRun && !reason) {
                        reason = 'Sem justificativa preenchida';
                    }

                    detailedData.push({
                        date,
                        svc,
                        plate,
                        didRun,
                        reason,
                        reportId,
                        fullJustifications
                    });
                });
            }
        });

        setDetailedUtilizationData(detailedData);
        setLoading(false);
      }
    };

    loadUtilization();
  }, [startDate, endDate, activeTab, svcs, mercadoLivreSvcs, fixedVehicles]);

  useEffect(() => {
    const fetchDirData = async () => {
      if (activeTab === 'director') {
        setDirLoading(true);
        const fetchedReports = await getReportsByDateRange(dirStartDate, dirEndDate);
        const fetchedRoutes = await getDailyRoutesByDateRange(dirStartDate, dirEndDate);
        
        const mapVehicleToCategory = (rawType: string): string => {
            const t = rawType.toUpperCase().trim();
            if (['BULK - VUC EQUIPE ÚNICA POOL', 'UTILITÁRIOS', 'BULK - VAN EQUIPE ÚNICA POOL', 'VAN', 'VEÍCULO DE PASSEIO', 'VUC'].includes(t)) return t;
            return ''; 
        };

        const utilizationGroups: Record<string, Set<string>> = {}; 
        const utilizationCounts: Record<string, number> = {}; 
        fetchedRoutes.forEach(route => {
            const routeXpt = (route.xpt || '').trim().toUpperCase();
            const svc = routeXpt === 'ESP8' ? 'XPT' : (route.svc_id || '').trim();
            const mappedType = mapVehicleToCategory(route.vehicle_type);
            if (!svc || !mappedType) return;
            const key = `${route.date}|${svc}|${mappedType}`;
            if (!utilizationGroups[key]) utilizationGroups[key] = new Set();
            utilizationGroups[key].add(route.plate);
            utilizationCounts[key] = (utilizationCounts[key] || 0) + 1;
        });

        const combinedData: Record<string, { Date: string, Svc: string, Modals: Record<string, { Offer: number, Utilized: number, UtilizedRoutes: number }> }> = {};
        fetchedReports.forEach(report => {
            const combinedKey = `${report.date}|${report.svc_id}`;
            if (!combinedData[combinedKey]) combinedData[combinedKey] = { Date: report.date, Svc: report.svc_id, Modals: {} };
            INITIAL_CATEGORIES.forEach(cat => {
                const modalName = cat.name.toUpperCase();
                if (!combinedData[combinedKey].Modals[modalName]) combinedData[combinedKey].Modals[modalName] = { Offer: 0, Utilized: 0, UtilizedRoutes: 0 };
                combinedData[combinedKey].Modals[modalName].Offer += (report[`offer_${cat.id.replace(/-/g, '_')}`] || 0);
            });
        });

        // Use same export logic context ...
        
        Object.keys(utilizationGroups).forEach(key => {
            const [date, svc, vehicleType] = key.split('|');
            const combinedKey = `${date}|${svc}`;
            if (!combinedData[combinedKey]) combinedData[combinedKey] = { Date: date, Svc: svc, Modals: {} };
            if (!combinedData[combinedKey].Modals[vehicleType]) combinedData[combinedKey].Modals[vehicleType] = { Offer: 0, Utilized: 0, UtilizedRoutes: 0 };
            combinedData[combinedKey].Modals[vehicleType].Utilized += utilizationGroups[key].size;
            combinedData[combinedKey].Modals[vehicleType].UtilizedRoutes += utilizationCounts[key];
        });

        const finalDirData: any[] = [];
        Object.values(combinedData).forEach(entry => {
            Object.keys(entry.Modals).forEach(modalName => {
                const item = entry.Modals[modalName];
                if (item.Offer > 0 || item.Utilized > 0 || item.UtilizedRoutes > 0) {
                   finalDirData.push({
                      date: entry.Date,
                      svc: entry.Svc,
                      modal: modalName,
                      offer: item.Offer,
                      utilized: item.Utilized,
                      utilizedRoutes: item.UtilizedRoutes
                   });
                }
            });
        });

        setDirData(finalDirData);
        setDirLoading(false);
      }
    };
    fetchDirData();
  }, [dirStartDate, dirEndDate, activeTab]);

  useEffect(() => {
    const loadSummary = async () => {
      if (activeTab === 'summary' && svcs.length > 0) {
        setSummaryLoading(true);
        const fetchedReports = await getReportsByDate(selectedDate);
        const fetchedRoutes = await getDailyRoutesByDate(selectedDate);
        
        const validSvcIds = svcs
          .filter(svc => mercadoLivreSvcs.includes(svc.id) && svc.name !== 'FIRST MILE')
          .map(svc => svc.id);

        const validFixedPlates = fixedVehicles
          .filter(v => validSvcIds.includes(v.svc_id))
          .map(v => v.plate);

        const summaryMap: Record<string, any> = {};

        validSvcIds.forEach(svc => {
           summaryMap[svc] = {
             svc,
             offerSpot: 0,
             ranSpot: 0,
             fixedTotal: fixedVehicles.filter(v => v.svc_id === svc).length,
             fixedRan: 0,
             fixedIdle: 0
           };
        });

        fetchedReports.forEach(rep => {
           if (validSvcIds.includes(rep.svc_id)) {
               INITIAL_CATEGORIES.forEach(cat => {
                   const key = `offer_${cat.id.replace(/-/g, '_')}`;
                   summaryMap[rep.svc_id].offerSpot += (rep[key] || 0);
               });
           }
        });

        const routesBySvcAndPlate: Record<string, Set<string>> = {};
        fetchedRoutes.forEach(r => {
            const svc = r.xpt?.toUpperCase() === 'ESP8' ? 'XPT' : (r.svc_id || '');
            if (!routesBySvcAndPlate[svc]) routesBySvcAndPlate[svc] = new Set();
            routesBySvcAndPlate[svc].add(r.plate);
        });

        validSvcIds.forEach(svc => {
           const platesInSvc = routesBySvcAndPlate[svc] || new Set();
           let fixedRanCount = 0;
           let spotRanCount = 0;
           
           const fixedPlatesForThisSvc = fixedVehicles.filter(v => v.svc_id === svc).map(v => v.plate);

           platesInSvc.forEach(plate => {
               if (fixedPlatesForThisSvc.includes(plate)) {
                   fixedRanCount++;
               } else {
                   spotRanCount++;
               }
           });

           summaryMap[svc].fixedRan = fixedRanCount;
           summaryMap[svc].fixedIdle = summaryMap[svc].fixedTotal - fixedRanCount;
           summaryMap[svc].ranSpot = spotRanCount;
        });

        const arr = Object.values(summaryMap).sort((a,b) => a.svc.localeCompare(b.svc));
        setSummaryData(arr);
        setSummaryLoading(false);
      }
    };
    loadSummary();
  }, [selectedDate, activeTab, svcs, mercadoLivreSvcs, fixedVehicles]);

  const handleExportCSV = () => {
    if (reports.length === 0) return;
    const rows = [["Data", "SVC", "Placa", "Motivo"]];
    reports.forEach(report => {
      const svc = report.svc_id;
      const rDate = selectedDate.split('-').reverse().join('/');
      if (report.justifications) {
        const justs = report.justifications.split('; ');
        justs.forEach((just: string) => {
          const match = just.match(/"?([A-Za-z0-9]+)"?\s*-\s*(.*)/);
          if (match) {
            rows.push([rDate, svc, match[1], match[2]]);
          } else {
            rows.push([rDate, svc, "N/A", just]);
          }
        });
      }
    });
    const csvContent = rows.map(r => r.join(";")).join("\n");
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
    const rows = [["Data", "SVC", "Modal", "Oferta", "Capacidade"]];
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

  const handleExportRangeAction = async (type: 'fleet' | 'offer') => {
    setExportLoading(true);
    const fetchedReports = await getReportsByDateRange(exportStartDate, exportEndDate);
    if (!fetchedReports || fetchedReports.length === 0) {
      alert("Nenhum dado encontrado.");
      setExportLoading(false);
      return;
    }
    const rows = type === 'fleet' ? [["Data", "SVC", "Placa", "Motivo"]] : [["Data", "SVC", "Modal", "Oferta", "Capacidade"]];
    fetchedReports.forEach(report => {
      const svc = report.svc_id;
      const rDate = report.date.split('-').reverse().join('/');
      if (type === 'fleet') {
        if (report.justifications) {
          report.justifications.split('; ').forEach((just: string) => {
            const match = just.match(/"?([A-Za-z0-9]+)"?\s*-\s*(.*)/);
            rows.push([rDate, svc, match ? match[1] : "N/A", match ? match[2] : just]);
          });
        }
      } else {
        INITIAL_CATEGORIES.forEach(cat => {
           const key = cat.id.replace(/-/g, '_');
           const offer = report[`offer_${key}`];
           const capacity = report[`capacity_${key}`];
           if (offer != null || capacity != null) rows.push([rDate, svc, cat.name, (offer || 0).toString(), (capacity || 0).toString()]);
        });
      }
    });
    const csvContent = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Export_${type}_${exportStartDate}_a_${exportEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportLoading(false);
  };

  const handleExportOfferVsUtilization = async (consolidated = false) => {
    setExportLoading(true);
    const fetchedReports = await getReportsByDateRange(exportStartDate, exportEndDate);
    const fetchedRoutes = await getDailyRoutesByDateRange(exportStartDate, exportEndDate);
    
    const mapVehicleToCategory = (rawType: string): string => {
        const t = rawType.toUpperCase().trim();
        if (['BULK - VUC EQUIPE ÚNICA POOL', 'UTILITÁRIOS', 'BULK - VAN EQUIPE ÚNICA POOL', 'VAN', 'VEÍCULO DE PASSEIO', 'VUC'].includes(t)) return t;
        return ''; 
    };

    const utilizationGroups: Record<string, Set<string>> = {}; 
    const utilizationCounts: Record<string, number> = {}; 
    fetchedRoutes.forEach(route => {
        const routeXpt = (route.xpt || '').trim().toUpperCase();
        const svc = routeXpt === 'ESP8' ? 'XPT' : (route.svc_id || '').trim();
        const mappedType = mapVehicleToCategory(route.vehicle_type);
        if (!svc || !mappedType) return;
        const key = consolidated ? `${route.date}|${svc}|${mappedType}` : `${route.date}|${svc}|${mappedType}`;
        if (!utilizationGroups[key]) utilizationGroups[key] = new Set();
        utilizationGroups[key].add(route.plate);
        utilizationCounts[key] = (utilizationCounts[key] || 0) + 1;
    });

    const combinedData: Record<string, { Date: string, Svc: string, Modals: Record<string, { Offer: number, Utilized: number, UtilizedRoutes: number }> }> = {};
    fetchedReports.forEach(report => {
        const combinedKey = `${report.date}|${report.svc_id}`;
        if (!combinedData[combinedKey]) combinedData[combinedKey] = { Date: report.date, Svc: report.svc_id, Modals: {} };
        INITIAL_CATEGORIES.forEach(cat => {
            const modalName = cat.name.toUpperCase();
            if (!combinedData[combinedKey].Modals[modalName]) combinedData[combinedKey].Modals[modalName] = { Offer: 0, Utilized: 0, UtilizedRoutes: 0 };
            combinedData[combinedKey].Modals[modalName].Offer += (report[`offer_${cat.id.replace(/-/g, '_')}`] || 0);
        });
    });

    Object.keys(utilizationGroups).forEach(key => {
        const [date, svc, vehicleType] = key.split('|');
        const combinedKey = `${date}|${svc}`;
        if (!combinedData[combinedKey]) combinedData[combinedKey] = { Date: date, Svc: svc, Modals: {} };
        if (!combinedData[combinedKey].Modals[vehicleType]) combinedData[combinedKey].Modals[vehicleType] = { Offer: 0, Utilized: 0, UtilizedRoutes: 0 };
        combinedData[combinedKey].Modals[vehicleType].Utilized += utilizationGroups[key].size;
        combinedData[combinedKey].Modals[vehicleType].UtilizedRoutes += utilizationCounts[key];
    });

    const rows = [["Data", "SVC", "Modal", "Oferta", "Utilizado (Placas Únicas)", "Rotas Totais (Ida/Volta)"]];
    Object.values(combinedData).forEach(entry => {
        Object.keys(entry.Modals).forEach(modalName => {
            const item = entry.Modals[modalName];
            if (item.Offer > 0 || item.Utilized > 0 || item.UtilizedRoutes > 0) rows.push([entry.Date.split('-').reverse().join('/'), entry.Svc, modalName, item.Offer.toString(), item.Utilized.toString(), item.UtilizedRoutes.toString()]);
        });
    });

    const csvContent = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Oferta_vs_Utilizado_${exportStartDate}_a_${exportEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportLoading(false);
  };

  const handleExportOfferVsUtilizationConsolidado = async () => {
    setExportLoading(true);
    const fetchedReports = await getReportsByDateRange(exportStartDate, exportEndDate);
    const fetchedRoutes = await getDailyRoutesByDateRange(exportStartDate, exportEndDate);
    
    const consolidated: Record<string, { Offer: number, Utilized: number }> = {};
    
    fetchedReports.forEach(r => {
        const key = `${r.date}|${r.svc_id}`;
        if (!consolidated[key]) consolidated[key] = { Offer: 0, Utilized: 0 };
        INITIAL_CATEGORIES.forEach(cat => consolidated[key].Offer += (r[`offer_${cat.id.replace(/-/g, '_')}`] || 0));
    });
    
    const mapVehicleToCategory = (rawType: string): string => {
        const t = rawType.toUpperCase().trim();
        if (['BULK - VUC EQUIPE ÚNICA POOL', 'UTILITÁRIOS', 'BULK - VAN EQUIPE ÚNICA POOL', 'VAN', 'VEÍCULO DE PASSEIO', 'VUC'].includes(t)) return t;
        return ''; 
    };

    const routeCounts: Record<string, Set<string>> = {};
    const routeTotals: Record<string, number> = {};
    fetchedRoutes.forEach(r => {
        const routeXpt = (r.xpt || '').trim().toUpperCase();
        const svc = routeXpt === 'ESP8' ? 'XPT' : (r.svc_id || '').trim();
        const mappedType = mapVehicleToCategory(r.vehicle_type);
        if (!svc || !mappedType) return;
        const key = `${r.date}|${svc}`;
        if (!routeCounts[key]) routeCounts[key] = new Set();
        routeCounts[key].add(r.plate);
        routeTotals[key] = (routeTotals[key] || 0) + 1;
    });
    
    const rows = [["Data", "SVC", "Oferta Total", "Utilizado Total (Placas Únicas)", "Rotas Totais (Ida/Volta)"]];
    
    Object.keys(routeCounts).forEach(key => {
        if (!consolidated[key]) consolidated[key] = { Offer: 0, Utilized: 0 };
    });
    Object.keys(consolidated).forEach(key => {
        const [date, svc] = key.split('|');
        rows.push([date.split('-').reverse().join('/'), svc, consolidated[key].Offer.toString(), (routeCounts[key]?.size || 0).toString(), (routeTotals[key] || 0).toString()]);
    });
    
    const csvContent = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Consolidado_SVC_${exportStartDate}_a_${exportEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        if (results.meta.fields) {
          setCsvHeaders(results.meta.fields);
          const routeMatch = results.meta.fields.find(f => f.toLowerCase().includes('route_id') || f.toLowerCase().includes('route'));
          if (routeMatch) setSelectedPlateCol(routeMatch);
        }
      }
    });
  };

  const handleImportRoutes = async () => {
    if (!csvFile || !selectedPlateCol) return;
    setImportLoading(true);
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const payloadToInsert: any[] = [];
        results.data.forEach((row: any) => {
          const rawRouteId = row[selectedPlateCol];
          const rawPlate = row['Placa'] || row['Plate'] || row['placa'];
          const rawDate = row['Data'] || row['Data '] || row['Date'] || '';
          
          let formattedDate = '';
          if (rawDate && rawDate.includes('/')) {
             const parts = rawDate.split('/');
             if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (rawDate && rawDate.includes('-')) {
             formattedDate = rawDate; // Ja no formato YYYY-MM-DD
          }

          if (rawRouteId && rawPlate && formattedDate) {
            payloadToInsert.push({
                 route_id: String(rawRouteId).trim(),
                 date: formattedDate,
                 plate: String(rawPlate).replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
                 svc_id: String(row['SVC'] || '').trim(),
                 vehicle_type: String(row['Veículo'] || row['Modal'] || '').trim(),
                 xpt: String(row['XPT'] || '').trim()
            });
          }
        });
        if (payloadToInsert.length > 0) {
          await saveDailyRoutes(payloadToInsert);
          setImportSuccess(true);
        }
        setImportLoading(false);
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
    if (passwordInput === '@TransmanaADM22') {
      setIsAuthenticated(true);
    } else {
      setPasswordError(true);
    }
  };

  const missingSvcs = svcs.filter(svc => 
    mercadoLivreSvcs.includes(svc.id) && 
    svc.name !== 'FIRST MILE' &&
    !reports.some(r => r.svc_id === svc.id)
  );

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-8 rounded-3xl shadow-xl border border-slate-200 text-center">
          <h2 className="text-2xl font-black mb-6">Acesso Restrito</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border rounded-xl text-center" placeholder="Senha" />
            {passwordError && <p className="text-red-500 text-xs">Senha incorreta.</p>}
            <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">Acessar</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 space-y-6 font-sans">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-extrabold text-primary">Painel Master</h2>
        <button onClick={onBack} className="p-2 bg-slate-100 rounded-full"><span className="material-symbols-outlined">close</span></button>
      </div>

      <div className="flex justify-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200/60 dark:border-slate-800/80 overflow-x-auto">
        {[
           { id: 'daily', label: 'Diário' },
           { id: 'utilization', label: 'Utilização' },
           { id: 'audit', label: 'Subir Rotas' },
           { id: 'export', label: 'Exportar' },
           { id: 'director', label: 'Ofertas SPOT' },
           { id: 'summary', label: 'Resumo Diário' }
        ].map((tab) => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-6 py-3 font-bold text-sm tracking-wide rounded-xl transition-all duration-300 whitespace-nowrap 
              ${activeTab === tab.id ? 'bg-primary text-white shadow-md scale-[1.02]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'}`}
          >
            {tab.label.toUpperCase()}
          </button>
        ))}
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
      {activeTab === 'summary' && (
        <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl p-6 shadow-md border border-slate-200 dark:border-slate-800 space-y-6 animate-fade-in w-full overflow-x-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
             <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={selectedDate}
                  max={getLocalDateString()}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-xl border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm"
                />
                <div>
                   <h2 className="text-xl font-bold text-slate-800 dark:text-white">Resumo Executivo Diário</h2>
                   <p className="text-xs text-slate-500">Métricas consolidadas por SVC (Fixa vs Spot)</p>
                </div>
             </div>
             <button 
                onClick={async () => {
                   const el = document.getElementById('export-summary-container');
                   if (!el) return;
                   
                   const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#f8fafc' });
                   const imgData = canvas.toDataURL('image/png');
                   const link = document.createElement('a');
                   link.href = imgData;
                   link.download = `Resumo_Consolidado_${selectedDate}.png`;
                   link.click();
                }}
                disabled={summaryLoading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
             >
                <span className="material-symbols-outlined">image</span>
                Salvar como Imagem
             </button>
          </div>

          {summaryLoading ? (
             <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-slate-300 border-t-indigo-600 rounded-full animate-spin"></div></div>
          ) : (
            <div id="export-summary-container" className="bg-slate-50 p-8 rounded-2xl border border-slate-200 min-w-[800px] shadow-sm">
              <div className="text-center mb-8 border-b border-slate-200 pb-6">
                 <h2 className="text-2xl font-black text-slate-800 uppercase tracking-widest">Resumo Operacional</h2>
                 <p className="text-sm font-bold text-slate-500 mt-1">Data de Referência: {selectedDate.split('-').reverse().join('/')}</p>
                 <div className="flex justify-center flex-wrap gap-6 mt-6">
                    <div className="px-6 py-3 bg-blue-100 text-blue-800 rounded-xl border border-blue-200 shadow-sm">
                       <span className="text-xs font-bold block uppercase tracking-wider mb-1">Total Ofertas (SPOT)</span>
                       <span className="text-3xl font-black">{summaryData.reduce((acc, c) => acc + c.offerSpot, 0)}</span>
                    </div>
                    <div className="px-6 py-3 bg-emerald-100 text-emerald-800 rounded-xl border border-emerald-200 shadow-sm">
                       <span className="text-xs font-bold block uppercase tracking-wider mb-1">Total Rodou (SPOT)</span>
                       <span className="text-3xl font-black">{summaryData.reduce((acc, c) => acc + c.ranSpot, 0)}</span>
                    </div>
                    <div className="px-6 py-3 bg-indigo-100 text-indigo-800 rounded-xl border border-indigo-200 shadow-sm">
                       <span className="text-xs font-bold block uppercase tracking-wider mb-1">Frota Fixa Cadastrada</span>
                       <span className="text-3xl font-black">{summaryData.reduce((acc, c) => acc + c.fixedTotal, 0)}</span>
                    </div>
                 </div>
              </div>
              
              <table className="w-full text-center text-sm whitespace-nowrap bg-white rounded-xl overflow-hidden shadow-sm border border-slate-300">
                 <thead className="bg-slate-800 text-slate-100 uppercase text-xs font-bold tracking-wider">
                    <tr>
                       <th className="px-5 py-4 text-center">SVC</th>
                       <th className="px-5 py-4 text-center border-l border-slate-700 bg-slate-700/50" colSpan={3}>Ofertas (SPOT)</th>
                       <th className="px-5 py-4 text-center border-l-4 border-slate-400 bg-indigo-900/40" colSpan={4}>Frota Fixa (APP)</th>
                    </tr>
                    <tr className="bg-slate-700">
                       <th className="px-5 py-3 text-center font-medium">Nome</th>
                       
                       <th className="px-5 py-3 text-center border-l border-slate-600">Ofertados</th>
                       <th className="px-5 py-3 text-center border-l border-slate-600 text-emerald-300"><span className="flex items-center justify-center gap-1.5"><span className="material-symbols-outlined text-[16px]">check_circle</span> Rodaram</span></th>
                       <th className="px-5 py-3 text-center border-l border-slate-600 text-amber-300">Aproveitamento</th>
                       
                       <th className="px-5 py-3 text-center border-l-4 border-slate-400 bg-slate-800/80 text-indigo-200">Total Fixo</th>
                       <th className="px-5 py-3 text-center border-l border-slate-600 text-emerald-300 bg-slate-800/80"><span className="flex items-center justify-center gap-1.5"><span className="material-symbols-outlined text-[16px]">check_circle</span> Rodaram</span></th>
                       <th className="px-5 py-3 text-center border-l border-slate-600 text-rose-300 bg-slate-800/80">Parados</th>
                       <th className="px-5 py-3 text-center border-l border-slate-600 text-amber-300 bg-slate-800/80">Utilização</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-200">
                    {summaryData.map((row, i) => {
                       const spotDiff = row.offerSpot - row.ranSpot;
                       const spotAprov = row.offerSpot > 0 ? ((row.ranSpot / row.offerSpot) * 100).toFixed(1) : '0.0';
                       const fixaUtil = row.fixedTotal > 0 ? ((row.fixedRan / row.fixedTotal) * 100).toFixed(1) : '0.0';
                       
                       return (
                       <tr key={row.svc} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/70 hover:bg-slate-50'}>
                          <td className="px-5 py-3.5 text-center font-bold text-slate-800">{row.svc}</td>
                          
                          <td className="px-5 py-3.5 text-center font-bold text-slate-600 border-l border-slate-100/50 bg-slate-50">{row.offerSpot}</td>
                          <td className="px-5 py-3.5 text-center font-black text-emerald-600 border-l border-slate-100/50 bg-emerald-50/20">
                             {row.ranSpot} 
                             {spotDiff > 0 && <span className="text-[11px] text-rose-500 font-bold ml-1.5 align-text-top">(-{spotDiff})</span>}
                             {spotDiff < 0 && <span className="text-[11px] text-blue-500 font-bold ml-1.5 align-text-top">(+{Math.abs(spotDiff)})</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center font-bold text-amber-600 border-l border-slate-100/50 bg-amber-50/20">{spotAprov}%</td>
                          
                          <td className="px-5 py-3.5 text-center font-medium border-l-4 border-slate-300 bg-indigo-50/10">{row.fixedTotal}</td>
                          <td className="px-5 py-3.5 text-center font-black text-emerald-600 border-l border-slate-100 bg-emerald-50/30">{row.fixedRan}</td>
                          <td className="px-5 py-3.5 text-center font-black text-rose-500 border-l border-slate-100 bg-rose-50/30">{row.fixedIdle}</td>
                          <td className="px-5 py-3.5 text-center font-bold text-amber-600 border-l border-slate-100 bg-amber-50/30">{fixaUtil}%</td>
                       </tr>
                    )})}
                 </tbody>
                 <tfoot className="bg-slate-800 text-white shadow-inner">
                    {(() => {
                       const totalOfferSpot = summaryData.reduce((acc, c) => acc + c.offerSpot, 0);
                       const totalRanSpot = summaryData.reduce((acc, c) => acc + c.ranSpot, 0);
                       const totalSpotDiff = totalOfferSpot - totalRanSpot;
                       const totalSpotAprov = totalOfferSpot > 0 ? ((totalRanSpot / totalOfferSpot) * 100).toFixed(1) : '0.0';
                       
                       const totalFixed = summaryData.reduce((acc, c) => acc + c.fixedTotal, 0);
                       const totalFixedRan = summaryData.reduce((acc, c) => acc + c.fixedRan, 0);
                       const totalFixedIdle = summaryData.reduce((acc, c) => acc + c.fixedIdle, 0);
                       const totalFixaUtil = totalFixed > 0 ? ((totalFixedRan / totalFixed) * 100).toFixed(1) : '0.0';
                       
                       return (
                          <tr>
                             <td className="px-5 py-4 text-center font-black uppercase tracking-wider text-slate-300">TOTAL GERAL</td>
                             
                             <td className="px-5 py-4 text-center font-black border-l border-slate-700/50 bg-slate-700/30">{totalOfferSpot}</td>
                             <td className="px-5 py-4 text-center font-black text-emerald-400 border-l border-slate-700/50 bg-slate-700/30">
                                {totalRanSpot}
                                {totalSpotDiff > 0 && <span className="text-[11px] text-rose-400 font-bold ml-1.5 align-text-top">(-{totalSpotDiff})</span>}
                                {totalSpotDiff < 0 && <span className="text-[11px] text-blue-400 font-bold ml-1.5 align-text-top">(+{Math.abs(totalSpotDiff)})</span>}
                             </td>
                             <td className="px-5 py-4 text-center font-black text-amber-400 border-l border-slate-700/50 bg-slate-700/30">{totalSpotAprov}%</td>

                             <td className="px-5 py-4 text-center font-black border-l-4 border-slate-600 bg-slate-700/50">{totalFixed}</td>
                             <td className="px-5 py-4 text-center font-black text-emerald-400 border-l border-slate-700/50 bg-slate-700/50">{totalFixedRan}</td>
                             <td className="px-5 py-4 text-center font-black text-rose-400 border-l border-slate-700/50 bg-slate-700/50">{totalFixedIdle}</td>
                             <td className="px-5 py-4 text-center font-black text-amber-400 border-l border-slate-700/50 bg-slate-700/50">{totalFixaUtil}%</td>
                          </tr>
                       );
                    })()}
                 </tfoot>
              </table>
              <div className="mt-6 flex items-center gap-2 justify-end opacity-40 text-slate-700">
                 <span className="material-symbols-outlined text-[14px]">info</span>
                 <span className="text-[11px] font-bold uppercase tracking-widest leading-none">Exportação Gerada - Logística ML</span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'utilization' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-6 md:p-10 animate-fade-in w-full overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="material-symbols-outlined text-white">dashboard</span>
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">Dashboard FROTA FIXA</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Visualização executiva da operação, utilização e paradas da frota</p>
            </div>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/50 rounded-2xl p-6 mb-8 w-full sticky top-0 z-10 shadow-sm backdrop-blur-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Data Inicial</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Data Final</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all" />
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 border-t border-slate-200/50 dark:border-slate-700/50 pt-5 mt-5">
              <button 
                onClick={() => setUtilActiveTab('overview')} 
                className={`px-5 py-2.5 text-sm font-bold tracking-wide rounded-xl transition-all ${utilActiveTab === 'overview' ? 'bg-indigo-600 text-white shadow-md scale-[1.02]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                Resumo Consolidado
              </button>
              <button 
                onClick={() => setUtilActiveTab('details')} 
                className={`px-5 py-2.5 text-sm font-bold tracking-wide rounded-xl transition-all ${utilActiveTab === 'details' ? 'bg-indigo-600 text-white shadow-md scale-[1.02]' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                Visão Placa a Placa
              </button>
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
                 Rotas importadas e salvas com sucesso no banco de dados lendo a coluna Data do CSV!
               </div>
            )}

            <div className="w-full">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Arquivo CSV de Rotas (com coluna "Data" no formato DD/MM/AAAA)</label>
              <input type="file" accept=".csv" onChange={handleFileUpload} onClick={() => setImportSuccess(false)} className="w-full text-sm text-slate-500 file:mr-4 file:py-3.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 focus:outline-none" />
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

      {activeTab === 'export' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-200/60 dark:border-slate-800/80 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">download</span>
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">Exportar Dados (Período)</h3>
              <p className="text-xs text-slate-500">Exporte históricos de frota, oferta e capacidade em CSV aplicando filtros de data.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Data Inicial</label>
              <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 text-sm focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Data Final</label>
              <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} max={getLocalDateString()} className="w-full rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-3.5 text-sm focus:ring-primary/20 focus:border-primary font-medium text-slate-700 dark:text-slate-200" />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mt-6">
             <button onClick={() => handleExportRangeAction('fleet')} disabled={exportLoading} className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-md disabled:opacity-50">
               {exportLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-outlined text-[18px]">list_alt</span>}
               Exportar Frota
             </button>
             <button onClick={() => handleExportRangeAction('offer')} disabled={exportLoading} className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-lg shadow-primary/30 disabled:opacity-50">
               {exportLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-outlined text-[18px]">local_shipping</span>}
               Exportar Oferta/Cap.
             </button>
          </div>
          <div className="flex flex-col md:flex-row gap-4">
             <button onClick={handleExportOfferVsUtilization} disabled={exportLoading} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50">
               {exportLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-outlined text-[18px]">list_alt</span>}
               Cruzamento Específico (SVC e Modal)
             </button>
             <button onClick={handleExportOfferVsUtilizationConsolidado} disabled={exportLoading} className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50">
               {exportLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-outlined text-[18px]">functions</span>}
               Cruzamento Consolidado (Total por SVC)
             </button>
          </div>
        </div>
      )}

      {activeTab === 'director' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-6 md:p-10 animate-fade-in w-full overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <span className="material-symbols-outlined text-white">monitoring</span>
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">Dashboard SPOT</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Visualização executiva de Oferta vs Utilizado do modal de terceiros</p>
            </div>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/50 rounded-2xl p-6 mb-8 w-full sticky top-0 z-10 shadow-sm backdrop-blur-md">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Data Inicial</label>
                  <input type="date" value={dirStartDate} max={dirEndDate} onChange={e => setDirStartDate(e.target.value)} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Data Final</label>
                  <input type="date" value={dirEndDate} min={dirStartDate} max={getLocalDateString()} onChange={e => setDirEndDate(e.target.value)} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-700 dark:text-slate-200 shadow-sm transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Filtro SVC</label>
                  <div className="relative">
                    <select value={dirSvcFilter} onChange={e => setDirSvcFilter(e.target.value)} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-700 dark:text-slate-200 appearance-none shadow-sm transition-all">
                      <option value="">Todos os SVCs</option>
                      {/* Extract unique SVCs from the data itself dynamically! */}
                      {Array.from(new Set(dirData.map(d => d.svc))).sort().map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_content</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">Filtro Modal</label>
                  <div className="relative">
                    <select value={dirModalFilter} onChange={e => setDirModalFilter(e.target.value)} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-sm focus:ring-amber-500/20 focus:border-amber-500 font-medium text-slate-700 dark:text-slate-200 appearance-none shadow-sm transition-all">
                      <option value="">Todos os Modais</option>
                      {INITIAL_CATEGORIES.map(s => (
                        <option key={s.id} value={s.name.toUpperCase()}>{s.name.toUpperCase()}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">minor_crash</span>
                  </div>
                </div>
                
                <div className="md:col-span-4 mt-2 flex items-center justify-end">
                  <label className="flex items-center gap-2 cursor-pointer bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 px-4 py-2 rounded-xl transition-all hover:bg-amber-100 dark:hover:bg-amber-900/20">
                    <input type="checkbox" checked={dirConsolidateModals} onChange={e => setDirConsolidateModals(e.target.checked)} className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4" />
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Consolidar tabela somando todos os Modais por Polo/SVC</span>
                  </label>
                </div>
             </div>
          </div>

          {dirLoading ? (
             <div className="flex flex-col items-center justify-center p-16 w-full">
               <div className="w-12 h-12 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
               <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium animate-pulse">Cruzando bases de dados...</p>
             </div>
          ) : (
            <>
              {(() => {
                const filteredDirData = dirData.filter(d => 
                   (!dirSvcFilter || d.svc === dirSvcFilter) &&
                   (!dirModalFilter || d.modal === dirModalFilter)
                );
                const dirTotalOffer = filteredDirData.reduce((sum, item) => sum + item.offer, 0);
                const dirTotalUtilized = filteredDirData.reduce((sum, item) => sum + item.utilized, 0);
                const dirTotalUtilizedRoutes = filteredDirData.reduce((sum, item) => sum + item.utilizedRoutes, 0);
                const dirPercentage = dirTotalOffer > 0 ? ((dirTotalUtilized / dirTotalOffer) * 100).toFixed(1) : '0.0';
                
                const gapColor = dirTotalUtilized >= dirTotalOffer ? 'text-emerald-500' : 'text-rose-500';

                let displayData = filteredDirData;
                if (dirConsolidateModals) {
                   const grouped: Record<string, any> = {};
                   filteredDirData.forEach(item => {
                      const key = `${item.date}|${item.svc}`;
                      if (!grouped[key]) grouped[key] = { date: item.date, svc: item.svc, modal: 'CONSOLIDADO', offer: 0, utilized: 0, utilizedRoutes: 0 };
                      grouped[key].offer += item.offer;
                      grouped[key].utilized += item.utilized;
                      grouped[key].utilizedRoutes += item.utilizedRoutes;
                   });
                   displayData = Object.values(grouped);
                }

                return (
                  <div>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 w-full">
                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">inventory_2</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">OFERTA TOTAL</h3>
                          </div>
                          <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{dirTotalOffer.toLocaleString('pt-BR')}</p>
                          <p className="text-xs text-slate-400 mt-2 font-medium">Capacidade Garantida (SPOT)</p>
                       </div>
                       
                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">route</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">UTILIZADOS (PLACAS)</h3>
                          </div>
                          <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{dirTotalUtilized.toLocaleString('pt-BR')}</p>
                          <p className={`text-xs mt-2 font-bold ${gapColor}`}>Defasagem de {Math.abs(dirTotalUtilized - dirTotalOffer)} carro(s)</p>
                       </div>
                       
                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">multiple_stop</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">ROTAS TOTAIS</h3>
                          </div>
                          <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{dirTotalUtilizedRoutes.toLocaleString('pt-BR')}</p>
                          <p className="text-xs mt-2 font-bold text-slate-400 dark:text-slate-500">Viagens realizadas (Ida/Volta)</p>
                       </div>

                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">bolt</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">APROVEITAMENTO</h3>
                          </div>
                          <div className="flex items-baseline gap-1">
                             <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{dirPercentage}</p>
                             <p className="text-2xl font-bold text-slate-400">%</p>
                          </div>
                          {/* Progress bar visual */}
                          <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full mt-3 overflow-hidden">
                             <div className={`h-full ${dirTotalUtilized >= dirTotalOffer ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Number(dirPercentage))}%` }}></div>
                          </div>
                       </div>
                    </div>
                    
                    {/* Detail Table */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm w-full">
                       <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                         <h3 className="font-bold text-slate-700 dark:text-slate-300">Detalhamento dos Filtros</h3>
                         <span className="text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-full text-slate-500">{displayData.length} registros</span>
                       </div>
                       <div className="overflow-x-auto w-full">
                         <table className="w-full text-sm text-left">
                           <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider">
                             <tr>
                               <th className="px-6 py-4">Data</th>
                               <th className="px-6 py-4">Polo/SVC</th>
                               <th className="px-6 py-4">Modal</th>
                               <th className="px-6 py-4 text-center">Oferta</th>
                               <th className="px-6 py-4 text-center">Utilizado (Placas)</th>
                               <th className="px-6 py-4 text-center">Rotas Totais</th>
                               <th className="px-6 py-4 text-center">Performance/Aprov.</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                             {displayData.length === 0 ? (
                               <tr>
                                 <td colSpan={7} className="px-6 py-8 text-center text-slate-400 font-medium">Nenhum cruzamento encontrado para os filtros aplicados.</td>
                               </tr>
                             ) : (
                               displayData.sort((a,b) => b.date.localeCompare(a.date)).map((item, idx) => {
                                 const itemPerc = item.offer > 0 ? ((item.utilized / item.offer) * 100).toFixed(0) : 0;
                                 return (
                                   <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                                     <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-600 dark:text-slate-300 text-xs">{item.date.split('-').reverse().join('/')}</td>
                                     <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">{item.svc}</td>
                                     <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-md m-2 inline-block px-2 py-1 border border-slate-100 dark:border-slate-700 mt-2.5">{item.modal}</td>
                                     <td className="px-6 py-4 text-center bg-blue-50/30 dark:bg-blue-500/5">
                                        {editingOfferKey === `${item.date}|${item.svc}|${item.modal}` ? (
                                           <div className="flex items-center justify-center gap-1">
                                             <input 
                                               type="number" 
                                               min="0"
                                               value={editingOfferValue}
                                               onChange={(e) => setEditingOfferValue(e.target.value === '' ? '' : Number(e.target.value))}
                                               className="w-16 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-xs p-1 text-center font-bold focus:ring-2 focus:ring-blue-500"
                                               autoFocus
                                               disabled={isSavingOffer}
                                               onKeyDown={(e) => {
                                                  if(e.key === 'Enter') handleSaveOffer(item.date, item.svc, item.modal);
                                                  if(e.key === 'Escape') setEditingOfferKey(null);
                                               }}
                                             />
                                             <button disabled={isSavingOffer} onClick={() => handleSaveOffer(item.date, item.svc, item.modal)} className="text-emerald-500 hover:text-emerald-600 disabled:opacity-50 flex items-center justify-center p-1"><span className="material-symbols-outlined text-[16px]">check</span></button>
                                             <button disabled={isSavingOffer} onClick={() => setEditingOfferKey(null)} className="text-slate-400 hover:text-slate-600 disabled:opacity-50 flex items-center justify-center p-1"><span className="material-symbols-outlined text-[16px]">close</span></button>
                                           </div>
                                        ) : (
                                           <div className="flex items-center justify-center gap-2 group cursor-pointer" onClick={() => { if(!dirConsolidateModals) { setEditingOfferKey(`${item.date}|${item.svc}|${item.modal}`); setEditingOfferValue(item.offer); } }} title={dirConsolidateModals ? "Desative a consolidação para editar" : "Clique para editar"}>
                                              <span className="font-bold text-blue-600 dark:text-blue-400">{item.offer}</span>
                                              {!dirConsolidateModals && <span className="material-symbols-outlined text-[12px] text-blue-300 dark:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">edit</span>}
                                           </div>
                                        )}
                                     </td>
                                     <td className="px-6 py-4 text-center font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-500/5">{item.utilized}</td>
                                     <td className="px-6 py-4 text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-500/5">{item.utilizedRoutes}</td>
                                     <td className="px-6 py-4 text-center">
                                       <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${item.utilized >= item.offer ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'}`}>
                                         {itemPerc}%
                                       </span>
                                     </td>
                                   </tr>
                                 );
                               })
                             )}
                           </tbody>
                         </table>
                       </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}


      {loading && activeTab !== 'audit' && activeTab !== 'export' ? (
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
        <div className="space-y-6">
          {utilActiveTab === 'overview' && (
            <>
              {(() => {
                const sumTotalPlates = utilizationData.reduce((acc, row) => acc + row.totalPlates, 0);
                const sumAvailable = utilizationData.reduce((acc, row) => acc + row.available, 0);
                const sumRanAmount = utilizationData.reduce((acc, row) => acc + row.ranAmount, 0);
                
                const percReal = sumAvailable > 0 ? ((sumRanAmount / sumAvailable) * 100).toFixed(1) : '0.0';
                
                const gapColor = sumRanAmount >= sumAvailable ? 'text-emerald-500' : 'text-rose-500';

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 w-full">
                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:bg-blue-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">inventory_2</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">FROTA TOTAL</h3>
                          </div>
                          <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{sumTotalPlates.toLocaleString('pt-BR')}</p>
                          <p className="text-xs text-slate-400 mt-2 font-medium">Equivalente à Frota Total Fixa</p>
                       </div>
                       
                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:bg-indigo-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">task_alt</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">FROTA DISPONÍVEL</h3>
                          </div>
                          <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{sumAvailable.toLocaleString('pt-BR')}</p>
                          <p className="text-xs mt-2 font-bold text-blue-500">Excluindo carros em manutenção</p>
                       </div>
                       
                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">directions_car</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">UTILIZADOS (PLACAS)</h3>
                          </div>
                          <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{sumRanAmount.toLocaleString('pt-BR')}</p>
                          <p className={`text-xs mt-2 font-bold ${gapColor}`}>Defasagem de {Math.abs(sumAvailable - sumRanAmount)} carro(s) da capacidade</p>
                       </div>

                       <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md p-6 group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all"></div>
                          <div className="flex items-center gap-4 mb-4 relative">
                             <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                               <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">bolt</span>
                             </div>
                             <h3 className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide">APROVEITAMENTO</h3>
                          </div>
                          <div className="flex items-baseline gap-1">
                             <p className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white relative tracking-tight">{percReal}</p>
                             <p className="text-2xl font-bold text-slate-400">%</p>
                          </div>
                          <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full mt-3 overflow-hidden">
                             <div className={`h-full ${sumRanAmount >= sumAvailable ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Number(percReal))}%` }}></div>
                          </div>
                       </div>
                  </div>
                );
              })()}

              {/* Visão Matemática Pura (Líquida / Bruta) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)]">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-500">calculate</span>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Resumo Real (Matemática Pura - O que de fato operou)</h3>
                </div>
                <div className="overflow-x-auto pb-2">
                  <table className="w-full text-left text-xs md:text-sm text-slate-600 dark:text-slate-300 min-w-[800px] md:min-w-0">
                    <thead className="bg-white dark:bg-slate-900 text-[10px] md:text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700">Data</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center">Base Total</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-amber-600 dark:text-amber-500">Manutenção</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-blue-600 dark:text-blue-500">Disp. Líquido</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-emerald-600 dark:text-emerald-500">Rodaram (Reais)</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-right">% Bruta (Total)</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-right text-indigo-600 dark:text-indigo-400">% Líquida (Disp.)</th>
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
                            <td className="px-3 md:px-5 py-3 md:py-4 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                              {row.date.split('-').reverse().join('/')}
                            </td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center font-medium">{row.totalPlates}</td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center text-amber-600 dark:text-amber-500 bg-amber-50/30 dark:bg-amber-900/10 font-bold">{row.maintenance}</td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10 font-bold">{row.available}</td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10 font-bold">
                                {row.ranAmount}
                            </td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-right font-extrabold text-slate-800 dark:text-slate-100">
                              {row.utilizationPureTotalPerc.toFixed(1)}%
                            </td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-right font-extrabold text-indigo-700 dark:text-indigo-300">
                              {row.utilizationPurePerc.toFixed(1)}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Visão Calculada (Ajustada ML) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] mt-6">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">timeline</span>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Resumo Ajustado (Regra Mercado Livre x1.16)</h3>
                </div>
                <div className="overflow-x-auto pb-2">
                  <table className="w-full text-left text-xs md:text-sm text-slate-600 dark:text-slate-300 min-w-[700px] md:min-w-0">
                    <thead className="bg-white dark:bg-slate-900 text-[10px] md:text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700">Data</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center">Base Total</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-blue-600 dark:text-blue-500">Disp. Líquido</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-center text-emerald-600 dark:text-emerald-500">Rodaram (Ajustado)</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-right">% Bruta Ajustada</th>
                        <th className="px-3 md:px-5 py-3 md:py-4 border-b border-slate-200 dark:border-slate-700 text-right text-indigo-600 dark:text-indigo-400">% Líquida Ajustada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {utilizationData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-slate-400 italic">Nenhum dado encontrado no período.</td>
                        </tr>
                      ) : (
                        utilizationData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 md:px-5 py-3 md:py-4 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                              {row.date.split('-').reverse().join('/')}
                            </td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center font-medium">{row.totalPlates}</td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10 font-bold">{row.available}</td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-center text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10 font-bold" title={`${row.ranAmount} veículos reais`}>
                                {row.adjustedRan.toFixed(1)}
                            </td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-right font-extrabold text-slate-800 dark:text-slate-100">
                              {row.utilizationTotalPerc.toFixed(1)}%
                            </td>
                            <td className="px-3 md:px-5 py-3 md:py-4 text-right font-extrabold text-indigo-700 dark:text-indigo-300">
                              {row.utilizationPerc.toFixed(1)}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

          {/* Additional Analytics Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            
            {/* Top Reasons */}
            {justificationStats.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] p-5 col-span-1 md:col-span-2 lg:col-span-1">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">pie_chart</span>
                  Top Motivos de Parada
                </h3>
                <div className="space-y-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                  {justificationStats.map((stat, idx) => {
                     const maxCount = justificationStats[0].count;
                     const perc = (stat.count / maxCount) * 100;
                     return (
                       <div key={idx} className="flex items-center gap-4">
                         <span className="w-1/3 text-xs font-semibold text-slate-600 dark:text-slate-400 truncate" title={stat.reason}>{stat.reason}</span>
                         <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex items-center">
                           <div className="h-full bg-amber-500 dark:bg-amber-600 rounded-full transition-all duration-1000" style={{ width: `${perc}%` }}></div>
                         </div>
                         <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-8 text-right">{stat.count}</span>
                       </div>
                     )
                  })}
                </div>
              </div>
            )}
            
            {/* Top SVCs */}
            {topSvcStats.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] p-5">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500">storefront</span>
                  Top SVCs Ofensores
                </h3>
                <div className="space-y-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                  {topSvcStats.map((stat, idx) => {
                     const maxCount = topSvcStats[0].count;
                     const perc = (stat.count / maxCount) * 100;
                     return (
                       <div key={idx} className="flex items-center gap-4">
                         <span className="w-1/3 text-xs font-semibold text-slate-600 dark:text-slate-400 truncate" title={stat.svc}>{stat.svc}</span>
                         <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex items-center">
                           <div className="h-full bg-red-400 dark:bg-red-500 rounded-full transition-all duration-1000" style={{ width: `${perc}%` }}></div>
                         </div>
                         <span className="text-xs font-bold text-red-600 dark:text-red-400 w-8 text-right">{stat.count}</span>
                       </div>
                     )
                  })}
                </div>
              </div>
            )}
            
            {/* Top Plates */}
            {topPlateStats.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] p-5">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-500">directions_car</span>
                  Top Placas Paradas
                </h3>
                <div className="space-y-3.5 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                  {topPlateStats.map((stat, idx) => {
                     const maxCount = topPlateStats[0].count;
                     const perc = (stat.count / maxCount) * 100;
                     return (
                       <div key={idx} className="flex flex-col gap-1.5 border-b border-slate-100 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0">
                         <div className="flex justify-between items-center">
                           <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-center min-w-[80px]">{stat.plate}</span>
                           <span className="text-xs font-bold px-2 py-1 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex items-center justify-center gap-1 shadow-sm">
                              {stat.count} <span className="opacity-70 text-[10px]">dias</span>
                           </span>
                         </div>
                         <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-purple-400 dark:bg-purple-500 rounded-full" style={{ width: `${perc}%` }}></div>
                            </div>
                         </div>
                         <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate opacity-80" title={stat.reason}>
                            Motivo(s): {stat.reason}
                         </p>
                       </div>
                     )
                  })}
                </div>
              </div>
            )}
          </div>
          
          {/* Daily Evolution Chart */}
          {dailyIdleStats.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] p-5 mt-6">
              <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-500">timeline</span>
                Evolução Diária de Paradas (Frota Fixa)
              </h3>
              
              <div className="h-48 md:h-64 flex items-end gap-2 md:gap-4 overflow-x-auto pb-4 custom-scrollbar">
                {dailyIdleStats.map((stat, idx) => {
                   const maxVal = Math.max(...dailyIdleStats.map(s => s.idle)) || 1;
                   const percHeight = (stat.idle / maxVal) * 100;
                   const dateObj = new Date(stat.date);
                   dateObj.setDate(dateObj.getDate() + 1); // Adjust for timezone if needed
                   const dayStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
                   
                   return (
                     <div key={idx} className="flex flex-col items-center justify-end h-full gap-2 min-w-[32px] md:min-w-[48px] group">
                       <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                          {stat.idle}
                       </span>
                       <div 
                         className="w-full bg-gradient-to-t from-indigo-500 to-blue-400 dark:from-indigo-600 dark:to-blue-500 rounded-t-sm shadow-md transition-all duration-500 group-hover:brightness-110 group-hover:shadow-indigo-500/30"
                         style={{ height: `${Math.max(percHeight, 2)}%` }} // At least 2% to show the bar
                         title={`${stat.idle} paradas em ${dayStr}`}
                       ></div>
                       <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap rotate-[-45deg] origin-top-left translate-y-2 translate-x-1">
                         {dayStr}
                       </span>
                     </div>
                   );
                })}
              </div>
            </div>
          )}
            </>
          )}


          {/* DETALHAMENTO PLACA A PLACA */}
          {utilActiveTab === 'details' && detailedUtilizationData.length > 0 && (() => {
             const filteredDetails = detailedUtilizationData.filter(d => 
                (!detSvcFilter || d.svc === detSvcFilter) &&
                (!detPlateFilter || d.plate.toLowerCase().includes(detPlateFilter.toLowerCase())) &&
                (detStatusFilter === 'all' || (detStatusFilter === 'ran' ? d.didRun : !d.didRun))
             );
             
             let finalDisplayedDetails = [...filteredDetails];
             if (detSortConfig) {
               finalDisplayedDetails.sort((a, b) => {
                 let aVal = a[detSortConfig.key as keyof typeof a] || '';
                 let bVal = b[detSortConfig.key as keyof typeof b] || '';
                 
                 if (detSortConfig.key === 'didRun') {
                    aVal = a.didRun ? 1 : 0;
                    bVal = b.didRun ? 1 : 0;
                 }
                 
                 if (aVal < bVal) return detSortConfig.direction === 'asc' ? -1 : 1;
                 if (aVal > bVal) return detSortConfig.direction === 'asc' ? 1 : -1;
                 return 0;
               });
             }
             
             const handleDetSort = (key: string) => {
                let direction: 'asc' | 'desc' = 'asc';
                if (detSortConfig && detSortConfig.key === key && detSortConfig.direction === 'asc') direction = 'desc';
                setDetSortConfig({ key, direction });
             };
             
             const handleExportDetailedPlate = () => {
                const rows = [["Data", "SVC", "Placa", "Carregou (1=Sim/0=Nao)", "Justificativa"]];
                finalDisplayedDetails.forEach(d => {
                   rows.push([d.date.split('-').reverse().join('/'), d.svc, d.plate, d.didRun ? '1' : '0', d.reason]);
                });
                const csvContent = rows.map(r => r.join(";")).join("\n");
                const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", `Detalhe_Placas_${startDate}_a_${endDate}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
             };

             return (
               <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] p-6 mt-8">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                   <div>
                     <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
                       <span className="material-symbols-outlined text-blue-500">app_registration</span>
                       Visão Placa a Placa (Mercado Livre)
                     </h3>
                     <p className="text-xs text-slate-500 mt-1">Validação de carregamento e justificativas baseada na rota do dia.</p>
                   </div>
                   <button onClick={handleExportDetailedPlate} className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-all active:scale-95">
                     <span className="material-symbols-outlined text-[18px]">download</span>
                     Exportar Formato CSV (31.csv)
                   </button>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Filtrar por Placa</label>
                      <input 
                        type="text" 
                        value={detPlateFilter} 
                        onChange={(e) => setDetPlateFilter(e.target.value)} 
                        placeholder="Ex: ABC1D23" 
                        className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 focus:ring-blue-500 shadow-sm appearance-none outline-none uppercase" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Filtrar por SVC</label>
                      <div className="relative">
                        <select value={detSvcFilter} onChange={e => setDetSvcFilter(e.target.value)} className="w-full rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 focus:ring-blue-500 shadow-sm appearance-none">
                          <option value="">Todos os SVCs</option>
                          {Array.from(new Set(detailedUtilizationData.map(d => d.svc))).sort().map(s => (
                             <option key={s as string} value={s as string}>{s as string}</option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_content</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Status de Carregamento</label>
                      <div className="flex gap-2">
                        <button onClick={() => setDetStatusFilter('all')} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${detStatusFilter === 'all' ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-md transform scale-[1.02]' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>Todos</button>
                        <button onClick={() => setDetStatusFilter('ran')} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${detStatusFilter === 'ran' ? 'bg-emerald-500 text-white shadow-md transform scale-[1.02]' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>Carregou (1)</button>
                        <button onClick={() => setDetStatusFilter('idle')} className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${detStatusFilter === 'idle' ? 'bg-rose-500 text-white shadow-md transform scale-[1.02]' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>Parado (0)</button>
                      </div>
                    </div>
                 </div>

                 <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl max-h-[400px] overflow-y-auto custom-scrollbar">
                   <table className="w-full text-sm text-left relative">
                     <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider sticky top-0 z-10 shadow-sm select-none">
                       <tr>
                         <th className="px-5 py-4 w-1/6 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition" onClick={() => handleDetSort('date')}>
                           <div className="flex items-center gap-1">Data {detSortConfig?.key === 'date' && <span className="material-symbols-outlined text-[14px]">{detSortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}</div>
                         </th>
                         <th className="px-5 py-4 w-1/6 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition" onClick={() => handleDetSort('svc')}>
                           <div className="flex items-center gap-1">SVC {detSortConfig?.key === 'svc' && <span className="material-symbols-outlined text-[14px]">{detSortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}</div>
                         </th>
                         <th className="px-5 py-4 w-1/6 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition" onClick={() => handleDetSort('plate')}>
                           <div className="flex items-center gap-1">Placa {detSortConfig?.key === 'plate' && <span className="material-symbols-outlined text-[14px]">{detSortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}</div>
                         </th>
                         <th className="px-5 py-4 w-1/6 text-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition" onClick={() => handleDetSort('didRun')}>
                           <div className="flex items-center justify-center gap-1">Status (Carregou) {detSortConfig?.key === 'didRun' && <span className="material-symbols-outlined text-[14px]">{detSortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}</div>
                         </th>
                         <th className="px-5 py-4 w-2/6 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition" onClick={() => handleDetSort('reason')}>
                           <div className="flex items-center gap-1">Justificativa Reportada {detSortConfig?.key === 'reason' && <span className="material-symbols-outlined text-[14px]">{detSortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}</div>
                         </th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {finalDisplayedDetails.length === 0 ? (
                           <tr>
                              <td colSpan={5} className="px-5 py-12 text-center text-slate-400 font-medium">Nenhum registro encontrado para os filtros aplicados.</td>
                           </tr>
                        ) : (
                           finalDisplayedDetails.map((item, idx) => (
                              <tr key={idx} className={`transition-colors ${(!item.didRun && item.reason && item.reason.toUpperCase().includes('RODOU')) ? 'bg-red-100 hover:bg-red-200 dark:bg-rose-900/30 dark:hover:bg-rose-900/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}>
                                 <td className="px-5 py-3.5 font-medium text-slate-600 dark:text-slate-300">{item.date.split('-').reverse().join('/')}</td>
                                 <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-200">{item.svc}</td>
                                 <td className="px-5 py-3.5"><span className="font-mono font-bold bg-slate-100 dark:bg-slate-900 rounded px-2.5 py-1 border border-slate-200 dark:border-slate-800">{item.plate}</span></td>
                                 <td className="px-5 py-3.5 text-center">
                                     {item.didRun ? (
                                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shadow-sm border border-emerald-200 dark:border-emerald-800/50">
                                            <span className="material-symbols-outlined text-[14px]">check_circle</span> Sim (1)
                                        </span>
                                     ) : (
                                        <span className="px-2.5 py-1 bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shadow-sm border border-rose-200 dark:border-rose-800/50">
                                            <span className="material-symbols-outlined text-[14px]">cancel</span> Não (0)
                                        </span>
                                     )}
                                 </td>
                                 <td className="px-5 py-3.5">
                                    {editingPlateKey === `${item.date}|${item.plate}` ? (
                                      <div className="flex items-center gap-2">
                                        <select 
                                          value={editingPlateJust}
                                          onChange={(e) => setEditingPlateJust(e.target.value)}
                                          className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs p-1.5 focus:ring-2 focus:ring-blue-500 shadow-inner"
                                          onKeyDown={(e) => {
                                            if(e.key === 'Escape') setEditingPlateKey(null);
                                          }}
                                          autoFocus
                                          disabled={isSavingJust}
                                        >
                                           <option value="">Selecione o motivo...</option>
                                           {editingPlateJust && !JUSTIFICATION_OPTIONS.includes(editingPlateJust) && editingPlateJust !== 'RODOU' && (
                                               <option value={editingPlateJust}>{editingPlateJust}</option>
                                           )}
                                           {JUSTIFICATION_OPTIONS.map(opt => (
                                             <option key={opt} value={opt}>{opt}</option>
                                           ))}
                                           <option value="RODOU">RODOU</option>
                                        </select>
                                        <button disabled={isSavingJust} onClick={() => handleSaveJustification(item.date, item.plate, item.reportId, item.fullJustifications)} className="p-1.5 flex items-center justify-center bg-emerald-500 text-white rounded hover:bg-emerald-600 shadow-sm disabled:opacity-50"><span className="material-symbols-outlined text-[16px]">check</span></button>
                                        <button disabled={isSavingJust} onClick={() => setEditingPlateKey(null)} className="p-1.5 flex items-center justify-center bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 shadow-sm disabled:opacity-50"><span className="material-symbols-outlined text-[16px]">close</span></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between group">
                                        <span className={`text-xs font-semibold ${!item.didRun && item.reason === 'Sem justificativa preenchida' ? 'text-rose-500 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                           {item.reason}
                                        </span>
                                        {item.reportId && (
                                           <button 
                                              onClick={() => { setEditingPlateKey(`${item.date}|${item.plate}`); setEditingPlateJust(item.reason); }} 
                                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-500 transition-opacity ml-2 shrink-0 bg-white dark:bg-slate-800 rounded shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center"
                                              title="Editar Justificativa"
                                           >
                                             <span className="material-symbols-outlined text-[14px]">edit</span>
                                           </button>
                                        )}
                                      </div>
                                    )}
                                 </td>
                              </tr>
                           ))
                        )}
                     </tbody>
                   </table>
                 </div>
               </div>
             );
          })()}
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
