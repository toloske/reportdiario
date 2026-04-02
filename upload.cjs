const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sdhlbavsoycahkwtfbnv.supabase.co',
  'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
);

async function run() {
  console.log("Reading CSV...");
  const rl = readline.createInterface({ input: fs.createReadStream('../rotas.csv'), crlfDelay: Infinity });
  
  const payloadToInsert = [];
  let count = 0;
  
  for await (const line of rl) {
    if (count === 0) { count++; continue; }
    const row = line.split(';');
    if (row.length < 13) continue;

    const rawRouteId = row[5];
    const rawPlate = row[11];
    
    if (rawRouteId && typeof rawRouteId === 'string' && rawPlate) {
      const cleanedPlate = rawPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (cleanedPlate.length > 4) {
          const rawDate = row[0];
          let formattedDate = rawDate;
          if (rawDate && rawDate.includes('/')) {
             const parts = rawDate.split('/');
             if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }

          payloadToInsert.push({
             route_id: rawRouteId.trim(),
             date: formattedDate,
             plate: cleanedPlate.trim(),
             driver_id: (row[9] || '').trim(),
             vehicle_type: (row[12] || '').trim(),
             svc_id: (row[3] || '').trim(),
             xpt: (row[4] || '').trim(),
             mlp: (row[1] || '').trim(),
             regional: (row[2] || '').trim(),
             canal: (row[6] || '').trim(),
             ciclo: (row[7] || '').trim(),
             cluster: (row[8] || '').trim(),
             id_veiculo: (row[10] || '').trim(),
             hora_inicio: (row[13] || '').trim(),
             hora_fim: (row[14] || '').trim(),
             orh_plan: (row[15] || '').trim(),
             orh_hours: (row[16] || '').trim(),
             km_plan: (row[17] || '').trim(),
             km_real: (row[18] || '').trim(),
             stem_out: (row[19] || '').trim(),
             parada: (row[20] || '').trim(),
             pacotes_total: (row[21] || '').trim(),
             pacotes_entregues: (row[22] || '').trim(),
             insucessos: (row[23] || '').trim(),
             ds: (row[24] || '').trim()
          });
      }
    }
    count++;
  }
  
  console.log(`Parsed ${payloadToInsert.length} routes. Uploading backwards to bypass existing!`);
  
  // To avoid timeouts on what's already uploaded, we start pushing from the end!
  payloadToInsert.reverse();
  
  const BATCH_SIZE = 4000;
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
