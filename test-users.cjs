require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.auth.admin.listUsers({ page: 1, perPage: 200 })
  .then(res => {
    console.log("Found users:", res.data.users.length);
    if (res.error) console.error("Error:", res.error);
  })
  .catch(console.error);
