import { supabase } from './services/supabaseClient.js';

async function run() {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, justifications')
    .limit(1);

  console.log("FETCHED:", data, error);

  if (data && data.length > 0) {
     const id = data[0].id;
     console.log("TRYING TO UPDATE:", id);
     const res = await supabase.from('daily_reports').update({ justifications: data[0].justifications + " test" }).eq('id', id).select('*');
     console.log("UPDATE RES:", res);
  }
}

run();
