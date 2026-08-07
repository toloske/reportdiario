import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sdhlbavsoycahkwtfbnv.supabase.co',
  'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
);

async function run() {
  const { data, error } = await supabase
    .from('service_centers')
    .select('*')
    .eq('id', 'SSP40');
    
  if (error) {
    console.error("Error fetching SSP40:", error);
    return;
  }
  
  console.log("SSP40 record currently in DB:", data);
}

run();
