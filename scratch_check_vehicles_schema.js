import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://sdhlbavsoycahkwtfbnv.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
);

async function run() {
  console.log("Querying one vehicle from Supabase...");
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .limit(1);

  if (error) {
     console.error("Error fetching vehicles schema:", error);
  } else {
     console.log("Vehicle row:", JSON.stringify(data[0], null, 2));
  }

  process.exit(0);
}

run();
