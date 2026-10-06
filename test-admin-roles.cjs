const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data: roles, error } = await supabase.from('user_roles').select('*').in('role', ['admin', 'super_admin', 'hr']);
  console.log('Roles:', roles);
  console.log('Error:', error);
}
run();
