import { supabase } from './services/supabaseClient';

async function run() {
  console.log("Fetching 1 report...");
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, justifications')
    .limit(1);

  console.log("FETCHED:", data, error);

  if (data && data.length > 0) {
     const id = data[0].id;
     console.log("TRYING TO UPDATE:", id);
     const { data: updateData, error: updateError } = await supabase.from('daily_reports').update({ justifications: data[0].justifications + " test" }).eq('id', id);
     console.log("UPDATE RES (no select):", updateData, updateError);
     
     const { data: updateData2, error: updateError2 } = await supabase.from('daily_reports').update({ justifications: data[0].justifications }).eq('id', id).select().single();
     console.log("UPDATE RES (with select):", updateData2, updateError2);
  }
}

run();
