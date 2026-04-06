import { supabase } from './services/supabaseClient';

async function run() {
  const { data, error } = await supabase
    .from('daily_routes')
    .select('*')
    .eq('plate', 'SDQ2A80')
    .order('date', { ascending: false });
  
  if (error) {
     console.error("DB error:", error);
  } else {
     console.log("Routes for SDQ2A80:", JSON.stringify(data, null, 2));
  }
}

run();
