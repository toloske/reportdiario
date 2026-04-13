const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://sdhlbavsoycahkwtfbnv.supabase.co', 'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K');

async function deleteRecords() {
    console.log("Attempting to delete daily_routes...");
    const { error } = await supabase.from('daily_routes').delete().neq('route_id', 'something_dummy');
    if (error) {
        console.error("Failed to delete:", error);
    } else {
        console.log("Delete successful!");
    }
}
deleteRecords();
