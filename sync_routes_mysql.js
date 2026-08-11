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

// Load Decommissioned Vehicles JSON
let decommissionedVehicles = {};
try {
  const jsonPath = path.resolve('decommissioned_vehicles.json');
  if (fs.existsSync(jsonPath)) {
    decommissionedVehicles = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
} catch (e) {
  console.error("Erro ao carregar decommissioned_vehicles.json:", e.message);
}

function isVehicleActiveOnDate(plate, dateStr) {
  if (!plate || !dateStr) return true;
  const cleanPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const deactDate = decommissionedVehicles[cleanPlate];
  if (deactDate) {
    return dateStr < deactDate;
  }
  return true;
}

async function run() {
  console.log("=== INICIANDO SINCRONIZAÇÃO DE ROTAS (MYSQL -> SUPABASE) ===");

  // Parse command line arguments
  // Usage examples:
  // node sync_routes_mysql.js --days 3
  // node sync_routes_mysql.js --date 2026-06-02
  // node sync_routes_mysql.js --start 2026-06-01 --end 2026-06-03
  
  const args = process.argv.slice(2);
  const forceCorte = args.includes('--send-corte') || args.includes('--force-corte');
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
    const createConn = mysql.createConnection || (mysql.default && mysql.default.createConnection);
    connection = await createConn(mysqlConfig);
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
            driver_id: getVal(row.Motorista) || getVal(row.ID_Motorista) || getVal(row.CPF_Motorista),
            vehicle_type: getVal(row.Tipo_Veiculo),
            svc_id: (() => {
              const s = getVal(row.Service);
              if (s === 'SSP49' || s === 'SSP57') return 'SSP40';
              if (s.startsWith('SFC')) {
                const city = getVal(row.Service_Cidade || row.XPT_Cidade).toUpperCase().trim();
                if (city === 'ITUPEVA') return 'SSP38';
                if (city === 'CAMPINAS') return 'SSP37';
                if (city === 'SOROCABA') return 'SSP20';
                if (city === 'PIRACICABA') return 'SSP36';
                if (city === 'JUNDIAÍ' || city === 'JUNDIAI') return 'SSP18';
                if (city === 'ATIBAIA') return 'SSP25';
                if (city === 'MOGI MIRIM' || city === 'MOGI-MIRIM') return 'SSP29';
                if (city === 'LIMEIRA') return 'SSP9';
                if (city === 'SUZANO') return 'SSP23';
                if (city === 'GUARULHOS') return 'SSP30';
                if (city === 'COTIA') return 'SSP34';
                if (city === 'LORENA') return 'SSP39';
                if (city === 'CAÇAPAVA' || city === 'CACAPAVA') return 'SSP8';
                if (city === 'ARAÇATUBA' || city === 'ARACATUBA') return 'SSP10';
                if (city === 'SÃO JOSÉ DO RIO PRETO' || city === 'SAO JOSE DO RIO PRETO') return 'SSP12';
                if (city === 'SÃO CARLOS' || city === 'SAO CARLOS') return 'SSP22';
                if (city === 'FRANCA') return 'SSP26';
                if (city === 'ITAPETININGA') return 'SSP27';
                if (city === 'JALES') return 'SSP28';
                if (city === 'BARRETOS') return 'SSP31';
                if (city === 'CRAVINHOS') return 'SSP4';
                if (city === 'ZONA NORTE') return 'SSP40';
                if (city === 'ZONA OESTE') return 'SSP7';
                
                // Fallback for SFC1 if city is not matching/empty
                if (s === 'SFC1' || s.startsWith('SFC1')) return 'SSP38';
              }
              return s;
            })(),
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

  // Verify lock row in Supabase daily_reports
  try {
    const { data: lockRow, error: lockError } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('date', targetDate)
      .eq('svc_id', 'SYSTEM_NOTIFICATION_LOCK')
      .limit(1);

    if (lockRow && lockRow.length > 0) {
      console.log(`[Alerta WhatsApp] Relatório de preenchimento para ${targetDate} já foi enviado anteriormente (travado no banco).`);
      return;
    }
  } catch (err) {
    console.error(`[Alerta WhatsApp] Erro ao verificar trava no Supabase:`, err.message);
  }

  if (notifiedDates.includes(targetDate)) {
    console.log(`[Alerta WhatsApp] Data ${targetDate} já notificada anteriormente (travado no arquivo local).`);
    return;
  }

  console.log(`[Alerta WhatsApp] Verificando preenchimento para a data: ${targetDate}...`);

  // 1. Fetch expected SVCs (SVCs with active vehicles having operation 'Mercado Livre')
  const { data: mlVehicles, error: mlVehError } = await supabase
    .from('vehicles')
    .select('plate, svc_id')
    .eq('active', true)
    .eq('operation', 'Mercado Livre');

  if (mlVehError) {
    console.error("Erro ao buscar veículos Mercado Livre no Supabase:", mlVehError.message);
    return;
  }

  const activeMlVehicles = (mlVehicles || []).filter(v => isVehicleActiveOnDate(v.plate, targetDate));

  const expectedSvcIds = Array.from(
    new Set(
      activeMlVehicles.map(v => {
        if (v.svc_id === 'SSP49' || v.svc_id === 'SSP57') return 'SSP40';
        return v.svc_id;
      })
    )
  ).filter(id => id && id !== 'FIRST MILE');
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

  // Send standalone Preenchimento Concluído message to VITE_WHATSAPP_DEFAULT_RECIPIENT (general group)
  const defaultRecipient = process.env.VITE_WHATSAPP_DEFAULT_RECIPIENT || '120363400557269347@g.us';
  const defaultOpts = {
    url: process.env.VITE_EVOLUTION_API_URL,
    key: process.env.VITE_EVOLUTION_API_KEY,
    instance: process.env.VITE_EVOLUTION_INSTANCE,
    recipient: defaultRecipient
  };

  if (defaultOpts.url && defaultOpts.key && defaultOpts.instance && defaultOpts.recipient) {
    const dateFormatted = targetDate.split('-').reverse().join('/');
    const completionMsg = `✅ *Preenchimento Concluído!* Todos os dispatchers responderam aos relatórios para a data ${dateFormatted}.`;
    console.log(`[Alerta WhatsApp] Enviando confirmação de conclusão para o grupo geral ${defaultOpts.recipient}...`);
    try {
      let number = defaultOpts.recipient.trim();
      if (!number.includes('@')) {
        number = number.replace(/\D/g, '');
      }

      const res = await fetch(`${defaultOpts.url}/message/sendText/${defaultOpts.instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': defaultOpts.key
        },
        body: JSON.stringify({
          number: number,
          text: completionMsg,
          delay: 1200,
          linkPreview: true
        })
      });

      if (res.ok) {
        console.log(`[Alerta WhatsApp] Confirmação de conclusão enviada com sucesso no grupo geral.`);
      } else {
        const errText = await res.text();
        console.error(`[Alerta WhatsApp] Erro ao enviar confirmação no grupo geral (status ${res.status}):`, errText);
      }
    } catch (err) {
      console.error(`[Alerta WhatsApp] Falha ao enviar confirmação no grupo geral:`, err.message);
    }
  }

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

  // Filter fixed vehicles that are in our expected SVCs, excluding XPT since we have no vision of their routes
  const relevantVehicles = fixedVehicles
    .map(v => {
      if (v.svc_id === 'SSP49' || v.svc_id === 'SSP57') {
        return { ...v, svc_id: 'SSP40' };
      }
      return v;
    })
    .filter(v => expectedSvcIds.includes(v.svc_id) && v.svc_id !== 'XPT' && isVehicleActiveOnDate(v.plate, targetDate));

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
  
  // Helper para extrair a placa do carro reserva a partir da justificativa
  function extractReservePlate(justificationStr, originalPlate) {
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
  }

  // 1. Check all relevant fixed vehicles (excluding XPT)
  for (const vehicle of relevantVehicles) {
    if (vehicle.svc_id === 'XPT') continue; // safeguard

    const hasRoute = routedPlates.has(vehicle.plate);
    const justification = justificationsMap[vehicle.plate];

    if (!hasRoute) {
      // Did not run on original plate
      if (justification) {
        const justUpper = justification.toUpperCase();
        
        if (justUpper.includes('RODOU')) {
          // Error: Marked as RODOU but did not run
          errors.push({ plate: vehicle.plate, svc: vehicle.svc_id, reason: justification });
        } else if (justUpper.includes('CARRO RESERVA') || justUpper.includes('RESERVA')) {
          const reservePlate = extractReservePlate(justification, vehicle.plate);
          if (reservePlate) {
            const reserveHasRoute = routedPlates.has(reservePlate);
            if (!reserveHasRoute) {
              // Reserve car plate did NOT have a route in system -> ERROR
              errors.push({
                plate: vehicle.plate,
                svc: vehicle.svc_id,
                reason: `Carro reserva (${reservePlate}) não teve rota identificada no sistema`
              });
            } else {
              console.log(`[Alerta WhatsApp] Veículo ${vehicle.plate} (Carro Reserva). Rota da placa reserva ${reservePlate} CONFIRMADA com sucesso! (Válido)`);
            }
          } else {
            // Reserve plate not provided -> ERROR
            errors.push({
              plate: vehicle.plate,
              svc: vehicle.svc_id,
              reason: 'Carro reserva sem placa do reserva informada'
            });
          }
        }
      } else {
        // Error: No justification filled
        errors.push({ plate: vehicle.plate, svc: vehicle.svc_id, reason: 'Sem justificativa preenchida' });
      }
    }
  }

  // 2. Check Próprio (third-party) vehicles that were justified in reports as RODOU but had no route
  const fixedPlatesSet = new Set(relevantVehicles.map(v => v.plate));
  for (const plate of Object.keys(justificationsMap)) {
    if (fixedPlatesSet.has(plate)) continue; // already checked as fixed vehicle

    // Find which report/SVC this plate belongs to
    const rep = reports.find(r => r.justifications && r.justifications.includes(plate));
    const svcId = rep ? rep.svc_id : '';
    if (!svcId || svcId === 'XPT' || !expectedSvcIds.includes(svcId)) continue; // skip XPT or irrelevant

    const hasRoute = routedPlates.has(plate);
    const justification = justificationsMap[plate];

    if (!hasRoute && justification && justification.toUpperCase().includes('RODOU')) {
      errors.push({ plate, svc: svcId, reason: justification });
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
      "Regional 2": ["SSP34", "FIRST MILE", "SSP23", "SSP30", "SSP39", "SSP40", "SSP7", "SSP8", "SSP18", "SSP25"],
      "Regional 3": ["SSP10", "SSP12", "SSP22", "SSP26", "SSP28", "SSP31", "SSP4"]
    };

    const dateFormatted = targetDate.split('-').reverse().join('/');
    let msg = `⚠️ *Atenção: Divergências de Preenchimento - ${dateFormatted}*\n\n`;
    msg += `As placas abaixo estão justificadas como "RODOU", mas não tiveram rotas identificadas no sistema, ou estão sem justificativa preenchida:\n\n`;

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
      recipient: process.env.VITE_WHATSAPP_ERRORS_RECIPIENT || '120363284501155529@g.us'
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
          // Save to notified dates (Supabase lock row)
          await supabase
            .from('daily_reports')
            .insert({
              date: targetDate,
              svc_id: 'SYSTEM_NOTIFICATION_LOCK',
              acceptance_type: 'SYSTEM_LOCK',
              justifications: 'SENT'
            });
          console.log(`[Alerta WhatsApp] Trava de notificação salva no Supabase para ${targetDate}.`);

          // Save locally as fallback
          notifiedDates.push(targetDate);
          try {
            fs.writeFileSync(notifiedFilePath, JSON.stringify(notifiedDates, null, 2));
          } catch {}
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
    console.log(`[Alerta WhatsApp] Nenhum erro de preenchimento encontrado para ${targetDate}. Verificando veículos sem driver...`);
    
    // Find all vehicles justified as "sem driver"
    const semDriverPlates = [];
    for (const plate of Object.keys(justificationsMap)) {
      const justification = justificationsMap[plate];
      if (justification && justification.toLowerCase().includes('sem driver')) {
        // Find which SVC this report belongs to
        const rep = reports.find(r => r.justifications && r.justifications.includes(plate));
        const svcId = rep ? rep.svc_id : '';
        if (svcId && expectedSvcIds.includes(svcId) && svcId !== 'XPT') {
          semDriverPlates.push({ plate, svc: svcId, reason: justification });
        }
      }
    }

    console.log(`[Alerta WhatsApp] Encontrados ${semDriverPlates.length} veículos sem driver.`);

    const dateFormatted = targetDate.split('-').reverse().join('/');

    if (semDriverPlates.length > 0) {
      // Fetch SVC names
      const { data: svcs, error: svcsError } = await supabase
        .from('service_centers')
        .select('id, name');

      const svcNamesMap = {};
      if (!svcsError && svcs) {
        svcs.forEach(s => { svcNamesMap[s.id] = s.name; });
      }

      // Group by SVC
      const semDriverBySvc = {};
      semDriverPlates.forEach(e => {
        if (!semDriverBySvc[e.svc]) {
          semDriverBySvc[e.svc] = { svcName: svcNamesMap[e.svc] || e.svc, plates: [] };
        }
        semDriverBySvc[e.svc].plates.push(e);
      });

      // Regionals mapping
      const MAPEAMENTO_REGIONAIS = {
        "Regional 1": ["SSP20", "SSP27", "SSP36", "XPT", "SSP3", "SSP37", "SSP38", "SSP9", "SSP29"],
        "Regional 2": ["SSP34", "FIRST MILE", "SSP23", "SSP30", "SSP39", "SSP40", "SSP7", "SSP8", "SSP18", "SSP25"],
        "Regional 3": ["SSP10", "SSP12", "SSP22", "SSP26", "SSP28", "SSP31", "SSP4"]
      };

      let msg = `🚗 *Veículos Sem Driver - ${dateFormatted}*\n\n`;
      msg += `Todos os relatórios foram preenchidos sem divergências! Segue a lista de veículos parados por motivo de "Sem Driver":\n\n`;

      const byRegional = {};
      Object.keys(semDriverBySvc).forEach(svcId => {
        const reg = Object.keys(MAPEAMENTO_REGIONAIS).find(k => MAPEAMENTO_REGIONAIS[k].includes(svcId)) || 'Outras Regionais';
        if (!byRegional[reg]) byRegional[reg] = [];
        byRegional[reg].push(svcId);
      });

      Object.keys(byRegional).sort().forEach(reg => {
        msg += `*${reg}*\n`;
        byRegional[reg].forEach(svcId => {
          const group = semDriverBySvc[svcId];
          msg += `  ${group.svcName}\n`;
          group.plates.forEach(p => {
            msg += `    • *${p.plate}* (${p.reason})\n`;
          });
        });
        msg += '\n';
      });

      const semDriverRecipient = process.env.VITE_WHATSAPP_SEM_DRIVER_RECIPIENT || '5515996813326';
      
      const apiOpts = {
        url: process.env.VITE_EVOLUTION_API_URL,
        key: process.env.VITE_EVOLUTION_API_KEY,
        instance: process.env.VITE_EVOLUTION_INSTANCE,
        recipient: semDriverRecipient
      };

      if (apiOpts.url && apiOpts.key && apiOpts.instance && apiOpts.recipient) {
        console.log(`[Alerta WhatsApp] Enviando lista de sem driver para ${apiOpts.recipient}...`);
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
            console.log(`[Alerta WhatsApp] Lista de sem driver enviada com sucesso.`);
          } else {
            const errText = await res.text();
            console.error(`[Alerta WhatsApp] Erro no envio de sem driver (status ${res.status}):`, errText);
          }
        } catch (sendErr) {
          console.error(`[Alerta WhatsApp] Falha na requisição da Evolution API (sem driver):`, sendErr.message);
        }
      }
    } else {
      // errors.length === 0 AND semDriverPlates.length === 0
      // Send a simple completion message to the group
      const errorsRecipient = process.env.VITE_WHATSAPP_ERRORS_RECIPIENT || '120363333587397484@g.us';
      const apiOpts = {
        url: process.env.VITE_EVOLUTION_API_URL,
        key: process.env.VITE_EVOLUTION_API_KEY,
        instance: process.env.VITE_EVOLUTION_INSTANCE,
        recipient: errorsRecipient
      };

      if (apiOpts.url && apiOpts.key && apiOpts.instance && apiOpts.recipient) {
        const cleanMsg = `✅ *Preenchimento Concluído!* Todos os dispatchers responderam aos relatórios para a data ${dateFormatted} sem nenhuma divergência ou ocorrência de Sem Driver.`;
        console.log(`[Alerta WhatsApp] Enviando confirmação de conclusão limpa para o grupo ${apiOpts.recipient}...`);
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
              text: cleanMsg,
              delay: 1200,
              linkPreview: true
            })
          });

          if (res.ok) {
            console.log(`[Alerta WhatsApp] Mensagem de conclusão limpa enviada com sucesso.`);
          } else {
            const errText = await res.text();
            console.error(`[Alerta WhatsApp] Erro no envio de conclusão limpa (status ${res.status}):`, errText);
          }
        } catch (sendErr) {
          console.error(`[Alerta WhatsApp] Falha na requisição da Evolution API (conclusão limpa):`, sendErr.message);
        }
      }
    }

    // Save to notified dates (Supabase lock row)
    await supabase
      .from('daily_reports')
      .insert({
        date: targetDate,
        svc_id: 'SYSTEM_NOTIFICATION_LOCK',
        acceptance_type: 'SYSTEM_LOCK',
        justifications: 'SENT'
      });
    console.log(`[Alerta WhatsApp] Trava de notificação salva no Supabase para ${targetDate}.`);

    // Save locally as fallback
    notifiedDates.push(targetDate);
    try {
      fs.writeFileSync(notifiedFilePath, JSON.stringify(notifiedDates, null, 2));
    } catch {}
  }
}

// Function: Calculate regional & critical SVC metrics and send corte summary to WhatsApp group
async function checkAndSendCorteSummary(targetDate, forceSend = false) {
  const corteNotifiedFile = path.join(process.cwd(), 'whatsapp_corte_notified.json');
  let notifiedKeys = [];
  try {
    if (fs.existsSync(corteNotifiedFile)) {
      notifiedKeys = JSON.parse(fs.readFileSync(corteNotifiedFile, 'utf8'));
    }
  } catch (e) {
    console.error("Erro ao ler whatsapp_corte_notified.json:", e);
  }

  const currentHour = new Date().getHours();
  const corteKey = `${targetDate}_06:00`;

  // Trigger if forceSend is true OR currentHour is >= 6 and key not sent yet
  const isTimeForCorte = forceSend || (currentHour >= 6 && !notifiedKeys.includes(corteKey));

  if (!isTimeForCorte) {
    console.log(`[Corte 06:00 WhatsApp] Fora do horário de corte das 06:00 ou já notificado hoje (${corteKey}). Pulando.`);
    return;
  }

  if (notifiedKeys.includes(corteKey) && !forceSend) {
    console.log(`[Corte 06:00 WhatsApp] Resumo de corte ${corteKey} já enviado hoje. Pulando.`);
    return;
  }

  console.log(`[Corte 06:00 WhatsApp] Gerando e enviando resumo por regional para ${targetDate}...`);

  const groupRecipient = process.env.VITE_WHATSAPP_GROUP_RECIPIENT || '120363284501155529@g.us';

  const MAPEAMENTO_REGIONAIS = {
    "Regional 1": ["SSP20", "SSP27", "SSP36", "XPT", "SSP3", "SSP37", "SSP38", "SSP9", "SSP29"],
    "Regional 2": ["SSP34", "FIRST MILE", "SSP23", "SSP30", "SSP39", "SSP40", "SSP7", "SSP8", "SSP18", "SSP25"],
    "Regional 3": ["SSP10", "SSP12", "SSP22", "SSP26", "SSP28", "SSP31", "SSP4"]
  };

  const { data: svcs } = await supabase.from('service_centers').select('id, name');
  const svcNamesMap = {};
  if (svcs) svcs.forEach(s => { svcNamesMap[s.id] = s.name; });

  const { data: rawVehicles, error: vehErr } = await supabase
    .from('vehicles')
    .select('plate, fleet_type, svc_id')
    .eq('active', true);

  if (vehErr) {
    console.error("[Corte 06:00 WhatsApp] Erro ao buscar veículos:", vehErr.message);
    return;
  }

  const vehicles = (rawVehicles || [])
    .map(v => {
      if (v.svc_id === 'SSP49' || v.svc_id === 'SSP57') {
        return { ...v, svc_id: 'SSP40' };
      }
      return v;
    })
    .filter(v => isVehicleActiveOnDate(v.plate, targetDate));

  const { data: routes, error: rErr } = await supabase
    .from('daily_routes')
    .select('plate, route_id, svc_id, xpt')
    .eq('date', targetDate);

  if (rErr) {
    console.error("[Corte 06:00 WhatsApp] Erro ao buscar rotas:", rErr.message);
    return;
  }

  const uniqueRoutePlates = new Set((routes || []).map(r => r.plate));

  const svcData = {};

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
  const corteTimeStr = "06:00";

  let msg = `📊 *RESUMO DE CARREGAMENTO POR REGIONAL*\n`;
  msg += `📅 *Data:* ${dateFormatted} | ⏰ *Corte:* ${corteTimeStr}\n\n`;

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

  const apiOpts = {
    url: process.env.VITE_EVOLUTION_API_URL,
    key: process.env.VITE_EVOLUTION_API_KEY,
    instance: process.env.VITE_EVOLUTION_INSTANCE
  };

  if (apiOpts.url && apiOpts.key && apiOpts.instance && groupRecipient) {
    console.log(`[Corte 06:00 WhatsApp] Enviando mensagem de corte para ${groupRecipient}...`);
    try {
      const res = await fetch(`${apiOpts.url}/message/sendText/${apiOpts.instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiOpts.key
        },
        body: JSON.stringify({
          number: groupRecipient,
          text: msg,
          delay: 1200,
          linkPreview: false
        })
      });

      if (res.ok) {
        console.log(`[Corte 06:00 WhatsApp] Resumo enviado com sucesso para ${groupRecipient}.`);
        if (!notifiedKeys.includes(corteKey)) {
          notifiedKeys.push(corteKey);
          fs.writeFileSync(corteNotifiedFile, JSON.stringify(notifiedKeys, null, 2));
        }
      } else {
        const errText = await res.text();
        console.error(`[Corte 06:00 WhatsApp] Erro ao enviar (status ${res.status}):`, errText);
      }
    } catch (err) {
      console.error(`[Corte 06:00 WhatsApp] Exceção ao enviar:`, err.message);
    }
  } else {
    console.warn(`[Corte 06:00 WhatsApp] Credenciais de Evolution API ausentes no .env.`);
  }
}

run();

