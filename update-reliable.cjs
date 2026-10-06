const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);

async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, full_name').ilike('full_name', '%reliable%');
  if (error) {
    console.error(error);
    return;
  }
  
  for (const p of profiles) {
    await supabase.from('profiles').update({ designation: 'Distributor' }).eq('id', p.id);
    await supabase.from('employee_details').upsert({ user_id: p.id, designation: 'Distributor' }, { onConflict: 'user_id' });
    console.log(`Updated Distributor: ${p.full_name}`);
  }
}
run();
