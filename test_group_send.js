import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const API_URL = process.env.VITE_EVOLUTION_API_URL;
const API_KEY = process.env.VITE_EVOLUTION_API_KEY;
const INSTANCE = process.env.VITE_EVOLUTION_INSTANCE;

const TARGET_GROUP = '120363284501155529@g.us';

const MAPEAMENTO_REGIONAIS = {
  "Regional 1": ["SSP20", "SSP27", "SSP36", "XPT", "SSP3", "SSP37", "SSP38", "SSP9", "SSP29"],
  "Regional 2": ["SSP34", "FIRST MILE", "SSP23", "SSP30", "SSP39", "SSP40", "SSP49", "SSP57", "SSP7", "SSP8", "SSP18", "SSP25"],
  "Regional 3": ["SSP10", "SSP12", "SSP22", "SSP26", "SSP28", "SSP31", "SSP4"]
};

async function sendRegionalSummaryToGroup() {
  const { data: svcs } = await supabase.from('service_centers').select('id, name');
  const svcNamesMap = {};
  svcs?.forEach(s => { svcNamesMap[s.id] = s.name; });

  const { data: vehicles } = await supabase.from('vehicles').select('plate, fleet_type, svc_id').eq('active', true);
  
  const { data: routeDates } = await supabase.from('daily_routes').select('date').order('date', { ascending: false }).limit(1);
  const targetDate = routeDates?.[0]?.date || new Date().toISOString().split('T')[0];

  const { data: routes } = await supabase.from('daily_routes').select('plate, route_id, svc_id, xpt').eq('date', targetDate);
  const uniqueRoutePlates = new Set(routes?.map(r => r.plate));

  const svcData = {};

  vehicles?.forEach(v => {
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

  routes?.forEach(r => {
    const sId = r.xpt?.toUpperCase() === 'ESP8' ? 'XPT' : (r.svc_id || '');
    const vehicle = vehicles?.find(v => v.plate === r.plate);
    if (!vehicle || (vehicle.fleet_type !== 'FROTA FIXA' && vehicle.fleet_type !== 'FROTA PRÓPRIA')) {
      if (!svcData[sId]) {
        svcData[sId] = { totalFF: 0, loadedFF: 0, totalTransmana: 0, loadedTransmana: 0, loadedSpot: 0 };
      }
      svcData[sId].loadedSpot++;
    }
  });

  const dateFormatted = targetDate.split('-').reverse().join('/');
  const currentTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let msg = `📊 *RESUMO DE CARREGAMENTO POR REGIONAL*\n`;
  msg += `📅 *Data:* ${dateFormatted} | ⏰ *Corte:* ${currentTimeStr}\n\n`;

  let totalGeneralFF = 0, totalGeneralLoadedFF = 0;
  let totalGeneralTransmana = 0, totalGeneralLoadedTransmana = 0;
  let totalGeneralSpot = 0;

  Object.keys(MAPEAMENTO_REGIONAIS).forEach(reg => {
    msg += `📍 *${reg.toUpperCase()}*\n`;
    const svcList = MAPEAMENTO_REGIONAIS[reg];
    let regFF = 0, regLoadedFF = 0;
    let regTransmana = 0, regLoadedTransmana = 0;
    let regSpot = 0;

    const svcLines = [];

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
    msg += svcLines.join('\n') + '\n\n';
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

  console.log(`Enviando mensagem para o grupo ${TARGET_GROUP}...`);

  try {
    const res = await fetch(`${API_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        number: TARGET_GROUP,
        text: msg,
        delay: 1200,
        linkPreview: false
      })
    });

    if (res.ok) {
      console.log('✅ Mensagem enviada com sucesso para o grupo:', TARGET_GROUP);
    } else {
      const errText = await res.text();
      console.error(`❌ Erro no envio (${res.status}):`, errText);
    }
  } catch (err) {
    console.error('❌ Falha na requisição da Evolution API:', err.message);
  }
}

sendRegionalSummaryToGroup();
