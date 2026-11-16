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
const researchMigration = read("supabase/migrations/003_family_research_center.sql");

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
  "scripts/seed-supabase.js", "vercel.json", "README-DEPLOY.md", "supabase/migrations/002_family_contributions.sql", "supabase/migrations/003_family_research_center.sql"
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
for (const marker of ["family_contributors", "family_contributions", "family_public_contributions", "is_family_contributor", "family-contribution-files"]) {
  if (!contributionMigration.includes(marker) || !schema.includes(marker)) throw new Error("Contribution migration/schema is missing " + marker);
}
for (const id of ["family-contribution-portal", "familyContributionForm", "contributionAdminQueue", "digital-family-museum", "migration-stories", "migrationStoryForm", "bookIncludeMigration", "bookIncludeMuseum", "bookIncludeContributions"]) {
  if (!ids.includes(id)) throw new Error("Missing V15 feature element: " + id);
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
for (const marker of ["family_research_records", "family_timeline_events", "family_research_tasks", "family-research-files", "Read visible family research records", "Read visible family timeline events"]) {
  if (!researchMigration.includes(marker) || !schema.includes(marker)) throw new Error("Research migration/schema is missing " + marker);
}
for (const id of ["family-research-center", "researchRecordForm", "researchTaskForm", "timelineEventForm", "timelineSearch", "timelinePersonFilter", "timelineYearFilter", "researchRecordList"]) {
  if (!ids.includes(id)) throw new Error("Missing V17 Research Center / timeline element: " + id);
}
for (const method of ["loadResearchWorkspace", "createResearchRecord", "deleteResearchRecord", "researchFileUrl", "createTimelineEvent", "deleteTimelineEvent", "createResearchTask", "updateResearchTask", "deleteResearchTask"]) {
  if (!db.includes(method)) throw new Error("Cloud client is missing V17 research method: " + method);
}

if (!researchMigration.includes("public = false") || !researchMigration.includes("file_size_limit = 26214400")) {
  throw new Error("Research storage bucket must remain private and capped at 25 MB.");
}
for (const table of ["family_research_records", "family_timeline_events", "family_research_tasks"]) {
  if (!researchMigration.includes(`alter table public.${table} enable row level security`)) {
    throw new Error("RLS is not enabled for " + table);
  }
}
if (!html.includes('id="researchRecordPublish"') || !html.includes('id="timelineEventPublish"')) {
  throw new Error("Public publication must require an explicit confirmation checkbox.");
}
if (!read("package.json").includes('"version": "17.0.0"')) {
  throw new Error("Project package version is not 17.0.0.");
}
console.log(`Checks passed: JS syntax, unique HTML IDs, project references, private research storage, RLS, publication confirmations, contribution portal, and seed data (${peopleCount} people, ${unionCount} unions, ${indexCount} family-index groups).`);
