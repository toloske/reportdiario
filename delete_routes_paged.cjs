const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://sdhlbavsoycahkwtfbnv.supabase.co', 'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K');

async function run() {
  console.log("Fetching all route IDs to delete in batches...");
  let deletedCount = 0;
  
  while (true) {
      const { data, error } = await supabase.from('daily_routes')
        .select('route_id')
        .limit(1000);
        
      if (error) {
         console.error("Error fetching:", error);
         break;
      }
      
      if (!data || data.length === 0) {
         console.log("No more routes to delete!");
         break;
      }
      
      const ids = data.map(v => v.route_id);
      console.log(`Deleting batch of ${ids.length} routes...`);
      
      const { error: delError } = await supabase.from('daily_routes')
        .delete()
        .in('route_id', ids);
        
      if (delError) {
         console.error("Error deleting:", delError);
         break;
      }
      
      deletedCount += ids.length;
      console.log(`Deleted ${deletedCount} rows so far...`);
  }
}
run();
