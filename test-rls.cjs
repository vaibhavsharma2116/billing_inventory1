const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data, error } = await supabase.from('user_roles').select('*');
  console.log('Roles length with RLS:', data?.length, error);
}
run();
