// This client is for backend scripts only (check-all-sites.js, send-digest.js,
// add-site.js). It uses the service_role key, which bypasses Row Level
// Security entirely. NEVER put this key in a public-facing page or commit it
// anywhere, it has full access to every table.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

export const supabase = createClient(supabaseUrl, serviceRoleKey);