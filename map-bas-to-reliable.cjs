const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);

async function run() {
  const baNames = ['swapnali', 'vanita', 'mehwish', 'pooja kalantari', 'mohit gupta', 'mamta talele', 'mamata talele'];
  const reliableDistId = 'd5c187eb-d414-44b4-af2c-ba3e24f57b15';
  
  const { data: profiles, error } = await supabase.from('profiles').select('id, full_name');
  if (error) {
    console.error(error);
    return;
  }

  for (const p of profiles) {
    const name = p.full_name?.toLowerCase() || '';
    const isBA = baNames.some(b => name.includes(b));

    if (isBA) {
      await supabase.from('profiles').update({ distributor_id: reliableDistId }).eq('id', p.id);
      console.log(`Mapped BA to Reliable: ${p.full_name}`);
    }
  }
  
  console.log('Mapping complete!');
}

run();
