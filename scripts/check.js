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
const contributionMigration = read("supabase/migrations/002_family_contributions.sql");
const seedScript = read("scripts/seed-supabase.js");

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
  "scripts/seed-supabase.js", "vercel.json", "README-DEPLOY.md", "supabase/migrations/002_family_contributions.sql"
]) {
  if (!fs.existsSync(path.join(root, f))) throw new Error("Missing project file: " + f);
}
const peopleCount = Object.keys(seed.people || {}).length;
const unionCount = (seed.unions || []).length;
const indexCount = (seed.familyIndex || []).length;
if (peopleCount !== 196 || unionCount !== 55 || indexCount !== 20) {
  throw new Error(`Unexpected seed data counts: ${peopleCount} people, ${unionCount} unions, ${indexCount} index groups`);
}
for (const id of ["juanita-valdris", "lourdes-lacsamana", "oneil-lacsamana", "alberto-lacsamana", "alfredo-jr-lacsamana", "alfonso-ramon-mons-lacsamana", "milagros-gandingan", "makoy-lacsamana", "josephine-lacsamana", "private-jerry-youngest", "ariane-agnes", "private-richard-eldest", "private-richard-youngest", "rufino-dacanay", "felicidad-natarte"]) {
  if (!seed.people[id]) throw new Error("Missing V17 person record: " + id);
}
const seedIds = new Set(Object.keys(seed.people || {}));
for (const union of seed.unions || []) {
  if (!union.a || !seedIds.has(union.a) || (union.b && !seedIds.has(union.b))) throw new Error("A family union points to a missing person: " + JSON.stringify(union));
  for (const child of union.kids || []) if (!seedIds.has(child)) throw new Error("A family union has a missing child: " + child);
}
for (const group of seed.familyIndex || []) {
  for (const id of group.ids || []) if (!seedIds.has(id)) throw new Error("Family index group references a missing person: " + id);
}
for (const file of [
  "public/assets/research/alfredo-pidong-juanita-valdivia-register-p71.png",
  "public/assets/research/joaquin-lacsamana-concepcion-viloria-1955-marriage-contract.png",
  "public/assets/research/francisco-lacsamana-pacita-lomiteng-1958-marriage-contract.png",
  "public/assets/research/eduardo-lacsamana-purita-argueza-1959-marriage-contract.png",
  "public/assets/research/macario-lacsamana-felicidad-santos-1962-marriage-contract.png"
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error("Missing V17 source scan: " + file);
}
for (const marker of ["Juanita Valdivia", "Macario Lacsamana and Felicidad Santos marry", "assets/research/alfredo-pidong-juanita-valdivia-register-p71.png", "Educator · academic leader · Catholic community service"]) {
  if (!script.includes(marker)) throw new Error("Missing V17 archive content marker: " + marker);
}
if (!schema.includes("enable row level security") || !schema.includes("is_family_admin")) {
  throw new Error("Supabase schema is missing expected RLS controls.");
}
for (const marker of ["family_contributors", "family_contributions", "family_public_contributions", "is_family_contributor", "family-contribution-files"]) {
  if (!contributionMigration.includes(marker) || !schema.includes(marker)) throw new Error("Contribution migration/schema is missing " + marker);
}
for (const id of ["family-contribution-portal", "familyContributionForm", "contributionAdminQueue", "digital-family-museum", "migration-stories", "migrationStoryForm", "bookIncludeMigration", "bookIncludeMuseum", "bookIncludeContributions"]) {
  if (!ids.includes(id)) throw new Error("Missing V15 feature element: " + id);
}
if (!seedScript.includes("const isPublished = current ? current.is_published === true : true;") || !seedScript.includes("is_published: isPublished")) {
  throw new Error("The seed script must preserve the existing publication setting when updating base data.");
}
for (const method of ["loadMyContributions", "loadPublishedContributions", "submitContribution", "reviewContribution", "contributionAttachmentUrl"]) {
  if (!db.includes(method)) throw new Error("Cloud client is missing contribution method: " + method);
}
if (api.includes("SUPABASE_SECRET_KEY") || api.includes("SUPABASE_SERVICE_ROLE_KEY")) {
  throw new Error("A server-side Supabase secret must not be exposed by the config API.");
}
if (fs.existsSync(path.join(root, ".env.local"))) throw new Error("Do not package .env.local in a deployment ZIP.");
for (const marker of ["profileTitle", "initPremiumInteractions", "closeProfileDrawer", "readingProgressBar", "backToTop"]) {
  if (!script.includes(marker)) throw new Error("Missing V16 interaction enhancement: " + marker);
}
for (const marker of ["REGAL OBSIDIAN DESIGN SYSTEM", ".reading-progress-track", ".profile-drawer", ".archive-index a.is-active"]) {
  if (!read("public/styles.css").includes(marker)) throw new Error("Missing V16 design system marker: " + marker);
}
if (!html.includes("Cormorant+Garamond") || !html.includes('role="dialog"')) {
  throw new Error("V16 display typography or dialog accessibility markup is missing.");
}
console.log(`Checks passed: JS syntax, unique HTML IDs, project references, contribution portal and migration schema markers, RLS markers, no secret in API config, no local env file, and seed data (${peopleCount} people, ${unionCount} unions, ${indexCount} family-index groups).`);
