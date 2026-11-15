const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function authHeaders(secretKey, extra = {}) {
  const headers = { apikey: secretKey, ...extra };
  // sb_secret_* keys are opaque API keys (not JWTs); legacy service_role keys are JWTs.
  if (!secretKey.startsWith("sb_secret_")) headers.Authorization = "Bearer " + secretKey;
  return headers;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) {
    throw new Error("Add SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) to a local .env.local file. Never commit or deploy that file.");
  }
  const baseData = JSON.parse(fs.readFileSync(path.join(root, "supabase", "seed-family-data.json"), "utf8"));
  const endpoint = url.replace(/\/$/, "") + "/rest/v1/family_tree_state";
  const currentResponse = await fetch(endpoint + "?select=id,payload,is_published&id=eq.main", {
    headers: authHeaders(secretKey, { Accept: "application/json" })
  });
  if (!currentResponse.ok) {
    throw new Error("Could not inspect the existing family_tree_state row (" + currentResponse.status + "): " + await currentResponse.text());
  }
  const currentRows = await currentResponse.json();
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (current?.payload?.baseData && !process.argv.includes("--force")) {
    throw new Error("The base genealogy is already seeded. No changes were made. Use `npm run seed -- --force` only if you intentionally want to replace the base dataset; existing tree edits will be preserved.");
  }
  const existingEdits = current?.payload?.treeEdits || { over: {}, add: [] };
  const payload = { baseData, treeEdits: existingEdits };
  const response = await fetch(endpoint + "?on_conflict=id", {
    method: "POST",
    headers: authHeaders(secretKey, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    }),
    body: JSON.stringify({ id: "main", payload, is_published: true, updated_at: new Date().toISOString() })
  });
  if (!response.ok) {
    throw new Error("Supabase seed failed (" + response.status + "): " + await response.text());
  }
  console.log("Base genealogy uploaded to Supabase.");
  console.log("People:", Object.keys(baseData.people || {}).length);
  console.log("Unions:", (baseData.unions || []).length);
  console.log("Family index groups:", (baseData.familyIndex || []).length);
  console.log("Existing shared tree edits preserved:", !!current?.payload?.treeEdits);
  console.log("The published family_tree_state row now contains the base data and shared edits.");
  console.log("The secret key was used only by this local script and was not written to browser files.");
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
