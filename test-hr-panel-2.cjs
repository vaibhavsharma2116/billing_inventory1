const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);
async function run() {
  const { data: profs } = await supabase.from('profiles').select('id, full_name, designation');
  const { data: roles } = await supabase.from('user_roles').select('*');
  
  const partyIds = new Set(
    (roles ?? [])
      .filter((r) => ["distributor", "csa", "depot"].includes(r.role))
      .map((r) => r.user_id)
  );
  
  const filtered = profs.filter((p) => !partyIds.has(p.id));
  
  console.log('Total people showing in HR panel:', filtered.length);
  for (const f of filtered) {
    if (f.full_name.toLowerCase().includes('mahir') || f.full_name.toLowerCase().includes('reliable')) {
        console.log('YES THEY ARE SHOWING:', f.full_name, f.designation);
    }
  }
}
run();
