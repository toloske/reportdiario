import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Setup Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados no arquivo .env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// MySQL Connection Configuration
const mysqlConfig = {
  host: process.env.MYSQL_HOST || 'banco.impactasistemas.com.br',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'transmana_powerbi',
  password: process.env.MYSQL_PASSWORD || 'o962kJ96t5Cu8729BA5',
  database: process.env.MYSQL_DATABASE || 'transmana',
  connectTimeout: 20000
};

// Helper: Format Date to YYYY-MM-DD
function formatDate(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    return val.split(' ')[0];
  }
  if (val instanceof Date) {
    try {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return null;
    }
  }
  return null;
}

// Helper: Safely convert values to string
function getVal(val) {
  return val === undefined || val === null ? '' : String(val).trim();
}

async function run() {
  console.log("=== INICIANDO SINCRONIZAÇÃO DE ROTAS (MYSQL -> SUPABASE) ===");

  // Parse command line arguments
  // Usage examples:
  // node sync_routes_mysql.js --days 3
  // node sync_routes_mysql.js --date 2026-06-02
  // node sync_routes_mysql.js --start 2026-06-01 --end 2026-06-03
  
  const args = process.argv.slice(2);
  let targetDates = [];

  const getRelativeDate = (offsetDays) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return formatDate(d);
  };

  const daysIdx = args.indexOf('--days');
  const dateIdx = args.indexOf('--date');
  const startIdx = args.indexOf('--start');
  const endIdx = args.indexOf('--end');

  if (dateIdx !== -1 && args[dateIdx + 1]) {
    targetDates.push(args[dateIdx + 1]);
    console.log(`Modo: Data específica ativa: ${args[dateIdx + 1]}`);
  } else if (startIdx !== -1 && args[startIdx + 1] && endIdx !== -1 && args[endIdx + 1]) {
    const start = new Date(args[startIdx + 1] + 'T00:00:00');
    const end = new Date(args[endIdx + 1] + 'T00:00:00');
    let loop = new Date(start);
    while (loop <= end) {
      targetDates.push(formatDate(loop));
      loop.setDate(loop.getDate() + 1);
    }
    console.log(`Modo: Intervalo ativo de ${args[startIdx + 1]} até ${args[endIdx + 1]} (${targetDates.length} dias)`);
  } else {
    // Default to last 2 days
    let daysToSync = 2;
    if (daysIdx !== -1 && args[daysIdx + 1]) {
      daysToSync = parseInt(args[daysIdx + 1], 10);
    }
    for (let i = 0; i < daysToSync; i++) {
      targetDates.push(getRelativeDate(i));
    }
    console.log(`Modo: Sincronizando últimos ${daysToSync} dias: [${targetDates.join(', ')}]`);
  }

  if (targetDates.length === 0) {
    console.error("Erro: Nenhuma data para processar.");
    process.exit(1);
  }

  let connection;
  try {
    console.log("Conectando ao banco de rotas MySQL...");
    connection = await mysql.createConnection(mysqlConfig);
    console.log("Conectado com sucesso ao MySQL.");

    // Query daily routes from MySQL view
    // We filter by target dates
    const placeholders = targetDates.map(() => '?').join(',');
    const query = `
      SELECT * 
      FROM view_base_diario 
      WHERE DATE(Data_Rota) IN (${placeholders})
    `;

    console.log(`Executando consulta para as datas solicitadas no MySQL...`);
    const [rows] = await connection.query(query, targetDates);
    console.log(`Encontradas ${rows.length} rotas no MySQL para o período.`);

    if (rows.length === 0) {
      console.log("Nenhuma rota encontrada para as datas especificadas.");
      return;
    }

    // Map MySQL rows to Supabase payload
    const payload = [];
    for (const row of rows) {
      const rawRouteId = row.ID_Rota;
      const rawPlate = row.Veiculo;
      const formattedDate = formatDate(row.Data_Rota);

      if (rawRouteId && rawPlate && formattedDate) {
        const cleanedPlate = String(rawPlate).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (cleanedPlate.length >= 5) {
          
          // Format times nicely if possible
          let startHour = '';
          if (row.Data_Criacao_Rota) {
            const d = new Date(row.Data_Criacao_Rota);
            startHour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
          }

          let endHour = '';
          if (row.Adc_DH_Conclusao) {
            const d = new Date(row.Adc_DH_Conclusao);
            endHour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
          }

          payload.push({
            route_id: String(rawRouteId).trim(),
            date: formattedDate,
            plate: cleanedPlate,
            driver_id: getVal(row.ID_Motorista) || getVal(row.Motorista) || getVal(row.CPF_Motorista),
            vehicle_type: getVal(row.Tipo_Veiculo),
            svc_id: getVal(row.Service),
            xpt: getVal(row.XPT),
            mlp: getVal(row.Tipo),
            regional: getVal(row.XPT_Cidade || row.Service_Cidade),
            canal: getVal(row.Canal),
            ciclo: getVal(row.Ciclo_Meli),
            cluster: getVal(row.Cluster),
            id_veiculo: getVal(row.ID_Veiculo),
            hora_inicio: startHour,
            hora_fim: endHour,
            orh_plan: getVal(row.ORH),
            orh_hours: '',
            km_plan: getVal(row.KM_Normal),
            km_real: getVal(row.Adc_Distancia_Percorrida),
            stem_out: getVal(row.DH_StemOut),
            parada: getVal(row.QTD_Paradas),
            pacotes_total: getVal(row.QTD_Pacotes),
            pacotes_entregues: getVal(row.QTD_Entregue),
            insucessos: getVal(row.QTD_Falhas),
            ds: getVal(row.Observacao)
          });
        }
      }
    }

    console.log(`Mapeadas ${payload.length} rotas válidas para inserção.`);

    if (payload.length === 0) {
      console.log("Nenhuma rota válida após a limpeza e validação de dados.");
      return;
    }

    // Upsert into Supabase daily_routes in batches to avoid network size limits
    const BATCH_SIZE = 500;
    let successCount = 0;
    
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      console.log(`Enviando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(payload.length / BATCH_SIZE)} (${chunk.length} rotas) para o Supabase...`);
      
      const { error } = await supabase
        .from('daily_routes')
        .upsert(chunk, { onConflict: 'route_id' });

      if (error) {
        console.error(`Erro ao salvar lote no Supabase:`, error.message);
      } else {
        successCount += chunk.length;
      }
    }

    console.log(`\nSincronização concluída com sucesso!`);
    console.log(`Total de rotas processadas: ${payload.length}`);
    console.log(`Total de rotas salvas no Supabase: ${successCount}`);

    // WhatsApp Alert check for each synchronized date
    console.log("\nIniciando verificação de erros de preenchimento (WhatsApp)...");
    for (const date of targetDates) {
      try {
        await checkAndAlertFillingErrors(date);
      } catch (err) {
        console.error(`Erro ao verificar alertas de preenchimento para a data ${date}:`, err);
      }
    }

  } catch (error) {
    console.error("Erro crítico na sincronização de rotas:", error);
  } finally {
    if (connection) {
      await connection.end();
      console.log("Conexão com o banco de dados encerrada.");
    }
  }
}

// Function: Check if all expected dispatchers have filled their reports and alert via WhatsApp if they have filling errors
async function checkAndAlertFillingErrors(targetDate) {
  const notifiedFilePath = path.join(process.cwd(), 'whatsapp_notified_dates.json');
  let notifiedDates = [];
  try {
    if (fs.existsSync(notifiedFilePath)) {
      notifiedDates = JSON.parse(fs.readFileSync(notifiedFilePath, 'utf8'));
    }
  } catch (e) {
    console.error("Erro ao ler whatsapp_notified_dates.json:", e);
  }

  if (notifiedDates.includes(targetDate)) {
    console.log(`[Alerta WhatsApp] Data ${targetDate} já notificada anteriormente. Pulando.`);
    return;
  }

  console.log(`[Alerta WhatsApp] Verificando preenchimento para a data: ${targetDate}...`);

  // 1. Fetch expected SVCs (SVCs with active vehicles having operation 'Mercado Livre')
  const { data: mlVehicles, error: mlVehError } = await supabase
    .from('vehicles')
    .select('svc_id')
    .eq('active', true)
    .eq('operation', 'Mercado Livre');

  if (mlVehError) {
    console.error("Erro ao buscar veículos Mercado Livre no Supabase:", mlVehError.message);
    return;
  }

  const expectedSvcIds = Array.from(new Set(mlVehicles.map(v => v.svc_id))).filter(id => id && id !== 'FIRST MILE');
  console.log(`[Alerta WhatsApp] Esperando relatórios de ${expectedSvcIds.length} SVCs: [${expectedSvcIds.join(', ')}]`);

  // 2. Fetch submitted reports for targetDate
  const { data: reports, error: reportsError } = await supabase
    .from('daily_reports')
    .select('svc_id, justifications')
    .eq('date', targetDate);

  if (reportsError) {
    console.error("Erro ao buscar relatórios diários no Supabase:", reportsError.message);
    return;
  }

  const submittedSvcIds = reports.map(r => r.svc_id);
  console.log(`[Alerta WhatsApp] SVCs que já preencheram: [${submittedSvcIds.join(', ')}]`);

  // Check if all expected have filled
  const allFilled = expectedSvcIds.every(svc => submittedSvcIds.includes(svc));
  if (!allFilled) {
    const missingSvcs = expectedSvcIds.filter(svc => !submittedSvcIds.includes(svc));
    console.log(`[Alerta WhatsApp] O dia ${targetDate} ainda não foi concluído por todos os dispatchers. Faltam: [${missingSvcs.join(', ')}].`);
    return;
  }

  console.log(`[Alerta WhatsApp] Todos os dispatchers preencheram para o dia ${targetDate}! Analisando erros de preenchimento...`);

  // 3. Calculate errors:
  // - Fetch all active fixed fleet vehicles
  const { data: fixedVehicles, error: fixedVehError } = await supabase
    .from('vehicles')
    .select('plate, svc_id, modal')
    .or('fleet_type.eq.FROTA FIXA,svc_id.eq.XPT')
    .eq('active', true);

  if (fixedVehError) {
    console.error("Erro ao buscar frota fixa no Supabase:", fixedVehError.message);
    return;
  }

  // Filter fixed vehicles that are in our expected SVCs
  const relevantVehicles = fixedVehicles.filter(v => expectedSvcIds.includes(v.svc_id));

  // Parse submitted justifications: map plate -> justification
  const justificationsMap = {};
  for (const r of reports) {
    if (!r.justifications) continue;
    const items = r.justifications.split('; ');
    for (const item of items) {
      const match = item.match(/"?([A-Za-z0-9-]+)"?\s*-\s*(.*)/);
      if (match) {
        const plate = match[1].trim();
        const reason = match[2].trim();
        justificationsMap[plate] = reason;
      }
    }
  }

  // Fetch routed plates for targetDate
  const { data: routes, error: routesError } = await supabase
    .from('daily_routes')
    .select('plate')
    .eq('date', targetDate);

  if (routesError) {
    console.error("Erro ao buscar rotas no Supabase:", routesError.message);
    return;
  }

  const routedPlates = new Set(routes.map(r => r.plate));

  // Detect errors
  const errors = []; // array of { plate, svc, reason }
  for (const vehicle of relevantVehicles) {
    const hasRoute = routedPlates.has(vehicle.plate);
    const justification = justificationsMap[vehicle.plate];

    if (!hasRoute) {
      // Did not run
      if (justification && justification.toUpperCase().includes('RODOU')) {
        // Error: Marked as RODOU but did not run
        errors.push({ plate: vehicle.plate, svc: vehicle.svc_id, reason: justification });
      } else if (!justification) {
        // Error: No justification filled
        errors.push({ plate: vehicle.plate, svc: vehicle.svc_id, reason: 'Sem justificativa preenchida' });
      }
    }
  }

  console.log(`[Alerta WhatsApp] Encontrados ${errors.length} erros de preenchimento.`);

  if (errors.length > 0) {
    // Fetch SVC names
    const { data: svcs, error: svcsError } = await supabase
      .from('service_centers')
      .select('id, name');

    const svcNamesMap = {};
    if (!svcsError && svcs) {
      svcs.forEach(s => { svcNamesMap[s.id] = s.name; });
    }

    // Group errors by SVC
    const errorsBySvc = {};
    errors.forEach(e => {
      if (!errorsBySvc[e.svc]) {
        errorsBySvc[e.svc] = { svcName: svcNamesMap[e.svc] || e.svc, plates: [] };
      }
      errorsBySvc[e.svc].plates.push(e);
    });

    // Regionals mapping
    const MAPEAMENTO_REGIONAIS = {
      "Regional 1": ["SSP20", "SSP27", "SSP36", "XPT", "SSP3", "SSP37", "SSP38", "SSP9", "SSP29"],
      "Regional 2": ["SSP34", "FIRST MILE", "SSP23", "SSP30", "SSP39", "SSP40", "SSP49", "SSP57", "SSP7", "SSP8", "SSP18", "SSP25"],
      "Regional 3": ["SSP10", "SSP12", "SSP22", "SSP26", "SSP28", "SSP31", "SSP4"]
    };

    const dateFormatted = targetDate.split('-').reverse().join('/');
    let msg = `Verificação de placas sem rota - ${dateFormatted}\n\n`;
    msg += `Atenção: As placas abaixo estão justificadas como "RODOU", mas não tiveram rotas identificadas no sistema, ou estão sem justificativa preenchida:\n\n`;

    const byRegional = {};
    Object.keys(errorsBySvc).forEach(svcId => {
      const reg = Object.keys(MAPEAMENTO_REGIONAIS).find(k => MAPEAMENTO_REGIONAIS[k].includes(svcId)) || 'Outras Regionais';
      if (!byRegional[reg]) byRegional[reg] = [];
      byRegional[reg].push(svcId);
    });

    Object.keys(byRegional).sort().forEach(reg => {
      msg += `*${reg}*\n`;
      byRegional[reg].forEach(svcId => {
        const group = errorsBySvc[svcId];
        msg += `  ${group.svcName}\n`;
        group.plates.forEach(p => {
          msg += `    • ${p.plate} (${p.reason})\n`;
        });
      });
      msg += '\n';
    });

    msg += `Qual a justificativa correta das placas?`;

    // Send message via Evolution API
    const apiOpts = {
      url: process.env.VITE_EVOLUTION_API_URL,
      key: process.env.VITE_EVOLUTION_API_KEY,
      instance: process.env.VITE_EVOLUTION_INSTANCE,
      recipient: process.env.VITE_WHATSAPP_DEFAULT_RECIPIENT
    };

    if (apiOpts.url && apiOpts.key && apiOpts.instance && apiOpts.recipient) {
      console.log(`[Alerta WhatsApp] Enviando mensagem de erros para ${apiOpts.recipient}...`);
      try {
        let number = apiOpts.recipient.trim();
        if (!number.includes('@')) {
          number = number.replace(/\D/g, '');
        }

        const res = await fetch(`${apiOpts.url}/message/sendText/${apiOpts.instance}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiOpts.key
          },
          body: JSON.stringify({
            number: number,
            text: msg,
            delay: 1200,
            linkPreview: true
          })
        });

        if (res.ok) {
          console.log(`[Alerta WhatsApp] WhatsApp enviado com sucesso.`);
          // Save to notified dates
          notifiedDates.push(targetDate);
          fs.writeFileSync(notifiedFilePath, JSON.stringify(notifiedDates, null, 2));
        } else {
          const errText = await res.text();
          console.error(`[Alerta WhatsApp] Erro no envio do WhatsApp (status ${res.status}):`, errText);
        }
      } catch (sendErr) {
        console.error(`[Alerta WhatsApp] Falha na requisição da Evolution API:`, sendErr.message);
      }
    } else {
      console.warn(`[Alerta WhatsApp] Credenciais de WhatsApp incompletas no .env. Não enviado.`);
    }
  } else {
    console.log(`[Alerta WhatsApp] Nenhum erro de preenchimento encontrado para ${targetDate}. Salvando data.`);
    notifiedDates.push(targetDate);
    fs.writeFileSync(notifiedFilePath, JSON.stringify(notifiedDates, null, 2));
  }
}

run();
