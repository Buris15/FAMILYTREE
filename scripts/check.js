const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("public/index.html");
const script = read("public/script.js");
const db = read("public/database.js");
const api = read("api/config.js");
const seed = JSON.parse(read("supabase/seed-family-data.json"));
const schema = read("supabase/schema.sql");

new vm.Script(script, { filename: "public/script.js" });
new vm.Script(db, { filename: "public/database.js" });
new vm.Script(api, { filename: "api/config.js" });
new vm.Script(read("scripts/seed-supabase.js"), { filename: "scripts/seed-supabase.js" });

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) throw new Error("Duplicate HTML IDs: " + [...new Set(duplicates)].join(", "));
for (const file of ["styles.css", "script.js", "database.js"]) {
  if (!html.includes(file)) throw new Error("index.html does not reference " + file);
}
for (const f of [
  "public/index.html", "public/styles.css", "public/script.js", "public/database.js",
  "api/config.js", "supabase/schema.sql", "supabase/seed-family-data.json",
  "scripts/seed-supabase.js", "vercel.json", "README-DEPLOY.md"
]) {
  if (!fs.existsSync(path.join(root, f))) throw new Error("Missing project file: " + f);
}
const peopleCount = Object.keys(seed.people || {}).length;
const unionCount = (seed.unions || []).length;
const indexCount = (seed.familyIndex || []).length;
if (peopleCount !== 182 || unionCount !== 51 || indexCount !== 19) {
  throw new Error(`Unexpected seed data counts: ${peopleCount} people, ${unionCount} unions, ${indexCount} index groups`);
}
if (!schema.includes("enable row level security") || !schema.includes("is_family_admin")) {
  throw new Error("Supabase schema is missing expected RLS controls.");
}
if (api.includes("SUPABASE_SECRET_KEY") || api.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  throw new Error("A server-side Supabase secret must not be exposed by the config API.");
}
if (fs.existsSync(path.join(root, ".env.local"))) throw new Error("Do not package .env.local in a deployment ZIP.");
console.log(`Checks passed: JS syntax, unique HTML IDs, project references, RLS markers, no secret in API config, no local env file, and seed data (${peopleCount} people, ${unionCount} unions, ${indexCount} family-index groups).`);
