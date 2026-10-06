const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);

async function run() {
  const baNames = ['swapnali', 'vanita', 'mehwish', 'pooja kalantari', 'mohit gupta', 'mamta talele', 'mamata talele'];
  
  const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, designation');
  if (error) {
    console.error(error);
    return;
  }

  for (const p of profiles) {
    const name = p.full_name?.toLowerCase() || '';
    const isBA = baNames.some(b => name.includes(b));
    const isNavnath = name.includes('navnath borse');

    if (isBA) {
      await supabase.from('profiles').update({ designation: 'Beauty Advisor (BA)' }).eq('id', p.id);
      await supabase.from('employee_details').upsert({ user_id: p.id, designation: 'Beauty Advisor (BA)' }, { onConflict: 'user_id' });
      console.log(`Updated BA: ${p.full_name}`);
    } else if (isNavnath) {
      await supabase.from('profiles').update({ designation: 'Field Salesman' }).eq('id', p.id);
      await supabase.from('employee_details').upsert({ user_id: p.id, designation: 'Field Salesman' }, { onConflict: 'user_id' });
      console.log(`Updated Salesman: ${p.full_name}`);
    }
  }
  
  console.log('Update complete!');
}

run();
