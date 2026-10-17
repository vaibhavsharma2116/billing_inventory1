// Auto-initialize server-side Supabase environment variables on Node runtime
const DEFAULT_SUPABASE_URL = "https://anphciwmfczwlslqkhrs.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFucGhjaXdtZmN6d2xzbHFraHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjAwNTYsImV4cCI6MjEwNTYzNjA1Nn0.AQ4Z28aqczs4GIAPF-wnd-iLjl6iafsy5mtrXUQD9Ok";
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFucGhjaXdtZmN6d2xzbHFraHJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDA2MDA1NiwiZXhwIjoyMTA1NjM2MDU2fQ.nXsNMVPd2UXIGshZobShie7fSdl3uGKQ00mMxk-AnD4";

if (typeof process !== "undefined" && process.env) {
  try {
    if (typeof (process as any).loadEnvFile === "function") {
      (process as any).loadEnvFile();
    }
  } catch {
    // .env may not exist or is already loaded
  }

  process.env.SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_SUPABASE_SERVICE_ROLE_KEY;
}
