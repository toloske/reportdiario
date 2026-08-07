import fs from 'fs';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sdhlbavsoycahkwtfbnv.supabase.co',
  'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
);

async function run() {
  console.log("Reading CSV with PapaParse...");
  const fileContent = fs.readFileSync('../rotas irisys.csv', 'utf8');

  // Let's parse it entirely
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  const payloadToInsert = [];
  
  for (const row of result.data) {
    const rawRouteId = row['IdRota'];
    const rawPlate = row['Placa'];
    const rawDate = row['Data'];

    if (rawRouteId && typeof rawRouteId === 'string' && rawPlate) {
      const cleanedPlate = rawPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (cleanedPlate.length > 4) {
          let formattedDate = rawDate;
          if (rawDate && rawDate.includes('/')) {
             const parts = rawDate.split('/');
             if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }

          payloadToInsert.push({
             route_id: rawRouteId.trim(),
             date: formattedDate,
             plate: cleanedPlate.trim(),
             driver_id: (row['ID Motorista (Irisys)'] || '').trim(),
             vehicle_type: (row['Tipo Veiculo'] || '').trim(),
             svc_id: (() => {
                  const s = (row['SVC'] || '').trim();
                  if (s === 'SSP49' || s === 'SSP57') return 'SSP40';
                  if (s.startsWith('SFC')) {
                     const city = (row['Cidade Base'] || row['Regional'] || '').toUpperCase().trim();
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
                     if (s === 'SFC1' || s.startsWith('SFC1')) return 'SSP38';
                  }
                  return s;
              })(),
             xpt: (row['XPT'] || '').trim(),
             mlp: (row['Tipo'] || '').trim(),
             regional: (row['Cidade Base'] || '').trim(),
             canal: '', // Doesn't seem mapped
             ciclo: (row['Ciclo'] || '').trim(),
             cluster: (row['Cluster'] || '').trim(),
             id_veiculo: '',
             hora_inicio: (row['Início'] || '').trim(),
             hora_fim: (row['Últ. Ent.'] || '').trim(),
             orh_plan: (row['ORH'] || '').trim(),
             orh_hours: '',
             km_plan: (row['Km APP'] || '').trim(),
             km_real: (row['Km Meli'] || '').trim(),
             stem_out: (row['Stem Out'] || '').trim(),
             parada: (row['Parada'] || '').trim(),
             pacotes_total: (row['Pacotes'] || '').trim(),
             pacotes_entregues: (row['Entreg.'] || '').trim(),
             insucessos: (row['Insuc.'] || '').trim(),
             ds: (row['DS'] || '').trim()
          });
      }
    }
  }
  
  console.log(`Parsed ${payloadToInsert.length} routes. Uploading backwards to bypass existing!`);
  
  payloadToInsert.reverse();
  
  const BATCH_SIZE = 1000;
  for (let i = 0; i < payloadToInsert.length; i += BATCH_SIZE) {
    const chunk = payloadToInsert.slice(i, i + BATCH_SIZE);
    console.log(`Uploading chunk ${i} to ${i + chunk.length}...`);
    const { error } = await supabase.from('daily_routes').upsert(chunk, { onConflict: 'route_id' });
    if (error) {
       console.error("Error at chunk", i, error.message);
    }
  }
  
  console.log("SUCCESS!");
}

run();
