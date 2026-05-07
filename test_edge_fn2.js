async function test() {
  const res = await fetch('https://sdhlbavsoycahkwtfbnv.supabase.co/functions/v1/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
    },
    body: JSON.stringify({
      to: ['hitalo.correa@transmana.com.br'], 
      subject: 'Test', 
      body: '<p>Test</p>', 
      attachments: [] 
    })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}
test();
