// Adds a new site to the "sites" table so the weekly checker knows to track it.
// Usage: npm run add-site -- https://example.com "Example Co"

import { supabase } from "./supabase-client.js";

const url = process.argv[2];
const name = process.argv[3] || null;

if (!url) {
  console.error('Usage: npm run add-site -- https://example.com "Optional Name"');
  process.exit(1);
}

const { data, error } = await supabase
  .from("sites")
  .insert({ url, name })
  .select()
  .single();

if (error) {
  console.error("Failed to add site:", error.message);
  process.exit(1);
}

console.log("Site added:");
console.log(data);
