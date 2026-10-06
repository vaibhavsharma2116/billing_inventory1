const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, designation, reports_to');
  const mahir = profiles.filter(p => p.full_name?.toLowerCase().includes('mahir'));
  console.log('Mahir:', mahir);
  const shubham = profiles.filter(p => p.full_name?.toLowerCase().includes('shubham kapure'));
  console.log('Shubham Kapure:', shubham);
}
run();
