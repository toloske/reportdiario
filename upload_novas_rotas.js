import fs from 'fs';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sdhlbavsoycahkwtfbnv.supabase.co',
  'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
);

async function run() {
  console.log("Reading CSV with PapaParse...");
  const fileContent = fs.readFileSync('../rotas - Export.csv', 'utf8');

  // Let's parse it entirely
  const result = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  const payloadToInsert = [];
  
  for (const row of result.data) {
    const rawRouteId = row['IdRota'] || row['Route_ID'];
    const rawPlate = row['Placa'] || row['placa'] || row['Plate'];
    const rawDateStr = row['Data'] || row['Data '] || row['Date'] || '';
    const primeiraEntrega = row['Primeira Entrega'] || row['Primeira entrega'] || row['Início'] || '';
    
    // Logic equivalent to frontend fix
    let targetDateStr = rawDateStr;
    if (primeiraEntrega) {
       const datePart = primeiraEntrega.trim().split(' ')[0];
       if (datePart.includes('/') || datePart.includes('-')) {
           targetDateStr = datePart;
       }
    }

    if (rawRouteId && typeof rawRouteId === 'string' && rawPlate) {
      const cleanedPlate = rawPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (cleanedPlate.length > 4) {
          
          let formattedDate = '';
          if (targetDateStr) {
              if (targetDateStr.includes('/')) {
                 const parts = targetDateStr.split('/');
                 if (parts.length >= 3) {
                     let month, day, year;
                     if (parts[0].length === 4) {
                         year = parts[0]; month = parts[1]; day = parts[2];
                     } else {
                         const yearSlice = parts[2].split(' ')[0];
                         year = yearSlice.length > 4 ? yearSlice.substring(0, 4) : yearSlice;
                         
                         // Default assume MM/DD/YYYY given Mercado Livre's export format
                         month = parts[0]; 
                         day = parts[1];
                     }
                     if (parseInt(month, 10) > 12) { const temp = month; month = day; day = temp; }
                     formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                 }
              } else if (targetDateStr.includes('-')) {
                 formattedDate = targetDateStr.split(' ')[0];
                 const parts = formattedDate.split('-');
                 if (parts.length === 3 && parts[2].length === 4) {
                     formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                 }
              }
          }

          if(formattedDate) {
              payloadToInsert.push({
                 route_id: rawRouteId.trim(),
                 date: formattedDate,
                 plate: cleanedPlate.trim(),
                 driver_id: (row['ID Motorista (Irisys)'] || row['Motorista'] || '').trim(),
                 vehicle_type: (row['Tipo Veiculo'] || row['Veículo'] || row['Modal'] || '').trim(),
                 svc_id: (row['SVC'] || '').trim(),
                 xpt: (row['XPT'] || '').trim(),
                 mlp: (row['Tipo'] || row['MLP'] || '').trim(),
                 regional: (row['Cidade Base'] || row['Regional'] || '').trim(),
                 canal: (row['Canal'] || '').trim(),
                 ciclo: (row['Ciclo'] || '').trim(),
                 cluster: (row['Cluster'] || '').trim(),
                 id_veiculo: (row['ID Veículo'] || '').trim(),
                 hora_inicio: (row['Início'] || '').trim(),
                 hora_fim: (row['Últ. Ent.'] || '').trim(),
                 orh_plan: (row['ORH'] || '').trim(),
                 orh_hours: '',
                 km_plan: (row['Km APP'] || '').trim(),
                 km_real: (row['Km Meli'] || '').trim(),
                 stem_out: (row['Stem Out'] || '').trim(),
                 parada: (row['Parada'] || '').trim(),
                 pacotes_total: (row['Pacotes'] || row['Total Pacotes'] || '').trim(),
                 pacotes_entregues: (row['Entreg.'] || '').trim(),
                 insucessos: (row['Insuc.'] || '').trim(),
                 ds: (row['DS'] || '').trim()
              });
          }
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
