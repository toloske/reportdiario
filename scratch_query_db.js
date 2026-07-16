import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sdhlbavsoycahkwtfbnv.supabase.co',
  'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
);

const rpcNames = ['exec_sql', 'run_sql', 'execute_sql', 'sql', 'query'];

async function run() {
  const sqlQuery = `
    SELECT 
      trigger_name, 
      event_manipulation, 
      event_object_table, 
      action_statement 
    FROM information_schema.triggers;
  `;

  for (const rpcName of rpcNames) {
    try {
      console.log(`Trying RPC: ${rpcName}...`);
      const { data, error } = await supabase.rpc(rpcName, { sql: sqlQuery, query: sqlQuery });
      if (error) {
        console.log(`RPC ${rpcName} error:`, error.message);
      } else {
        console.log(`RPC ${rpcName} SUCCEEDED! Result:`, data);
        process.exit(0);
      }
    } catch (e) {
      console.log(`RPC ${rpcName} exception:`, e.message);
    }
  }

  // Also, let's try querying pg_catalog via raw PostgREST HTTP RPC endpoint to see if any custom functions exist
  console.log("No common SQL RPC found.");
  process.exit(0);
}

run();
