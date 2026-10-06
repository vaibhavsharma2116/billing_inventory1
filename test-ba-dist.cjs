const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data } = await supabase.from('profiles').select('id, full_name, distributor_id, csa_id, retailer_id').ilike('full_name', '%mamata talele%');
  console.log(data);
}
run();
