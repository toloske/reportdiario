import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_URL = process.env.VITE_EVOLUTION_API_URL;
const API_KEY = process.env.VITE_EVOLUTION_API_KEY;
const INSTANCE = process.env.VITE_EVOLUTION_INSTANCE;

const TARGET_PHONE = '5515996813326';

async function generateAndSendSummary() {
  console.log('--- Gerando Resumo de Carregamento ---');

  // 1. Fetch active vehicles from Supabase
  const { data: vehicles, error: vehError } = await supabase
    .from('vehicles')
    .select('plate, fleet_type, svc_id')
    .eq('active', true);

  if (vehError) {
    console.error('Erro ao buscar veículos:', vehError.message);
    return;
  }

  const vehicleMap = {};
  let totalFF = 0;
  let totalTransmana = 0;

  vehicles.forEach(v => {
    vehicleMap[v.plate] = v.fleet_type;
    if (v.fleet_type === 'FROTA FIXA') {
      totalFF++;
    } else if (v.fleet_type === 'FROTA PRÓPRIA') {
      totalTransmana++;
    }
  });

  // 2. Fetch latest date with routes or today's date
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: latestDateRow } = await supabase
    .from('daily_routes')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);

  const targetDate = latestDateRow?.[0]?.date || todayStr;

  // 3. Fetch routes for targetDate
  const { data: routes, error: routesError } = await supabase
    .from('daily_routes')
    .select('plate, route_id')
    .eq('date', targetDate);

  if (routesError) {
    console.error('Erro ao buscar rotas:', routesError.message);
    return;
  }

  const uniquePlates = new Set((routes || []).map(r => r.plate));

  let loadedFF = 0;
  let loadedTransmana = 0;
  let loadedSpot = 0;

  uniquePlates.forEach(plate => {
    const ft = vehicleMap[plate];
    if (ft === 'FROTA FIXA') {
      loadedFF++;
    } else if (ft === 'FROTA PRÓPRIA') {
      loadedTransmana++;
    } else {
      loadedSpot++;
    }
  });

  const percFF = totalFF > 0 ? ((loadedFF / totalFF) * 100).toFixed(1) : '0';
  const percTransmana = totalTransmana > 0 ? ((loadedTransmana / totalTransmana) * 100).toFixed(1) : '0';

  const dateFormatted = targetDate.split('-').reverse().join('/');
  const currentTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // 4. Construct WhatsApp Message
  let message = `📊 *RESUMO DE CARREGAMENTO DE ROTAS*\n`;
  message += `📅 *Data:* ${dateFormatted}\n`;
  message += `⏰ *Corte/Horário:* ${currentTimeStr}\n\n`;
  message += `🚗 *Carros FF carregados:* ${loadedFF}/${totalFF} (${percFF}%)\n`;
  message += `🚐 *Carros Frota Transmana carregados:* ${loadedTransmana}/${totalTransmana} (${percTransmana}%)\n`;
  message += `⚡ *Carros SPOTS carregados:* ${loadedSpot}\n\n`;
  message += `📦 *Total de Veículos em Rota:* ${uniquePlates.size}\n\n`;
  message += `_Mensagem enviada via Evolution API para homologação._`;

  console.log('Mensagem a ser enviada:\n');
  console.log(message);

  // 5. Send via Evolution API
  if (!API_URL || !API_KEY || !INSTANCE) {
    console.error('Credenciais da Evolution API ausentes no .env!');
    return;
  }

  console.log(`\nEnviando WhatsApp para ${TARGET_PHONE}...`);

  try {
    const res = await fetch(`${API_URL}/message/sendText/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY
      },
      body: JSON.stringify({
        number: TARGET_PHONE,
        text: message,
        delay: 1200,
        linkPreview: false
      })
    });

    if (res.ok) {
      console.log('✅ WhatsApp enviado com sucesso para', TARGET_PHONE);
    } else {
      const errText = await res.text();
      console.error(`❌ Erro no envio (${res.status}):`, errText);
    }
  } catch (err) {
    console.error('❌ Falha na requisição da Evolution API:', err.message);
  }
}

generateAndSendSummary();
