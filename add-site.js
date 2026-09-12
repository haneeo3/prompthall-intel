// Adds a new site to the "sites" table so the weekly checker knows to track it.
// A contact/checkout URL is optional but recommended, this is usually the
// page where a failure actually costs a business money or leads.
// Usage: npm run add-site -- https://example.com "Example Co" https://example.com/contact

import { supabase } from "./supabase-client.js";

const url = process.argv[2];
const name = process.argv[3] || null;
const contactUrl = process.argv[4] || null;

if (!url) {
  console.error(
    'Usage: npm run add-site -- https://example.com "Optional Name" https://example.com/contact'
  );
  process.exit(1);
}

const { data, error } = await supabase
  .from("sites")
  .insert({ url, name, contact_url: contactUrl })
  .select()
  .single();

if (error) {
  console.error("Failed to add site:", error.message);
  process.exit(1);
}

console.log("Site added:");
console.log(data);