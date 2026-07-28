import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function generateDriverPerformanceExample() {
  console.log('--- Gerando Exemplo de Performance por Driver (D-1 Fechado) ---');

  // Query routes that have pacotes_total populated
  const { data: routes, error } = await supabase
    .from('daily_routes')
    .select('route_id, plate, driver_id, svc_id, pacotes_total, pacotes_entregues, insucessos, date')
    .not('pacotes_total', 'is', null)
    .limit(30);

  if (error || !routes || routes.length === 0) {
    console.error('Nenhuma rota com pacotes encontrada:', error?.message);
    return;
  }

  // Pick a date from the retrieved routes
  const sampleDate = routes[0].date;
  console.log(`Data selecionada para o exemplo: ${sampleDate}`);

  // Fetch all routes for this sample date
  const { data: dayRoutes } = await supabase
    .from('daily_routes')
    .select('route_id, plate, driver_id, svc_id, pacotes_total, pacotes_entregues, insucessos')
    .eq('date', sampleDate);

  const { data: svcs } = await supabase.from('service_centers').select('id, name, city');
  const svcNamesMap = {};
  svcs?.forEach(s => { svcNamesMap[s.id] = `${s.name} (${s.city || s.id})`; });

  // Group routes by SVC
  const routesBySvc = {};
  (dayRoutes || []).forEach(r => {
    const sId = r.svc_id || 'OUTROS';
    if (!routesBySvc[sId]) routesBySvc[sId] = [];
    routesBySvc[sId].push(r);
  });

  const dateFormatted = sampleDate.split('-').reverse().join('/');

  Object.keys(routesBySvc).slice(0, 3).forEach(svcId => {
    const svcRoutes = routesBySvc[svcId];
    const svcName = svcNamesMap[svcId] || svcId;

    let totalPacotesSvc = 0;
    let totalEntreguesSvc = 0;

    let msg = `📋 *PERFORMANCE POR DRIVER (D-1 FECHADO)*\n`;
    msg += `📅 *Data da Operação:* ${dateFormatted}\n`;
    msg += `🏬 *SVC:* ${svcName}\n\n`;
    msg += `🏎️ *Detalhamento por Rota / Motorista:*\n\n`;

    svcRoutes.forEach(r => {
      const total = parseInt(r.pacotes_total || '0', 10);
      const entregues = parseInt(r.pacotes_entregues || '0', 10);
      totalPacotesSvc += total;
      totalEntreguesSvc += entregues;

      const perc = total > 0 ? ((entregues / total) * 100).toFixed(1) : '0.0';
      const isCritical = total > 0 && parseFloat(perc) < 80;
      const statusIcon = isCritical ? '🚨' : '✅';
      const driverLabel = r.driver_id ? `Driver ${r.driver_id}` : 'Sem ID Motorista';

      msg += `• ${statusIcon} *${r.plate}* (${driverLabel}): ${entregues}/${total} entregues (${perc}%)\n`;
    });

    const percSvc = totalPacotesSvc > 0 ? ((totalEntreguesSvc / totalPacotesSvc) * 100).toFixed(1) : '0.0';

    msg += `\n-----------------------------------\n`;
    msg += `📊 *TOTAL DO SVC (${svcId})*\n`;
    msg += `📦 *Pacotes Totais:* ${totalPacotesSvc}\n`;
    msg += `✅ *Pacotes Entregues:* ${totalEntreguesSvc}\n`;
    msg += `🎯 *Aproveitamento do SVC:* ${percSvc}%\n`;

    console.log(`\n=================== [ MENSAGEM DO SVC ${svcId} ] ===================`);
    console.log(msg);
  });
}

generateDriverPerformanceExample();
