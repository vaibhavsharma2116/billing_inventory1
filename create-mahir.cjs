const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)[1];
const supabase = createClient(url, key);

async function run() {
  const chaitaleeId = 'cdd5a1d0-4684-410e-bda6-b1fb4279889e';
  const mahirDistId = '42eee2a7-9d9b-4b26-ae29-78bbac3ba146';
  const email = 'mahir.enterprises007@gmail.com';
  const phone = '8788181388';
  const name = 'Mahir Enterprises';
  
  // Create user in auth
  let { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
  });

  if (authError && authError.message.includes('already exists')) {
    console.log('User already exists in auth, finding ID...');
    // Fetch users via admin list
    const { data: usersData } = await supabase.auth.admin.listUsers();
    authData = { user: usersData.users.find(u => u.email === email) };
  } else if (authError) {
    console.error('Auth Error:', authError);
    return;
  }
  
  const userId = authData.user.id;
  console.log('User ID:', userId);

  // Update profile
  const { error: profError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: name,
    phone,
    designation: 'Distributor',
    distributor_id: mahirDistId,
    reports_to: chaitaleeId
  });
  if (profError) console.error('Profile Error:', profError);

  // Update roles
  const { error: roleError } = await supabase.from('user_roles').upsert({
    user_id: userId,
    role: 'distributor'
  });
  if (roleError) console.error('Role Error:', roleError);

  console.log('Mahir Enterprises created and mapped successfully!');
}

run();
