// Manual one-off check for a single site. Looks up the site by URL in the
// "sites" table, runs the shared checkSite() logic (PageSpeed + full-site
// crawl), and stores the result as a new row in "scores".
// Usage: npm run check -- https://example.com

import "dotenv/config";
import { supabase } from "./supabase-client.js";
import { checkSite } from "./site-checker.js";

const siteUrl = process.argv[2];

if (!siteUrl) {
  console.error("Usage: npm run check -- https://example.com");
  process.exit(1);
}

async function findOrWarnSite(url) {
  const { data, error } = await supabase
    .from("sites")
    .select("id, url")
    .eq("url", url)
    .maybeSingle();

  if (error) throw new Error(`Supabase lookup failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `No site found with URL "${url}". Add it through the signup form first.`
    );
  }
  return data;
}

async function main() {
  const site = await findOrWarnSite(siteUrl);
  console.log(`Checking ${site.url} ...`);

  const result = await checkSite(site.url);

  const { error: insertError } = await supabase.from("scores").insert({
    site_id: site.id,
    ...result,
  });

  if (insertError) {
    throw new Error(`Failed to save score: ${insertError.message}`);
  }

  console.log("\nSaved to Supabase:");
  console.log(`Performance score: ${result.performance_score}/100`);
  console.log(`LCP: ${result.lcp}  CLS: ${result.cls}  TBT: ${result.tbt}`);
  console.log(
    `Pages checked: ${result.pages_checked}, broken: ${result.pages_broken_count}, slow: ${result.pages_slow_count}`
  );
}

main().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});
