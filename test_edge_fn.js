import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sdhlbavsoycahkwtfbnv.supabase.co';
const supabaseKey = 'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'; // using key from earlier grep
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { 
      to: ['hitalo.correa@transmana.com.br'], 
      subject: 'Test', 
      body: '<p>Test</p>', 
      attachments: [] 
    }
  });

  if (error) {
    console.error("Error calling edge function:", error);
  } else {
    console.log("Success:", data);
  }
}
test();
