const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, designation, reports_to');
  if (error) {
    console.error(error);
    return;
  }
  const chaitalee = profiles.find(p => p.full_name?.toLowerCase().includes('chaitalee'));
  if (!chaitalee) return console.log('Chaitalee not found');
  console.log('Chaitalee ID:', chaitalee.id);
  
  const team = profiles.filter(p => p.reports_to === chaitalee.id);
  console.log('Direct Team mapped via reports_to:', team.map(t => ({ name: t.full_name, designation: t.designation })));
}
run();
