const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://anphciwmfczwlslqkhrs.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFucGhjaXdtZmN6d2xzbHFraHJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDA2MDA1NiwiZXhwIjoyMTA1NjM2MDU2fQ.nXsNMVPd2UXIGshZobShie7fSdl3uGKQ00mMxk-AnD4"
);

const data = fs.readFileSync("profiles_dump.sql", "utf-8");
const lines = data.split("\n");

let inCopy = false;
let records = [];

for (const line of lines) {
  if (line.startsWith("COPY public.profiles")) {
    inCopy = true;
    continue;
  }
  if (inCopy) {
    if (line.trim() === "\\.") {
      inCopy = false;
      break;
    }
    const cols = line.split("\t");
    if (cols.length >= 11) {
      records.push({
        id: cols[0],
        full_name: cols[1],
        phone: cols[2] === "\\N" ? null : cols[2],
        employee_code: cols[3] === "\\N" ? null : cols[3],
        designation: cols[4] === "\\N" ? null : cols[4],
        distributor_id: cols[5] === "\\N" ? null : cols[5],
        csa_id: cols[6] === "\\N" ? null : cols[6],
        retailer_id: cols[8] === "\\N" ? null : cols[8],
        depot_id: cols[9] === "\\N" ? null : cols[9],
        reports_to: cols[10] === "\\N" ? null : cols[10].trim(),
      });
    }
  }
}

async function run() {
  console.log(`Found ${records.length} profile records in dump. Updating Supabase...`);
  let success = 0;
  for (const rec of records) {
    const { error } = await supabase
      .from("profiles")
      .update({
        distributor_id: rec.distributor_id,
        csa_id: rec.csa_id,
        retailer_id: rec.retailer_id,
        depot_id: rec.depot_id,
        reports_to: rec.reports_to,
      })
      .eq("id", rec.id);
    if (error) {
      console.error(`Error updating ${rec.full_name}:`, error.message);
    } else {
      success++;
    }
  }
  console.log(`Successfully updated ${success} profiles!`);
}

run();
