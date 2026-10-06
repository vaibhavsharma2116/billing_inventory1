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
  
  // See what is left in filtered that looks like a company
  const companies = filtered.filter(p => p.full_name.toLowerCase().includes('enterprise') || p.full_name.toLowerCase().includes('agency') || p.full_name.toLowerCase().includes('trading') || p.full_name.toLowerCase().includes('trader') || p.full_name.toLowerCase().includes('ent') || p.designation?.toLowerCase().includes('distributor'));
  
  console.log('Companies still showing in HR Panel:', companies.map(c => `${c.full_name} (${c.designation})`));
}
run();
