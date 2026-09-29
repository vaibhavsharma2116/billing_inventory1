import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim().replace(/^"|"$/g, '');
});

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
  const { data: users, error: err1 } = await sb.auth.admin.listUsers();
  if (err1) { console.error(err1); return; }
  const uid = users.users[0].id; // just testing with the first user, or wait...
  const { data: roles } = await sb.from("user_roles").select("*").eq("role", "super_admin").limit(1);
  if (roles && roles.length) {
    const adminId = roles[0].user_id;
    console.log("Found admin user:", adminId);
    const { data, error } = await sb.rpc('has_role', { _user_id: adminId, _role: 'super_admin' });
    console.log("has_role result:", data, error);
  }
}
test();
