import { supabase } from "./supabaseClient";
import { whatsappService } from "./whatsappService";
import { isVehicleActiveOnDate } from "./dataService";

const GROUP_RECIPIENT = import.meta.env.VITE_WHATSAPP_GROUP_RECIPIENT || '120363284501155529@g.us';

const MAPEAMENTO_REGIONAIS: Record<string, string[]> = {
  "Regional 1": ["SSP27", "SSP36", "XPT", "SSP3", "SSP38", "SSP9", "SSP29"],
  "Regional 2": ["SSP34", "FIRST MILE", "SSP23", "SSP30", "SSP39", "SSP40", "SSP7", "SSP8", "SSP18", "SSP25"],
  "Regional 3": ["SSP10", "SSP12", "SSP22", "SSP26", "SSP28", "SSP31", "SSP4"]
};

// Helper: Get previous date string (YYYY-MM-DD)
export const getPreviousDayDateStr = (dateStr: string): string => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const corteSummaryService = {
  generateRegionalSummaryText: async (targetDate: string, corteTime: string = '06:00'): Promise<string> => {
    // 1. Fetch SVC names
    const { data: svcs } = await supabase.from('service_centers').select('id, name');
    const svcNamesMap: Record<string, string> = {};
    if (svcs) {
      svcs.forEach(s => { svcNamesMap[s.id] = s.name; });
    }

    // 2. Fetch active vehicles
    const { data: rawVehicles, error: vehErr } = await supabase
      .from('vehicles')
      .select('plate, fleet_type, svc_id')
      .eq('active', true);

    if (vehErr || !rawVehicles) {
      throw new Error(`Erro ao buscar veículos: ${vehErr?.message || 'Dados indisponíveis'}`);
    }

    const vehicles = rawVehicles
      .map(v => {
        if (v.svc_id === 'SSP49' || v.svc_id === 'SSP57') {
          return { ...v, svc_id: 'SSP40' };
        }
        return v;
      })
      .filter(v => isVehicleActiveOnDate(v.plate, targetDate));

    // 3. Fetch routes for targetDate
    const { data: routes, error: rErr } = await supabase
      .from('daily_routes')
      .select('plate, route_id, svc_id, xpt')
      .eq('date', targetDate);

    if (rErr) {
      throw new Error(`Erro ao buscar rotas para ${targetDate}: ${rErr.message}`);
    }

    const uniqueRoutePlates = new Set((routes || []).map(r => r.plate));

    interface SVCData {
      totalFF: number;
      loadedFF: number;
      totalTransmana: number;
      loadedTransmana: number;
      loadedSpot: number;
    }

    const svcData: Record<string, SVCData> = {};

    vehicles.forEach(v => {
      const sId = v.svc_id;
      if (!svcData[sId]) {
        svcData[sId] = { totalFF: 0, loadedFF: 0, totalTransmana: 0, loadedTransmana: 0, loadedSpot: 0 };
      }
      if (v.fleet_type === 'FROTA FIXA') {
        svcData[sId].totalFF++;
        if (uniqueRoutePlates.has(v.plate)) svcData[sId].loadedFF++;
      } else if (v.fleet_type === 'FROTA PRÓPRIA') {
        svcData[sId].totalTransmana++;
        if (uniqueRoutePlates.has(v.plate)) svcData[sId].loadedTransmana++;
      }
    });

    (routes || []).forEach(r => {
      const sId = r.xpt?.toUpperCase() === 'ESP8' ? 'XPT' : (r.svc_id || '');
      const vehicle = vehicles.find(v => v.plate === r.plate);
      if (!vehicle || (vehicle.fleet_type !== 'FROTA FIXA' && vehicle.fleet_type !== 'FROTA PRÓPRIA')) {
        if (!svcData[sId]) {
          svcData[sId] = { totalFF: 0, loadedFF: 0, totalTransmana: 0, loadedTransmana: 0, loadedSpot: 0 };
        }
        svcData[sId].loadedSpot++;
      }
    });

    const dateFormatted = targetDate.split('-').reverse().join('/');

    let msg = `📊 *RESUMO DE CARREGAMENTO POR REGIONAL*\n`;
    msg += `📅 *Data:* ${dateFormatted} | ⏰ *Corte:* ${corteTime}\n\n`;

    let totalGeneralFF = 0, totalGeneralLoadedFF = 0;
    let totalGeneralTransmana = 0, totalGeneralLoadedTransmana = 0;
    let totalGeneralSpot = 0;

    Object.keys(MAPEAMENTO_REGIONAIS).forEach(reg => {
      msg += `📍 *${reg.toUpperCase()}*\n`;
      const svcList = MAPEAMENTO_REGIONAIS[reg];
      let regFF = 0, regLoadedFF = 0;
      let regTransmana = 0, regLoadedTransmana = 0;
      let regSpot = 0;

      const svcLines: string[] = [];

      svcList.forEach(sId => {
        const d = svcData[sId];
        if (d && (d.totalFF > 0 || d.totalTransmana > 0 || d.loadedSpot > 0)) {
          regFF += d.totalFF;
          regLoadedFF += d.loadedFF;
          regTransmana += d.totalTransmana;
          regLoadedTransmana += d.loadedTransmana;
          regSpot += d.loadedSpot;

          const totalFixed = d.totalFF + d.totalTransmana;
          const loadedFixed = d.loadedFF + d.loadedTransmana;
          const percFixed = totalFixed > 0 ? (loadedFixed / totalFixed) * 100 : 0;
          
          const isCritical = totalFixed > 0 && percFixed < 50;
          const statusEmoji = isCritical ? '🚨' : (percFixed >= 80 ? '🟢' : '🟡');
          const criticalTag = isCritical ? ' *[CRÍTICO <50%]*' : '';
          const name = svcNamesMap[sId] || sId;

          svcLines.push(`  ${statusEmoji} *${name}*: FF ${d.loadedFF}/${d.totalFF} | Transmana ${d.loadedTransmana}/${d.totalTransmana} | SPOT ${d.loadedSpot} (${percFixed.toFixed(0)}%)${criticalTag}`);
        }
      });

      totalGeneralFF += regFF;
      totalGeneralLoadedFF += regLoadedFF;
      totalGeneralTransmana += regTransmana;
      totalGeneralLoadedTransmana += regLoadedTransmana;
      totalGeneralSpot += regSpot;

      const totalRegFixed = regFF + regTransmana;
      const loadedRegFixed = regLoadedFF + regLoadedTransmana;
      const percRegFixed = totalRegFixed > 0 ? ((loadedRegFixed / totalRegFixed) * 100).toFixed(1) : '0';

      msg += `   └ Frota: ${loadedRegFixed}/${totalRegFixed} (${percRegFixed}%) | SPOTS: ${regSpot}\n`;
      if (svcLines.length > 0) {
        msg += svcLines.join('\n') + '\n';
      }
      msg += '\n';
    });

    const totalGeneralFixed = totalGeneralFF + totalGeneralTransmana;
    const loadedGeneralFixed = totalGeneralLoadedFF + totalGeneralLoadedTransmana;
    const percGeneralFixed = totalGeneralFixed > 0 ? ((loadedGeneralFixed / totalGeneralFixed) * 100).toFixed(1) : '0';

    msg += `-----------------------------------\n`;
    msg += `📈 *RESUMO GERAL DO DIA*\n`;
    msg += `🚗 *Carros FF:* ${totalGeneralLoadedFF}/${totalGeneralFF} (${totalGeneralFF > 0 ? ((totalGeneralLoadedFF/totalGeneralFF)*100).toFixed(1) : 0}%)\n`;
    msg += `🚐 *Frota Transmana:* ${totalGeneralLoadedTransmana}/${totalGeneralTransmana} (${totalGeneralTransmana > 0 ? ((totalGeneralLoadedTransmana/totalGeneralTransmana)*100).toFixed(1) : 0}%)\n`;
    msg += `⚡ *Carros SPOTS:* ${totalGeneralSpot}\n`;
    msg += `🏆 *Frota Fixa + Transmana Total:* ${loadedGeneralFixed}/${totalGeneralFixed} (${percGeneralFixed}%)\n`;
    msg += `📦 *Total de Veículos em Rota:* ${loadedGeneralFixed + totalGeneralSpot}\n`;

    return msg;
  },

  generateDriverPerformanceText: async (targetDate: string, svcId: string): Promise<string> => {
    const { data: svcs } = await supabase.from('service_centers').select('id, name, city');
    const svcObj = svcs?.find(s => s.id === svcId);
    const svcName = svcObj ? `${svcObj.name} (${svcObj.city || svcObj.id})` : svcId;

    const { data: routes, error } = await supabase
      .from('daily_routes')
      .select('route_id, plate, driver_id, svc_id, xpt, pacotes_total, pacotes_entregues, insucessos')
      .eq('date', targetDate);

    if (error) {
      throw new Error(`Erro ao buscar rotas para ${targetDate}: ${error.message}`);
    }

    const filteredRoutes = (routes || []).filter(r => {
      const sId = r.xpt?.toUpperCase() === 'ESP8' ? 'XPT' : (r.svc_id || '');
      return sId === svcId;
    });

    if (filteredRoutes.length === 0) {
      return `📋 *PERFORMANCE POR DRIVER (D-1 FECHADO)*\n📅 *Data:* ${targetDate.split('-').reverse().join('/')}\n🏬 *SVC:* ${svcName}\n\nNenhuma rota registrada para este SVC na data.`;
    }

    const dateFormatted = targetDate.split('-').reverse().join('/');

    let totalPacotesSvc = 0;
    let totalEntreguesSvc = 0;

    let msg = `📋 *PERFORMANCE POR DRIVER (D-1 FECHADO)*\n`;
    msg += `📅 *Data da Operação:* ${dateFormatted}\n`;
    msg += `🏬 *SVC:* ${svcName}\n\n`;
    msg += `🏎️ *Detalhamento por Rota / Motorista:*\n\n`;

    filteredRoutes.forEach(r => {
      const total = parseInt(r.pacotes_total || '0', 10);
      const entregues = parseInt(r.pacotes_entregues || '0', 10);
      totalPacotesSvc += total;
      totalEntreguesSvc += entregues;

      const perc = total > 0 ? ((entregues / total) * 100).toFixed(1) : '0.0';
      const isCritical = total > 0 && parseFloat(perc) < 80;
      const statusIcon = isCritical ? '🚨' : '✅';
      const driverLabel = r.driver_id 
        ? (isNaN(Number(r.driver_id)) ? r.driver_id : `Motorista ${r.driver_id}`) 
        : 'Sem Motorista';

      msg += `• ${statusIcon} *${r.plate}* (${driverLabel}): ${entregues}/${total} entregues (${perc}%)\n`;
    });

    const percSvc = totalPacotesSvc > 0 ? ((totalEntreguesSvc / totalPacotesSvc) * 100).toFixed(1) : '0.0';

    msg += `\n-----------------------------------\n`;
    msg += `📊 *TOTAL DO SVC (${svcId})*\n`;
    msg += `📦 *Pacotes Totais:* ${totalPacotesSvc}\n`;
    msg += `✅ *Pacotes Entregues:* ${totalEntreguesSvc}\n`;
    msg += `🎯 *Aproveitamento do SVC:* ${percSvc}%\n`;

    return msg;
  },

  sendRegionalSummaryWhatsApp: async (targetDate: string, customRecipient?: string): Promise<boolean> => {
    const text = await corteSummaryService.generateRegionalSummaryText(targetDate, '06:00');
    const recipient = customRecipient || GROUP_RECIPIENT;
    return await whatsappService.sendText(text, recipient);
  },

  sendDriverPerformanceWhatsApp: async (targetDate: string, svcId: string, customRecipient?: string): Promise<boolean> => {
    const text = await corteSummaryService.generateDriverPerformanceText(targetDate, svcId);
    const recipient = customRecipient || GROUP_RECIPIENT;
    return await whatsappService.sendText(text, recipient);
  }
};
