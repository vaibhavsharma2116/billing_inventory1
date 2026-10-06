const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data: profs } = await supabase.from('profiles').select('id, full_name');
  
  const { data: roles } = await supabase.from('user_roles').select('*');
  
  // Find profiles that are NOT in roles as distributor/csa/depot but maybe they are named like one
  const distRoleUserIds = new Set(roles.filter(r => ['distributor', 'csa', 'depot'].includes(r.role)).map(r => r.user_id));
  
  const suspects = profs.filter(p => !distRoleUserIds.has(p.id) && (p.full_name.toLowerCase().includes('enterprise') || p.full_name.toLowerCase().includes('agency') || p.full_name.toLowerCase().includes('trading') || p.full_name.toLowerCase().includes('trader') || p.full_name.toLowerCase().includes('ent')));
  
  console.log('Suspects (Should be distributors but missing role):', suspects.map(s => s.full_name));
}
run();
