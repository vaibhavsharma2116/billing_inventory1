const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data } = await supabase.from('profiles').select('id, full_name, designation').ilike('full_name', '%reliable%');
  console.log('Reliable Profile:', data);
  if(data && data.length) {
    const { data: roles } = await supabase.from('user_roles').select('*').eq('user_id', data[0].id);
    console.log('Roles for Reliable:', roles);
  }
}
run();
