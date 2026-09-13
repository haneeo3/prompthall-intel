// Loops through every row in "sites" and runs the shared checkSite() logic
// for each, saving the result into "scores". This is what the weekly
// automation runs. Usage: npm run check-all

import "dotenv/config";
import { supabase } from "./supabase-client.js";
import { checkSite } from "./site-checker.js";

async function checkOneSite(site) {
  try {
    console.log(`Checking ${site.url} ...`);
    const result = await checkSite(site.url);

    const { error: insertError } = await supabase.from("scores").insert({
      site_id: site.id,
      ...result,
    });

    if (insertError) throw new Error(insertError.message);

    console.log(
      `  -> saved. Score: ${result.performance_score}/100, pages checked: ${result.pages_checked}, broken: ${result.pages_broken_count}, slow: ${result.pages_slow_count}`
    );

    return { site: site.url, ok: true };
  } catch (err) {
    console.error(`  -> FAILED: ${err.message}`);
    return { site: site.url, ok: false, error: err.message };
  }
}

async function main() {
  const { data: sites, error } = await supabase.from("sites").select("id, url");

  if (error) throw new Error(`Failed to load sites: ${error.message}`);
  if (!sites || sites.length === 0) {
    console.log("No sites to check. Add one with: npm run add-site -- https://example.com");
    return;
  }

  console.log(`Found ${sites.length} site(s) to check.\n`);

  const results = [];
  for (const site of sites) {
    results.push(await checkOneSite(site));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone. ${results.length - failed.length}/${results.length} succeeded.`);
  if (failed.length > 0) {
    console.log("Failed sites:", failed.map((f) => f.site).join(", "));
  }
}

main().catch((err) => {
  console.error("check-all failed:", err.message);
  process.exit(1);
});