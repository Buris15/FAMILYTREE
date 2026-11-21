const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("public/index.html");
const script = read("public/script.js");
const db = read("public/database.js");
const researchWorkspace = read("public/research-workspace.js");
const researchMigration = read("supabase/migrations/003_family_research_workspace.sql");
const api = read("api/config.js");
const seed = JSON.parse(read("supabase/seed-family-data.json"));
const schema = read("supabase/schema.sql");
const contributionMigration = read("supabase/migrations/002_family_contributions.sql");
const seedScript = read("scripts/seed-supabase.js");

new vm.Script(script, { filename: "public/script.js" });
new vm.Script(db, { filename: "public/database.js" });
new vm.Script(researchWorkspace, { filename: "public/research-workspace.js" });
new vm.Script(api, { filename: "api/config.js" });
new vm.Script(read("scripts/seed-supabase.js"), { filename: "scripts/seed-supabase.js" });

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) throw new Error("Duplicate HTML IDs: " + [...new Set(duplicates)].join(", "));
for (const file of ["styles.css", "script.js", "database.js", "research-workspace.js"]) {
  if (!html.includes(file)) throw new Error("index.html does not reference " + file);
}
for (const f of [
  "public/index.html", "public/styles.css", "public/script.js", "public/database.js", "public/research-workspace.js",
  "api/config.js", "supabase/schema.sql", "supabase/seed-family-data.json",
  "scripts/seed-supabase.js", "vercel.json", "README-DEPLOY.md", "supabase/migrations/002_family_contributions.sql", "supabase/migrations/003_family_research_workspace.sql"
]) {
  if (!fs.existsSync(path.join(root, f))) throw new Error("Missing project file: " + f);
}
const peopleCount = Object.keys(seed.people || {}).length;
const visiblePeopleCount = Object.values(seed.people || {}).filter((person) => !person.same).length;
const unionCount = (seed.unions || []).length;
const indexCount = (seed.familyIndex || []).length;
if (peopleCount !== 229 || visiblePeopleCount !== 224 || unionCount !== 57 || indexCount !== 29) {
  throw new Error(`Unexpected seed data counts: ${visiblePeopleCount} distinct profiles (${peopleCount} data entries), ${unionCount} unions, ${indexCount} index groups`);
}
for (const id of [
  "juanita-valdris", "lourdes-lacsamana", "oneil-lacsamana", "alberto-lacsamana", "alfredo-jr-lacsamana", "alfonso-ramon-mons-lacsamana", "linda-fornoles", "paz", "paz-munar", "paz-child-4", "paz-child-5", "paz-child-6", "mario-lac", "pacita-lomiteng", "milagros-gandingan", "makoy-lacsamana", "josephine-lacsamana", "private-jerry-youngest", "ariane-agnes", "private-richard-eldest", "private-richard-youngest", "rufino-dacanay", "felicidad-natarte",
  "joaquin-ortega-molina", "maria-verzosa", "bernardino-guadalupe", "nicolasa-villaverde", "maria-expectacion-lopez-lasamana", "bernardo-lopez-lacsamana", "rosa-lopez-lacsamana", "ynes-lopez-lacsamana", "ysabelo-lopez-lacsamana", "timotea-lopez-lacsamana", "maximo-lopez-lacsamana", "proceso-lopez-lacsamana", "jennifer-joan", "eduardo-francisco", "manuel-orros", "agustin-orros", "joaquin-orros", "rosario-orros", "ligaya-israel", "jocelyn-abrogar", "justito-orros", "john-h-orros", "kiko-c-ortega", "tj-ortega", "coleen-ortega-garcia", "ysabel-ortega", "derrick-wilquin-orros-atijera", "maricar-icay-atijera", "cedric-sonny-panis"
]) {
  if (!seed.people[id]) throw new Error("Missing V19 person record: " + id);
}
const seedIds = new Set(Object.keys(seed.people || {}));
for (const union of seed.unions || []) {
  if (!union.a || !seedIds.has(union.a) || (union.b && !seedIds.has(union.b))) throw new Error("A family union points to a missing person: " + JSON.stringify(union));
  for (const child of union.kids || []) if (!seedIds.has(child)) throw new Error("A family union has a missing child: " + child);
}
for (const group of seed.familyIndex || []) {
  for (const id of group.ids || []) if (!seedIds.has(id)) throw new Error("Family index group references a missing person: " + id);
}
if (seed.people["paz-munar"].same !== "paz") throw new Error("Paz duplicate profile is not merged to the canonical Paz ID.");
if (!(seed.unions || []).some((u) => u.a === "leon" && u.b === "cayetana" && u.kids.includes("paz"))) throw new Error("Paz is missing from the Leon / Cayetana union.");
if (!(seed.unions || []).some((u) => u.a === "jose" && u.b === "paz" && ["kining", "mela", "cichit", "paz-child-4", "paz-child-5", "paz-child-6"].every((id) => u.kids.includes(id)))) throw new Error("Paz's six-child union is incomplete.");
if (!(seed.unions || []).some((u) => u.a === "joaquin-ortega-molina" && u.b === "maria-verzosa" && u.kids.includes("antonio"))) throw new Error("Joaquin Ortega y Molina / Maria Verzosa are not connected as Antonio's parents.");
if (!(seed.unions || []).some((u) => u.a === "antonio" && u.b === "juana" && u.kids.includes("joaquin"))) throw new Error("Antonio Ortega y Verzosa / Juana Joaquino are not connected as Joaquin's parents.");
if (!(seed.unions || []).some((u) => u.a === "bernardino-guadalupe" && u.b === "nicolasa-villaverde" && u.kids.includes("evaristo-guadalupe") && u.kind === "parentage")) throw new Error("Evaristo’s reported parents are missing or not marked as parentage.");
const ramonaEvaristo = (seed.unions || []).find((u) => u.a === "ramona-lopez" && u.b === "evaristo-guadalupe");
if (!ramonaEvaristo || ramonaEvaristo.kind !== "parentage" || !/NOT MARRIED/i.test(ramonaEvaristo.label || "") || !["leon", "francisca"].every((id) => ramonaEvaristo.kids.includes(id))) throw new Error("Ramona / Evaristo must be retained as parentage only and explicitly not married.");
const ramonaSiblings = ["maria-expectacion-lopez-lasamana", "bernardo-lopez-lacsamana", "rosa-lopez-lacsamana", "ynes-lopez-lacsamana", "ysabelo-lopez-lacsamana", "timotea-lopez-lacsamana", "maximo-lopez-lacsamana", "proceso-lopez-lacsamana"];
const martinNarcisa = (seed.unions || []).find((u) => u.a === "martin-lacsamana" && u.b === "narcisa-lopez");
if (!martinNarcisa || !ramonaSiblings.every((id) => martinNarcisa.kids.includes(id))) throw new Error("Ramona’s eight newly reported siblings are incomplete.");
if (seed.people["evaristo-guadalupe"].alsoKnownAs !== "Muy Reverendo Padre Fray Evaristo Villaverde Guadalupe OSA") throw new Error("Evaristo’s alternate name is missing.");
if (seed.people["maria-expectacion-lopez-lasamana"].name !== "Maria de la Expectacion Lopez Lacsamana") throw new Error("Maria de la Expectacion’s family surname must display as Lacsamana.");
if (seed.people["ramona-lopez"].n.includes("Maria de la Expectacion Lopez Lasamana")) throw new Error("Ramona’s profile must use the clarified Lacsamana spelling.");
if (seed.people["ramona-lopez"].n.includes("Maria’s surname is preserved as \"Lasamana\"")) throw new Error("Ramona’s profile must not retain the superseded Maria surname spelling.");
if (!seed.familyIndex.some((group) => group.ids.includes("maria-expectacion-lopez-lasamana") && group.how.includes("Maria de la Expectacion Lopez Lacsamana"))) throw new Error("Family index must use the clarified Lacsamana spelling.");
if (script.includes('["Lasamana", "Source spelling to verify"')) throw new Error("The superseded Lasamana spelling must not appear as a surname-register entry.");
const manolingUnion = (seed.unions || []).find((u) => u.a === "manuel" && u.b === "geraldine-denny");
const manolingChildren = ["pacoy3", "jennifer-joan", "joy", "mannix", "alfredo", "eduardo-francisco", "jeff-ortega"];
if (!manolingUnion || manolingUnion.kids.length !== 7 || !manolingChildren.every((id) => manolingUnion.kids.includes(id))) throw new Error("Manoling / Geraldine must have exactly the seven named canonical children.");
if (["emmanuel-victor", "manoling-child-6", "manoling-child-7"].some((id) => manolingUnion.kids.includes(id))) throw new Error("Manoling duplicate / placeholder IDs must remain aliases, not extra children.");
if (seed.people["emmanuel-victor"].same !== "mannix" || seed.people["manoling-child-6"].same !== "eduardo-francisco" || seed.people["manoling-child-7"].same !== "jeff-ortega") throw new Error("Manoling legacy IDs are not mapped to the intended canonical children.");
if (seed.people.manuela.d !== "1906–1928" || seed.people.mela.d) throw new Error("Miling and Mela dates must remain distinct; only Miling has supplied life years.");
const orrosParents = (seed.unions || []).find((u) => u.a === "joaquina" && u.b === "justo2");
if (!orrosParents || !["justo-jr", "manuel-orros", "agustin-orros", "joaquin-orros", "rosario-orros"].every((id) => orrosParents.kids.includes(id))) throw new Error("The Justo Orros Jr. sibling branch is incomplete.");
const orrosSons = (seed.unions || []).find((u) => u.a === "justo-jr" && u.b === "jocelyn-abrogar");
if (!orrosSons || !["jay-jay", "justito-orros", "john-h-orros"].every((id) => orrosSons.kids.includes(id))) throw new Error("Justo Jr. / Jocelyn's three sons are incomplete.");
if (!(seed.unions || []).some((u) => u.a === "justo-jr" && u.b === "ligaya-israel")) throw new Error("Justo Jr.'s earlier marriage to Ligaya Israel is missing.");
if (!(seed.unions || []).some((u) => u.a === "pacoy" && u.b === "corazon" && u.kids.includes("kiko-c-ortega"))) throw new Error("Kiko C. Ortega is missing from the Pacoy / Corazon family branch.");
if (seed.people["pacoy-francisco"].same || seed.people["kiko-c-ortega"].same) throw new Error("The unresolved Francisco Jr. / Kiko identity must not be merged.");
if (!(seed.unions || []).some((u) => u.a === "alfredo-pidong" && u.b === "juanita-valdris" && ["lourdes-lacsamana", "oneil-lacsamana", "alberto-lacsamana", "alfredo-jr-lacsamana", "alfonso-ramon-mons-lacsamana", "linda-fornoles"].every((id) => u.kids.includes(id)))) throw new Error("The Alfredo / Juanita six-child union is incomplete.");
if ((seed.unions || []).some((u) => u.kids.includes("mario-lac"))) throw new Error("Mario Agustin Lacsamana must remain separate from unsupported parent-child links.");
for (const file of [
  "public/assets/research/alfredo-pidong-juanita-valdivia-register-p71.png",
  "public/assets/research/joaquin-lacsamana-concepcion-viloria-1955-marriage-contract.png",
  "public/assets/research/francisco-lacsamana-pacita-lomiteng-1958-marriage-contract.png",
  "public/assets/research/eduardo-lacsamana-purita-argueza-1959-marriage-contract.png",
  "public/assets/research/macario-lacsamana-felicidad-santos-1962-marriage-contract.png",
  "public/assets/research/evaristo-guadalupe-archival-register-pages.png",
  "public/assets/research/evaristo-guadalupe-signature.svg",
  "public/assets/research/evaristo-relatives-update.txt"
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error("Missing V17 source scan: " + file);
}
for (const marker of ["Juanita Valdivia", "Macario Lacsamana and Felicidad Santos marry", "assets/research/alfredo-pidong-juanita-valdivia-register-p71.png", "Educator · academic leader · Catholic community service", "Paz Munar Lacsamana and Jose Alvaro", "Fr. Evaristo Guadalupe serves as parish priest of Bangar", "Msgr. Alfonso Ramon Lacsamana is assigned to Pagdalagan parish", "Eight members of the wider Ortega family have served as La Union Governor", "House Resolution No. 545", "Joaquin “Kining” Ortega’s wartime and public service", "Manuel “Manoling” Ortega dies in San Fernando", "Dr. Juanita Valdivia Lacsamana completes her Ed.D.", "Dr. Juanita “Tetang” Lacsamana receives a Centenarian Longevity Award"]) {
  if (!script.includes(marker)) throw new Error("Missing V17 archive content marker: " + marker);
}
for (const marker of ["appendHistoricalProfile(\"kining\"", "appendHistoricalProfile(\"justo-jr\"", "appendHistoricalProfile(\"manuel\"", "appendHistoricalProfile(\"coleen-ortega-garcia\"", "House of Representatives member profile", "it does not list the seven children", "appendHistoricalProfile(\"victor\"", "appendHistoricalProfile(\"pacoy3\"", "appendHistoricalProfile(\"raphaelle\"", "appendHistoricalProfile(\"kiko-c-ortega\""]) {
  if (!script.includes(marker)) throw new Error("Missing V19 biography / source content marker: " + marker);
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
for (const method of ["loadResearchWorkspace", "createResearchRecord", "deleteResearchRecord", "researchFileUrl", "createTimelineEvent", "deleteTimelineEvent", "createResearchTask", "updateResearchTask", "deleteResearchTask"]) {
  if (!db.includes(method) || !researchWorkspace.includes(method)) throw new Error("Research workspace is missing client/controller method: " + method);
}
for (const id of ["family-research-center", "timelineEventForm", "researchRecordForm", "researchTaskForm", "timelineList", "researchRecordList", "researchTaskList"]) {
  if (!ids.includes(id)) throw new Error("Research workspace HTML is missing required element: " + id);
}
for (const marker of ["family_research_records", "family_timeline_events", "family_research_tasks", "family-research-files", "enable row level security", "Only admins insert family research records", "Read visible family research records"]) {
  if (!researchMigration.toLowerCase().includes(marker.toLowerCase())) throw new Error("Research workspace migration is missing security marker: " + marker);
}
if (!/values\s*\([\s\S]*?'family-research-files',[\s\S]*?'family-research-files',[\s\S]*?false/i.test(researchMigration)) throw new Error("Research upload bucket must remain private.");
if (!script.includes('family-archive-ready')) throw new Error("Main archive script is missing the research workspace lifecycle event.");
if (!script.includes('u.kind !== "parentage"') || !script.includes("parentage-label") || !script.includes("1808–1814")) throw new Error("V19.2 parentage labels, spouse filtering, or historical context are missing.");
if (!html.includes("evaristo-guadalupe-archival-register-pages.png") || !html.includes("evaristo-guadalupe-signature.svg")) throw new Error("V19.2 Evaristo archival exhibits are missing from the documents gallery.");
for (const marker of [
  'el("div", "tree-line-key")',
  "Recorded branch",
  "Reported / pending",
  "Spouse / partner",
  "Parentage only",
  "Co-parent link · not a marriage",
  'function drawLines()',
  'function unionCardsForLines(couple)',
  'function primaryCardForLines(node)',
  'unit.querySelector(":scope > .union-connectors")',
  'family-connector " + line + (kind === "parentage" ? " parentage"',
  'Parent/couple stem → shared sibling bus → a separate drop to each child.'
]) {
  if (!script.includes(marker)) throw new Error("Family-tree line indicator is missing: " + marker);
}
for (const marker of [
  ".tree-line-key {",
  ".tree-line-swatch.solid::before",
  ".tree-line-swatch.dashed::before",
  ".union-connectors path.family-connector.parentage",
  ".union-connectors circle.family-junction",
  ".union-unit > .union-connectors",
  ".couple .pl {"
]) {
  if (!read("public/styles.css").includes(marker)) throw new Error("Family-tree line indicator styling is missing: " + marker);
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
console.log(`Checks passed: JS syntax, unique HTML IDs, V19.1 project references, contribution portal, research workspace forms and API, research migration / private storage / RLS markers, no secret in API config, no local env file, V19.2.3 local attached family-tree connector routing, and V19 master findings seed data (${visiblePeopleCount} distinct profiles / ${peopleCount} entries, ${unionCount} unions, ${indexCount} family-index groups).`);
