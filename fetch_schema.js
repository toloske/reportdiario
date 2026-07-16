async function run() {
  const url = 'https://sdhlbavsoycahkwtfbnv.supabase.co/rest/v1/';
  const headers = {
    'apikey': 'sb_publishable_RcZs4mOqLKdlPBDp_fW_5w_Wcn04n1K'
  };

  try {
    const res = await fetch(url, { headers });
    const schema = await res.json();
    console.log("Schema content:", schema);
  } catch (e) {
    console.error("Error fetching schema:", e);
  }
}

run();
