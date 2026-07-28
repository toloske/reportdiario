import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const API_URL = process.env.VITE_EVOLUTION_API_URL;
const API_KEY = process.env.VITE_EVOLUTION_API_KEY;
const INSTANCE = process.env.VITE_EVOLUTION_INSTANCE;

const TARGET_GROUP = '120363284501155529@g.us';

async function sendDriverPerformanceSample() {
  console.log('--- Enviando Exemplo de Performance por Driver (D-1) ---');

  const sampleDate = '2026-04-11';
  const targetSvc = 'SSP18';

  const { data: svcs } = await supabase.from('service_centers').select('id, name, city');
  const svcObj = svcs?.find(s => s.id === targetSvc);
  const svcName = svcObj ? `${svcObj.name} (${svcObj.city || targetSvc})` : targetSvc;

  const { data: routes } = await supabase
    .from('daily_routes')
    .select('route_id, plate, driver_id, svc_id, xpt, pacotes_total, pacotes_entregues, insucessos')
    .eq('date', sampleDate)
    .eq('svc_id', targetSvc)
    .limit(15);

  const dateFormatted = sampleDate.split('-').reverse().join('/');

  let totalPacotesSvc = 0;
  let totalEntreguesSvc = 0;

  let msg = `📋 *PERFORMANCE POR DRIVER (D-1 FECHADO)*\n`;
  msg += `📅 *Data da Operação:* ${dateFormatted}\n`;
  msg += `🏬 *SVC:* ${svcName}\n\n`;
  msg += `🏎️ *Detalhamento por Rota / Motorista:*\n\n`;

  (routes || []).forEach(r => {
    const total = parseInt(r.pacotes_total || '0', 10);
    const entregues = parseInt(r.pacotes_entregues || '0', 10);
    totalPacotesSvc += total;
    totalEntreguesSvc += entregues;

    const perc = total > 0 ? ((entregues / total) * 100).toFixed(1) : '0.0';
    const isCritical = total > 0 && parseFloat(perc) < 80;
    const statusIcon = isCritical ? '🚨' : '✅';
    const driverLabel = r.driver_id ? `Motorista ${r.driver_id}` : 'Sem ID Motorista';

    msg += `• ${statusIcon} *${r.plate}* (${driverLabel}): ${entregues}/${total} entregues (${perc}%)\n`;
  });

  const percSvc = totalPacotesSvc > 0 ? ((totalEntreguesSvc / totalPacotesSvc) * 100).toFixed(1) : '0.0';

  msg += `\n-----------------------------------\n`;
  msg += `📊 *TOTAL DO SVC (${targetSvc})*\n`;
  msg += `📦 *Pacotes Totais:* ${totalPacotesSvc}\n`;
  msg += `✅ *Pacotes Entregues:* ${totalEntreguesSvc}\n`;
  msg += `🎯 *Aproveitamento do SVC:* ${percSvc}%\n`;

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
      console.log('✅ Relatório de Performance por Driver entregue com sucesso no grupo:', TARGET_GROUP);
    } else {
      const errText = await res.text();
      console.error(`❌ Erro no envio (${res.status}):`, errText);
    }
  } catch (err) {
    console.error('❌ Exceção ao enviar via Evolution API:', err.message);
  }
}

sendDriverPerformanceSample();
