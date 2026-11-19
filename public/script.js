
(async () => {
"use strict";
await (window.FamilyCloud && window.FamilyCloud.ready ? window.FamilyCloud.ready : Promise.resolve());
/* =====================================================================
   FAMILY DATA — this is the part to edit when you learn something new.

   P(id, name, role, {options})   a blood relative of the branch
   S(id, name, role, {options})   someone who married in
   U(personId, partnerId|null, [childIds], lineStyle)   a couple + children
        lineStyle: "blood" (solid blue) · "pending" (amber dashed) · "you" (green)
   options: d = dates, av = emoji, k = colour (src|sp|you|todo|rel),
            n = note shown on hover, fam = family name, ed = 1 for an
            editable placeholder, gone = 1 if died young, same = id of the
            card this person is a duplicate of
   Cards are drawn from this data, so every line is always attached.
   ===================================================================== */
const PEOPLE = Object.create(null);
const UNIONS = [];
const CHIP = {}; // person id -> small info chip drawn under that branch
const BRANCH_NOTE = {}; // Ortega child id -> source note under the branch
function P(id, name, role, o) {
  PEOPLE[id] = Object.assign({
    id,
    name,
    role: role || "",
    k: "src",
    nationality: "Not documented in available sources",
    religion: "Not documented in available sources",
  }, o || {});
  return id;
}
function S(id, name, role, o) {
  return P(id, name, role, Object.assign({ k: "sp" }, o || {}));
}
function U(a, b, kids, line) {
  UNIONS.push({ a, b: b || null, kids: kids || [], line: line || "blood" });
}
const REMOTE_BASE_DATA = window.FamilyCloud ? window.FamilyCloud.baseData : null;
if (REMOTE_BASE_DATA && REMOTE_BASE_DATA.people) {
  Object.assign(PEOPLE, REMOTE_BASE_DATA.people);
  if (Array.isArray(REMOTE_BASE_DATA.unions)) UNIONS.push(...REMOTE_BASE_DATA.unions);
  Object.assign(CHIP, REMOTE_BASE_DATA.chip || {});
  Object.assign(BRANCH_NOTE, REMOTE_BASE_DATA.branchNotes || {});
}
const FAMILY_INDEX = REMOTE_BASE_DATA && Array.isArray(REMOTE_BASE_DATA.familyIndex)
  ? REMOTE_BASE_DATA.familyIndex
  : [];


/* =====================================================================
   ENGINE — builds the cards from the data above. Nothing below needs
   editing to add people.
   ===================================================================== */
const NS = "http://www.w3.org/2000/svg";
const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const viewport = $("#viewport");
const treeMap = $("#treeMap");
const svg = $("#treeLines");
const stage = $("#stage");

/* ---------- saved edits (names you type, people you add) ---------- */
const KEY = "lacsamana-tree:v3";
const LEGACY_KEY = "lacsamana-tree:v2";
let store = { over: {}, add: [] };
const BASE_IDS = new Set(Object.keys(PEOPLE));
const BASE_UNIONS = JSON.stringify(UNIONS);

function loadStore() {
  try {
    const current = localStorage.getItem(KEY);
    const legacy = current ? null : localStorage.getItem(LEGACY_KEY);
    const s = JSON.parse(current || legacy || "null");
    if (s && typeof s === "object") {
      store = { over: s.over || {}, add: Array.isArray(s.add) ? s.add : [] };
      if (!current && legacy) localStorage.setItem(KEY, JSON.stringify(store));
    }
  } catch (e) {}
  // carry over names typed into the earlier version of this page
  try {
    BASE_IDS.forEach((id) => {
      ["name", "role"].forEach((f) => {
        const v = localStorage.getItem("lacsamana-tree:p_" + id + ":" + f);
        if (v && !(store.over[id] && store.over[id][f])) (store.over[id] = store.over[id] || {})[f] = v;
      });
    });
  } catch (e) {}
}
function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  if (window.FamilyCloud) window.FamilyCloud.queueTreeEdits(store);
}
function resetData() {
  UNIONS.length = 0;
  JSON.parse(BASE_UNIONS).forEach((u) => UNIONS.push(u));
  Object.keys(PEOPLE).forEach((id) => {
    if (!BASE_IDS.has(id)) delete PEOPLE[id];
  });
}
function applyStore() {
  store.add.forEach((a) => {
    if (!PEOPLE[a.parent]) return;
    PEOPLE[a.id] = {
      id: a.id, name: a.name, role: a.role || "", k: "todo", ed: 1, added: 1,
      nationality: "Not documented in available sources",
      religion: "Not documented in available sources",
    };
    if (a.as === "spouse") {
      const u = UNIONS.find((x) => x.a === a.parent && !x.b);
      if (u) u.b = a.id;
      else UNIONS.push({ a: a.parent, b: a.id, kids: [], line: "pending" });
    } else {
      let u = UNIONS.find((x) => x.a === a.parent && (x.b || "") === (a.unionB || ""));
      if (!u) {
        u = { a: a.parent, b: null, kids: [], line: "pending" };
        UNIONS.push(u);
      }
      u.kids.push(a.id);
    }
  });
}

/* ---------- small graph helpers ---------- */
const ov = (id) => store.over[id] || {};
const nameOf = (p) => ov(p.id).name || p.name;
const roleOf = (p) => ov(p.id).role || p.role;
const unionsOf = (id) => UNIONS.filter((u) => u.a === id);
const relatedUnionsOf = (id) => UNIONS.filter((u) => u.a === id || u.b === id);
const spousesOf = (id) => relatedUnionsOf(id).filter((u) => u.kind !== "parentage").map((u) => ({ id: u.a === id ? u.b : u.a, line: u.line })).filter((x) => x.id && PEOPLE[x.id]);
const kidsOf = (id) =>
  relatedUnionsOf(id).flatMap((u) =>
    u.kids.map((k) => ({ id: k, line: PEOPLE[k] && PEOPLE[k].added ? "pending" : u.line }))
  );

function avatarFor(p) {
  if (p.av) return p.av;
  if (p.gone) return "🕊️";
  if (p.k === "sp") return "💍";
  const r = p.role || "";
  if (/daughter|wife|mother|sister|aunt/i.test(r)) return "👩";
  if (/\bson\b|husband|father|brother|uncle/i.test(r)) return "👨";
  return "👤";
}

/* ---------- cross-branch kinship index ----------
   Sibling and cousin labels are derived from the parent/child links in UNIONS.
   Cousin relationships are calculated across every connected branch. The
   explorer lists each named person and the exact cousin degree relative to
   the selected family member. Pending links are marked as provisional. */
let kinshipIndex = null;
function buildKinshipIndex() {
  const parents = new Map();
  const children = new Map();
  Object.keys(PEOPLE).forEach((id) => { parents.set(id, []); children.set(id, []); });
  UNIONS.forEach((u) => {
    (u.kids || []).forEach((kid) => {
      if (!parents.has(kid)) parents.set(kid, []);
      if (u.a && PEOPLE[u.a]) {
        parents.get(kid).push({ id: u.a, provisional: u.line === "pending" });
        if (!children.has(u.a)) children.set(u.a, []);
        children.get(u.a).push(kid);
      }
      if (u.b && PEOPLE[u.b]) {
        parents.get(kid).push({ id: u.b, provisional: u.line === "pending" });
        if (!children.has(u.b)) children.set(u.b, []);
        children.get(u.b).push(kid);
      }
    });
  });
  function ancestorMap(personId) {
    const result = new Map([[personId, { distance: 0, provisional: false }]]);
    const queue = [personId];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      const here = result.get(current);
      (parents.get(current) || []).forEach((edge) => {
        const candidate = { distance: here.distance + 1, provisional: here.provisional || edge.provisional };
        const previous = result.get(edge.id);
        if (!previous || candidate.distance < previous.distance ||
            (candidate.distance === previous.distance && previous.provisional && !candidate.provisional)) {
          result.set(edge.id, candidate);
          queue.push(edge.id);
        }
      });
    }
    return result;
  }
  function cousinRelation(a, b, ancestorCache) {
    if (a === b) return null;
    const aa = ancestorCache.get(a);
    const bb = ancestorCache.get(b);
    let closest = null;
    aa.forEach((da, ancestor) => {
      const db = bb.get(ancestor);
      if (!db) return;
      const candidate = {
        aDistance: da.distance,
        bDistance: db.distance,
        provisional: da.provisional || db.provisional,
        total: da.distance + db.distance,
      };
      if (!closest || candidate.total < closest.total ||
          (candidate.total === closest.total && Math.max(candidate.aDistance, candidate.bDistance) < Math.max(closest.aDistance, closest.bDistance)) ||
          (candidate.total === closest.total && Math.max(candidate.aDistance, candidate.bDistance) === Math.max(closest.aDistance, closest.bDistance) && closest.provisional && !candidate.provisional)) {
        closest = candidate;
      }
    });
    if (!closest || closest.aDistance < 2 || closest.bDistance < 2) return null;
    return {
      degree: Math.min(closest.aDistance, closest.bDistance) - 1,
      removed: Math.abs(closest.aDistance - closest.bDistance),
      provisional: closest.provisional,
      total: closest.total,
    };
  }
  const ids = Object.keys(PEOPLE).filter((id) => !PEOPLE[id].same && PEOPLE[id].status !== "unknown");
  const ancestors = new Map(ids.map((id) => [id, ancestorMap(id)]));
  const siblings = Object.create(null);
  parents.forEach((plist, personId) => {
    const shared = new Set(plist.map((x) => x.id));
    const matches = [];
    if (shared.size) parents.forEach((otherParents, otherId) => {
      if (otherId !== personId && otherParents.some((x) => shared.has(x.id))) matches.push(otherId);
    });
    siblings[personId] = matches;
  });
  const cousins = Object.create(null);
  ids.forEach((id) => { cousins[id] = []; });
  ids.forEach((a, i) => {
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j];
      const relation = cousinRelation(a, b, ancestors);
      if (!relation || siblings[a].includes(b)) continue;
      cousins[a].push({ id: b, ...relation });
      cousins[b].push({ id: a, ...relation });
    }
  });
  Object.values(cousins).forEach((list) => list.sort((a, b) => a.degree - b.degree || a.removed - b.removed || nameOf(PEOPLE[a.id]).localeCompare(nameOf(PEOPLE[b.id]))));
  return { parents, siblings, cousins };
}
function cousinLabel(relation) {
  const degree = relation.degree;
  const ordinal = degree === 1 ? "1st" : degree === 2 ? "2nd" : degree === 3 ? "3rd" : degree + "th";
  const removed = relation.removed ? " " + (relation.removed === 1 ? "once" : relation.removed === 2 ? "twice" : relation.removed + " times") + " removed" : "";
  return ordinal + " cousin" + removed;
}
function kinshipSummary(pid) {
  if (!kinshipIndex) return { siblings: [], cousins: [] };
  return {
    siblings: (kinshipIndex.siblings[pid] || []).filter((id) => PEOPLE[id]),
    cousins: (kinshipIndex.cousins[pid] || []).filter((x) => PEOPLE[x.id]),
  };
}
function kinshipCardMarkup() { return ""; }

/* ---------- Spanish–Philippine family heritage flags ----------
   The flags represent documented family-origin / ancestry pathways, not
   present-day citizenship and not a DNA result. Descendants of Leon or
   Francisca inherit the recorded Spanish-born ancestry path through Evaristo.
   The single-ancestor pedigree contribution halves at each parent-child step.
*/
let heritageIndex = new Map();
function buildHeritageIndex() {
  const result = new Map();
  const rootId = "evaristo-guadalupe";
  if (!PEOPLE[rootId]) return result;
  const best = new Map([[rootId, { distance: 0, provisional: false }]]);
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const currentInfo = best.get(current);
    UNIONS.forEach((u) => {
      if (u.a !== current && u.b !== current) return;
      (u.kids || []).forEach((kid) => {
        if (!PEOPLE[kid]) return;
        const candidate = {
          distance: currentInfo.distance + 1,
          provisional: currentInfo.provisional || u.line === "pending"
        };
        const previous = best.get(kid);
        if (!previous || candidate.distance < previous.distance ||
            (candidate.distance === previous.distance && previous.provisional && !candidate.provisional)) {
          best.set(kid, candidate);
          queue.push(kid);
        }
      });
    });
  }
  best.forEach((info, id) => {
    if (id === rootId) {
      result.set(id, { flags: ["🇪🇸"], title: "Spanish-born ancestor", distance: 0, share: 100, provisional: false });
    } else if (info.distance > 0) {
      result.set(id, {
        flags: ["🇵🇭", "🇪🇸"],
        title: "Philippine family roots · Spanish ancestry through Evaristo Guadalupe y Villaverde",
        distance: info.distance,
        share: 100 / Math.pow(2, info.distance),
        provisional: info.provisional
      });
    }
  });
  // Joaquin's existing biography identifies him as Filipino; this is a
  // separate biographical flag and does not imply descent from Evaristo.
  if (PEOPLE.joaquin && !result.has("joaquin")) {
    result.set("joaquin", { flags: ["🇵🇭"], title: "Filipino identity described in the Ortega family-history source", distance: null, share: null, provisional: false });
  }
  return result;
}
function heritageInfoFor(pid) {
  return heritageIndex.get(pid) || null;
}
function heritageFlagsMarkup(pid) {
  const h = heritageInfoFor(pid);
  if (!h || !h.flags.length) return "";
  return '<span class="heritage-flags" aria-label="' + esc(h.title) + '" title="' + esc(h.title) + '">' + h.flags.join(" ") + '</span>';
}
function heritagePanelMarkup(pid) {
  const h = heritageInfoFor(pid);
  if (!h) return "";
  let heading = h.distance === 0 ? "Spanish-born ancestral origin" : h.distance === 1 ? "Spanish–Philippine parentage in the recorded family tree" : "Spanish–Philippine family heritage";
  let detail = "The Augustinian archival register records Evaristo Guadalupe y Villaverde as born in Ocaña, Toledo, Spain, in 1830. The supplied FamilySearch tree screenshot identifies him as a parent of Don Leon and Doña Francisca.";
  if (h.distance === 0) {
    detail += " The Spanish flag here represents his documented Spanish birthplace / origin, not a determination of anyone's present-day citizenship.";
  } else {
    const percent = Number(h.share.toFixed(2)).toString();
    detail = "Spanish ancestry is traced through Evaristo Guadalupe y Villaverde, recorded as born in Ocaña, Toledo, Spain. This person is " + h.distance + " parent-child generation step(s) below Evaristo in the current tree. The theoretical pedigree contribution from this single ancestor is " + percent + "% (1/2 per generation); this is a genealogy calculation, not a DNA test or a complete ethnicity estimate.";
    if (h.distance === 1) detail += " This represents one Spanish-born parent in the supplied parent couple; the other parent's full ancestral background is not yet established.";
    if (h.provisional) detail += " The parent-child path currently relies on family-tree information / family-supplied links that still need original-record corroboration.";
    detail += " The two flags indicate Philippine family roots and a Spanish-born ancestral line. They do not claim two current nationalities or that every descendant is exactly half Spanish.";
  }
  const source = '<a href="https://www.agustinosvalladolid.es/estudio/investigacion/archivoagustiniano/archivofondos/archivo2019/archivo_2019.pdf" target="_blank" rel="noopener">Augustinian archival register ↗</a> · <a href="https://history.state.gov/historicaldocuments/frus1873p1v2/d217" target="_blank" rel="noopener">1845 Spanish Constitution and 1852 nationality decree transcription ↗</a>';
  return '<section class="heritage-panel" aria-label="Ancestral heritage"><div class="heritage-panel-flags">' + h.flags.join(" ") + '</div><div class="heritage-panel-copy"><span>FAMILY HERITAGE · NOT A CITIZENSHIP RECORD</span><strong>' + esc(heading) + '</strong><p>' + esc(detail) + '</p><small>' + source + '</small></div></section>';
}

function statusInfo(p) {
  const editedPlaceholder = p.ed && ov(p.id).name && !/needed|not supplied/i.test(ov(p.id).name);
  const status = editedPlaceholder ? "family" : (p.status || (p.k === "todo" ? "unknown" : p.k === "you" ? "family" : p.k === "rel" ? "unlinked" : p.k === "sp" ? "source" : "source"));
  const labels = {
    source: ["Source referenced", "source"],
    family: ["Family supplied", "family"],
    record: ["Indexed record · check original", "record"],
    unknown: ["Needs information", "unknown"],
    unlinked: ["Unlinked record group", "unlinked"],
  };
  return labels[status] || labels.source;
}

/* ---------- one person card ---------- */
function initialsFor(p) {
  const raw = nameOf(p).replace(/[“”"'’]/g, " ").split(/\s+/).filter(Boolean);
  const ignored = new Set(["don", "dona", "doña", "gov", "col", "dr", "osa", "jr", "sr", "ii", "iii", "iv", "v", "y", "de", "del", "la", "the"]);
  const parts = raw.filter((x) => !ignored.has(x.replace(/\.$/, "").toLowerCase()) && !/^\d/.test(x));
  if (!parts.length) return "?";
  const first = parts[0].replace(/[^A-Za-zÀ-ÿ]/g, "").charAt(0);
  const last = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).replace(/[^A-Za-zÀ-ÿ]/g, "").charAt(0);
  return (first + last).toUpperCase();
}
function cardEl(pid, o) {
  o = o || {};
  const p = PEOPLE[pid];
  if (!p) return document.createTextNode("");
  const name = nameOf(p);
  const role = roleOf(p);
  const evidence = statusInfo(p);
  const cls = "card person-node " + (p.k || "src") + " evidence-" + evidence[1] + (p.gone ? " gone" : "") + (p.self ? " self" : "") + (p.ed ? " ed" : "") + (o.big ? " big" : "");
  const c = el("button", cls);
  c.type = "button";
  c.dataset.pid = pid;
  c.setAttribute("aria-label", name + ". " + role + ". Open profile.");
  c.title = [name, role, p.d, p.n].filter(Boolean).join("\n");
  const full = [role, p.d].filter(Boolean).join(" · ");
  const flags = heritageFlagsMarkup(pid);
  c.innerHTML =
    '<span class="av" aria-hidden="true">' + esc(initialsFor(p)) + '</span>' +
    '<span class="tx"><span class="name-line"><span class="name" data-f="name">' + esc(name) + '</span>' + flags + '</span>' +
    (full ? '<span class="meta">' + esc(full) + '</span>' : '') +
    '<span class="evidence-tag ' + evidence[1] + '">' + esc(evidence[0]) + '</span></span>';
  return c;
}
function coupleEl(pid, o) {
  o = o || {};
  const row = el("div", "couple");
  const unions = unionsOf(pid);
  const union = o.union || (o.unionIndex != null ? unions[o.unionIndex] : unions[0]);
  const partner = union && union.b ? union.b : "";
  if (pid === "francisca" && partner === "joaquin") {
    const left = cardEl(pid, { big: o.big });
    const rightWrap = el("div", "spouse-with-parents");
    rightWrap.appendChild(el("div", "spouse-parents-label", "JOAQUIN’S PARENTS"));
    const parents = el("div", "spouse-parents");
    parents.appendChild(cardEl("antonio", { big: true }));
    parents.appendChild(el("span", "pl spouse-parent-link"));
    parents.appendChild(cardEl("juana", { big: true }));
    rightWrap.appendChild(parents);
    rightWrap.appendChild(el("span", "spouse-parent-stem"));
    rightWrap.appendChild(cardEl("joaquin", { big: o.big }));
    row.append(left, el("span", "pl " + (union.line === "pending" ? "pending" : "")), rightWrap);
  } else {
    row.appendChild(cardEl(pid, { big: o.big }));
    if (partner && PEOPLE[partner]) {
      if (union.kind === "parentage") {
        row.appendChild(el("span", "parentage-label", union.label || "PARENTAGE ONLY · MARITAL STATUS NOT ESTABLISHED"));
      } else {
        row.appendChild(el("span", "pl " + (union.line === "pending" ? "pending" : "")));
      }
      row.appendChild(cardEl(partner, { big: o.big }));
    }
  }
  return row;
}
function nodeEl(pid) {
  const n = el("div", "node");
  n.dataset.pid = pid;
  const unions = unionsOf(pid);
  if (unions.length) {
    unions.forEach((u, index) => {
      const unit = el("div", "union-unit");
      unit.dataset.line = u.line || "blood";
      unit.appendChild(coupleEl(pid, { union: u, unionIndex: index }));
      if (u.kids && u.kids.length) {
        const ul = el("ul", "kids");
        u.kids.forEach((kid) => {
          if (!PEOPLE[kid]) return;
          const li = el("li", "child-node " + (PEOPLE[kid].added ? "pending" : (u.line || "blood")));
          li.dataset.child = kid;
          li.appendChild(nodeEl(kid));
          ul.appendChild(li);
        });
        unit.appendChild(ul);
      }
      n.appendChild(unit);
    });
  } else {
    n.appendChild(coupleEl(pid));
  }
  if (CHIP[pid]) n.appendChild(el("div", "chip", esc(CHIP[pid])));
  return n;
}

function branchEl(cid, i, total) {
  const b = el("section", "branch");
  b.id = "branch_" + cid;
  b.dataset.pid = cid;
  b.appendChild(
    el("div", "branch-top", "<span>GENERATION II</span><span>" + String(i + 1).padStart(2, "0") + " / " + total + "</span>")
  );
  b.appendChild(nodeEl(cid));
  if (BRANCH_NOTE[cid]) b.appendChild(el("p", "branch-note", esc(BRANCH_NOTE[cid])));
  return b;
}

/* ---------- the whole page ---------- */
function renderAll() {
  kinshipIndex = buildKinshipIndex();
  heritageIndex = buildHeritageIndex();
  stage.textContent = "";

  const main = el("section", "main-tree");
  main.id = "mainLineage";
  main.appendChild(el("div", "tree-overline", "LACSAMANA × ORTEGA · CONNECTED FAMILY TREE"));
  main.appendChild(el("div", "tree-caption", "Martin Lacsamana and Narcisa Lopez → Ramona and eight recorded siblings · Ramona and Fr. Evaristo are linked to Leon and Francisca by reported parentage only; they did not marry."));
  main.appendChild(el("p", "heritage-flag-legend", '<span>🇵🇭 🇪🇸</span> marks Philippine family roots and Spanish-born ancestry through Evaristo Guadalupe y Villaverde. The flags identify heritage, not citizenship or an exact percentage.'));
  const root = el("div", "tree-root");
  root.id = "ancPanel";
  root.appendChild(nodeEl("martin-lacsamana"));
  main.appendChild(root);
  const evaristoOrigins = el("section", "ancestral-context-panel");
  evaristoOrigins.appendChild(el("div", "tree-overline", "FR. EVARISTO’S FAMILY OF ORIGIN"));
  evaristoOrigins.appendChild(el("p", "ancestral-context-note", "The supplied relatives update names Bernardino Guadalupe and Nicolasa Villaverde as Fr. Evaristo’s parents. This is a parentage record; their marital status is not established in the supplied note."));
  evaristoOrigins.appendChild(nodeEl("bernardino-guadalupe"));
  main.appendChild(evaristoOrigins);
  stage.appendChild(main);

  const records = el("section", "archive-extras");
  records.id = "otherRecordsPanel";
  records.appendChild(el("div", "tree-overline", "UNLINKED RESEARCH RECORDS"));
  records.appendChild(el("p", "research-caption", "These records are preserved in the archive, but are not connected to the main tree until the original evidence confirms the relationship."));
  const recordRow = el("div", "research-node-row");
  ["leon-bulacan", "leon-teodora", "leon-laguna"].forEach((id) => recordRow.appendChild(nodeEl(id)));
  records.appendChild(recordRow);

  const unplaced = el("div", "unplaced-names");
  unplaced.appendChild(el("span", "research-caption", "OTHER NAMES AWAITING A DOCUMENTED CONNECTION"));
  ["catalino", "romana", "mario-lac", "emmanuel-victor"].forEach((id) => {
    if (PEOPLE[id]) unplaced.appendChild(cardEl(id));
  });
  records.appendChild(unplaced);
  stage.appendChild(records);

  const people = Object.values(PEOPLE).filter((p) => !p.same).length;
  const stat = $("#stat");
  if (stat) stat.textContent = people + " profiles · 2 connected sibling lines · cousin mode available";
  if ($("#statPeople")) $("#statPeople").textContent = people;
  if ($("#statBranches")) $("#statBranches").textContent = 14;
  if ($("#statResearch")) $("#statResearch").textContent = 3;
  populateCousinSelect();
}

/* ---------- connector lines between the big sections ----------
   Everything inside a branch (couple → children) is drawn with CSS, so
   it can never come loose. Only the long links are drawn here, measured
   from the real card positions, and they sit ABOVE the panels. */
function rel(e) {
  let x = 0, y = 0;
  while (e && e !== treeMap) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent;
  }
  return { x, y };
}
function box(e) {
  const r = rel(e);
  return { x: r.x, y: r.y, w: e.offsetWidth, h: e.offsetHeight };
}
function seg(d, cls) {
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", d);
  p.setAttribute("class", cls || "");
  svg.appendChild(p);
}
function txt(x, y, s, cls) {
  const t = document.createElementNS(NS, "text");
  t.setAttribute("x", x);
  t.setAttribute("y", y);
  if (cls) t.setAttribute("class", cls);
  t.textContent = s;
  svg.appendChild(t);
}

function layoutTop() { /* Structural connectors are rendered with the family tree elements. */ }
function drawLines() {
  svg.textContent = "";
  const W = Math.max(treeMap.offsetWidth, 1), H = Math.max(treeMap.offsetHeight, 1);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  const treeRect = treeMap.getBoundingClientRect();
  const scale = zoom || 1;
  const measure = (node) => {
    const r = node.getBoundingClientRect();
    return {
      x: (r.left - treeRect.left) / scale,
      y: (r.top - treeRect.top) / scale,
      w: r.width / scale,
      h: r.height / scale,
    };
  };
  $$(".union-unit").forEach((unit) => {
    const couple = unit.querySelector(":scope > .couple");
    const kids = unit.querySelector(":scope > .kids");
    if (!couple || !kids || !kids.children.length) return;
    const p = measure(couple);
    const parentX = p.x + p.w / 2;
    const parentY = p.y + p.h - 2;
    const childCards = Array.from(kids.children).map((li) => li.querySelector(":scope > .node .card")).filter(Boolean);
    if (!childCards.length) return;
    const children = childCards.map(measure).map((r) => ({ x: r.x + r.w / 2, y: r.y + 2 }));
    const topY = Math.min(...children.map((c) => c.y));
    const gap = Math.max(14, Math.min(26, (topY - parentY) * 0.45));
    const busY = Math.min(topY - 4, parentY + gap);
    const line = unit.dataset.line || "blood";
    const path = document.createElementNS(NS, "path");
    let d = "M " + parentX + " " + parentY + " V " + busY;
    if (children.length > 1) {
      const xs = children.map((c) => c.x);
      d += " M " + Math.min(...xs) + " " + busY + " H " + Math.max(...xs);
    }
    children.forEach((c) => { d += " M " + c.x + " " + busY + " V " + c.y; });
    path.setAttribute("d", d);
    path.setAttribute("class", "family-connector " + line);
    svg.appendChild(path);
  });
}
function $$(s, r) { return Array.from((r || treeMap).querySelectorAll(s)); }

let linesRaf = 0;
function scheduleLines() {
  cancelAnimationFrame(linesRaf);
  linesRaf = requestAnimationFrame(() => {
    layoutTop();
    drawLines();
  });
}

/* ---------- person details panel ---------- */
let activePersonId = "adrian";
function allPartners(pid) {
  const out = new Set();
  UNIONS.forEach((u) => {
    if (u.kind === "parentage") return;
    if (u.a === pid && u.b) out.add(u.b);
    if (u.b === pid && u.a) out.add(u.a);
  });
  return Array.from(out).filter((id) => PEOPLE[id]);
}
function personLinks(ids, label) {
  if (!ids || !ids.length) return '<p class="relationship-empty">No ' + esc(label.toLowerCase()) + ' recorded yet.</p>';
  return '<div class="relationship-links">' + ids.map((id) => '<button type="button" data-kinship-focus="' + esc(id) + '">' + esc(nameOf(PEOPLE[id])) + '</button>').join("") + '</div>';
}
function cousinGroupsFor(pid) {
  const cousins = kinshipSummary(pid).cousins;
  const groups = new Map();
  cousins.forEach((c) => {
    const label = cousinLabel(c);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(c);
  });
  return groups;
}
function showPersonDetails(pid, silent) {
  const p = PEOPLE[pid];
  const panel = $("#personDetails");
  if (!p || !panel) return;
  activePersonId = pid;
  const evidence = statusInfo(p);
  const kin = kinshipSummary(pid);
  const parents = (kinshipIndex.parents.get(pid) || []).map((x) => x.id).filter((id) => PEOPLE[id]);
  const partners = allPartners(pid);
  const children = kidsOf(pid).map((x) => x.id).filter((id) => PEOPLE[id]);
  const cousinButton = '<button type="button" class="drawer-cousin-action" data-open-cousins="' + esc(pid) + '">Show cousins of ' + esc(nameOf(p)) + '</button>';
  panel.innerHTML =
    '<div class="detail-top"><div><div class="panel-kicker">FAMILY PROFILE</div><h3 id="profileTitle" class="detail-name">' + esc(nameOf(p)) + heritageFlagsMarkup(pid) + '</h3><p>' + esc(roleOf(p)) + (p.d ? ' · ' + esc(p.d) : '') + '</p></div><span class="evidence-tag ' + evidence[1] + '">' + esc(evidence[0]) + '</span></div>' +
    (p.n ? '<p class="detail-note">' + esc(p.n) + '</p>' : '<p class="detail-note">No additional historical note has been added for this person yet.</p>') +
    historicalSectionsMarkup(pid) +
    heritagePanelMarkup(pid) +
    '<div class="identity-facts" aria-label="Nationality and religion">' +
      '<div class="identity-fact"><span>Nationality</span><strong>' + esc(p.nationality || "Not documented in available sources") + '</strong>' + (p.nationalityNote ? '<small>' + esc(p.nationalityNote) + '</small>' : '') + (p.nationalitySource ? '<a href="' + esc(p.nationalitySource) + '" target="_blank" rel="noopener">Nationality source</a>' : '') + '</div>' +
      '<div class="identity-fact"><span>Religion</span><strong>' + esc(p.religion || "Not documented in available sources") + '</strong>' + (p.religionNote ? '<small>' + esc(p.religionNote) + '</small>' : '') + (p.religionSource ? '<a href="' + esc(p.religionSource) + '" target="_blank" rel="noopener">Religion source</a>' : '') + '</div>' +
    '</div>' +
    '<div class="relationship-grid">' +
    '<section class="relationship-section"><h4>Parents of ' + esc(nameOf(p)) + '</h4>' + personLinks(parents, "parents") + '</section>' +
    '<section class="relationship-section"><h4>Spouse / partners of ' + esc(nameOf(p)) + '</h4>' + personLinks(partners, "spouse / partners") + '</section>' +
    '<section class="relationship-section"><h4>Children of ' + esc(nameOf(p)) + '</h4>' + personLinks(children, "children") + '</section>' +
    '<section class="relationship-section"><h4>Sisters and brothers of ' + esc(nameOf(p)) + '</h4>' + personLinks(kin.siblings, "sisters and brothers") + '</section>' +
    '</div>' +
    '<div class="detail-actions"><button type="button" class="btn" data-detail-focus="' + esc(pid) + '">Locate in tree</button>' + cousinButton + '</div>';
  const select = $("#cousinPersonSelect");
  if (select && PEOPLE[pid]) select.value = pid;
  if (!silent) {
    const drawer = $("#profileDrawer");
    const backdrop = $("#drawerBackdrop");
    if (drawer) {
      drawer.hidden = false;
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-modal", "true");
      drawer.setAttribute("aria-labelledby", "profileTitle");
      drawer.setAttribute("aria-label", "Profile for " + nameOf(p));
    }
    if (backdrop) backdrop.hidden = false;
    if ($("#cousinExplorer") && !$("#cousinExplorer").hidden) renderCousinExplorer();
    requestAnimationFrame(() => $("#closeProfile")?.focus({ preventScroll: true }));
  }
}

/* ---------- editing, adding and removing people ---------- */
function rebuild() {
  resetData();
  applyStore();
  renderAll();
  buildFamilies();
  populateCousinSelect();
  scheduleLines();
}

function selectAll(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function addPerson(parent, as, unionB) {
  const id = "n" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  store.add.push({
    id, parent, as,
    unionB: as === "child" ? (unionB || "") : "",
    name: as === "child" ? "New child — name needed" : "New partner — name needed",
    role: "Added by you",
  });
  saveStore();
  rebuild();
  const card = treeMap.querySelector('.card[data-pid="' + id + '"]');
  if (card) {
    focusBox(box(card), { pad: 220, max: 1 });
    const h = card.querySelector('[data-f="name"]');
    if (h) {
      h.focus();
      selectAll(h);
    }
  }
}

function removePerson(id) {
  const gone = new Set([id]);
  let more = true;
  while (more) {
    more = false;
    store.add.forEach((a) => {
      if (gone.has(a.parent) && !gone.has(a.id)) {
        gone.add(a.id);
        more = true;
      }
    });
  }
  if (gone.size > 1 && !window.confirm("Remove this person and everyone you added under them?")) return;
  store.add = store.add.filter((a) => !gone.has(a.id));
  gone.forEach((g) => delete store.over[g]);
  saveStore();
  rebuild();
}

function startEdit(card) {
  const p = PEOPLE[card.dataset.pid];
  const h = card.querySelector('[data-f="name"]'), m = card.querySelector('[data-f="role"]');
  if (!p || !h || !m) return;
  [h, m].forEach((n) => {
    n.contentEditable = "true";
    n.spellcheck = false;
  });
  m.textContent = roleOf(p);
  h.focus();
  selectAll(h);
}

function commit(pid, field, text) {
  const p = PEOPLE[pid];
  if (!p) return;
  text = text.replace(/\s+/g, " ").trim();
  const o = (store.over[pid] = store.over[pid] || {});
  const base = field === "name" ? p.name : p.role;
  if (!text || text === base) delete o[field];
  else o[field] = text;
  if (!Object.keys(o).length) delete store.over[pid];
  saveStore();
}

function refreshCard(card) {
  const fresh = cardEl(card.dataset.pid, {
    head: card.dataset.head === "1",
    big: card.classList.contains("big"),
    unionIndex: card.dataset.unionIndex != null ? Number(card.dataset.unionIndex) : null,
    unionB: card.dataset.unionB || "",
  });
  card.replaceWith(fresh);
}

let lastProfileTrigger = null;
function closeProfileDrawer(restoreFocus = true) {
  const drawer = $("#profileDrawer");
  const backdrop = $("#drawerBackdrop");
  if (drawer) drawer.hidden = true;
  if (backdrop) backdrop.hidden = true;
  if (restoreFocus && lastProfileTrigger && lastProfileTrigger.isConnected) {
    lastProfileTrigger.focus({ preventScroll: true });
  }
}
treeMap.addEventListener("click", (e) => {
  const card = e.target.closest(".card[data-pid]");
  if (card) { lastProfileTrigger = card; showPersonDetails(card.dataset.pid); }
});

$("#personDetails").addEventListener("click", (e) => {
  const kin = e.target.closest("[data-kinship-focus]");
  if (kin) { focusPeople([kin.dataset.kinshipFocus]); return; }
  const b = e.target.closest("[data-detail-focus]");
  if (b) { focusPeople([b.dataset.detailFocus]); return; }
  const cousins = e.target.closest("[data-open-cousins]");
  if (cousins) {
    activePersonId = cousins.dataset.openCousins;
    setCousinMode(true);
    const select = $("#cousinPersonSelect");
    if (select) select.value = activePersonId;
    renderCousinExplorer();
  }
});

$("#cousinToggle").addEventListener("click", () => setCousinMode($("#cousinExplorer").hidden));
$("#cousinPersonSelect").addEventListener("change", renderCousinExplorer);
$("#closeCousins").addEventListener("click", () => setCousinMode(false));
$("#closeProfile").addEventListener("click", () => closeProfileDrawer());
$("#drawerBackdrop").addEventListener("click", () => closeProfileDrawer());
treeMap.addEventListener("focusout", (e) => {
  const f = e.target;
  if (!f.isContentEditable || !f.dataset || !f.dataset.f) return;
  const card = f.closest(".card");
  if (!card) return;
  commit(card.dataset.pid, f.dataset.f, f.textContent);
  if (!card.contains(e.relatedTarget)) refreshCard(card);
});
treeMap.addEventListener("keydown", (e) => {
  if (e.target.isContentEditable && e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".card")) {
    e.preventDefault();
    document.querySelectorAll(".card.sel").forEach((c) => c.classList.remove("sel"));
    e.target.classList.add("sel");
    showPersonDetails(e.target.dataset.pid);
  }
});


/* ---------- cousin mode: names, degrees and direct navigation ---------- */
function populateCousinSelect() {
  const select = $("#cousinPersonSelect");
  if (!select) return;
  const current = select.value || activePersonId || "adrian";
  select.textContent = "";
  Object.values(PEOPLE).filter((p) => !p.same).sort((a, b) => nameOf(a).localeCompare(nameOf(b))).forEach((p) => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = nameOf(p);
    select.appendChild(option);
  });
  select.value = PEOPLE[current] ? current : (PEOPLE.adrian ? "adrian" : select.options[0]?.value || "");
}
function renderCousinExplorer() {
  const panel = $("#cousinExplorer");
  const results = $("#cousinResults");
  const select = $("#cousinPersonSelect");
  if (!panel || !results || !select) return;
  const pid = select.value || activePersonId || "adrian";
  const name = PEOPLE[pid] ? nameOf(PEOPLE[pid]) : "Selected family member";
  const groups = cousinGroupsFor(pid);
  results.textContent = "";
  const ordered = Array.from(groups.entries()).sort((a, b) => {
    const rank = (label) => {
      const degree = parseInt(label, 10) || 99;
      const removedMatch = label.match(/(\d+) times removed/);
      const removed = /once removed/.test(label) ? 1 : /twice removed/.test(label) ? 2 : (removedMatch ? Number(removedMatch[1]) : 0);
      return [degree, removed];
    };
    const ra = rank(a[0]), rb = rank(b[0]);
    return ra[0] - rb[0] || ra[1] - rb[1] || a[0].localeCompare(b[0]);
  });
  if (!ordered.length) {
    results.appendChild(el("p", "cousin-empty", "No cousin relationships can be calculated for " + name + " from the parent–child links currently recorded."));
  }
  ordered.forEach(([label, list]) => {
    const section = el("section", "cousin-degree");
    section.appendChild(el("h4", "", label + " of " + name));
    const names = el("div", "cousin-name-list");
    list.forEach((c) => {
      const exactRelation = label + ' of ' + name;
      const button = el("button", "cousin-name", esc(nameOf(PEOPLE[c.id])) + (c.provisional ? '<small>' + esc(exactRelation) + ' · includes an unverified link</small>' : '<small>' + esc(exactRelation) + '</small>'));
      button.type = "button";
      button.dataset.kinshipFocus = c.id;
      button.title = nameOf(PEOPLE[c.id]) + " — " + label + " of " + name;
      names.appendChild(button);
    });
    section.appendChild(names);
    results.appendChild(section);
  });
  const cousinIds = new Set(kinshipSummary(pid).cousins.map((c) => c.id));
  treeMap.classList.add("cousin-mode");
  $$(".card").forEach((card) => {
    card.classList.toggle("cousin-hit", cousinIds.has(card.dataset.pid));
    card.classList.toggle("cousin-anchor", card.dataset.pid === pid);
  });
}
function setCousinMode(on) {
  const toggle = $("#cousinToggle");
  const panel = $("#cousinExplorer");
  if (!toggle || !panel) return;
  toggle.setAttribute("aria-pressed", on ? "true" : "false");
  toggle.classList.toggle("active", on);
  toggle.textContent = on ? "Cousins: On" : "Cousins: Off";
  panel.hidden = !on;
  if (on) {
    populateCousinSelect();
    const select = $("#cousinPersonSelect");
    if (select && PEOPLE[activePersonId]) select.value = activePersonId;
    renderCousinExplorer();
    requestAnimationFrame(() => select?.focus({ preventScroll: true }));
  } else {
    treeMap.classList.remove("cousin-mode");
    $$(".card.cousin-hit, .card.cousin-anchor").forEach((card) => card.classList.remove("cousin-hit", "cousin-anchor"));
    requestAnimationFrame(() => toggle.focus({ preventScroll: true }));
  }
}

/* ---------- pan, zoom and navigation ---------- */
const MIN_ZOOM = 0.03, MAX_ZOOM = 2.5;
let zoom = 1, panX = 20, panY = 20, touched = false;
const zoomText = $("#zoomText");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function apply() {
  treeMap.style.transform = "translate3d(" + panX + "px," + panY + "px,0) scale(" + zoom + ")";
  zoomText.textContent = Math.round(zoom * 100) + "%";
}
function glide(on) {
  treeMap.style.transition = on ? "transform .45s cubic-bezier(.2,.7,.2,1)" : "";
}
function zoomAt(next, cx, cy) {
  const r = viewport.getBoundingClientRect();
  const x = cx - r.left, y = cy - r.top;
  const mx = (x - panX) / zoom, my = (y - panY) / zoom;
  zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
  panX = x - mx * zoom;
  panY = y - my * zoom;
  apply();
}
function zoomStep(f) {
  touched = true;
  glide(true);
  const r = viewport.getBoundingClientRect();
  zoomAt(zoom * f, r.left + r.width / 2, r.top + r.height / 2);
  setTimeout(() => glide(false), 480);
}
function focusBox(b, o) {
  o = o || {};
  const pad = o.pad != null ? o.pad : 40;
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  if (o.glide) glide(true);
  zoom = clamp(Math.min(vw / (b.w + pad * 2), vh / (b.h + pad * 2), o.max || 1), MIN_ZOOM, MAX_ZOOM);
  panX = vw / 2 - (b.x + b.w / 2) * zoom;
  panY = vh / 2 - (b.y + b.h / 2) * zoom;
  apply();
  if (o.glide) setTimeout(() => glide(false), 480);
}
function fitTree(animated) {
  focusBox({ x: 0, y: 0, w: treeMap.offsetWidth, h: treeMap.offsetHeight }, { pad: 8, max: 0.95, glide: animated === true });
}
/* on a phone the header scrolls away, so only a sticky one needs room */
const narrow = () => viewport.clientWidth < 700;
function stickyH() {
  const h = $(".site-header");
  return getComputedStyle(h).position === "sticky" ? h.offsetHeight : 0;
}
function showViewport() {
  const hh = stickyH();
  const top = viewport.getBoundingClientRect().top;
  if (top < hh || top > window.innerHeight * 0.45) {
    window.scrollTo({ top: top + window.scrollY - hh - 8, behavior: "smooth" });
  }
}
/* the view the page opens in: the whole tree on a laptop or desktop, the
   family roots on a phone or small tablet (the whole tree there would be
   a few pixels wide and nobody could read it) */
function startView() {
  const root = $("#mainLineage");
  if (!root) return;
  const focusIds = ["martin-lacsamana", "narcisa-lopez", "ramona-lopez", "evaristo-guadalupe"];
  const cards = focusIds.map((id) => treeMap.querySelector('.card[data-pid="' + id + '"]')).filter(Boolean);
  if (!cards.length) { fitTree(false); return; }
  const boxes = cards.map(box);
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  focusBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { pad: narrow() ? 130 : 175, max: narrow() ? 1.1 : 1.25 });
}

/* drag to move, pinch to zoom */
const pts = new Map();
let drag = null, pinch = null, down = null;
const NOGRAB = "button, a, input, textarea, select, .card, [contenteditable='true']";
viewport.addEventListener("pointerdown", (e) => {
  if (e.target.closest(NOGRAB)) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  touched = true;
  glide(false);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
  if (pts.size === 1) {
    drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    down = { x: e.clientX, y: e.clientY };
    viewport.classList.add("is-dragging");
  } else if (pts.size === 2) {
    const v = Array.from(pts.values());
    drag = null;
    down = null;
    pinch = { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1, z: zoom };
  }
  e.preventDefault();
});
viewport.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pts.size >= 2) {
    const v = Array.from(pts.values());
    const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1;
    zoomAt(pinch.z * (d / pinch.d), (v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2);
  } else if (drag) {
    panX = drag.px + e.clientX - drag.x;
    panY = drag.py + e.clientY - drag.y;
    apply();
  }
});
function endPointer(e) {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (pts.size < 2) pinch = null;
  if (pts.size === 0) {
    drag = null;
    viewport.classList.remove("is-dragging");
    down = null;
  } else if (pts.size === 1) {
    const p = Array.from(pts.values())[0];
    drag = { x: p.x, y: p.y, px: panX, py: panY };
  }
}
viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  touched = true;
  glide(false);
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(zoom * Math.exp(-dy * 0.0015), e.clientX, e.clientY);
}, { passive: false });
viewport.addEventListener("dblclick", (e) => {
  if (e.target.closest(NOGRAB)) return;
  touched = true;
  zoomAt(zoom * 1.25, e.clientX, e.clientY);
});
viewport.addEventListener("keydown", (e) => {
  if (e.target.isContentEditable) return;
  const step = 80;
  const k = e.key;
  if (k === "+" || k === "=") zoomStep(1.25);
  else if (k === "-") zoomStep(0.8);
  else if (k === "0") fitTree(true);
  else if (k === "ArrowLeft") panX += step;
  else if (k === "ArrowRight") panX -= step;
  else if (k === "ArrowUp") panY += step;
  else if (k === "ArrowDown") panY -= step;
  else return;
  e.preventDefault();
  touched = true;
  apply();
});

/* ---------- jump to a person or a group of people ---------- */
let hlTimer = 0;
function focusPeople(ids) {
  const set = new Set(ids);
  ids.forEach((id) => {
    const p = PEOPLE[id];
    if (p && p.same) set.add(p.same);
    Object.keys(PEOPLE).forEach((k) => PEOPLE[k].same === id && set.add(k));
  });
  const cards = Array.from(set)
    .map((id) => treeMap.querySelector('.card[data-pid="' + id + '"]'))
    .filter(Boolean);
  if (!cards.length) return;
  showPersonDetails(cards[0].dataset.pid);
  touched = true;
  showViewport();
  const bs = cards.map(box);
  const x0 = Math.min.apply(null, bs.map((b) => b.x)), y0 = Math.min.apply(null, bs.map((b) => b.y));
  const x1 = Math.max.apply(null, bs.map((b) => b.x + b.w)), y1 = Math.max.apply(null, bs.map((b) => b.y + b.h));
  focusBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { pad: 90, max: 1, glide: true });
  document.querySelectorAll(".card.hl").forEach((c) => c.classList.remove("hl"));
  cards.forEach((c) => c.classList.add("hl"));
  treeMap.classList.add("focusing");
  clearTimeout(hlTimer);
  hlTimer = setTimeout(() => {
    cards.forEach((c) => c.classList.remove("hl"));
    treeMap.classList.remove("focusing");
  }, 3600);
}

const NAV = {
  roots() {
    focusPeople(["martin-lacsamana", "narcisa-lopez", "ramona-lopez", "evaristo-guadalupe"]);
  },
  ortega() { focusPeople(["manuel"]); },
  leon() { focusPeople(["leon"]); },
  research() {
    showViewport();
    const b = $("#otherRecordsPanel");
    if (b) focusBox(box(b), { pad: 34, max: narrow() ? 0.8 : 0.95, glide: true });
  },
  geography() {
    const target = $("#geographic-map");
    if (!target) return NAV.archive();
    const y = target.getBoundingClientRect().top + window.scrollY - stickyH() - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
    setTimeout(() => familyMigrationMap && familyMigrationMap.invalidateSize({pan:false}), 260);
  },
  nameHistory() {
    const target = $("#name-history");
    if (!target) return NAV.families();
    const y = target.getBoundingClientRect().top + window.scrollY - stickyH() - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
  },
  archive() {
    const target = $("#family-archive");
    if (!target) return NAV.families();
    const y = target.getBoundingClientRect().top + window.scrollY - stickyH() - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
  },
  families() {
    const y = $("#sources").getBoundingClientRect().top + window.scrollY - stickyH() - 12;
    window.scrollTo({ top: y, behavior: "smooth" });
  },
  adrian() { focusPeople(["eduardo", "purita-argueza", "jeffrey", "adrian", "sister"]); },
};
document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => {
  NAV[b.dataset.nav]();
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    const active = nav === b;
    nav.classList.toggle("is-active", active);
    if (active) nav.setAttribute("aria-current", "location"); else nav.removeAttribute("aria-current");
  });
}));
$("#zin").addEventListener("click", () => zoomStep(1.25));
$("#zout").addEventListener("click", () => zoomStep(0.8));
$("#fit").addEventListener("click", () => {
  touched = true;
  fitTree(true);
});
// the same three buttons, sitting on the canvas (shown on phones)
$("#vzin").addEventListener("click", () => zoomStep(1.25));
$("#vzout").addEventListener("click", () => zoomStep(0.8));
$("#vfit").addEventListener("click", () => {
  touched = true;
  fitTree(true);
});

/* ---------- search ---------- */
const q = $("#q"), qres = $("#qres");
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
q.addEventListener("input", () => {
  const t = norm(q.value.trim());
  qres.textContent = "";
  if (t.length < 2) {
    qres.hidden = true;
    q.setAttribute("aria-expanded", "false");
    return;
  }
  const hits = Object.values(PEOPLE).filter((p) => !p.same && norm(nameOf(p) + " " + roleOf(p)).includes(t)).slice(0, 8);
  hits.forEach((p) => {
    const b = el("button", "", esc(nameOf(p)) + "<small>" + esc(roleOf(p)) + "</small>");
    b.type = "button";
    b.addEventListener("click", () => {
      qres.hidden = true;
      q.setAttribute("aria-expanded", "false");
      q.value = "";
      focusPeople([p.id]);
    });
    qres.appendChild(b);
  });
  if (!hits.length) qres.appendChild(el("button", "", "No one found<small>Try part of a name</small>"));
  qres.hidden = false;
  q.setAttribute("aria-expanded", "true");
  qres.querySelectorAll("button").forEach((item) => item.setAttribute("role", "option"));
});
q.addEventListener("keydown", (e) => {
  const items = Array.from(qres.querySelectorAll("button:not(:disabled)"));
  if (e.key === "Escape") {
    qres.hidden = true;
    q.setAttribute("aria-expanded", "false");
    q.blur();
  } else if (e.key === "ArrowDown" && items.length) {
    e.preventDefault(); items[0].focus();
  } else if (e.key === "Enter") {
    const first = qres.querySelector("button:not(:disabled)");
    if (first) first.click();
  }
});
qres.addEventListener("keydown", (e) => {
  const items = Array.from(qres.querySelectorAll("button:not(:disabled)"));
  const index = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" && items.length) { e.preventDefault(); items[Math.min(index + 1, items.length - 1)].focus(); }
  else if (e.key === "ArrowUp" && items.length) { e.preventDefault(); if (index <= 0) q.focus(); else items[index - 1].focus(); }
  else if (e.key === "Escape") { qres.hidden = true; q.setAttribute("aria-expanded", "false"); q.focus(); }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) { qres.hidden = true; q.setAttribute("aria-expanded", "false"); }
});

/* ---------- index of connected families ---------- */
function buildFamilies() {
  const grid = $("#famGrid");
  if (!grid) return;
  grid.textContent = "";
  FAMILY_INDEX.forEach((f) => {
    const ids = f.ids.filter((id) => PEOPLE[id]);
    const card = el("div", "fam", "<h3>" + esc(f.name) + "</h3><p>" + esc(f.how) + "</p>");
    const b = el("button", "btn", "Locate people");
    b.type = "button";
    b.addEventListener("click", () => focusPeople(ids));
    card.appendChild(b);
    grid.appendChild(card);
  });
}

/* ---------- export / import / reset ---------- */
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "lacsamana-tree-edits.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$("#importBtn").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s || typeof s !== "object" || !s.over || !Array.isArray(s.add)) throw new Error("shape");
      store = { over: s.over, add: s.add };
      saveStore();
      rebuild();
    } catch (err) {
      window.alert("That file doesn’t look like an export from this page.");
    }
  };
  r.readAsText(f);
  e.target.value = "";
});
$("#resetBtn").addEventListener("click", () => {
  if (!window.confirm("Remove every name you typed and every person you added in this browser?")) return;
  store = { over: {}, add: [] };
  saveStore();
  rebuild();
});

/* =====================================================================
   FAMILY HISTORY ARCHIVE — timeline, locations, records, biographies,
   oral history, research gaps, and property leads. This data is separate
   from the core family tree so archive notes never alter parent links.
   ===================================================================== */
const ARCHIVE_KEY = "lacsamana-family-archive:v1";
const emptyArchiveStore = () => ({ stories: [], achievements: [], properties: [], links: [], institutions: [], lifeStories: [], homeEntries: [], migrationStories: [] });
let archiveStore = emptyArchiveStore();
function loadArchiveStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || "null");
    if (raw && typeof raw === "object") {
      archiveStore = {
        stories: Array.isArray(raw.stories) ? raw.stories : [],
        achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
        properties: Array.isArray(raw.properties) ? raw.properties : [],
        links: Array.isArray(raw.links) ? raw.links : [],
        institutions: Array.isArray(raw.institutions) ? raw.institutions : [],
        lifeStories: Array.isArray(raw.lifeStories) ? raw.lifeStories : [],
        homeEntries: Array.isArray(raw.homeEntries) ? raw.homeEntries : [],
        migrationStories: Array.isArray(raw.migrationStories) ? raw.migrationStories : [],
      };
    }
  } catch (e) { /* Keep the built-in archive if local storage is unavailable. */ }
}
function saveArchiveStore() {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archiveStore)); }
  catch (e) { window.alert("The browser could not save this archive entry. Export existing notes and check available browser storage."); }
  if (window.FamilyCloud) window.FamilyCloud.queueArchiveState(archiveStore);
}
function archiveId(prefix) { return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function archiveText(value, fallback) { return value && String(value).trim() ? String(value).trim() : (fallback || "Not documented"); }
function archiveButton(label, id, cls) {
  return '<button type="button" class="' + (cls || 'archive-person-link') + '" data-archive-person="' + esc(id) + '">' + esc(label) + '</button>';
}
const SURNAME_REGISTER = [
  ["Lacsamana", "Core family surname", "Appears in the supplied direct La Union lineage, the Ortega-Lacsamana branch, and Maria de la Expectacion Lopez Lacsamana; spelling clarified by the family."],
  ["Laksamana", "Related linguistic form", "Malay word discussed in the surname-origin note; not established as a spelling used by this particular family branch."],
  ["Lopez", "Family surname", "Appears in Narcisa Lopez, Ramona Lopez Lacsamana, and eight newly listed siblings in the family-supplied update."],
  ["Guadalupe · Villaverde", "Evaristo’s reported parental surnames", "The supplied relatives update names Bernardino Guadalupe and Nicolasa Villaverde as the parents of Fr. Evaristo Guadalupe y Villaverde, OSA."]
  ["Ortega", "Family surname", "Appears in the descendants of Doña Francisca and Don Joaquin."],
  ["Guadalupe", "Ancestral surname", "Appears in Evaristo Guadalupe y Villaverde."],
  ["Villaverde", "Ancestral surname", "Appears in Evaristo Guadalupe y Villaverde."],
  ["Verzosa", "Ortega family record", "Appears in Antonio Ortega y Verzosa."],
  ["Joaquino / Juaquino", "Spelling variation to verify", "The supplied notes show both spellings in connection with Joaquin's maternal surname."],
  ["Munar", "Marriage / family surname", "Appears in Cayetana Munar and her daughter Paz Munar Lacsamana; Paz later married her first cousin Jose Alvaro “Pepe” Ortega."],
  ["Garcia", "Marriage surname", "Appears in Emilia / Emiliana Garcia, reported as Leon's second wife."],
  ["Valdivia · Bautista", "Marriage-family surnames", "Dr. Juanita Valdivia Lacsamana’s formal maiden surname is Valdivia. “Valdris” is retained as a clerical transcription variant in an earlier index; her parents are Andres Valdivia and Marcelina Bautista."],
  ["Viloria · Nuval", "Marriage-family surnames", "Appear in the supplied indexed marriage information for Concepcion Viloria and her parents."],
  ["Lomiteng · Buyao", "Marriage-family surnames", "Appear in the supplied indexed marriage information for Pacita Lomiteng and her parents."],
  ["Argueza · Rillera", "Marriage-family surnames", "Appear in the supplied indexed marriage information for Purita Argueza and her parents."],
  ["Capalad · Lacanilao", "Separate record groups", "Appear in separate Leon Lacsamana index groups; do not merge those groups into Don Leon's La Union line without evidence."],
  ["Santos · David · Timbal", "Record-associated surnames", "Appear in Bulacan / Manila records; some named individuals have unspecified roles in the supplied extracts."],
  ["Sombillo · Samson", "Separate record group", "Appear in the Teodora Lacanilao / Maxima Lacsamana index group."],
  ["Panis · Jacinto", "Ortega descendant surnames", "Appear in the Vicenta Ortega descendant branch."],
  ["Balingit · Dacanay · Alviar", "Ortega descendant / spouse surnames", "Appear in the family index through descendants of Jose Alvaro Ortega and Paz Lacsamana."],
  ["Natarte", "Family surname", "Appears in the family-supplied parentage update for Sheryll Dacanay; original record not yet attached."],
  ["Gandingan", "Marriage-family surname", "Appears in the family-supplied spouse and descendant update for Jerry Lacsamana."],
  ["Agnes", "Marriage-family surname", "Appears in the family-supplied spouse update for Richard Lee; full identity details are not supplied."],
  ["Rivero · Favis", "Ortega descendant / spouse surnames", "Appear in the Luis Ortega branch and his wife's recorded name."],
  ["Montilla · Resurreccion", "Ortega descendant / spouse surnames", "Appear in the Ramona Ortega branch."],
  ["Agustin", "Parallel Lacsamana branch", "Appears as the maternal maiden surname in Mario Agustin Lacsamana’s full name."],
  ["Fornoles", "Lacsamana descendant / residence connection", "Appears in Linda Lacsamana Fornoles; family notes place her in Oxnard, California, alongside relatives Romeo and John Fornoles."],
  ["Maglaya · Benitez · Manguerra · Kleindienst", "Ortega descendant / spouse surnames", "Appear in marriages connected to the Ramona Ortega descendants."],
  ["Campos", "Ortega descendant surname", "Appears in Corazon Campos and the Francisco Isabelo Ortega branch."],
  ["Orros", "Ortega descendant surname", "Appears in the Manuela and Joaquina Ortega branches."],
  ["Nuesa", "Ortega spouse surname", "Appears in Felicula Nuesa, spouse of Joaquin 'Titing' Ortega."],
  ["Gonong · Peralta · Cantorna", "Ortega descendant surnames", "Appear in the Maria Ortega descendant branch."],
  ["Ubaldo · Bolong · Argel", "Ortega descendant surnames", "Appear in the Evaristo Ortega branch and the surnames of descendants / spouses."],
];
const ARCHIVE_EVENTS = [
  { date: "Date not established", sort: "0000-00-00", title: "Birth of Don Leon Lacsamana · date awaiting documentation", detail: "Don Leon’s birth is now explicitly included as a missing historical milestone. The Ortega Reunion 2017 souvenir program identifies Leon as Doña Francisca’s brother and describes him living in Carlatan and visiting family in Daya, but it does not state his birth date or birthplace. No year has been inferred from his sister’s 1877 birth. Add the date only when a reliable civil, church, or other historical record is located.", status: "Research gap · birth date and birthplace not yet established", people: ["leon"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf", urlLabel: "Family context source ↗" },
  { date: "1808–1814", sort: "1808-01-01", title: "French invasion and occupation of Spain", detail: "The supplied relatives update notes that French forces led by Napoleon conquered Spain in 1808 and that Spanish control was regained in 1814. This is retained as broad historical context; no personal involvement by Evaristo or his parents is established.", status: "Historical context from family-supplied note · independent citation not attached", people: [] },
  { date: "26 October 1830", sort: "1830-10-26", title: "Evaristo Guadalupe y Villaverde is born", detail: "The supplied FamilySearch screenshot lists Ocaña, Toledo, Spain as his birthplace.", status: "FamilySearch profile screenshot · Sources (0)", people: ["evaristo-guadalupe"], url: "https://www.familysearch.org/tree/person/details/G138-FPT" },
  { date: "1849 (year shown)", sort: "1849-01-01", title: "Ramona Lopez Lacsamana's recorded birth year", detail: "The supplied FamilySearch screenshot displays 1849; day and month are not shown.", status: "FamilySearch profile screenshot · original record not attached", people: ["ramona-lopez"], url: "https://www.familysearch.org/tree/person/details/GNHK-MZ3" },
  { date: "11 March 1866", sort: "1866-03-11", title: "Joaquin Ortega y Joaquino is born in Cebu", detail: "The Ortega Reunion 2017 souvenir program records this date and birthplace and identifies his parents as Antonio Ortega y Verzosa and Juana Joaquino. This is a published family-history source; an original baptismal or civil birth record remains desirable.", status: "Published family-history program · original birth record not attached", people: ["joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "9 March 1877", sort: "1877-03-09", title: "Doña Francisca is born in Bangar", detail: "The Ortega Reunion 2017 program gives this birth date and birthplace.", status: "Published family-history program", people: ["francisca"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "17 January 1887", sort: "1887-01-17", title: "Evaristo dies in San Juan, La Union", detail: "The date appears in the supplied FamilySearch screenshot and an Augustinian archival register cited in the current profile note.", status: "FamilySearch screenshot + Augustinian archival register", people: ["evaristo-guadalupe"], url: "https://www.agustinosvalladolid.es/estudio/investigacion/archivoagustiniano/archivofondos/archivo2019/archivo_2019.pdf" },
  { date: "8 March 1917", sort: "1917-03-08", title: "Juanita Valdivia Lacsamana is born in Alaminos", detail: "The supplied family biography gives this birth date and birthplace. The 1944 register scan's recorded age differs by about two months, so the discrepancy remains noted pending an original birth record.", status: "Family-supplied biography · birth record not attached", people: ["juanita-valdris"] },
  { date: "1889", sort: "1889-01-01", title: "Joaquin works with the Tabacalera in Carlatan", detail: "The Ortega Reunion 2017 family-history account states that Joaquin worked with the Compania General de Tabacos de Filipinas in Carlatan, San Fernando, in 1889. The date is from a published family-history narrative.", status: "Published family-history program", people: ["joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "1901–1904", sort: "1901-01-01", title: "Joaquin Ortega serves as Civil Governor of La Union", detail: "The Provincial Government of La Union commemorates Joaquin's appointment in 1901 and identifies his governorship as 1901–1904.", status: "Provincial Government of La Union", people: ["joaquin"], url: "https://launion.gov.ph/pglu-celebrates-don-joaquin-ortegas-life-and-memory/" },
  { date: "15 August 1901", sort: "1901-08-15", title: "Joaquin Ortega is appointed Civil Governor of La Union", detail: "The Provincial Government of La Union states that the Taft Commission appointed Joaquin Ortega on 15 August 1901 as the province's first Civil Governor.", status: "Provincial Government of La Union", people: ["joaquin"], url: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/" },
  { date: "1902", sort: "1902-01-01", title: "Joaquin Ortega becomes La Union's first elected governor", detail: "The Provincial Government of La Union states that he became the province's first elected governor the following year after his 1901 appointment.", status: "Provincial Government of La Union", people: ["joaquin"], url: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/" },
  { date: "1904", sort: "1904-01-01", title: "Joaquin attends the International Exposition in the United States", detail: "The Ortega Reunion 2017 family biography states that Joaquin joined Filipino governors attending the exposition and was selected as a juror, receiving a gold medal for his participation. This remains attributed to the family-history program pending independent exhibition records.", status: "Published family-history program · independent exposition record not attached", people: ["joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "1905–1914", sort: "1905-01-01", title: "Joaquin serves as Lieutenant Governor in northern sub-provinces", detail: "The Ortega Reunion 2017 biography records service in Abra, Bontoc and Mountain Province during this period. This detail is from the family-history publication and awaits corroboration against government appointment records.", status: "Published family-history program · original appointment records sought", people: ["joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "1916–1920", sort: "1916-01-01", title: "Joaquin receives assignments involving Lepanto and Benguet", detail: "The Ortega Reunion 2017 biography records similar duties for the sub-provinces of Lepanto and Benguet. Original appointment records have not been attached.", status: "Published family-history program · corroboration needed", people: ["joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "1920–1926", sort: "1920-01-01", title: "Joaquin serves as Special Agent of the Bureau of Non-Christian Tribes", detail: "The Ortega Reunion 2017 biography records this appointment and says he retired under the Osmeña Act in 1926. Original government service records are still needed.", status: "Published family-history program · corroboration needed", people: ["joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "31 May 1943", sort: "1943-05-31", title: "Don Joaquin Ortega dies", detail: "The Provincial Government of La Union records that Joaquin died on 31 May 1943 at age 77.", status: "Provincial Government of La Union · original civil death record not attached", people: ["joaquin"], url: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/" },
  { date: "8 October 1944", sort: "1944-10-08", title: "Alfredo 'Pidong' Lacsamana and Juanita marry", detail: "The supplied register-page scan shows record 6079, page 71, registration 108, and lists Alfredo's parents as Leon Lacsamana and Cayetana Munar. The wife's entry appears to read Juanita Valdivia, while the earlier index says Valdris. The scan records ages 27 and 27 years 9 months; the family biography gives Juanita's birth date as 8 March 1917, so the age and spelling differences remain open.", status: "User-supplied register-page scan · Luna, La Union · spelling and age discrepancy retained", people: ["alfredo-pidong", "juanita-valdris"], url: "assets/research/alfredo-pidong-juanita-valdivia-register-p71.png", urlLabel: "View register scan ↗" },
  { date: "25 October 1953", sort: "1953-10-25", title: "Rafaela Lacsamana dies in San Pablo City", detail: "A separate Laguna index lists document 687 and age 38. The index's sex / relationship classification conflicts with the given name; identity is not connected to the main La Union line.", status: "Separate index record · identity and sex classification need review", people: ["rafaela-lac" ] },
  { date: "2 January 1955", sort: "1955-01-02", title: "Joaquin Lacsamana and Concepcion Viloria marry", detail: "The supplied marriage contract places the wedding at the Immaculate Conception Church in San Fernando, La Union. It names Leon Lacsamana and Emilia Garcia as Joaquin's parents and Leocadio Viloria and Prisea Nuval as Concepcion's parents. The contract records ages 27 years 10 months and 26 years 10 months; an earlier index summary gives Concepcion age 29.", status: "Supplied marriage contract scan · recorded ages differ from earlier index notes", people: ["joaquin-lac", "concepcion-viloria"], url: "assets/research/joaquin-lacsamana-concepcion-viloria-1955-marriage-contract.png", urlLabel: "View marriage contract ↗" },
  { date: "8 September 1958", sort: "1958-09-08", title: "Francisco Lacsamana and Pacita Lomiteng marry", detail: "The supplied marriage contract places the wedding at the Office of the Justice of the Peace in San Fernando, La Union. It names Leon Lacsamana and Emiliana Garcia as Francisco's parents, and Mariano Lomiteng and Rafaela Buyao as Pacita's parents. The family notes also use the spelling Emilia Garcia.", status: "Supplied marriage contract scan · spouse-parent names recorded", people: ["francisco-lac", "pacita-lomiteng"], url: "assets/research/francisco-lacsamana-pacita-lomiteng-1958-marriage-contract.png", urlLabel: "View marriage contract ↗" },
  { date: "27 July 1959", sort: "1959-07-27", title: "Eduardo Lacsamana and Purita Argueza marry", detail: "The supplied marriage contract places the wedding at the Office of the Justice of the Peace in San Fernando, La Union. It names Leon Lacsamana and Emilia Garcia as Eduardo's parents, and Isabelo Argueza and Concepcion Rillera as Purita's parents. The contract records Eduardo age 36 years 11 months, conflicting with the earlier index-based estimate of c. 1933.", status: "Supplied marriage contract scan · Eduardo age / birth-year discrepancy retained", people: ["eduardo", "purita-argueza"], url: "assets/research/eduardo-lacsamana-purita-argueza-1959-marriage-contract.png", urlLabel: "View marriage contract ↗" },
  { date: "16 November 1962", sort: "1962-11-16", title: "Macario Lacsamana and Felicidad Santos marry", detail: "The supplied contract names Our Lady of Perpetual Help Parish as the place of marriage. It lists Leon Lacsamana and Alejandra Capalad as Macario's parents, and Ramon Santos and Candida Lacsamana as Felicidad's parents. This evidence supports the separate Leon / Bulacan–Manila record group, not the Don Leon of La Union branch.", status: "Supplied marriage contract scan · separate Leon record group", people: ["macario-lac", "felicidad-santos"], url: "assets/research/macario-lacsamana-felicidad-santos-1962-marriage-contract.png", urlLabel: "View marriage contract ↗" },
  { date: "3 April 1964", sort: "1964-04-03", title: "Doña Francisca dies", detail: "The Ortega Reunion 2017 family-history program gives this death date.", status: "Published family-history program", people: ["francisca"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "21 August 1985", sort: "1985-08-21", title: "Sheryll Dacanay is born", detail: "Birth date supplied by Adrian. Birthplace and original birth record have not been supplied.", status: "Family-supplied information · source record not attached", people: ["sheryll-dacanay"] },
  { date: "2017", sort: "2017-01-01", title: "Ortega Reunion souvenir program documents the family history", detail: "The publication includes biographical notes, a family-tree diagram, the sibling connection between Francisca and Leon, and descendant information.", status: "Published family-history program", people: ["francisca", "leon", "joaquin"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "1866–1887", sort: "1866-01-01", title: "Fr. Evaristo Guadalupe serves as parish priest of Bangar", detail: "The latest family research reports that municipal records from Bangar, La Union verify Evaristo Guadalupe y Villaverde, OSA, as parish priest from 1866 to 1887. The municipal record copy has not yet been attached to this archive.", status: "Municipal records cited in family research update · record copy not attached", people: ["evaristo-guadalupe"] },
  { date: "11 February 1894", sort: "1894-02-11", title: "Gov. Joaquin Ortega and Doña Francisca marry", detail: "The latest family research update gives 11 February 1894 as the marriage date of Gov. Joaquin Ortega and Doña Francisca Lacsamana.", status: "Family research update · marriage-record copy not attached", people: ["joaquin", "francisca"] },
  { date: "5 January 1917", sort: "1917-01-05", title: "Joaquin “Titing” Ortega Jr. is baptized", detail: "The family update gives his baptism date as 5 January 1917 in San Fernando, La Union. This is a baptism date, not a birth date.", status: "Family research update · parish-register copy not attached", people: ["titing"] },
  { date: "7 December 1922", sort: "1922-12-07", title: "Ramona “Nena” Ortega and Col. Eduardo Montilla marry", detail: "The family research update gives 7 December 1922 as the marriage date. Their children are identified in the family profile with their reported public and professional roles.", status: "Family research update · marriage-record copy not attached", people: ["ramona", "eduardo-m"] },
  { date: "8 September 1927", sort: "1927-09-08", title: "Paz Munar Lacsamana and Jose Alvaro “Pepe” Ortega marry", detail: "The family update confirms that Paz Munar Lacsamana, daughter of Don Leon and Cayetana Munar, married her first cousin Jose Alvaro “Pepe” Ortega in San Fernando, La Union. Six children are reported; only Kining, Mela and Cichit are named in the material supplied here.", status: "Family research update · record copy not attached", people: ["paz", "jose"] },
  { date: "6 December 1930", sort: "1930-12-06", title: "Pacita Lomiteng Lacsamana is born", detail: "The family research update gives her birth date as 6 December 1930.", status: "Family-supplied biography · birth record not attached", people: ["pacita-lomiteng"] },
  { date: "27 November 2014", sort: "2014-11-27", title: "Pacita Lomiteng Lacsamana dies in National City, California", detail: "The family research update gives her death date as 27 November 2014 in National City, California.", status: "Family-supplied biography · death record not attached", people: ["pacita-lomiteng"] },
  { date: "20 September 1996", sort: "1996-09-20", title: "Joaquin “Titing” Ortega Jr. dies and is buried at Lingsat", detail: "The family update records his death on 20 September 1996 and burial at Lingsat Public Cemetery in San Fernando, La Union.", status: "Family research update · cemetery / civil record copy not attached", people: ["titing"] },
  { date: "31 March 1980", sort: "1980-03-31", title: "Alfonso Ramon “Mons” Lacsamana is ordained a priest", detail: "The family update records his ordination on 31 March 1980.", status: "Family research update · ordination record not attached", people: ["alfonso-ramon-mons-lacsamana"] },
  { date: "10 May 2000", sort: "2000-05-10", title: "Alfonso Ramon “Mons” Lacsamana is appointed Monsignor", detail: "The family update records his appointment as Monsignor on 10 May 2000.", status: "Family research update · ecclesiastical appointment record not attached", people: ["alfonso-ramon-mons-lacsamana"] },
  { date: "July 2021", sort: "2021-07-01", title: "Msgr. Alfonso Ramon Lacsamana is assigned to Pagdalagan parish", detail: "The family update records his assignment as Parish Priest of Our Lady of Perpetual Help Parish in Pagdalagan, San Fernando, La Union, in July 2021.", status: "Family research update · parish assignment record not attached", people: ["alfonso-ramon-mons-lacsamana"] },
  { date: "2001–2022 · four terms", sort: "2001-01-01", title: "Mario Agustin Lacsamana serves four terms as City Councilor", detail: "The family update says public school and civic records document four terms as City Councilor of San Fernando, La Union, between 2001 and 2022. The exact term dates were not supplied and are not inferred.", status: "Public school / civic records cited in family update · copies not attached", people: ["mario-lac"] },
  { date: "1900 (year only)", sort: "1900-01-01", title: "Jose Alvaro “Pepe” Ortega is born", detail: "The master family summary gives 1900 as his birth year. No exact birth date or birthplace is supplied in this update.", status: "Family master summary · exact birth record not attached", people: ["jose"] },
  { date: "1906–1928", sort: "1906-01-01", title: "Life of Manuela “Miling” Ortega Orros", detail: "The master family summary gives these life years for Manuela “Miling” Ortega Orros, daughter of Doña Francisca and Gov. Joaquín and later wife of Justo “Titong” Orros Sr. She is distinct from Manuela “Mela” Ortega, daughter of Jose and Paz.", status: "Family master summary · exact day and month not supplied", people: ["manuela"] },
  { date: "1907–2003", sort: "1907-01-01", title: "Life of Joaquina Ortega Orros", detail: "The master family summary gives Joaquina’s life years and identifies her as the mother of Justo Ortega Orros Jr. and his siblings.", status: "Family master summary · original civil records not attached", people: ["joaquina"] },
  { date: "1908–1986", sort: "1908-01-01", title: "Life of Concepcion L. Ortega", detail: "The master family summary gives these life years; exact birth and death dates are not supplied.", status: "Family master summary · original civil records not attached", people: ["concepcion"] },
  { date: "Date not established · died age 13", sort: "0000-00-01", title: "Juanita L. Ortega dies young", detail: "The master family summary records that Juanita died at age 13. Exact birth and death dates are not supplied, so no calendar date is inferred.", status: "Family master summary · exact dates not supplied", people: ["juanita"] },
  { date: "7 November 1916", sort: "1916-11-07", title: "Joaquin “Titing” Ortega Jr. is born", detail: "The master family summary gives his birth date as 7 November 1916. His baptism followed on 5 January 1917 in San Fernando, La Union.", status: "Family master summary · birth record not attached", people: ["titing"] },
  { date: "11 May 1942", sort: "1942-05-11", title: "Lt. Jose Alvaro “Pepe” Ortega dies in Capas", detail: "The master family summary records his death in Capas, Tarlac, after the Bataan Death March. His wartime service is preserved as family history pending his military file and death record.", status: "Family master summary · primary military / death records not attached", people: ["jose"] },
  { date: "7 August 1945", sort: "1945-08-07", title: "Manuel “Manoling” Ortega is born in Bauang", detail: "The master family summary gives his birth date and birthplace as 7 August 1945 in Bauang, La Union.", status: "Family master summary · birth record not attached", people: ["manuel"] },
  { date: "1988–1992", sort: "1988-01-01", title: "Joaquin “Titing” Ortega Jr. serves as Governor of La Union", detail: "The master family summary lists Titing among the Ortega family members who served as provincial governor from 1988 to 1992.", status: "Family master summary · official term record not attached", people: ["titing"] },
  { date: "1992–2001", sort: "1992-01-01", title: "Justo Ortega Orros Jr. serves as Governor of La Union", detail: "The master family summary lists his gubernatorial term as 1992–2001. The 2017 Ortega Reunion biography also records his service as Philippine Ambassador Plenipotentiary to Mexico from 2002 to 2006.", status: "Family master summary + Ortega Reunion 2017 biography", people: ["justo-jr"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "2001–2007", sort: "2001-01-01", title: "Victor Francisco Ortega serves as Governor of La Union", detail: "The master family summary lists Victor Francisco Ortega’s governorship as 2001–2007.", status: "Family master summary · official term record not attached", people: ["victor"] },
  { date: "2002–2006", sort: "2002-01-01", title: "Justo Ortega Orros Jr. serves as Philippine Ambassador to Mexico", detail: "The Ortega Reunion 2017 biography records Justo Ortega Orros Jr.’s diplomatic assignment as Ambassador Plenipotentiary to Mexico from 2002 to 2006.", status: "Published family-history biography", people: ["justo-jr"], url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { date: "2007–2016", sort: "2007-01-01", title: "Manuel “Manoling” Ortega serves as Governor of La Union", detail: "The master family summary lists his term as 2007–2016. The Provincial Government of La Union also describes the family’s seven children, without naming all seven in that article.", status: "Family master summary + Provincial Government of La Union", people: ["manuel"], url: "https://launion.gov.ph/bm-ortega-takes-oath-as-the-new-ex-officio-member-of-lu-sp/" },
  { date: "2016–2022", sort: "2016-01-01", title: "Francisco Emmanuel “Pacoy” Ortega III serves as Governor of La Union", detail: "The master family summary lists his governorship as 2016–2022.", status: "Family master summary · official term record not attached", people: ["pacoy3"] },
  { date: "2022–2025", sort: "2022-01-01", title: "Raphaelle Veronica “Rafy” Ortega-David serves as Governor of La Union", detail: "The master family summary lists her term as 2022–2025.", status: "Family master summary · official term record not attached", people: ["raphaelle"] },
  { date: "2025–present · current in 2026", sort: "2025-01-01", title: "Mario Eduardo “Tot” Ortega becomes Governor of La Union", detail: "The master family summary lists his term beginning in 2025. The Provincial Government of La Union confirmed that he marked his first year in office on 6 July 2026 and continued to identify him as Governor in September 2026 updates.", status: "Provincial Government of La Union · current official updates", people: ["mario"], url: "https://launion.gov.ph/aramid-bannogtayo-amin-gov-mario-heralds-agkaysa-in-the-capitol-as-he-marks-1st-year-of-service-in-office/" },
  { date: "2 December 2025", sort: "2025-12-02", title: "Manuel “Manoling” Ortega dies in San Fernando", detail: "The master family summary gives 2 December 2025 as his date of death and San Fernando, La Union as the place. A 5 December 2025 condolence notice from Poro Point Management Corporation names his wife Geraldine “Denny” and son Manuel Victor “Mannix”. House Journal No. 20 identifies House Resolution No. 545 as a condolence resolution for former Representative Manuel C. Ortega; it does not list the seven children's names.", status: "Family master summary + Poro Point condolence notice + House Journal", people: ["manuel"], url: "https://poropointfreeport.gov.ph/new/ppmc-extends-sincere-condolences-to-the-family-of-hon-manuel-manoling-c-ortega/" },
  { date: "August 2025–present", sort: "2025-08-01", title: "Francisco Paolo P. Ortega V serves as House Deputy Speaker", detail: "The master family summary gives August 2025 as the start of his Deputy Speakership. The official House of Representatives member profile currently lists him as Deputy Speaker and La Union 1st District Representative.", status: "Official House of Representatives member profile", people: ["paolo"], url: "https://congress.gov.ph/house-members/view/K059" },
  { date: "3 December 2025", sort: "2025-12-03", title: "House Journal records House Resolution No. 545", detail: "The House Journal identifies House Resolution No. 545 as a resolution expressing condolences to the family of Hon. Manuel C. Ortega, former Representative of La Union’s 1st District. It is not a list of his seven children; the seven-child roster in this archive follows the supplied master family summary.", status: "20th Congress · House Journal No. 20", people: ["manuel"], url: "https://docs.congress.hrep.online/legisdocs/journals_20/Journal-01612-20251201.pdf" },
  { date: "Six generations · public service legacy", sort: "2026-01-01", title: "Eight members of the wider Ortega family have served as La Union Governor", detail: "The master family summary lists Gov. Joaquín Ortega (1901–1904), Joaquín “Titing” Ortega Jr. (1988–1992), Justo Ortega Orros Jr. (1992–2001), Victor Francisco Ortega (2001–2007), Manuel “Manoling” Ortega (2007–2016), Francisco Emmanuel “Pacoy” Ortega III (2016–2022), Raphaelle Veronica “Rafy” Ortega-David (2022–2025), and Mario Eduardo “Tot” Ortega (2025–present). This is a family-line summary; it does not imply all eight governors belong to one direct parent-child line.", status: "Master family research summary · individual terms are documented in their respective profiles", people: ["joaquin", "titing", "justo-jr", "victor", "manuel", "pacoy3", "raphaelle", "mario"] },
  { date: "World War II and later public service · dates not fully supplied", sort: "1942-01-01", title: "Joaquin “Kining” Ortega’s wartime and public service", detail: "The master family summary identifies Kining as the youngest USAFIP-NL World War II veteran and later a Mayor, NTA Administrator, and Presidential Consultant. Exact military service and appointment dates are not supplied in this update.", status: "Family master summary · individual service records not attached", people: ["kining"] },
  { date: "24 years in Congress · later COMELEC service", sort: "1967-01-01", title: "Francisco Isabelo “Pacoy” Ortega’s national public service", detail: "The master family summary records 24 years in Congress and subsequent service as a COMELEC Commissioner. Exact congressional terms and commission appointment dates are not supplied in this update.", status: "Family master summary · official service record not attached", people: ["pacoy"] },
  { date: "2022", sort: "2022-12-03", title: "Danielle Claudine “Coleen” Ortega Garcia-Crawford receives a Senate commendation", detail: "Senate P.S. Resolution No. 344 identifies Coleen as an actress and commends her Best Actress award at the 2022 El Grito International Fantastic Film Festival. This supports her public biography, not the exact cousin relationship to the branches mapped here.", status: "Senate P.S. Resolution No. 344", people: ["coleen-ortega-garcia"], url: "https://issuances-library.senate.gov.ph/sites/default/files/2023-01/4009336510%21.pdf" },
  { date: "2021–2022 published features", sort: "2021-01-01", title: "Actress Ysabel Ortega and her family’s La Union farm", detail: "Manila Bulletin and GMA coverage identify Ysabel Ortega as an actress and describe her family’s farm in La Union. The exact common ancestor connecting her to the family branches shown in this archive remains unmapped.", status: "Manila Bulletin + GMA Entertainment feature coverage", people: ["ysabel-ortega"], url: "https://mb.com.ph/2022/1/8/corn-and-other-fruit-bearing-trees-abound-in-actress-ysabel-ortegas-family-farm" },
  { date: "1976", sort: "1976-01-01", title: "Dr. Juanita Valdivia Lacsamana completes her Ed.D.", detail: "The family biography records that Tetang earned her Doctor of Education degree from Saint Louis University, Baguio City, in 1976.", status: "Family-supplied biography · diploma / registrar record not attached", people: ["juanita-valdris"] },
  { date: "1982", sort: "1982-01-01", title: "Dr. Juanita Valdivia Lacsamana retires from DepEd", detail: "The master family findings identify her final position as DepEd English Supervisor in La Union and give 1982 as her retirement year. The biography also records that she served as a Graduate School Dean.", status: "Family-supplied biography · service record not attached", people: ["juanita-valdris"] },
  { date: "2017", sort: "2017-04-01", title: "Dr. Juanita “Tetang” Lacsamana receives a Centenarian Longevity Award", detail: "The master family findings identify her as a 2017 Ortega Clan Reunion Centenarian Longevity Awardee. Her 100th birthday was celebrated in 2017, based on the family-supplied biography.", status: "Ortega Clan Reunion / family biography · award program copy not attached", people: ["juanita-valdris"] },
];
const GEOGRAPHY = [
  {
    id:"ocana", place:"Ocaña, Toledo, Spain", region:"spain", lat:39.958, lng:-3.501,
    precision:"Town reference point", source:"https://www.ayuntamiento.es/ocana/",
    events:[
      {type:"birth", title:"Recorded birthplace", date:"26 October 1830", personIds:["evaristo-guadalupe"], detail:"The FamilySearch profile screenshot lists Ocaña, Toledo, Spain as Evaristo's birthplace. An Augustinian archival register also identifies him as born in Ocaña in 1830.", status:"FamilySearch screenshot + Archivo Agustiniano historical register", source:"https://www.agustinosvalladolid.es/estudio/investigacion/archivoagustiniano/archivofondos/archivo2019/archivo_2019.pdf"}
    ]
  },
  {
    id:"cebu", place:"Cebu, Philippines", region:"philippines", lat:10.3157, lng:123.8854,
    precision:"Cebu-level record; city marker is approximate", approximate:true, source:"https://www.openstreetmap.org/search?query=Cebu%2C%20Philippines",
    events:[
      {type:"birth", title:"Birthplace recorded as Cebu", date:"Birth year reported as 1866; sources differ", personIds:["joaquin"], detail:"The current family profile note says Joaquin was born in Cebu. The underlying reference does not establish a specific town or barangay; the map pin is a regional reference near Cebu City, not an exact birthplace.", status:"Published family-history material; exact locality not established", source:"https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf"}
    ]
  },
  {
    id:"bangar", place:"Bangar, La Union, Philippines", region:"launion", lat:16.8937, lng:120.4229,
    precision:"Municipality reference point", source:"https://www.philatlas.com/luzon/r01/la-union/bangar.html",
    events:[
      {type:"birth", title:"Birthplace recorded", date:"9 March 1877", personIds:["francisca"], detail:"The Ortega Reunion 2017 souvenir program records Doña Francisca's birth in Bangar, La Union.", status:"Published family-history program", source:"https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf"},
      {type:"origin", title:"Lacsamana family roots", date:"Earlier generations · exact dates not established", personIds:["martin-lacsamana","narcisa-lopez","ramona-lopez","leon"], detail:"The supplied family history associates Martin Lacsamana, Narcisa Lopez, Ramona Lopez Lacsamana, and Don Leon Lacsamana with Bangar. These are family-origin associations, not individually verified birth or residence addresses.", status:"Family-supplied lineage and FamilySearch tree screenshot; further original records needed", source:"https://www.familysearch.org/tree/person/details/GNHK-MZ3"}
    ]
  },
  {
    id:"carlatan", place:"Carlatan, San Fernando City, La Union", region:"launion", lat:16.6330, lng:120.3150,
    precision:"Barangay reference point", source:"https://www.philatlas.com/luzon/r01/la-union/san-fernando/carlatan.html",
    events:[
      {type:"residence", title:"Family-reported residence", date:"Period not specified", personIds:["leon"], detail:"Family memoirs place Don Leon's residence in Carlatan, San Fernando. No exact house or property boundary is established.", status:"Family-reported memoir", source:""}
    ]
  },
  {
    id:"daya", place:"Daya · San Fernando City area, La Union", region:"launion", lat:16.6163, lng:120.3171,
    precision:"Approximate city-level reference only", approximate:true, source:"https://www.openstreetmap.org/search?query=San%20Fernando%20City%2C%20La%20Union%2C%20Philippines",
    events:[
      {type:"memory", title:"Reported family-visit destination", date:"Period not specified", personIds:["leon","francisca","alfredo-pidong","joaquin-lac","francisco-lac","eduardo"], detail:"Family memoirs say Don Leon regularly walked to visit his sister Doña Francisca and his children in Daya. The exact Daya site is not geocoded in the current research; this marker is only a San Fernando city-level reference and does not assert that every named person resided at this point.", status:"Family-reported memoir · exact Daya position unverified", source:""}
    ]
  },
  {
    id:"san-juan", place:"San Juan, La Union, Philippines", region:"launion", lat:16.6699, lng:120.3386,
    precision:"Municipality reference point", source:"https://mapcarta.com/San_Juan_%28La_Union%29",
    events:[
      {type:"death", title:"Recorded deathplace", date:"17 January 1887", personIds:["evaristo-guadalupe"], detail:"The supplied FamilySearch screenshot lists San Juan, La Union as Evaristo's deathplace. The Augustinian archival register also records his death there on 17 January 1887.", status:"FamilySearch screenshot + Archivo Agustiniano historical register", source:"https://www.agustinosvalladolid.es/estudio/investigacion/archivoagustiniano/archivofondos/archivo2019/archivo_2019.pdf"}
    ]
  },
  {
    id:"san-fernando", place:"San Fernando City, La Union, Philippines", region:"launion", lat:16.6163, lng:120.3171,
    precision:"City reference point", source:"https://mapcarta.com/San_Fernando_%28La_Union%29",
    events:[
      {type:"work", title:"Public service · Civil Governor of La Union", date:"1901–1904", personIds:["joaquin"], detail:"Don Joaquin Ortega served as La Union's first Civil Governor. This marks his documented public-service connection to the provincial capital; it is not a claim that this was his exact residence.", status:"Provincial Government of La Union historical article", source:"https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/"},
      {type:"marriage", title:"Marriage contracts · Joaquin, Francisco and Eduardo Lacsamana branches", date:"1955–1959", personIds:["joaquin-lac","concepcion-viloria","francisco-lac","pacita-lomiteng","eduardo","purita-argueza"], detail:"Three supplied marriage contracts place these weddings in San Fernando, La Union: the 2 January 1955 contract names the Immaculate Conception Church, while the 8 September 1958 and 27 July 1959 contracts name the Office of the Justice of the Peace. The register scans list each couple's parents. These are marriage-record locations, not claims of permanent residence.", status:"Three user-supplied marriage contract scans", source:"assets/research/joaquin-lacsamana-concepcion-viloria-1955-marriage-contract.png"}
    ]
  },
  {
    id:"luna", place:"Luna, La Union, Philippines", region:"launion", lat:16.8528, lng:120.3761,
    precision:"Municipality reference point", source:"https://digital.library.unt.edu/explore/locations/p19728/",
    events:[
      {type:"marriage", title:"Register entry · Alfredo Lacsamana and Juanita Valdivia / Valdris", date:"8 October 1944", personIds:["alfredo-pidong","juanita-valdris"], detail:"Record 6079, page 71, registration 108. The supplied scan appears to spell the wife's name Valdivia; earlier index notes say Valdris. The registration location is not a confirmed lifelong residence.", status:"Supplied register-page scan · spelling discrepancy retained", source:"assets/research/alfredo-pidong-juanita-valdivia-register-p71.png"}
    ]
  },
  {
    id:"marilao", place:"Marilao, Bulacan, Philippines", region:"other", lat:14.7576, lng:120.9485,
    precision:"Municipality reference point", source:"https://mapcarta.com/Marilao",
    events:[
      {type:"marriage", title:"Separate indexed marriage record", date:"12 April 1922", personIds:["inocencia-lac","alejandro-david"], detail:"Inocencia Lacsamana and Alejandro David's indexed marriage is located in Marilao, Bulacan. This record group is not currently connected to Don Leon's La Union line.", status:"User-supplied civil-registration index; relationship to La Union branch unconfirmed", source:""}
    ]
  },
  {
    id:"san-pablo", place:"San Pablo City, Laguna, Philippines", region:"other", lat:14.0701, lng:121.3256,
    precision:"City reference point", source:"https://mapcarta.com/San_Pablo_%28Laguna%29",
    events:[
      {type:"death", title:"Indexed death record · identity requires review", date:"25 October 1953", personIds:["rafaela-lac"], detail:"A separate index lists Rafaela Lacsamana's death in San Pablo City, Laguna, document 687, age 38. The index's sex / relationship classification conflicts with the feminine given name. This record is not connected to Don Leon's branch.", status:"Separate indexed record · original image needed to resolve identity and classification", source:""}
    ]
  }
];
const GEOGRAPHY_ROUTES = [
  {from:"ocana",to:"san-juan",type:"life",label:"Evaristo · birthplace to recorded deathplace",note:"The birth and death endpoints are recorded. The drawn line is a visual connector only; the actual route and intermediate stops are not documented."},
  {from:"carlatan",to:"daya",type:"memory",label:"Don Leon · family-reported visits",note:"The memoir describes regular visits from Carlatan toward Daya. This is a family-memory connection, not a surveyed walking route."}
];
const GEOGRAPHY_UNPINNED = [
  {place:"Manila, Philippines", people:"Macario / Inocencia Lacsamana research group", note:"Manila appears in the old grouping label, but the current extracts do not establish a specific birth, death, residence, or marriage event there. It is intentionally not pinned as a life event."}
];
const KNOWN_ARCHIVE_SOURCES = [
  { title: "Ortega Reunion 2017 souvenir program", type: "Family-history publication", url: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf", note: "Family-tree diagram, Francisca–Leon sibling relationship, biographical entries and descendants." },
  { title: "Provincial Government of La Union · Don Joaquin Ortega", type: "Government historical article", url: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/", note: "Joaquin's public legacy and appointment as the province's first Civil Governor." },
  { title: "Senate Legislative Reference Bureau · Batas Pambansa Blg. 458", type: "Legislative record", url: "https://ldr.senate.gov.ph/legislative-issuance/batas-pambansa-458", note: "Law approved 10 June 1983 converting Doña Francisca Lacsamana de Ortega Memorial Municipal High School in Bangar into a national high school under her memorial name." },
  { title: "Archivo Agustiniano · 2019 register", type: "Religious archive / historical register", url: "https://www.agustinosvalladolid.es/estudio/investigacion/archivoagustiniano/archivofondos/archivo2019/archivo_2019.pdf", note: "Evaristo Guadalupe entry, birthplace, assignments and death information as described in the current profile note." },
  { title: "Fr. Evaristo Guadalupe y Villaverde · handwritten register pages", type: "Family-supplied archival scan · undated / not transcribed", url: "assets/research/evaristo-guadalupe-archival-register-pages.png", note: "A photograph of a multi-entry handwritten register spread supplied for Evaristo’s research file. The specific entry has not yet been isolated or transcribed; do not treat the image as verified proof of a relationship until the entry is identified." },
  { title: "Fr. Evaristo Guadalupe y Villaverde · signature artwork", type: "Family-supplied SVG artwork · attribution not independently authenticated", url: "assets/research/evaristo-guadalupe-signature.svg", note: "SVG signature artwork supplied with the relatives update. Its attribution is preserved as supplied and has not been independently authenticated." },
  { title: "Family-supplied relatives update · Evaristo and Ramona", type: "Research note", url: "assets/research/evaristo-relatives-update.txt", note: "Names Evaristo’s parents, gives his alternate name, clarifies that Ramona and Evaristo did not marry, and lists eight siblings of Ramona." },
  { title: "FamilySearch · Ramona Lopez Lacsamana", type: "Genealogy profile", url: "https://www.familysearch.org/tree/person/details/GNHK-MZ3", note: "Supplied screenshot identifies her profile ID and birth year; screenshot showed no attached sources." },
  { title: "FamilySearch · Evaristo Guadalupe y Villaverde", type: "Genealogy profile", url: "https://www.familysearch.org/tree/person/details/G138-FPT", note: "Supplied screenshot identifies profile details; screenshot showed Sources (0) and Medium quality score." },
  { title: "Provincial Government of La Union · Denny Ortega and seven children", type: "Government article", url: "https://launion.gov.ph/bm-ortega-takes-oath-as-the-new-ex-officio-member-of-lu-sp/", note: "The article mentions seven children but does not identify all seven by name." },
  { title: "Alfredo Lacsamana and Juanita Valdivia / Valdris · register page 71", type: "Supplied civil-register scan · 8 October 1944", url: "assets/research/alfredo-pidong-juanita-valdivia-register-p71.png", note: "Register entry 6079, page 71, registration 108. The scan appears to read Juanita Valdivia and Andres Valdivia; earlier index notes use Valdris. Review the spelling discrepancy and age difference before treating the names as final." },
  { title: "Joaquin Lacsamana and Concepcion Viloria · marriage contract", type: "Supplied marriage contract · 2 January 1955", url: "assets/research/joaquin-lacsamana-concepcion-viloria-1955-marriage-contract.png", note: "Records the wedding at the Immaculate Conception Church, San Fernando, La Union, and lists each spouse’s parents. The bride’s recorded age differs from the earlier index summary; the mother's name also has Prisea / Prinsea variants." },
  { title: "Francisco Lacsamana and Pacita Lomiteng · marriage contract", type: "Supplied marriage contract · 8 September 1958", url: "assets/research/francisco-lacsamana-pacita-lomiteng-1958-marriage-contract.png", note: "Records the wedding at the Office of the Justice of the Peace, San Fernando, La Union, and lists Leon Lacsamana / Emiliana Garcia and Mariano Lomiteng / Rafaela Buyao as parents." },
  { title: "Eduardo Lacsamana and Purita Argueza · marriage contract", type: "Supplied marriage contract · 27 July 1959", url: "assets/research/eduardo-lacsamana-purita-argueza-1959-marriage-contract.png", note: "Records the wedding at the Office of the Justice of the Peace, San Fernando, La Union, and lists both sets of parents. Eduardo’s recorded age (36 years 11 months) conflicts with the earlier age-index estimate." },
  { title: "Macario Lacsamana and Felicidad Santos · marriage contract", type: "Supplied marriage contract · 16 November 1962", url: "assets/research/macario-lacsamana-felicidad-santos-1962-marriage-contract.png", note: "Records the marriage at Our Lady of Perpetual Help Parish and lists Leon Lacsamana / Alejandra Capalad as Macario’s parents and Ramon Santos / Candida Lacsamana as Felicidad’s. This is kept separate from the La Union Don Leon branch." },
  { title: "Provincial Government of La Union · Gov. Mario marks first year in office", type: "Official provincial government update · 6 July 2026", url: "https://launion.gov.ph/aramid-bannogtayo-amin-gov-mario-heralds-agkaysa-in-the-capitol-as-he-marks-1st-year-of-service-in-office/", note: "Confirms Mario Eduardo C. Ortega as Governor in July 2026." },
  { title: "House of Representatives · Francisco Paolo P. Ortega V", type: "Official House member profile", url: "https://congress.gov.ph/house-members/view/K059", note: "Currently lists him as Deputy Speaker and La Union 1st District Representative." },
  { title: "House Journal No. 20 · House Resolution No. 545", type: "Official House Journal · December 2025", url: "https://docs.congress.hrep.online/legisdocs/journals_20/Journal-01612-20251201.pdf", note: "Identifies HR 545 as a condolence resolution for former Representative Manuel C. Ortega. It does not enumerate his seven children; the names in this archive follow the supplied master family summary." },
  { title: "Poro Point Management Corporation · condolence for Hon. Manuel “Manoling” C. Ortega", type: "Official condolence notice · 5 December 2025", url: "https://poropointfreeport.gov.ph/new/ppmc-extends-sincere-condolences-to-the-family-of-hon-manuel-manoling-c-ortega/", note: "Identifies his wife Geraldine “Denny” and son Manuel Victor “Mannix”; the supplied master summary gives his date and place of death." },
  { title: "Philstar · 15 Ortega family members seek posts", type: "News report · 30 March 2007", url: "https://www.philstar.com/nation/2007/03/30/392299/15-ortega-family-members-seek-posts", note: "Contemporaneous electoral coverage identifies Jay-jay Orros as Justo Ortega Orros’s son, John Orros as his cousin, and Justito Orros as a vice-gubernatorial candidate." },
  { title: "Senate P.S. Resolution No. 344 · Coleen Ortega Garcia-Crawford", type: "Senate legislative record", url: "https://issuances-library.senate.gov.ph/sites/default/files/2023-01/4009336510%21.pdf", note: "Identifies Danielle Claudine “Coleen” Ortega Garcia-Crawford as an actress and commends her 2022 El Grito award." },
  { title: "Manila Bulletin · Ysabel Ortega’s family farm", type: "News feature · 8 January 2022", url: "https://mb.com.ph/2022/1/8/corn-and-other-fruit-bearing-trees-abound-in-actress-ysabel-ortegas-family-farm", note: "Identifies Ysabel Ortega as an actress and describes the family farm in Barangay Ortega, Bacnotan, La Union." },
];
const BIOGRAPHY_IDS = ["leon", "francisca", "joaquin", "evaristo-guadalupe", "ramona-lopez", "juanita-valdris", "alfonso-ramon-mons-lacsamana", "pacita-lomiteng", "linda-fornoles", "paz", "mario-lac", "ramona", "titing", "pio", "victor", "roberto", "manuel", "pacoy3", "justo-jr", "mario", "carlos", "jose", "kining", "manuela", "joaquina", "concepcion", "juanita", "pacoy", "raphaelle", "paolo", "coleen-ortega-garcia", "ysabel-ortega", "kiko-c-ortega"];
const HISTORICAL_PROFILE_DETAILS = {
  leon: {
    heading: "Family history and the Lacsamana line",
    sections: [
      { title: "Lineage and sibling connection", body: "The Ortega Reunion 2017 family-history publication identifies Leon Lacsamana as the brother of Francisca Lacsamana. The supplied FamilySearch tree screenshots connect Leon and Francisca to Ramona Lopez Lacsamana and Evaristo Guadalupe y Villaverde as parents. The screenshots are user-supplied FamilySearch tree/profile views; an original baptismal or civil record proving the parentage has not yet been attached.", evidence: "Published family-history program + user-supplied FamilySearch tree screenshot", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Carlatan and Daya family memory", body: "Family memoirs supplied for this archive place Leon in Carlatan, San Fernando, and recall that he walked to visit his sister and his children in Daya. The Ortega Reunion 2017 program describes Daya as Francisca's home, open to relatives coming from Manila and other distant places. The published account supports the family importance of Daya, but it does not independently document a dated itinerary or each journey by Leon.", evidence: "Family-reported memoir; Daya description in published family-history program", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Marriage and descendants reported in current research", body: "The latest family update confirms Paz Munar Lacsamana as the daughter of Don Leon and Cayetana Munar; the former separate ‘Paz’ and ‘Paz Munar’ profile IDs are merged. Alfredo ‘Pidong’ is also connected to Leon and Cayetana. Eduardo, Joaquin and Francisco remain represented by their respective record trails, with their maternal links retained as recorded in the supporting notes. The earlier reunion-program spelling ‘Catalina Munar-Lacsamana’ is preserved as a variant of the reported Cayetana Munar name pending an original marriage record.", evidence: "Family-supplied genealogy, municipal / civil research updates, and published reunion family-tree reference", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Open historical questions", body: "No reliable birth date, death date, or exact birthplace for Leon has been established in the sources currently attached to this project. Do not infer his birth year from Francisca's 1877 birth. The title ‘Don’ is retained because it is part of the family name used in this archive, but its formal historical basis has not been independently established.", evidence: "Research gap", source: "" }
    ]
  },
  francisca: {
    heading: "Lola Paca · family, home, and memorial legacy",
    sections: [
      { title: "Birth and death", body: "The Ortega Reunion 2017 souvenir program records Francisca Lacsamana as born in Bangar, La Union on 9 March 1877 and died on 3 April 1964 at age 87. The Provincial Government of La Union identifies her as the wife of Don Joaquin J. Ortega and confirms that the couple raised fourteen children.", evidence: "Published family-history program + Provincial Government of La Union", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Courtship and family traditions", body: "The family program recalls that Joaquin travelled on horseback from San Fernando to Bangar to serenade Francisca, and later fetched her by carriage to attend Holy Mass. It also attributes to Francisca the practice of bringing relatives together on Sundays and welcoming visitors from Manila and other distant places. These details are family recollections recorded in the 2017 reunion publication, not independently verified contemporary diary entries.", evidence: "Family recollections published in Ortega Reunion 2017", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Daya and the extended family", body: "The reunion program describes Francisca's home, called Daya, as a place where relatives from Manila and elsewhere could stay during vacations. It presents her as someone who encouraged family gatherings and maintained a welcoming household. The current archive preserves the family-reported account that her brother Leon visited her and his children there, while keeping that particular travel detail labeled as family memory.", evidence: "Published family-history program + family-supplied memoir", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Fourteen children and later generations", body: "The Provincial Government of La Union reports that Joaquin and Francisca raised fourteen children and that many descendants continued in local public leadership. The reunion program supplies individual biographies and descendant information for several children. The archive should continue documenting all fourteen branches, including less prominent descendants, without assuming that every living descendant is publicly documented.", evidence: "Provincial Government of La Union; Ortega Reunion 2017", source: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/" },
      { title: "Memorial school", body: "Her name was given to the Doña Francisca Lacsamana de Ortega Memorial Municipal High School in Bangar. Batas Pambansa Blg. 458, approved on 10 June 1983, converted the memorial municipal high school into a national high school under that name. This is an official legislative record of her lasting public commemoration.", evidence: "Batas Pambansa Blg. 458 · Senate Legislative Reference Bureau", source: "https://ldr.senate.gov.ph/legislative-issuance/batas-pambansa-458" }
    ]
  },
  "juanita-valdris": {
    heading: "Educator · academic leader · Catholic community service",
    sections: [
      { title: "Early life and education", body: "The family-supplied biography identifies Dr. Juanita Valdivia Lacsamana, Ed.D., affectionately known as “Tetang”, as born on 8 March 1917 in Alaminos, Pangasinan. It says she celebrated her 100th birthday in 2017. She began as a classroom teacher and later became principal of Gabaldon Elementary School in San Fernando, La Union. The biography says she earned a Master of Arts degree in Dagupan and completed a Doctor of Education degree at Saint Louis University, Baguio City, in 1976. The institutions and awards are preserved as family-supplied details pending independently checked personnel or school records.", evidence: "Family-supplied biographical research · original school / civil records not attached", source: "" },
      { title: "Department of Education and higher education", body: "The supplied biography says she served as Principal of Gabaldon Elementary School and later as an English Supervisor in La Union, retiring in 1982. The latest update identifies the role at retirement as DepEd English Supervisor. After retirement, she taught graduate students at Lorma College, Saint Louis College and Don Mariano Marcos Memorial State University, and served as Dean of the Graduate School at Osias Educational Foundation in Balaoan. It also records her as principal of St. Jude Montessori Educational Center at St. Jude Parish from 1989 to 1996. These appointments should be corroborated with school or Department of Education records before being described as independently verified.", evidence: "Family-supplied biographical research · appointment records not yet attached", source: "" },
      { title: "Local governance and church leadership", body: "The family biography records an appointed position in the Sangguniang Bayan of the Municipality of San Fernando from 1987 to 1988. It also says she served as President of the Diocesan Catholic Women’s League from 1980 to 1985 and President of the St. William Cathedral Parish Council from 1983 to 1985. The account recalls that she attended daily Holy Mass with her husband, Alfredo “Pidong” Lacsamana. These are family-preserved biographical details; appointment and parish records would strengthen the archive.", evidence: "Family-supplied biographical research · civic and parish records not yet attached", source: "" },
      { title: "Name and record variations", body: "The latest family update treats “Valdivia” as her formal maiden surname, supported by public school and civic records; “Valdris” is retained as a clerical transcription variant in the earlier index. The 1944 register-page scan appears to use “Juanita Valdivia” and lists Andres Valdivia and Marcelina Bautista as her parents. The scan records age 27 years 9 months; the family biography supplies 8 March 1917 as her birth date. These differences are intentionally preserved for follow-up rather than silently merged. The family biography and 2017 Ortega Clan Reunion record her as a Centenarian Longevity Awardee (also described as a Longevity Special Award at age 100). No death date is supplied in the current materials, so none is inferred.", evidence: "Supplied 1944 register-page scan + family-supplied biography · spelling / age differences open", source: "assets/research/alfredo-pidong-juanita-valdivia-register-p71.png" }
    ]
  },
  "alfonso-ramon-mons-lacsamana": {
    heading: "Priest · Monsignor · parish leadership",
    sections: [
      { title: "Family and early life", body: "The family research identifies Msgr. Alfonso Ramon “Mons” V. Lacsamana as the youngest son of Alfredo “Pidong” Lacsamana and Dr. Juanita Valdivia Lacsamana, Ed.D. His birthday is given as 17 June, but the birth year was not included and is not inferred.", evidence: "Family research update · birth record not attached", source: "" },
      { title: "Ordination and ecclesiastical service", body: "The family update records his ordination to the priesthood on 31 March 1980 and appointment as Monsignor on 10 May 2000. It further records that he was assigned as Parish Priest of Our Lady of Perpetual Help Parish in Pagdalagan, San Fernando, La Union, in July 2021. Copies of the ordination and appointment records were not supplied with this update.", evidence: "Family research update · ecclesiastical records not attached", source: "" }
    ]
  },
  "mario-lac": {
    heading: "Public service · parallel Lacsamana branch",
    sections: [
      { title: "Name and family branch", body: "The family update gives his full name as Mario Agustin Lacsamana, with Agustin as his mother’s maiden surname. It places him in a parallel branch of the Lacsamana clan, not as a biological son of Joaquin, Francisco, Alfredo “Pidong”, or Eduardo Lacsamana. No parent-child link to those men is drawn in the family tree.", evidence: "Family research update · relationship documentation not attached", source: "" },
      { title: "Public service", body: "The update reports that public school and civic records document four terms as City Councilor of San Fernando, La Union, within the 2001–2022 period. The exact four term dates and record copies were not included, so the archive does not infer individual election or service dates.", evidence: "Public school / civic records cited in supplied family update · copies not attached", source: "" }
    ]
  },
  "pacita-lomiteng": {
    heading: "Francisco Lacsamana’s family · Southern California",
    sections: [
      { title: "Life dates and family", body: "The family update records Pacita Lomiteng Lacsamana as born on 6 December 1930 and as having died on 27 November 2014 in National City, California. Her 8 September 1958 marriage contract to Francisco Lacsamana names Mariano Lomiteng and Rafaela Buyao as her parents.", evidence: "Family research update + supplied 1958 marriage contract", source: "assets/research/francisco-lacsamana-pacita-lomiteng-1958-marriage-contract.png" }
    ]
  },
  "linda-fornoles": {
    heading: "Sixth child of Alfredo “Pidong” and Dr. Juanita",
    sections: [
      { title: "Family branch and residence", body: "The family update identifies Linda Lacsamana Fornoles as the sixth child of Alfredo “Pidong” Lacsamana and Dr. Juanita Valdivia Lacsamana, Ed.D. Her siblings are Msgr. Alfonso Ramon, Lourdes, O’Neil, Alberto, and Alfredo Jr. The update places Linda in Oxnard, California, alongside relatives Romeo and John Fornoles; their precise relationships to her are not specified in the supplied note.", evidence: "Family research update · individual civil records not attached", source: "" }
    ]
  },
  "paz": {
    heading: "Munar · Lacsamana · Ortega family connection",
    sections: [
      { title: "Parentage and marriage", body: "The family update confirms Paz Munar Lacsamana as the daughter of Don Leon Lacsamana and Cayetana Munar. It identifies her as the same person as the earlier ‘Paz’ profile and records her marriage to her first cousin Jose Alvaro “Pepe” Ortega on 8 September 1927 in San Fernando, La Union.", evidence: "Family research update · original marriage record not attached", source: "" },
      { title: "Children", body: "Six children are reported: four sons and two daughters. The supplied names include Kining, Mela, and Cichit. The other three children are represented as unnamed placeholders until names are provided; no gender is assigned to an unnamed profile.", evidence: "Family research update · names of three children not supplied", source: "" }
    ]
  },
  "ramona-lopez": {
    heading: "Lacsamana family roots · mother of Leon and Francisca",
    sections: [
      { title: "Parents and siblings", body: "The supplied relatives update identifies Martin Lacsamana and Narcisa Lopez as Ramona’s parents and lists eight siblings: Maria de la Expectacion Lopez Lacsamana, Bernardo, Rosa, Ynes, Ysabelo, Timotea, Maximo, and Proceso Lopez Lacsamana. The user clarified that Maria’s surname is Lacsamana; the earlier typed relatives note used “Lasamana,” treated as a spelling typo. Dates and original civil / church records for these sibling links have not been supplied.", evidence: "Family-supplied relatives update · original records not attached", source: "assets/research/evaristo-relatives-update.txt" },
      { title: "Parentage and marital clarification", body: "The family update explicitly states that Ramona and Fr. Evaristo Guadalupe y Villaverde, OSA did not marry. Their connection to Don Leon and Doña Francisca is represented as reported parentage only; neither person is listed as the other’s spouse in this archive.", evidence: "Family-supplied relatives update · parentage source records not attached", source: "assets/research/evaristo-relatives-update.txt" }
    ]
  },
  "evaristo-guadalupe": {
    heading: "Augustinian priest · parish service in Bangar",
    sections: [
      { title: "Parents, name forms, and parentage", body: "The supplied relatives update names Bernardino Guadalupe and Nicolasa Villaverde as Evaristo’s parents and gives the alternate form “Muy Reverendo Padre Fray Evaristo Villaverde Guadalupe OSA.” It also explicitly states that Ramona Lopez Lacsamana and Fr. Evaristo did not marry. Their link to Don Leon and Doña Francisca is shown in this archive as reported parentage only, not as a marriage or spouse relationship.", evidence: "Family-supplied relatives update · original civil / church records not attached", source: "assets/research/evaristo-relatives-update.txt" },
      { title: "Parish service", body: "The family research reports that municipal records from Bangar, La Union verify Fr. Evaristo Guadalupe y Villaverde, OSA, as parish priest of Bangar from 1866 to 1887. This tenure overlaps the period associated with the births of Doña Francisca and Don Leon. The municipal record copy has not yet been attached to the digital archive.", evidence: "Municipal records cited in family research update · record copy not attached", source: "" },
      { title: "Archival register and signature materials", body: "A multi-entry handwritten register-page image and an SVG signature artwork attributed to Evaristo by the supplied filenames have been added to the research archive. The specific handwritten entry has not yet been isolated or transcribed, and the signature attribution has not been independently authenticated. Treat both as research materials, not as conclusive proof of parentage or identity.", evidence: "User-supplied register-page scan and signature artwork · transcription / authentication pending", source: "assets/research/evaristo-guadalupe-archival-register-pages.png" }
    ]
  },
  "ramona": {
    heading: "Ramona “Nena” Ortega · Montilla branch",
    sections: [
      { title: "Marriage and children", body: "The family update records Ramona “Nena” Ortega and Col. Eduardo Montilla as married on 7 December 1922. Their children’s roles are listed as Francisca Sophia “Paquita” (Barangay Kagawad), Eduardo Jose “Edward” (Ambassador), Lourdes “Penny” (Entrepreneur), and Manuel “Litong” (Attorney & Conchologist).", evidence: "Family research update · marriage record not attached", source: "" }
    ]
  },
  "titing": {
    heading: "Joaquin “Titing” Ortega Jr. · public service and family",
    sections: [
      { title: "Baptism, death, and burial", body: "The family update records Titing’s baptism on 5 January 1917 in San Fernando, La Union. It records his death on 20 September 1996 and burial at Lingsat Public Cemetery in San Fernando. Baptism is distinguished from his separately recorded birth date of 7 November 1916.", evidence: "Family research update · parish / cemetery record copies not attached", source: "" }
    ]
  },
  joaquin: {
    heading: "First Civil Governor of La Union · public service and family",
    sections: [
      { title: "Birth, parents, and education", body: "The Ortega Reunion 2017 souvenir program records Joaquin Ortega y Joaquino as born in Cebu on 11 March 1866 to Antonio Ortega y Verzosa and Juana Joaquino. The same program quotes a 24 May 1901 description by Col. William Penn Duvall calling Joaquin 31 years old; that age does not align with a March 1866 birth (he would have been 35). The Provincial Government later records his death in 1943 at age 77, which is broadly consistent with an 1866 birth year but does not prove the exact date. The program also says he studied at the University of Santo Tomas. An original baptismal record and university enrollment record have not been attached here, so the exact birth date should remain flagged for corroboration.", evidence: "Ortega Reunion 2017 family-history program", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Early work in Carlatan", body: "The reunion program says Joaquin worked with the Compania General de Tabacos de Filipinas (Tabacalera) in Carlatan, San Fernando, in 1889. It recounts that his father Antonio had been assigned to La Union and that the family lived near the Tabacalera. These details should be cross-checked against company and local archival records where available.", evidence: "Published family-history program", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Civil Governor of La Union", body: "The Provincial Government of La Union states that the Taft Commission appointed Joaquin as the province's first Civil Governor on 15 August 1901, and that he became the first elected governor the following year. The Provincial Government's historical article identifies his term as 1901–1904. This was an important early period in the establishment of American-era civil provincial government.", evidence: "Provincial Government of La Union historical articles", source: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/" },
      { title: "Later public appointments", body: "The Ortega Reunion 2017 biography records later service as Lieutenant Governor in Abra, Bontoc and Mountain Province from 1905 to 1914; assignments involving Lepanto and Benguet from 1916 to 1920; and service as Special Agent of the Bureau of Non-Christian Tribes from 1920 to 1926, after which he retired under the Osmeña Act. These specific appointments currently rely on the family-history publication; appointment papers or government service records would strengthen the documentation.", evidence: "Published family-history program · official appointment records not yet attached", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Marriage, children, and family life", body: "The family research update gives the marriage date of Joaquin Ortega and Francisca Lacsamana as 11 February 1894. The Provincial Government confirms that they raised fourteen children. The reunion program describes him as making time for his children, encouraging his sons to study law, and raising his nephew Jesus Ortega Floirendo as his own. The advice about his children's education and the nephew's upbringing are details preserved in the family-history narrative.", evidence: "Provincial Government of La Union + Ortega Reunion 2017", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
      { title: "Death and public remembrance", body: "The Provincial Government of La Union records that Joaquin died on 31 May 1943 at age 77. The province has commemorated his appointment and public service through anniversary programs and a statue at the Provincial Capitol. The exact birth date follows the family program but is not fully resolved because the same program quotes an 1901 age that conflicts with the 1866 date. An original civil or baptismal record remains desirable for final confirmation.", evidence: "Provincial Government of La Union · 2023 heritage commemoration", source: "https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/" }
    ]
  }
};

// V19 master-findings additions. Existing V18 biography sections are preserved.
function appendHistoricalProfile(id, heading, sections) {
  const current = HISTORICAL_PROFILE_DETAILS[id];
  if (!current) HISTORICAL_PROFILE_DETAILS[id] = { heading, sections: sections.slice() };
  else {
    if (!current.heading) current.heading = heading;
    const existingTitles = new Set((current.sections || []).map((item) => item.title));
    for (const section of sections) if (!existingTitles.has(section.title)) current.sections.push(section);
  }
}
appendHistoricalProfile("joaquin", "First Civil Governor of La Union · ancestry and public legacy", [
  { title: "Paternal ancestry", body: "The master family findings identify Gov. Joaquín Vicente Eulogio Ortega y Joaquino as the son of Antonio Ortega y Verzosa and Juana (Ana) Joaquino, and as the grandson of Joaquín Ortega y Molina and Maria Verzosa. The family tree depicts the paternal grandparent couple as the parents of Antonio. The underlying civil or parish records are not attached in this update.", evidence: "Master family research summary · original records not attached", source: "" },
  { title: "Marriage to Doña Francisca", body: "The master family findings give 11 February 1894 as the marriage date of Joaquín and Doña Francisca Lacsamana-Ortega. The date is included in the family timeline; a copy of the original marriage register has not been attached.", evidence: "Master family research summary · marriage record not attached", source: "" }
]);
appendHistoricalProfile("francisca", "Doña Francisca · mother, family and memorial legacy", [
  { title: "Ancestral parentage", body: "The master family findings reiterate Ramona Lopez Lacsamana as the mother of both Doña Francisca and Don Leon. The current tree places Ramona with Fr. Evaristo Guadalupe y Villaverde as their parents, retaining the FamilySearch tree view as a family-tree source rather than treating it as an original birth record.", evidence: "FamilySearch tree/profile view cited in master family findings · original birth record not attached", source: "https://www.familysearch.org/tree/person/details/GNHK-MZ3" },
  { title: "Memorial recognition", body: "Doña Francisca’s name is preserved in the Doña Francisca Lacsamana de Ortega Memorial National High School in Bangar. Batas Pambansa Blg. 458, approved 10 June 1983, converted the memorial municipal high school into a national high school.", evidence: "Batas Pambansa Blg. 458 · legislative record", source: "https://ldr.senate.gov.ph/legislative-issuance/batas-pambansa-458" }
]);
appendHistoricalProfile("jose", "Lt. Jose Alvaro “Pepe” Ortega · wartime service", [
  { title: "Birth, marriage and death", body: "The master family summary gives Jose Alvaro “Pepe” Ortega’s birth year as 1900, marriage to Paz Munar Lacsamana on 8 September 1927, and death on 11 May 1942 in Capas, Tarlac. It describes his wartime service as a lieutenant and his death after the Bataan Death March. The original military file, death record and marriage register are not attached in this update.", evidence: "Master family research summary · original records not attached", source: "" }
]);
appendHistoricalProfile("paz", "Paz Munar Lacsamana · the six indexed children", [
  { title: "Three named children and three private entries", body: "The master findings explain the difference between six FamilySearch-indexed children (four sons and two daughters) and the three children named in the Ortega Reunion 2017 biography as surviving when Paz died in 1944: Joaquin “Kining”, Manuela “Mela”, and Leon “Cichit”. The remaining three indexed children are described in the family research as likely having died in childhood before 1944 (two boys and one girl). This is an inference, not a proven death record; their names remain private and are not invented here.", evidence: "FamilySearch index summary + Ortega Reunion 2017 biography + family research inference", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" }
]);
appendHistoricalProfile("kining", "Joaquin “Kining” Ortega · wartime and public service", [
  { title: "World War II service and later roles", body: "The master family findings identify Kining as the youngest USAFIP-NL World War II veteran and list his later public roles as Mayor, NTA Administrator and Presidential Consultant. No exact service dates, mayoral term, agency appointment record or military service document was supplied, so these roles are recorded without inferred dates.", evidence: "Master family research summary · service records not attached", source: "" }
]);
appendHistoricalProfile("titing", "Joaquin “Titing” Ortega Jr. · governor and veteran public servant", [
  { title: "Life dates and family", body: "The master family summary gives Titing’s birth date as 7 November 1916, baptism as 5 January 1917 in San Fernando, La Union, and death as 20 September 1996, with burial at Lingsat Public Cemetery. It lists him among the La Union governors for 1988–1992. The family summary spells his wife’s name Felicula Ortega; the earlier archive used Felicula “Fely” Nuesa. This variant remains visible pending a marriage record.", evidence: "Master family research summary · parish and civil records not attached", source: "" }
]);
appendHistoricalProfile("manuela", "Manuela “Miling” Ortega Orros · life and family", [
  { title: "Life dates", body: "The master family summary gives Manuela “Miling” Ortega Orros’s life years as 1906–1928. She is a different person from Manuela “Mela” Ortega, daughter of Jose Alvaro “Pepe” Ortega and Paz Munar Lacsamana. No exact day or month is supplied.", evidence: "Master family research summary · original civil records not attached", source: "" }
]);
appendHistoricalProfile("joaquina", "Joaquina Ortega Orros · Orros family branch", [
  { title: "Life dates and children", body: "The master family summary gives Joaquina’s life years as 1907–2003 and names her as the mother of Justo Ortega Orros Jr. and his siblings Manuel “Lito”, Agustin, Joaquin and Rosario. These relationships are reflected in the family tree; original birth records are not attached.", evidence: "Master family research summary · original civil records not attached", source: "" }
]);
appendHistoricalProfile("concepcion", "Concepcion L. Ortega · life dates", [
  { title: "Life dates", body: "The master family summary gives Concepcion L. Ortega’s life years as 1908–1986. Exact dates and an original civil record have not been supplied.", evidence: "Master family research summary · original civil record not attached", source: "" }
]);
appendHistoricalProfile("juanita", "Juanita L. Ortega · early death", [
  { title: "Life record", body: "The master family summary records that Juanita L. Ortega died at age 13. No birth or death date is supplied, and the archive does not infer calendar dates.", evidence: "Master family research summary · exact dates not supplied", source: "" }
]);
appendHistoricalProfile("justo-jr", "Justo Ortega Orros Jr. · public service and descendants", [
  { title: "Governor and ambassador", body: "The master family summary lists Justo Ortega Orros Jr. as Governor of La Union from 1992 to 2001 and Philippine Ambassador to Mexico. The Ortega Reunion 2017 biography gives the ambassadorial assignment as 2002–2006 and also records his earlier service as Mayor of San Fernando, Provincial Board Member and judge.", evidence: "Ortega Reunion 2017 biography + master family research summary", source: "https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf" },
  { title: "Children and extended family", body: "The master family summary identifies three sons with Jocelyn Abrogar: Jonathan Justo “Jay-Jay” A. Orros, Justo “Tito” / “Justito” Orros III, and Hon. John H. Orros. It also records an earlier marriage to Ligaya Israel. The 2007 Philstar election report identifies Jay-jay as Justo Orros’s son, John Orros as his cousin, and Justito Orros as a vice-gubernatorial candidate. The specific marriage sequence and current employment titles follow the supplied family research; copies of civil and employment records are not attached.", evidence: "Philstar 2007 report + master family research summary", source: "https://www.philstar.com/nation/2007/03/30/392299/15-ortega-family-members-seek-posts" }
]);
appendHistoricalProfile("manuel", "Manuel “Manoling” Ortega · governor, family and legacy", [
  { title: "Life dates and family", body: "The master family summary gives Manoling’s birth as 7 August 1945 in Bauang, La Union, and death as 2 December 2025 in San Fernando, La Union, aged 80. It names seven children: Francisco Emmanuel “Pacoy” R. Ortega III, Jennifer Joan R. Ortega, Geraldine Joy R. Ortega, Manuel Victor “Mannix” R. Ortega Jr., Alfredo Pablo “Alf” R. Ortega, Eduardo Francisco R. Ortega, and Joseph Francisco R. Ortega. House Resolution No. 545 is a condolence resolution identified in the House Journal; it does not list the seven children. The seven-name roster follows the supplied family summary.", evidence: "Master family research summary + House Journal No. 20 + Poro Point condolence notice", source: "https://docs.congress.hrep.online/legisdocs/journals_20/Journal-01612-20251201.pdf" },
  { title: "Governorship and public service", body: "The master family summary lists his service as Governor of La Union from 2007 to 2016. The Provincial Government of La Union previously referred to his family’s seven children, and Poro Point Management Corporation’s condolence notice names his wife Geraldine “Denny” and son Manuel Victor “Mannix”.", evidence: "Provincial Government of La Union + Poro Point Management Corporation", source: "https://poropointfreeport.gov.ph/new/ppmc-extends-sincere-condolences-to-the-family-of-hon-manuel-manoling-c-ortega/" }
]);
appendHistoricalProfile("pacoy", "Francisco Isabelo “Pacoy” Ortega · Congress and COMELEC", [
  { title: "National service", body: "The master family summary records 24 years of service in the House of Representatives and later service as a COMELEC Commissioner. Exact congressional terms and the date of his appointment to COMELEC are not supplied in this update.", evidence: "Master family research summary · official service records not attached", source: "" },
  { title: "Family branch and unresolved namesake", body: "The current archive connects this profile with Corazon Campos and their descendants. A separate old entry, “Francisco Jr.”, is recorded as having died at age 14; the new master summary names Francisco “Kiko” C. Ortega Jr. as a former city councilor. They remain separate profiles pending a primary record to resolve whether the two entries are the same person.", evidence: "Master family research summary + legacy archive record; identity conflict unresolved", source: "" }
]);
appendHistoricalProfile("mario", "Mario Eduardo “Tot” Ortega · current provincial leadership", [
  { title: "Governor of La Union", body: "The master family summary lists Mario Eduardo “Tot” Ortega as Governor beginning in 2025. The Provincial Government of La Union confirmed his first year in office on 6 July 2026 and continued to identify him as Governor in later 2026 updates.", evidence: "Provincial Government of La Union · 2026 official updates", source: "https://launion.gov.ph/aramid-bannogtayo-amin-gov-mario-heralds-agkaysa-in-the-capitol-as-he-marks-1st-year-of-service-in-office/" }
]);
appendHistoricalProfile("paolo", "Francisco Paolo P. Ortega V · House leadership", [
  { title: "Deputy Speaker and district representative", body: "The master family summary records that Francisco Paolo P. Ortega V became House Deputy Speaker in August 2025. The official House of Representatives member profile currently lists him as Deputy Speaker and Representative of La Union’s 1st District.", evidence: "Official House of Representatives member profile", source: "https://congress.gov.ph/house-members/view/K059" }
]);
appendHistoricalProfile("coleen-ortega-garcia", "Danielle Claudine “Coleen” Ortega Garcia-Crawford · public recognition", [
  { title: "Acting career", body: "The master family summary names Coleen as an extended Ortega cousin. Senate P.S. Resolution No. 344 identifies her as a Filipina actress and commends her Best Actress award at the 2022 El Grito International Fantastic Film Festival. The precise common ancestor linking her to the branches represented in this archive is not yet mapped.", evidence: "Senate P.S. Resolution No. 344 + family-supplied cousin connection", source: "https://issuances-library.senate.gov.ph/sites/default/files/2023-01/4009336510%21.pdf" }
]);
appendHistoricalProfile("ysabel-ortega", "Ysabel Ortega · public profile", [
  { title: "Acting and La Union family connection", body: "The master family summary names Ysabel as an extended Ortega cousin. Manila Bulletin and GMA Entertainment have described her as an actress and profiled her family’s farm in La Union. The exact common ancestor connecting her to the branches mapped in this archive has not been established in the supplied material.", evidence: "Manila Bulletin / GMA feature coverage + family-supplied cousin connection", source: "https://mb.com.ph/2022/1/8/corn-and-other-fruit-bearing-trees-abound-in-actress-ysabel-ortegas-family-farm" }
]);

appendHistoricalProfile("victor", "Victor Francisco Ortega · Governor of La Union", [
  { title: "Provincial governorship", body: "The master family summary lists Victor Francisco Ortega as Governor of La Union from 2001 to 2007. The earlier archive uses the fuller form Victor Francisco Campos Ortega. The term is retained as family research pending an official appointment or election record in the source collection.", evidence: "Master family research summary · official term record not attached", source: "" }
]);
appendHistoricalProfile("pacoy3", "Francisco Emmanuel “Pacoy” Ortega III · provincial leadership", [
  { title: "Governor of La Union", body: "The master family summary lists Francisco Emmanuel “Pacoy” R. Ortega III as Governor of La Union from 2016 to 2022, after earlier public service including representation through the Abono party-list. His marriage to Vini Nolasco-Ortega is recorded in the family tree; the archive preserves earlier Vini name variants pending a civil or marriage record.", evidence: "Master family research summary + earlier archive family records", source: "" }
]);
appendHistoricalProfile("raphaelle", "Raphaelle Veronica “Rafy” Ortega-David · provincial leadership", [
  { title: "Governor of La Union", body: "The master family summary lists Raphaelle Veronica “Rafy” Ortega-David as Governor of La Union from 2022 to 2025. The earlier archive retains her family relationship to Francisco Emmanuel “Pacoy” Ortega III and Vini Nola Alviar Ortega as recorded in the family research and the ITU profile note.", evidence: "Master family research summary + earlier archive profile sources", source: "" }
]);
appendHistoricalProfile("kiko-c-ortega", "Francisco “Kiko” C. Ortega Jr. · identity review", [
  { title: "Public-service note and unresolved same-name record", body: "The master family summary identifies Francisco “Kiko” C. Ortega Jr. as a former San Fernando City Councilor and places him among the descendants of Francisco Isabelo “Pacoy” Ortega and Corazon Campos. A separate older profile, “Francisco Jr.”, records a death at age 14. The archive keeps Kiko and the older Francisco Jr. as separate entries and does not merge them unless a primary record establishes whether they are distinct people or duplicate descriptions.", evidence: "Master family research summary + legacy archive note · identity unresolved", source: "" }
]);

function renderSurnameRegister() {
  const target = $("#surnameRegistry"); if (!target) return;
  target.innerHTML = SURNAME_REGISTER.map(([name, kind, note]) => '<article class="surname-entry"><span class="archive-mini-label">' + esc(kind) + '</span><strong>' + esc(name) + '</strong><p>' + esc(note) + '</p></article>').join("");
}
function renderTimeline() {
  const target = $("#timelineList"); if (!target) return;
  target.innerHTML = ARCHIVE_EVENTS.slice().sort((a,b) => a.sort.localeCompare(b.sort)).map((e) => {
    const people = e.people.map((id) => PEOPLE[id] ? archiveButton(nameOf(PEOPLE[id]), id) : "").filter(Boolean).join(" ");
    return '<article class="timeline-event"><div class="timeline-date">' + esc(e.date) + '</div><div class="timeline-mark"><i></i></div><div class="timeline-body"><h4>' + esc(e.title) + '</h4><p>' + esc(e.detail) + '</p><span class="archive-mini-label">' + esc(e.status) + '</span><div class="archive-inline-links">' + people + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.urlLabel || "Source ↗") + '</a>' : '') + '</div></div></article>';
  }).join("");
}
let familyMigrationMap = null;
let familyMapMarkers = [];
let familyMapOverlays = [];
let familyMapMarkerById = new Map();
let familyMapActiveView = "launion";
let familyMapTileLayer = null;
let familyMapDarkTone = true;
let familyMapExpanded = false;
// CARTO browser map key supplied by the project owner. This key is visible in browser requests;
// restrict its permitted origins/referrers in the CARTO dashboard before publishing.
const CARTO_PUBLIC_KEY = "cb1_58q5_1_7ec553efa05ce9dd9f1b5e6b";
const CARTO_VOYAGER_RASTER_URL = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=" + encodeURIComponent(CARTO_PUBLIC_KEY);
function mapEventLabel(type) {
  return ({birth:"Birth",death:"Death",residence:"Residence",marriage:"Marriage record",work:"Public service",origin:"Family roots",memory:"Family memory"})[type] || "Family record";
}
function mapEscape(value) { return esc(String(value == null ? "" : value)); }
function mapPersonButton(id) {
  const person = PEOPLE[id];
  if (!person) return '<span class="map-person-unknown">' + mapEscape(id) + '</span>';
  return '<button type="button" data-map-person="' + mapEscape(id) + '">' + mapEscape(nameOf(person)) + '</button>';
}
function geographyVisibleEvents(place, query) {
  const enabled = new Set(Array.from(document.querySelectorAll(".map-event-filter:checked")).map((input) => input.value));
  const q = (query || "").trim().toLowerCase();
  return (place.events || []).filter((event) => {
    if (!enabled.has(event.type)) return false;
    if (!q) return true;
    const people = (event.personIds || []).map((id) => PEOPLE[id] ? nameOf(PEOPLE[id]) : id).join(" ");
    return [place.place, event.title, event.detail, event.date, people, event.status].join(" ").toLowerCase().includes(q);
  });
}
function mapPopup(place, events) {
  const rows = events.map((event) => {
    const people = (event.personIds || []).map(mapPersonButton).join("");
    return '<div class="family-map-popup-event"><b>' + mapEscape(event.title) + (event.date ? ' · ' + mapEscape(event.date) : '') + '</b>' +
      (people ? '<div class="family-map-person-links">' + people + '</div>' : '') +
      '<p>' + mapEscape(event.detail) + '</p><small>' + mapEscape(event.status || "Status not specified") + (event.source ? ' · <a href="' + mapEscape(event.source) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + '</small></div>';
  }).join("");
  return '<div class="family-map-popup"><div class="family-map-popup-head"><small>' + mapEscape(place.precision || "Map reference") + '</small><strong>' + mapEscape(place.place) + '</strong></div>' + rows +
    (place.approximate ? '<small>Approximate / regional reference marker. Do not interpret as an exact address.</small>' : '') + '</div>';
}
function mapMarkerClass(type) { return ["birth","death","residence","marriage","work","origin","memory"].includes(type) ? type : "origin"; }
function clearFamilyMapLayers() {
  if (!familyMigrationMap) return;
  familyMapMarkers.forEach((layer) => familyMigrationMap.removeLayer(layer));
  familyMapOverlays.forEach((layer) => familyMigrationMap.removeLayer(layer));
  familyMapMarkers = []; familyMapOverlays = []; familyMapMarkerById.clear();
}
function addFamilyMapPopupHandlers() {
  familyMigrationMap.off("popupopen.familyPeople");
  familyMigrationMap.on("popupopen.familyPeople", (event) => {
    const root = event.popup.getElement(); if (!root) return;
    root.querySelectorAll("[data-map-person]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.mapPerson;
        if (PEOPLE[id]) { focusPeople([id]); showPersonDetails(id); }
      });
    });
  });
}
function setFamilyMapTileStatus(message, state) {
  const status = $("#familyMapTileStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state || "info";
}
function applyFamilyMapTone() {
  const node = $("#familyMigrationMap");
  const button = $("#familyMapTheme");
  if (node) node.classList.toggle("map-theme-dark", familyMapDarkTone);
  if (button) {
    button.setAttribute("aria-pressed", familyMapDarkTone ? "true" : "false");
    button.textContent = familyMapDarkTone ? "Dark tone: On" : "Dark tone: Off";
  }
}
function setFamilyMapExpanded(expanded) {
  familyMapExpanded = !!expanded;
  const shell = $(".family-map-shell");
  const button = $("#familyMapExpand");
  if (shell) shell.classList.toggle("map-expanded", familyMapExpanded);
  document.body.classList.toggle("family-map-expanded-open", familyMapExpanded);
  if (button) {
    button.setAttribute("aria-pressed", familyMapExpanded ? "true" : "false");
    button.textContent = familyMapExpanded ? "Close expanded map" : "Expand map";
  }
  setTimeout(() => familyMigrationMap && familyMigrationMap.invalidateSize({pan:false}), 180);
}
function initFamilyMigrationMap() {
  const node = $("#familyMigrationMap");
  if (!node || familyMigrationMap || !window.L) return;
  familyMigrationMap = L.map(node, {
    zoomControl:false,
    scrollWheelZoom:false,
    doubleClickZoom:true,
    touchZoom:true,
    dragging:true,
    keyboard:true,
    preferCanvas:true,
    worldCopyJump:true,
    zoomSnap:0.5,
    zoomDelta:0.5,
    minZoom:3,
    maxZoom:20
  }).setView([16.79, 120.36], 9);
  L.control.zoom({position:"bottomright"}).addTo(familyMigrationMap);
  L.control.scale({position:"bottomleft", imperial:false, metric:true, maxWidth:110}).addTo(familyMigrationMap);
  familyMapTileLayer = L.tileLayer(CARTO_VOYAGER_RASTER_URL, {
    minZoom:3,
    maxZoom:20,
    maxNativeZoom:20,
    tileSize:256,
    updateWhenIdle:true,
    keepBuffer:3,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
  });
  familyMapTileLayer.on("loading", () => setFamilyMapTileStatus("Loading CARTO Voyager tiles…", "loading"));
  familyMapTileLayer.once("load", () => setFamilyMapTileStatus("CARTO Voyager connected", "success"));
  familyMapTileLayer.on("tileerror", () => setFamilyMapTileStatus("CARTO tile error · check the key, allowed domain, or connection", "error"));
  familyMapTileLayer.addTo(familyMigrationMap);
  applyFamilyMapTone();
  addFamilyMapPopupHandlers();
  setTimeout(() => familyMigrationMap && familyMigrationMap.invalidateSize({pan:false}), 160);
}
function renderGeography() {
  const target = $("#geographyPlaces"); if (!target) return;
  const search = $("#familyMapSearch");
  const query = search ? search.value : "";
  const visiblePlaces = GEOGRAPHY.map((place) => ({...place, visibleEvents: geographyVisibleEvents(place, query)})).filter((place) => place.visibleEvents.length);
  const totalEvents = visiblePlaces.reduce((sum, place) => sum + place.visibleEvents.length, 0);
  const summary = $("#familyMapSummary"); if (summary) summary.textContent = totalEvents + " mapped event" + (totalEvents === 1 ? "" : "s") + " · " + visiblePlaces.length + " places";
  const resultCount = $("#familyMapResultCount"); if (resultCount) resultCount.textContent = visiblePlaces.length + " locations · " + totalEvents + " event records";
  const heading = $("#familyMapHeading"); if (heading) heading.textContent = ({launion:"La Union · family locations",philippines:"Philippines · all recorded locations",spain:"Spain · European family record",all:"All locations · Europe to the Philippines"})[familyMapActiveView] || "Family locations";
  target.innerHTML = visiblePlaces.map((place) => {
    const associatedPeople = Array.from(new Set(place.visibleEvents.flatMap((event) => event.personIds || [])));
    return '<article class="family-map-register-item" id="map-place-' + mapEscape(place.id) + '"><div class="family-map-register-item-head"><div><h5>' + mapEscape(place.place) + '</h5><span class="archive-mini-label">' + mapEscape(place.precision || "Map reference") + (place.approximate ? ' · approximate' : '') + ' · ' + associatedPeople.length + ' named people</span></div><div class="map-place-actions"><button type="button" class="map-show-place" data-map-place="' + mapEscape(place.id) + '">Show on map</button><a href="' + mapEscape(place.source || ("https://www.openstreetmap.org/search?query=" + encodeURIComponent(place.place))) + '" target="_blank" rel="noopener" class="map-place-open">Open ↗</a></div></div>' +
    place.visibleEvents.map((event) => '<div class="family-map-register-event"><span class="map-event-type">' + mapEscape(mapEventLabel(event.type)) + (event.date ? ' · ' + mapEscape(event.date) : '') + '</span><p>' + mapEscape(event.title) + '</p><div class="family-map-register-people">' + (event.personIds || []).map(mapPersonButton).join("") + '</div><small>' + mapEscape(event.detail) + '</small><small>Evidence: ' + mapEscape(event.status || "Not specified") + '</small></div>').join("") + '</article>';
  }).join("");
  const unpinned = GEOGRAPHY_UNPINNED.map((item) => '<article class="family-map-register-item"><div class="family-map-register-item-head"><div><h5>' + mapEscape(item.place) + '</h5><span class="archive-mini-label">Unpinned research lead</span></div></div><p>' + mapEscape(item.people) + '</p><small>' + mapEscape(item.note) + '</small></article>').join("");
  target.innerHTML += unpinned;
  if (!window.L) {
    const status = $("#familyMapSummary"); if (status) status.textContent = "Interactive map library could not load; see the location register below.";
    return;
  }
  const mapWasReady = !!familyMigrationMap;
  initFamilyMigrationMap();
  if (!familyMigrationMap) return;
  clearFamilyMapLayers();
  const visibleIds = new Set(visiblePlaces.map((place) => place.id));
  visiblePlaces.forEach((place) => {
    const types = Array.from(new Set(place.visibleEvents.map((event) => mapMarkerClass(event.type))));
    const type = types.length > 1 ? "mixed" : (types[0] || "origin");
    const peopleCount = Array.from(new Set(place.visibleEvents.flatMap((event) => event.personIds || []))).length;
    const icon = L.divIcon({className:"family-map-marker-wrap", html:'<div class="family-map-pin ' + type + '"><span>' + peopleCount + '</span></div>', iconSize:[39,46], iconAnchor:[19,39], popupAnchor:[0,-36]});
    const marker = L.marker([place.lat,place.lng], {icon, title:place.place + " · " + peopleCount + " named people", keyboard:true, alt:place.place});
    marker.bindPopup(mapPopup(place, place.visibleEvents), {maxWidth:360, minWidth:245, autoPanPadding:[18,18], closeButton:true});
    marker.addTo(familyMigrationMap); familyMapMarkers.push(marker); familyMapMarkerById.set(place.id, marker);
    if (place.approximate) {
      const ring = L.circle([place.lat,place.lng], {radius:1250, className:"family-map-approx-ring", color:"#d69b62", weight:1.5, dashArray:"5 7", fillColor:"#d69b62", fillOpacity:.06, interactive:false}).addTo(familyMigrationMap);
      familyMapOverlays.push(ring);
    }
  });
  const connectionToggle = $("#familyMapConnections");
  if (!connectionToggle || connectionToggle.checked) {
    GEOGRAPHY_ROUTES.forEach((route) => {
      if (!visibleIds.has(route.from) || !visibleIds.has(route.to)) return;
      const a = GEOGRAPHY.find((p) => p.id === route.from), b = GEOGRAPHY.find((p) => p.id === route.to);
      if (!a || !b) return;
      const line = L.polyline([[a.lat,a.lng],[b.lat,b.lng]], {color:route.type === "life" ? "#cbb47f" : "#d69b62", weight:2.5, opacity:.88, dashArray:route.type === "life" ? "7 9" : "3 8", interactive:true}).addTo(familyMigrationMap);
      line.bindTooltip('<div class="family-map-route-label">' + mapEscape(route.label) + '</div>', {sticky:true, direction:"top", opacity:1});
      line.bindPopup('<div class="family-map-popup"><div class="family-map-popup-head"><small>INTERPRETATION NOTE</small><strong>' + mapEscape(route.label) + '</strong></div><p>' + mapEscape(route.note) + '</p></div>');
      familyMapOverlays.push(line);
    });
  }
  // Preserve a visitor's current pan/zoom when changing filters. Only the first render fits the default region.
  if (!mapWasReady) focusFamilyMap(familyMapActiveView, false);
  else if (query && familyMapMarkers.length) {
    const searchBounds = L.featureGroup(familyMapMarkers).getBounds();
    if (searchBounds.isValid()) familyMigrationMap.flyToBounds(searchBounds, {padding:[40,40], maxZoom:11, duration:.45});
  }
  applyFamilyMapTone();
}
function focusFamilyMap(view, updateButtons = true) {
  if (!familyMigrationMap) return;
  familyMapActiveView = view;
  if (updateButtons) document.querySelectorAll("[data-map-view]").forEach((button) => button.classList.toggle("active", button.dataset.mapView === view));
  const groups = {
    launion:["bangar","carlatan","daya","san-juan","san-fernando","luna"],
    philippines:["cebu","bangar","carlatan","daya","san-juan","san-fernando","luna","marilao","san-pablo"],
    spain:["ocana"],
    all:GEOGRAPHY.map((place) => place.id)
  };
  const selected = GEOGRAPHY.filter((place) => groups[view].includes(place.id));
  if (selected.length === 1) familyMigrationMap.flyTo([selected[0].lat,selected[0].lng], 9, {duration:.6});
  else if (selected.length) {
    const bounds = L.latLngBounds(selected.map((place) => [place.lat,place.lng]));
    familyMigrationMap.flyToBounds(bounds, {padding:[42,42], maxZoom:view === "launion" ? 10 : 5, duration:.65});
  }
  const heading = $("#familyMapHeading"); if (heading) heading.textContent = ({launion:"La Union · family locations",philippines:"Philippines · all recorded locations",spain:"Spain · European family record",all:"All locations · Europe to the Philippines"})[view] || "Family locations";
  setTimeout(() => familyMigrationMap && familyMigrationMap.invalidateSize(), 120);
}
function setupFamilyMapControls() {
  document.querySelectorAll("[data-map-view]").forEach((button) => button.addEventListener("click", () => focusFamilyMap(button.dataset.mapView)));
  document.querySelectorAll(".map-event-filter").forEach((input) => input.addEventListener("change", renderGeography));
  const search = $("#familyMapSearch"); if (search) search.addEventListener("input", renderGeography);
  const connectionToggle = $("#familyMapConnections"); if (connectionToggle) connectionToggle.addEventListener("change", renderGeography);
  const reset = $("#familyMapReset"); if (reset) reset.addEventListener("click", () => focusFamilyMap(familyMapActiveView));
  const theme = $("#familyMapTheme"); if (theme) theme.addEventListener("click", () => { familyMapDarkTone = !familyMapDarkTone; applyFamilyMapTone(); });
  const expand = $("#familyMapExpand"); if (expand) expand.addEventListener("click", () => setFamilyMapExpanded(!familyMapExpanded));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && familyMapExpanded) setFamilyMapExpanded(false); });
  const register = $("#geographyPlaces");
  if (register) register.addEventListener("click", (event) => {
    const placeButton = event.target.closest("[data-map-place]");
    if (placeButton && familyMigrationMap) {
      const place = GEOGRAPHY.find((item) => item.id === placeButton.dataset.mapPlace);
      const marker = familyMapMarkerById.get(placeButton.dataset.mapPlace);
      if (place && marker) { familyMigrationMap.flyTo([place.lat, place.lng], Math.max(familyMigrationMap.getZoom(), 11), {duration:.45}); setTimeout(() => marker.openPopup(), 470); }
      return;
    }
    const button = event.target.closest("[data-map-person]"); if (!button) return;
    const id = button.dataset.mapPerson;
    if (PEOPLE[id]) { focusPeople([id]); showPersonDetails(id); }
  });
  document.querySelectorAll('a[href="#geographic-map"]').forEach((link) => link.addEventListener("click", () => setTimeout(() => familyMigrationMap && familyMigrationMap.invalidateSize({pan:false}), 220)));
  window.addEventListener("resize", () => { if (familyMigrationMap) setTimeout(() => familyMigrationMap.invalidateSize({pan:false}), 140); });
}

function isUnidentifiedPerson(p) {
  const txt = [nameOf(p), roleOf(p), p.n || ""].join(" ");
  return !!p.ed || /unidentified|unnamed|name needed|name not publicly identified|unknown child|unknown relative/i.test(txt);
}
function renderUnidentified() {
  const target = $("#unidentifiedList"); if (!target) return;
  const rows = Object.values(PEOPLE).filter(isUnidentifiedPerson).sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
  const count = $("#unknownCount"); if (count) count.textContent = rows.length + " open lead" + (rows.length === 1 ? "" : "s");
  target.innerHTML = rows.length ? rows.map((p) => '<article class="unidentified-row"><div><strong>' + esc(nameOf(p)) + '</strong><p>' + esc(roleOf(p) || "Family relationship needs identification") + '</p><span class="archive-mini-label">' + esc(p.status || "Research needed") + '</span></div><div class="unidentified-actions">' + archiveButton("Locate profile", p.id, "archive-action subtle") + '<span>Profile ID: ' + esc(p.id) + '</span></div></article>').join("") : '<p class="archive-empty">No unidentified profiles are currently flagged in the base family data.</p>';
}
function historicalSectionsMarkup(id, escapeFn) {
  const profile = HISTORICAL_PROFILE_DETAILS[id];
  if (!profile) return "";
  const safe = escapeFn || esc;
  return '<div class="historical-profile-sections">' + profile.sections.map((section) => '<section class="life-story-block historical-profile-section"><h5>' + safe(section.title) + '</h5><p>' + safe(section.body) + '</p><span class="archive-mini-label">' + safe(section.evidence) + '</span>' + (section.source ? '<p><a href="' + safe(section.source) + '" target="_blank" rel="noopener">Open supporting source ↗</a></p>' : '') + '</section>').join("") + '</div>';
}
function renderBiographies() {
  const target = $("#biographyList"); if (!target) return;
  const rows = BIOGRAPHY_IDS.map((id) => PEOPLE[id]).filter(Boolean);
  target.innerHTML = rows.map((p) => {
    const historical = HISTORICAL_PROFILE_DETAILS[p.id];
    return '<article class="biography-entry"><span class="archive-mini-label">' + esc(historical ? historical.heading : (p.role || "Family biography")) + '</span><h4>' + esc(nameOf(p)) + '</h4><p>' + esc(p.n || "No biographical note has been added in the current archive yet.") + '</p>' + historicalSectionsMarkup(p.id) + archiveButton("Open family profile", p.id) + '</article>';
  }).join("");
}
function renderKnownSources() {
  const target = $("#archiveKnownSources"); if (!target) return;
  target.innerHTML = KNOWN_ARCHIVE_SOURCES.map((s) => '<article class="archive-source-entry"><span class="archive-mini-label">' + esc(s.type) + '</span><strong>' + esc(s.title) + '</strong><p>' + esc(s.note) + '</p><a href="' + esc(s.url) + '" target="_blank" rel="noopener">Open source ↗</a></article>').join("");
}
function archiveEntryMarkup(entry, kind) {
  const remove = '<button type="button" class="archive-remove" data-remove-archive="' + esc(kind) + '" data-id="' + esc(entry.id) + '">Remove</button>';
  const source = entry.source ? '<p class="archive-source-text">Source: ' + esc(entry.source) + '</p>' : "";
  const date = entry.date ? '<span class="archive-mini-label">' + esc(entry.date) + '</span>' : "";
  return '<article class="archive-saved-entry">' + date + '<h4>' + esc(entry.title || entry.name || "Untitled entry") + '</h4>' + (entry.person ? '<p class="archive-entry-meta">' + esc(entry.person) + '</p>' : "") + (entry.speaker ? '<p class="archive-entry-meta">Shared by ' + esc(entry.speaker) + '</p>' : "") + '<p>' + esc(entry.body || entry.note || entry.description || "") + '</p>' + source + remove + '</article>';
}
function renderSavedArchiveEntries() {
  const stories = $("#storyList"), achievements = $("#customAchievementList"), properties = $("#customPropertyList"), links = $("#customDocumentList");
  if (stories) stories.innerHTML = archiveStore.stories.length ? archiveStore.stories.map((e) => archiveEntryMarkup(e, "stories")).join("") : '<p class="archive-empty">No family interviews or newly submitted stories have been saved yet.</p>';
  if (achievements) achievements.innerHTML = archiveStore.achievements.length ? archiveStore.achievements.map((e) => archiveEntryMarkup(e, "achievements")).join("") : '<p class="archive-empty">No additional biography notes have been added yet.</p>';
  if (properties) properties.innerHTML = archiveStore.properties.length ? archiveStore.properties.map((e) => archiveEntryMarkup(e, "properties")).join("") : '<p class="archive-empty">No ancestral property claims have been added. The current records identify locations, not verified ownership.</p>';
  if (links) links.innerHTML = archiveStore.links.length ? archiveStore.links.map((e) => '<article class="archive-saved-entry"><span class="archive-mini-label">' + esc(e.type) + '</span><h4>' + esc(e.title) + '</h4><p>' + esc(e.note || "") + '</p><a href="' + esc(e.url) + '" target="_blank" rel="noopener">Open source ↗</a><button type="button" class="archive-remove" data-remove-archive="links" data-id="' + esc(e.id) + '">Remove</button></article>').join("") : '<p class="archive-empty">No personal document links added yet.</p>';
  const migrationTarget = $("#customMigrationStories");
  if (migrationTarget) migrationTarget.innerHTML = archiveStore.migrationStories.length ? archiveStore.migrationStories.map((entry) => '<article class="archive-saved-entry"><span class="archive-mini-label">' + esc(entry.evidence || "Family place story") + ' · ' + esc(entry.period || "Date not recorded") + '</span><h4>' + esc(entry.title) + '</h4><p class="archive-entry-meta">' + esc(entry.person || "Family branch") + '</p><p>' + esc([entry.from,entry.to].filter(Boolean).join(" → ")) + '</p><p>' + esc(entry.body) + '</p>' + (entry.source ? '<p class="archive-source-text">Source: ' + esc(entry.source) + '</p>' : '') + '<button type="button" class="archive-remove" data-remove-archive="migrationStories" data-id="' + esc(entry.id) + '">Remove</button></article>').join("") : '<p class="archive-empty">No additional migration or place stories have been added.</p>';
}
function addArchiveSubmit(formId, builder, bucket, statusId) {
  const form = $("#" + formId); if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const entry = builder();
    if (!entry) return;
    entry.id = archiveId(bucket);
    archiveStore[bucket].unshift(entry);
    saveArchiveStore(); renderSavedArchiveEntries(); form.reset();
    const status = statusId ? $("#" + statusId) : null;
    if (status) status.textContent = "Saved in this browser's family archive.";
  });
}
function initArchiveForms() {
  addArchiveSubmit("storyForm", () => ({ title: $("#storyTitle").value.trim(), person: $("#storyPerson").value.trim(), speaker: $("#storySpeaker").value.trim(), date: $("#storyDate").value.trim(), body: $("#storyBody").value.trim(), source: $("#storyConsent").value.trim() }), "stories");
  addArchiveSubmit("achievementForm", () => ({ title: $("#achievementTitle").value.trim(), person: $("#achievementPerson").value.trim(), body: $("#achievementNote").value.trim(), source: $("#achievementSource").value.trim() }), "achievements");
  addArchiveSubmit("propertyForm", () => ({ title: $("#propertyName").value.trim(), person: $("#propertyPeople").value.trim(), date: $("#propertyPeriod").value.trim(), body: $("#propertyType").value + ( $("#propertyNote").value.trim() ? " · " + $("#propertyNote").value.trim() : ""), source: $("#propertySource").value.trim() }), "properties");
  const docForm = $("#archiveDocumentForm");
  if (docForm) docForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#archiveDocTitle").value.trim(), type = $("#archiveDocType").value, url = $("#archiveDocUrl").value.trim(), note = $("#archiveDocNote").value.trim(), file = $("#archiveDocFile").files[0];
    if (!title) return;
    if (url) {
      try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) throw new Error("url"); }
      catch (e) { $("#archiveDocStatus").textContent = "Enter a valid http or https URL."; return; }
    }
    if (file) {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error("size");
        await saveArchiveFile({ id: archiveId("file"), title, type, url, note, blob: file, mime: file.type, size: file.size, added: new Date().toISOString() });
        $("#archiveDocStatus").textContent = "File saved in this browser's IndexedDB archive.";
      } catch (err) {
        $("#archiveDocStatus").textContent = err.message === "size" ? "Files must be 20 MB or smaller." : "This browser could not store the file. Try a smaller file or add its source URL instead.";
        return;
      }
    }
    if (url) archiveStore.links.unshift({ id: archiveId("link"), title, type, url, note, date: new Date().toLocaleDateString() });
    if (!file && !url) { $("#archiveDocStatus").textContent = "Choose a file or provide a source URL."; return; }
    saveArchiveStore(); renderSavedArchiveEntries(); await renderArchiveFiles(); docForm.reset();
    $("#archiveDocStatus").textContent = "Saved. Local files stay in this browser; source links are included in the archive-notes export.";
  });
  document.addEventListener("click", async (event) => {
    const personButton = event.target.closest("[data-archive-person]");
    if (personButton) { const id = personButton.dataset.archivePerson; if (PEOPLE[id]) { focusPeople([id]); showPersonDetails(id); } }
    const remove = event.target.closest("[data-remove-archive]");
    if (remove) {
      const bucket = remove.dataset.removeArchive, id = remove.dataset.id;
      if (Array.isArray(archiveStore[bucket])) { archiveStore[bucket] = archiveStore[bucket].filter((x) => x.id !== id); saveArchiveStore(); renderSavedArchiveEntries(); }
    }
    const deleteFile = event.target.closest("[data-delete-archive-file]");
    if (deleteFile) { await deleteArchiveFile(deleteFile.dataset.deleteArchiveFile); await renderArchiveFiles(); await renderMediaGalleries(); }
  });
  const importArchiveButton = $("#importArchiveBtn");
  const importArchiveFile = $("#importArchiveFile");
  if (importArchiveButton && importArchiveFile) {
    importArchiveButton.addEventListener("click", () => importArchiveFile.click());
    importArchiveFile.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const incoming = parsed.archive || parsed;
          const buckets = ["stories", "achievements", "properties", "links", "institutions", "lifeStories", "homeEntries", "migrationStories"];
          if (!incoming || !buckets.some((key) => Array.isArray(incoming[key]))) throw new Error("format");
          buckets.forEach((key) => { if (Array.isArray(incoming[key])) archiveStore[key] = incoming[key]; });
          saveArchiveStore(); renderSavedArchiveEntries(); renderAncestralPlaces(); renderInstitutionDirectory(); renderCustomLifeNotes(); renderAncestralHomeGallery();
          const status = $("#archiveDocStatus"); if (status) status.textContent = "Archive notes imported. Use Sync browser to save them to the shared database.";
        } catch (error) { window.alert("That file is not a valid family archive-notes export."); }
      };
      reader.readAsText(file); importArchiveFile.value = "";
    });
  }
  const exportButton = $("#exportArchiveBtn");
  if (exportButton) exportButton.addEventListener("click", () => {
    const backup = { exportedAt: new Date().toISOString(), archive: archiveStore, note: "Uploaded file binaries are stored separately in this browser's IndexedDB and are not included in this JSON export. Keep original files separately." };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "lacsamana-family-archive-notes.json"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  });
}
const ARCHIVE_DB_NAME = "lacsamana-family-archive-assets";
function openArchiveDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(ARCHIVE_DB_NAME, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error("IndexedDB error"));
  });
}
async function saveArchiveFile(record) {
  const db = await openArchiveDB();
  return new Promise((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(record); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; });
}
async function getArchiveFiles() {
  const db = await openArchiveDB();
  return new Promise((resolve, reject) => { const tx = db.transaction("files", "readonly"); const req = tx.objectStore("files").getAll(); req.onsuccess = () => { db.close(); resolve(req.result || []); }; req.onerror = () => { db.close(); reject(req.error); }; });
}
async function deleteArchiveFile(id) {
  try { const db = await openArchiveDB(); await new Promise((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); } catch (e) {}
}
async function renderArchiveFiles() {
  const target = $("#customDocumentList"); if (!target) return;
  if (window.FamilyCloud && window.FamilyCloud.configured && !window.FamilyCloud.isAdmin) {
    target.innerHTML = '<p class="archive-empty">Personal uploads in this browser are not part of the public archive. Shared file storage has not been configured yet.</p>';
    return;
  }
  try {
    const files = await getArchiveFiles();
    const savedLinks = archiveStore.links.length ? archiveStore.links.map((e) => '<article class="archive-saved-entry"><span class="archive-mini-label">' + esc(e.type) + '</span><h4>' + esc(e.title) + '</h4><p>' + esc(e.note || "") + '</p><a href="' + esc(e.url) + '" target="_blank" rel="noopener">Open source ↗</a><button type="button" class="archive-remove" data-remove-archive="links" data-id="' + esc(e.id) + '">Remove</button></article>').join("") : "";
    const documentFiles = files.filter((f) => !f.category || f.category === "document");
    const fileMarkup = documentFiles.map((f) => {
      const url = URL.createObjectURL(f.blob);
      const preview = (f.mime || "").startsWith("image/") ? '<a href="' + url + '" target="_blank" rel="noopener"><img class="archive-file-thumb" src="' + url + '" alt="' + esc(f.title) + '"></a>' : '<span class="archive-file-icon">DOC</span>';
      return '<article class="archive-saved-entry archive-file-entry">' + preview + '<div><span class="archive-mini-label">' + esc(f.type) + ' · ' + esc((f.size / 1024).toFixed(0)) + ' KB</span><h4>' + esc(f.title) + '</h4><p>' + esc(f.note || f.mime || "") + '</p><a href="' + url + '" target="_blank" rel="noopener">Open file ↗</a>' + (f.url ? ' · <a href="' + esc(f.url) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + '<button type="button" class="archive-remove" data-delete-archive-file="' + esc(f.id) + '">Remove file</button></div></article>';
    }).join("");
    target.innerHTML = (fileMarkup + savedLinks) || '<p class="archive-empty">No personal document links or uploaded files added yet.</p>';
  } catch (e) {
    target.innerHTML = '<p class="archive-empty">Local file storage is not available in this browser context. You can still add source URLs above.</p>';
  }
}
function renderAncestralPlaces() {
  const target = $("#ancestralPlaceList"); if (!target) return;
  const items = [
    ["Bangar, La Union", "Martin Lacsamana · Narcisa Lopez · Ramona · Francisca", "Family roots / birthplace references", "FamilySearch screenshot; Ortega family-history program"],
    ["Carlatan, San Fernando City", "Don Leon Lacsamana", "Residence in family memoir", "Family-reported account; no property deed attached"],
    ["Daya, San Fernando City", "Doña Francisca · Don Leon's children", "Place visited in family memoir", "Family-reported account"],
    ["San Juan, La Union", "Evaristo Guadalupe y Villaverde", "Recorded deathplace", "FamilySearch screenshot and Augustinian archival register"],
    ["Luna, La Union", "Alfredo Lacsamana · Juanita Valdivia / Valdris", "Register entry location · 1944", "Supplied register-page scan; surname and age differences remain unresolved"],
    ["Ocaña, Toledo, Spain", "Evaristo Guadalupe y Villaverde", "Recorded birthplace · 1830", "FamilySearch screenshot / Augustinian archival register"],
    ["Marilao, Bulacan", "Inocencia Lacsamana · Alejandro David", "Separate marriage-record location · 1922", "Unlinked research group"],
    ["San Pablo City, Laguna", "Rafaela Lacsamana · Victor Umila", "Separate death-record location · 1953", "Unlinked research group; index classification needs review"],
  ];
  target.innerHTML = items.map((x) => '<article class="ancestral-place"><span class="archive-mini-label">' + esc(x[2]) + '</span><h4>' + esc(x[0]) + '</h4><p>' + esc(x[1]) + '</p><small>' + esc(x[3]) + '</small></article>').join("");
}

/* =====================================================================
   V11 · Historical context, homes, portraits, affiliations, biographies,
   and printable family legacy book.
   These are archive layers; they do not modify parent-child relationships.
   ===================================================================== */
const WORLD_CONTEXT_EVENTS = [
  {start:1815,end:1815,region:"Philippines",title:"The Manila galleon trade had ended",detail:"The National Commission for Culture and the Arts describes the abolition of the galleon trade in 1815 as one of the changes preceding the nineteenth-century transformation of the Philippines. This is background to the period, not evidence of a specific family connection.",source:"https://ncca.gov.ph/wp-content/uploads/2021/09/PHILIPPINE-HISTORY-SOURCE-BOOK-FINAL-SEP022021.pdf",label:"NCCA · Philippine History Sourcebook"},
  {start:1833,end:1840,region:"Spain",title:"First Carlist War",detail:"Spain experienced a succession conflict and civil war after the death of Ferdinand VII. The event provides political context for a Spanish-born ancestor's early life; no personal involvement by Evaristo is established.",source:"https://www.etd.ceu.edu/2020/gibbons_christian.pdf",label:"Central European University · historical study"},
  {start:1868,end:1868,region:"Spain",title:"Spanish Revolution of 1868",detail:"A revolution deposed Isabella II and opened a period of political change in Spain. This is broad national context for Evaristo's adult years.",source:"https://www.gutenberg.org/cache/epub/57431/pg57431-images.html",label:"The Philippine Islands, 1493–1898 · historical chronology"},
  {start:1869,end:1869,region:"Philippines",title:"The Suez Canal opened",detail:"A contemporary historical chronology of the Philippines notes that the canal's opening on 17 November 1869 made communication with Spain quicker and easier. The source describes a general change in communications, not a documented journey by a Lacsamana or Ortega relative.",source:"https://www.gutenberg.org/cache/epub/57431/pg57431-images.html",label:"The Philippine Islands, 1493–1898 · events in Filipinas"},
  {start:1872,end:1872,region:"Philippines",title:"Cavite Mutiny and the execution of GOMBURZA",detail:"The Cavite Mutiny took place in January 1872. Fathers Mariano Gomez, Jose Burgos, and Jacinto Zamora were executed on 17 February 1872. The Bangko Sentral ng Pilipinas' commemoration describes their martyrdom and its historical significance. No family involvement is implied.",source:"https://www.bsp.gov.ph/Pages/AboutTheBank/Facilities/BSP%20Museum%20Collection/Announcements/Gomburza.aspx/1000",label:"Bangko Sentral ng Pilipinas · GOMBURZA commemoration"},
  {start:1873,end:1874,region:"Spain",title:"First Spanish Republic",detail:"Spain experienced a short-lived First Republic in 1873–1874, followed by the Bourbon Restoration. This overlaps Evaristo's later life, but no personal connection is established.",source:"https://www.etd.ceu.edu/2020/gibbons_christian.pdf",label:"Central European University · historical study"},
  {start:1896,end:1898,region:"Philippines",title:"Philippine Revolution",detail:"The revolution against Spanish colonial rule began in 1896 and continued through the events of 1898. The National Commission for Culture and the Arts describes the period as part of the political changes that ended Spanish control of the islands.",source:"https://ncca.gov.ph/wp-content/uploads/2021/09/PHILIPPINE-HISTORY-SOURCE-BOOK-FINAL-SEP022021.pdf",label:"NCCA · Philippine History Sourcebook"},
  {start:1898,end:1898,region:"Philippines",title:"Declaration of Philippine independence and transfer of sovereignty",detail:"Philippine independence was proclaimed on 12 June 1898. The Treaty of Paris was signed later that year between Spain and the United States. These events reshaped the colonial government; they are context, not evidence of an individual ancestor's political position.",source:"https://ncca.gov.ph/about-ncca-3/subcommissions/subcommission-on-cultural-heritagesch/historical-research/the-philippine-american-war-1899-1902/",label:"NCCA · Philippine-American War historical account"},
  {start:1899,end:1902,region:"Philippines",title:"Philippine-American War",detail:"The conflict followed the transfer of sovereignty from Spain to the United States and the establishment of the First Philippine Republic. The NCCA account discusses the war and the establishment of civil government in 1901–1902.",source:"https://ncca.gov.ph/about-ncca-3/subcommissions/subcommission-on-cultural-heritagesch/historical-research/the-philippine-american-war-1899-1902/",label:"NCCA · Philippine-American War"},
];
const HOME_GALLERY_SEEDS = [
  {title:"Carlatan · reported residence of Don Leon",place:"Carlatan, San Fernando City, La Union, Philippines",personIds:["leon"],category:"Family-reported residence",period:"Date range not established",note:"Family memoirs place Don Leon in Carlatan. No exact house, street address, land title, or verified building photograph is attached to the current archive.",source:"Ortega Reunion 2017 souvenir program / family-reported memoir"},
  {title:"Daya · family visit destination",place:"Daya, San Fernando City, La Union, Philippines",personIds:["francisca","leon"],category:"Place visited",period:"Date range not established",note:"Family memoirs describe Leon walking from Carlatan to visit Francisca and his children in Daya. This does not establish that the same property was owned by or continuously occupied by the family.",source:"Ortega Reunion 2017 souvenir program / family-reported memoir"},
  {title:"Bangar · Lacsamana family roots",place:"Bangar, La Union, Philippines",personIds:["martin-lacsamana","narcisa-lopez","ramona-lopez","francisca"],category:"Family roots / birthplace references",period:"Nineteenth century; individual dates vary",note:"Current research associates the family with Bangar and records Francisca's birthplace there. No specific ancestral house has been identified.",source:"Supplied FamilySearch screenshots and Ortega Reunion 2017 program"},
  {title:"Ocaña · Evaristo's birthplace",place:"Ocaña, Toledo, Spain",personIds:["evaristo-guadalupe"],category:"Birthplace",period:"26 October 1830",note:"This is a birthplace record, not proof that a particular house or property has been identified.",source:"FamilySearch screenshot G138-FPT and Archivo Agustiniano register"},
];
const INSTITUTION_SEEDS = [
  {name:"Order of Saint Augustine (OSA)",personIds:["evaristo-guadalupe"],type:"Religious order",period:"Nineteenth century; exact dates not established",note:"Evaristo's recorded name includes OSA, and an Augustinian historical register documents his service in Philippine parishes. The specific parishes and dates should be checked against the register.",evidence:"Order affiliation recorded in name / Augustinian archival register",source:"https://www.agustinosvalladolid.es/estudio/investigacion/archivoagustiniano/archivofondos/archivo2019/archivo_2019.pdf"},
  {name:"Office of the Civil Governor of La Union",personIds:["joaquin"],type:"Government office",period:"1901–1904",note:"Joaquin Ortega is documented as La Union's first Civil Governor. This is a public office, not an inferred membership.",evidence:"Provincial Government historical article",source:"https://launion.gov.ph/pglu-honors-legacy-of-don-joaquin-j-ortega-commemorates-his-122nd-appointment-as-provinces-first-civil-governor/"},
  {name:"Bauang Catholic Church",personIds:["vicenta"],type:"Church / baptism",period:"Baptism date not shown in current archive",note:"The Ortega Reunion 2017 biography states that Vicenta was baptized at Bauang Catholic Church. The original parish register has not been attached.",evidence:"Published family-history biography",source:"https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf"},
  {name:"Knights of Columbus · St. William the Hermit Parish",personIds:["justo-jr"],type:"Civic / Catholic organization",period:"Dates not established",note:"The Ortega Reunion 2017 biography describes Justo Ortega Orros Jr. as a member of the Knights of Columbus of St. William the Hermit Parish.",evidence:"Published family-history biography",source:"https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf"},
  {name:"Secular Order of Discalced Carmelites (OCDS)",personIds:["rosa"],type:"Religious order",period:"Dates not established",note:"The Ortega Reunion 2017 biography states that Rosa Viloria Ubaldo Ortega became a member of the Secular Carmelite Order.",evidence:"Published family-history biography",source:"https://www.ocds-ortegatwins.com/storage/2025/03/27/ortega-reunion-2017-landscape.pdf"},
];
function expansionEscape(value) { return esc(String(value == null ? "" : value)); }
function populateArchivePersonSelect(id, includeBlank) {
  const select = $("#" + id); if (!select) return;
  const old = select.value;
  const people = Object.values(PEOPLE).filter((p) => !p.same && p.status !== "unknown").sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
  select.innerHTML = (includeBlank ? '<option value="">Choose a person…</option>' : '') + people.map((p) => '<option value="' + esc(p.id) + '">' + esc(nameOf(p)) + '</option>').join("");
  if (old && PEOPLE[old]) select.value = old;
}
function personNames(ids) { return (ids || []).map((id) => PEOPLE[id] ? nameOf(PEOPLE[id]) : id).join(" · "); }
function lifeYears(p) {
  const text = String(p && p.d || "");
  const matches = Array.from(text.matchAll(/(?:18|19|20)\d{2}/g)).map((m) => Number(m[0]));
  if (!matches.length) return null;
  return {start:Math.min(...matches), end:Math.max(...matches), estimated:/c\.|about|circa|estimated|approx/i.test(text), anchorOnly:matches.length === 1, raw:text};
}
function renderWorldExplorer() {
  const personSelect = $("#worldPersonSelect"), list = $("#worldContextList"), summary = $("#worldLifeSummary");
  if (!personSelect || !list || !summary) return;
  const id = personSelect.value || "evaristo-guadalupe", person = PEOPLE[id];
  if (!person) return;
  const range = lifeYears(person);
  const region = $("#worldRegionSelect")?.value || "all";
  if (!range) {
    summary.textContent = nameOf(person) + " has no usable birth–death year range in the current profile. No personal lifetime is assumed; add documented dates to enable a precise overlap filter.";
    list.innerHTML = '<p class="archive-empty">No context events can be matched to this person&#39;s lifetime until at least one year is documented.</p>';
    return;
  }
  summary.textContent = nameOf(person) + (range.anchorOnly ? " · known date anchor: " : " · profile date range: ") + range.raw + (range.estimated ? " · estimated/approximate dates" : "") + (range.anchorOnly ? ". Events shown are events in that known year only; the full lifespan is not established." : ". Events shown overlap this recorded date range; they are historical context, not evidence of personal participation.");
  const rows = WORLD_CONTEXT_EVENTS.filter((event) => (region === "all" || event.region.toLowerCase() === region) && event.start <= range.end && event.end >= range.start).sort((a,b) => a.start - b.start);
  list.innerHTML = rows.length ? rows.map((e) => '<article class="context-event"><div class="context-event-date">' + e.start + (e.end !== e.start ? "–" + e.end : "") + '</div><div><h4>' + expansionEscape(e.title) + '<span class="context-region">' + expansionEscape(e.region) + '</span></h4><p>' + expansionEscape(e.detail) + '</p><a href="' + expansionEscape(e.source) + '" target="_blank" rel="noopener">' + expansionEscape(e.label) + ' ↗</a></div></article>').join("") : '<p class="archive-empty">No sourced context events in the selected region overlap the recorded date range.</p>';
}
function renderAncestralHomeGallery() {
  const target = $("#ancestralHomeGallery"), custom = $("#customHomeEntries");
  if (!target) return;
  target.innerHTML = HOME_GALLERY_SEEDS.map((item) => '<article class="heritage-gallery-entry"><div><span class="archive-mini-label">' + expansionEscape(item.category) + '</span><h4>' + expansionEscape(item.title) + '</h4><small>' + expansionEscape(item.place) + '</small></div><div><p><strong>People:</strong> ' + expansionEscape(personNames(item.personIds)) + '</p><p>' + expansionEscape(item.note) + '</p><small>Evidence: ' + expansionEscape(item.source) + '</small></div></article>').join("");
  if (custom) custom.innerHTML = archiveStore.homeEntries.length ? archiveStore.homeEntries.map((entry) => '<article class="archive-saved-entry"><span class="archive-mini-label">' + expansionEscape(entry.category) + ' · Family-added</span><h4>' + expansionEscape(entry.title) + '</h4><p class="archive-entry-meta">' + expansionEscape(entry.place) + (entry.personId && PEOPLE[entry.personId] ? ' · ' + expansionEscape(nameOf(PEOPLE[entry.personId])) : '') + '</p><p>' + expansionEscape(entry.note) + '</p>' + (entry.source ? '<p class="archive-source-text">Source: ' + expansionEscape(entry.source) + '</p>' : '') + '<button type="button" class="archive-remove" data-remove-archive="homeEntries" data-id="' + expansionEscape(entry.id) + '">Remove</button></article>').join("") : '<p class="archive-empty">No family-added ancestral home records yet.</p>';
}
function renderInstitutionDirectory() {
  const target = $("#institutionDirectory"), custom = $("#customInstitutionEntries");
  if (!target) return;
  target.innerHTML = INSTITUTION_SEEDS.map((item) => '<article class="institution-entry"><div><span class="archive-mini-label">' + expansionEscape(item.type) + '</span><h4>' + expansionEscape(item.name) + '</h4><small>' + expansionEscape(item.period) + '</small></div><div><p><strong>Associated person(s):</strong> ' + expansionEscape(personNames(item.personIds)) + '</p><p>' + expansionEscape(item.note) + '</p><small>Evidence: ' + expansionEscape(item.evidence) + '</small><br><a href="' + expansionEscape(item.source) + '" target="_blank" rel="noopener">Open source ↗</a></div></article>').join("");
  if (custom) custom.innerHTML = archiveStore.institutions.length ? archiveStore.institutions.map((item) => '<article class="archive-saved-entry"><span class="archive-mini-label">' + expansionEscape(item.type) + ' · Family-added</span><h4>' + expansionEscape(item.name) + '</h4><p class="archive-entry-meta">' + expansionEscape(item.person) + (item.period ? ' · ' + expansionEscape(item.period) : '') + '</p><p>' + expansionEscape(item.note) + '</p>' + (item.source ? '<p class="archive-source-text">Source: ' + expansionEscape(item.source) + '</p>' : '') + '<button type="button" class="archive-remove" data-remove-archive="institutions" data-id="' + expansionEscape(item.id) + '">Remove</button></article>').join("") : '<p class="archive-empty">No additional institution entries added yet.</p>';
}
function renderMediaGalleries() {
  const portraits = $("#portraitGallery");
  const homes = $("#ancestralHomeGallery");
  if (!portraits && !homes) return;
  if (window.FamilyCloud && window.FamilyCloud.configured && !window.FamilyCloud.isAdmin) {
    if (portraits) portraits.innerHTML = '<p class="archive-empty">Personal portrait uploads are private to the browser that added them. Shared file storage has not been configured yet.</p>';
    if (homes) homes.querySelectorAll(".home-gallery-photo").forEach((entry) => entry.remove());
    return;
  }
  getArchiveFiles().then((files) => {
    const portraitFiles = files.filter((f) => f.category === "portrait" && f.blob && (f.mime || "").startsWith("image/"));
    const groups = new Map();
    portraitFiles.forEach((f) => { const key = f.generation && f.generation !== "unassigned" ? "Generation " + f.generation : "Generation not assigned"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f); });
    if (portraits) portraits.innerHTML = groups.size ? Array.from(groups.entries()).sort((a,b) => a[0].localeCompare(b[0], undefined, {numeric:true})).map(([generation, items]) => '<section class="portrait-generation-group"><h4>' + expansionEscape(generation) + '</h4><div class="portrait-grid">' + items.map((f) => { const url = URL.createObjectURL(f.blob); const person = PEOPLE[f.personId]; return '<figure class="portrait-item"><a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" alt="' + expansionEscape(f.title) + '" loading="lazy"></a><figcaption><strong>' + expansionEscape(person ? nameOf(person) : (f.title || "Unidentified portrait")) + '</strong><span>' + expansionEscape(f.date || "Date not recorded") + (f.caption ? ' · ' + expansionEscape(f.caption) : '') + '</span>' + (person ? archiveButton("Open profile", person.id) : '') + (f.source ? '<span>Source: ' + expansionEscape(f.source) + '</span>' : '') + '<button type="button" class="archive-remove" data-delete-archive-file="' + expansionEscape(f.id) + '">Remove portrait</button></figcaption></figure>'; }).join("") + '</div></section>').join("") : '<p class="archive-empty">No verified portraits have been uploaded yet. Add a photograph and identify the person before treating it as a family portrait.</p>';
    if (homes) {
      homes.querySelectorAll(".home-gallery-photo").forEach((entry) => entry.remove());
      const homeFiles = files.filter((f) => f.category === "home" && f.blob && (f.mime || "").startsWith("image/"));
      homeFiles.forEach((f) => {
        const url = URL.createObjectURL(f.blob);
        const entry = document.createElement("article"); entry.className = "home-gallery-photo";
        const img = document.createElement("img"); img.src = url; img.alt = f.title || "Ancestral place image"; img.loading = "lazy";
        const copy = document.createElement("div");
        copy.innerHTML = '<strong>' + expansionEscape(f.title) + '</strong><p>' + expansionEscape(f.place || "Location not recorded") + '</p><small>' + expansionEscape(f.note || "") + '</small><br><button type="button" class="archive-remove" data-delete-archive-file="' + expansionEscape(f.id) + '">Remove image</button>';
        entry.append(img, copy); homes.appendChild(entry);
      });
    }
  }).catch(() => {
    if (portraits) portraits.innerHTML = '<p class="archive-empty">Portrait storage is unavailable in this browser. You can still add document links in the main archive.</p>';
  });
}
function relationshipsForBook() {
  return UNIONS.map((u) => {
    const parentNames = [u.a,u.b].filter((id) => id && PEOPLE[id]).map((id) => nameOf(PEOPLE[id]));
    const children = (u.kids || []).filter((id) => PEOPLE[id]).map((id) => nameOf(PEOPLE[id]));
    if (!parentNames.length && !children.length) return "";
    return '<li><strong>' + expansionEscape(parentNames.join(" + ") || "Parent not identified") + '</strong> — ' + expansionEscape(children.join(", ") || "No child listed in this union") + '</li>';
  }).join("");
}
function legacyBookSection(title, content) { return '<section><h2>' + expansionEscape(title) + '</h2>' + content + '</section>'; }
function readBlobAsDataURL(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}
async function generateLegacyBook() {
  const status = $("#legacyBookStatus");
  const title = archiveText($("#legacyBookTitle")?.value, "The Lacsamana–Ortega Family Heritage");
  const chosen = (id) => !!$("#" + id)?.checked;
  const sections = [];
  if (chosen("bookIncludePeople")) {
    const rows = Object.values(PEOPLE).filter((p) => !p.same).sort((a,b) => nameOf(a).localeCompare(nameOf(b))).map((p) => '<article class="person"><h3>' + expansionEscape(nameOf(p)) + '</h3><p><strong>' + expansionEscape(roleOf(p) || "Family member") + '</strong>' + (p.d ? ' · ' + expansionEscape(p.d) : '') + '</p>' + (p.n ? '<p>' + expansionEscape(p.n) + '</p>' : '') + '<p>Nationality: ' + expansionEscape(p.nationality || "Not documented") + ' · Religion: ' + expansionEscape(p.religion || "Not documented") + '</p><small>Profile ID: ' + expansionEscape(p.id) + ' · Evidence status: ' + expansionEscape(p.status || p.k || "Not classified") + '</small></article>').join("");
    sections.push(legacyBookSection("People in the family record", '<p>Profiles included: ' + Object.values(PEOPLE).filter((p) => !p.same).length + '. Names and relationships reflect the current local project data; unresolved links remain provisional.</p>' + rows + '<h3>Recorded parent / spouse unions and children</h3><ul class="union-list">' + relationshipsForBook() + '</ul>'));
  }
  if (chosen("bookIncludeTimeline")) {
    const rows = ARCHIVE_EVENTS.slice().sort((a,b) => a.sort.localeCompare(b.sort)).map((e) => '<article class="event"><strong>' + expansionEscape(e.date) + ' · ' + expansionEscape(e.title) + '</strong><p>' + expansionEscape(e.detail) + '</p><small>' + expansionEscape(e.status) + '</small></article>').join("");
    sections.push(legacyBookSection("Historical family timeline", rows));
  }
  if (chosen("bookIncludeWorld")) {
    const rows = WORLD_CONTEXT_EVENTS.slice().sort((a,b) => a.start - b.start).map((e) => '<article class="event"><strong>' + expansionEscape(e.start + (e.end !== e.start ? "–" + e.end : "") + " · " + e.title) + '</strong><p>' + expansionEscape(e.region + " · " + e.detail) + '</p><small>' + expansionEscape(e.label) + ' · ' + expansionEscape(e.source) + '</small></article>').join("");
    sections.push(legacyBookSection("Historical world context during the family eras", '<p>These are period events that overlapped some ancestors’ recorded or estimated lifetimes. They provide historical context only and do not establish that a particular family member participated in an event.</p>' + rows));
  }
  if (chosen("bookIncludeMap")) {
    const rows = GEOGRAPHY.map((place) => {
      const events = (place.events || []).map((e) => '<div class="event"><strong>' + expansionEscape(e.date + " · " + e.title) + '</strong><p>' + expansionEscape(personNames(e.personIds) + " · " + e.detail) + '</p><small>' + expansionEscape(e.status || "Evidence status not specified") + (e.source ? ' · ' + expansionEscape(e.source) : '') + '</small></div>').join("");
      return '<article class="event"><h3>' + expansionEscape(place.place) + '</h3><p><strong>Map reference:</strong> ' + expansionEscape(place.precision || "Location reference") + ' · ' + expansionEscape(place.lat) + ', ' + expansionEscape(place.lng) + '</p>' + (events || '<p>No individual life event is attached to this map reference.</p>') + '</article>';
    }).join("");
    sections.push(legacyBookSection("Geographic map index and recorded family places", '<p>This register lists the geographic points used by the interactive family map. Town-level and approximate pins are not exact addresses. Connecting lines are visual references and should not be interpreted as proven travel routes.</p>' + rows));
  }
  if (chosen("bookIncludeStories")) {
    const notes = [...archiveStore.stories.map((e) => ({title:e.title, person:e.person, date:e.date, body:e.body, source:e.source})), ...archiveStore.lifeStories.map((e) => ({title:e.title, person:e.person, date:e.date, body:e.body, source:e.source}))];
    const custom = notes.map((e) => '<article class="event"><strong>' + expansionEscape(e.title) + '</strong><p>' + expansionEscape([e.person,e.date].filter(Boolean).join(" · ")) + '</p><p>' + expansionEscape(e.body) + '</p><small>' + expansionEscape(e.source || "No source supplied") + '</small></article>').join("");
    const featured = '<article class="event"><strong>Don Leon’s visits to Daya</strong><p>Family memoirs describe Leon living in Carlatan and regularly walking to visit Doña Francisca and his children in Daya. The archive does not attach a dated diary or independent record to this account.</p><small>Family-reported account · verify with family oral history / original material</small></article>';
    const bios = BIOGRAPHY_IDS.map((id) => PEOPLE[id]).filter(Boolean).map((p) => {
      const details = HISTORICAL_PROFILE_DETAILS[p.id];
      const sectionsHTML = details ? details.sections.map((item) => '<div class="event"><h3>' + expansionEscape(item.title) + '</h3><p>' + expansionEscape(item.body) + '</p><small>' + expansionEscape(item.evidence) + (item.source ? ' · ' + expansionEscape(item.source) : '') + '</small></div>').join("") : "";
      return '<article class="event"><strong>' + expansionEscape(nameOf(p)) + '</strong><p>' + expansionEscape(roleOf(p)) + '</p><p>' + expansionEscape(p.n || "No biography note in the current project.") + '</p>' + sectionsHTML + '</article>';
    }).join("");
    sections.push(legacyBookSection("Stories and biographies", featured + bios + custom));
  }
  if (chosen("bookIncludePlaces")) {
    const places = [...HOME_GALLERY_SEEDS.map((p) => '<article class="event"><strong>' + expansionEscape(p.title) + '</strong><p>' + expansionEscape(p.place + " · " + p.category) + '</p><p>' + expansionEscape(p.note) + '</p><small>' + expansionEscape(p.source) + '</small></article>').join(""), ...archiveStore.homeEntries.map((p) => '<article class="event"><strong>' + expansionEscape(p.title) + '</strong><p>' + expansionEscape([p.place,p.period].filter(Boolean).join(" · ")) + '</p><p>' + expansionEscape(p.note) + '</p><small>' + expansionEscape(p.source || "Family-added; no source supplied") + '</small></article>').join(""), ...archiveStore.properties.map((p) => '<article class="event"><strong>' + expansionEscape(p.title) + '</strong><p>' + expansionEscape([p.person,p.date].filter(Boolean).join(" · ")) + '</p><p>' + expansionEscape(p.body) + '</p><small>' + expansionEscape(p.source || "No source supplied") + '</small></article>').join("")];
    sections.push(legacyBookSection("Ancestral places and homes", places.join("")));
  }
  if (chosen("bookIncludeInstitutions")) {
    const all = [...INSTITUTION_SEEDS.map((p) => '<article class="event"><strong>' + expansionEscape(p.name) + '</strong><p>' + expansionEscape(personNames(p.personIds) + " · " + p.type + " · " + p.period) + '</p><p>' + expansionEscape(p.note) + '</p><small>' + expansionEscape(p.source) + '</small></article>').join(""), ...archiveStore.institutions.map((p) => '<article class="event"><strong>' + expansionEscape(p.name) + '</strong><p>' + expansionEscape([p.person,p.type,p.period].filter(Boolean).join(" · ")) + '</p><p>' + expansionEscape(p.note) + '</p><small>' + expansionEscape(p.source || "No source supplied") + '</small></article>').join("")];
    sections.push(legacyBookSection("Institutions and affiliations", all.join("")));
  }
  if (chosen("bookIncludePhotos")) {
    try {
      const files = (await getArchiveFiles()).filter((f) => ["portrait","home"].includes(f.category) && f.blob && (f.mime || "").startsWith("image/"));
      let total = 0; const images = [];
      for (const f of files) {
        total += Number(f.size || 0);
        if (total > 12 * 1024 * 1024) break;
        const data = await readBlobAsDataURL(f.blob);
        images.push('<figure><img src="' + data + '" alt="' + expansionEscape(f.title) + '"><figcaption><strong>' + expansionEscape(PEOPLE[f.personId] ? nameOf(PEOPLE[f.personId]) : f.title) + '</strong><br>' + expansionEscape([f.date,f.place,f.caption,f.note].filter(Boolean).join(" · ")) + '</figcaption></figure>');
      }
      const warning = total > 12 * 1024 * 1024 ? '<p>Some large uploaded images were omitted to keep the book file manageable. They remain in the local archive.</p>' : "";
      sections.push(legacyBookSection("Uploaded portraits and ancestral place images", (images.join("") || '<p>No portrait or ancestral-home images have been uploaded into the local archive yet.</p>') + warning));
    } catch (e) { sections.push(legacyBookSection("Uploaded portraits and ancestral place images", '<p>Image storage was not available while generating this book.</p>')); }
  }
  if (chosen("bookIncludeMigration")) {
    const recorded = (GEOGRAPHY || []).flatMap((place) => (place.events || []).flatMap((event) => (event.personIds || []).map((pid) => '<article class="event"><strong>' + expansionEscape(nameOf(PEOPLE[pid] || {n:pid})) + ' · ' + expansionEscape(event.title || event.type || "Recorded event") + '</strong><p>' + expansionEscape(place.place + " · " + (event.date || "Date not recorded")) + '</p><p>' + expansionEscape(event.detail || "Place association recorded in the family geography index.") + '</p><small>' + expansionEscape(event.status || "Evidence status not stated") + '</small></article>'))).join("");
    const custom = archiveStore.migrationStories.map((item) => '<article class="event"><strong>' + expansionEscape(item.person + " · " + item.title) + '</strong><p>' + expansionEscape([item.from,item.to,item.period].filter(Boolean).join(" → ")) + '</p><p>' + expansionEscape(item.body) + '</p><small>' + expansionEscape(item.evidence + " · " + (item.source || "No source supplied")) + '</small></article>').join("");
    sections.push(legacyBookSection("Family migration and place stories", '<p>Place sequences are presented in the order of recorded events where dates are available. They do not automatically prove a direct migration route.</p>' + (recorded || '<p>No person-linked place events.</p>') + custom));
  }
  if (chosen("bookIncludeMuseum")) {
    const exhibits = [
      ["Don Leon Lacsamana", "Family-reported Carlatan residence and visits to Daya; birth details remain unresolved."],
      ["Doña Francisca Lacsamana-Ortega", "Sister of Don Leon and wife of Don Joaquin Ortega; fourteen children are reported in the family research."],
      ["Don Joaquin Ortega", "Public-service biography and family history, retaining conflicts and source limitations."],
      ["Lacsamana surname history", "Linguistic context is distinguished from proof of this family's biological ancestry."]
    ];
    sections.push(legacyBookSection("Digital family museum exhibits", exhibits.map((item) => '<article class="event"><strong>' + expansionEscape(item[0]) + '</strong><p>' + expansionEscape(item[1]) + '</p></article>').join("")));
  }
  if (chosen("bookIncludeContributions")) {
    let contributions = [];
    try { contributions = window.FamilyCloud?.configured ? await window.FamilyCloud.loadPublishedContributions() : []; }
    catch (error) { contributions = []; }
    const rows = contributions.map((item) => '<article class="event"><strong>' + expansionEscape(item.title) + '</strong><p>' + expansionEscape(contributionTypeLabel(item.submission_type) + " · " + [item.person_name,item.event_period,item.location].filter(Boolean).join(" · ")) + '</p><p>' + expansionEscape(item.details) + '</p><small>' + expansionEscape(item.source_note || "Approved family contribution") + (item.source_url ? ' · ' + expansionEscape(item.source_url) : '') + '</small></article>').join("");
    sections.push(legacyBookSection("Approved public family contributions", rows || '<p>No public family contributions have been approved for publication yet.</p>'));
  }
  if (chosen("bookIncludeSources")) {
    const known = KNOWN_ARCHIVE_SOURCES.map((s) => '<li><strong>' + expansionEscape(s.title) + '</strong> — ' + expansionEscape(s.note) + ' <a href="' + expansionEscape(s.url) + '">' + expansionEscape(s.url) + '</a></li>').join("");
    const perPerson = Object.values(PEOPLE).filter((p) => p.nationalitySource || p.religionSource).map((p) => '<li>' + expansionEscape(nameOf(p)) + ': ' + [p.nationalitySource,p.religionSource].filter(Boolean).map(expansionEscape).join(" · ") + '</li>').join("");
    sections.push(legacyBookSection("Sources and research limitations", '<ul>' + known + perPerson + '</ul><p>Family-supplied information, published family histories, indexes, original records, and uncertain research leads are not interchangeable. Each claim should retain its evidence status.</p>'));
  }
  const bookHTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + expansionEscape(title) + '</title><style>body{font:14px/1.65 Georgia,serif;color:#1c1c1c;max-width:900px;margin:40px auto;padding:0 24px}header{border-bottom:2px solid #222;padding-bottom:24px;margin-bottom:30px}h1{font:700 34px Georgia,serif}h2{font:700 24px Georgia,serif;border-bottom:1px solid #aaa;padding-bottom:7px;margin-top:40px}h3{font-size:16px;margin-bottom:4px}.person,.event{padding:10px 0;border-bottom:1px solid #ddd;break-inside:avoid}.person p,.event p{margin:4px 0}.person small,.event small{color:#555}figure{display:inline-block;width:30%;vertical-align:top;margin:1%;break-inside:avoid}figure img{width:100%;height:260px;object-fit:contain;background:#eee}figcaption{font-size:11px}a{color:#164f87;overflow-wrap:anywhere}.union-list li{margin:7px 0}.print-hint{color:#555;font-size:12px}@media print{body{margin:0 auto;padding:0 12mm}a{color:#111}section{break-before:page}header{break-before:auto}}</style></head><body><header><p>FAMILY HISTORY ARCHIVE</p><h1>' + expansionEscape(title) + '</h1><p>Compiled from the family data and archive entries stored in this browser on ' + expansionEscape(new Date().toLocaleDateString()) + '.</p><p class="print-hint">To create a PDF: open this file in a browser and choose Print → Save as PDF.</p><p>This is a working family-history compilation. Dates, relationships, and biographical claims retain the evidence limitations recorded in the source project.</p></header>' + sections.join("") + '<footer><hr><p>Prepared for preservation of Lacsamana–Ortega family history. Keep original source documents and image permissions with this book.</p></footer></body></html>';
  const blob = new Blob([bookHTML], {type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "Lacsamana-Ortega-Family-Legacy-Book.html"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (status) status.textContent = "Book generated. Open the downloaded HTML file and use Print → Save as PDF.";
}
function migrationYear(value) {
  const match = String(value || "").match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}
function renderMigrationStories() {
  const target = $("#migrationStoryList");
  if (!target) return;
  const grouped = new Map();
  (GEOGRAPHY || []).forEach((place) => (place.events || []).forEach((event) => (event.personIds || []).forEach((personId) => {
    if (!PEOPLE[personId]) return;
    if (!grouped.has(personId)) grouped.set(personId, []);
    grouped.get(personId).push({ place: place.place, placeId: place.id, event });
  })));
  const builtIn = [...grouped.entries()].map(([personId, events]) => ({
    personId,
    name: nameOf(PEOPLE[personId]),
    events: events.sort((a,b) => (migrationYear(a.event.date) ?? 9999) - (migrationYear(b.event.date) ?? 9999))
  })).sort((a,b) => a.name.localeCompare(b.name));
  const cards = builtIn.map((item) => '<article class="migration-story-card"><div class="migration-story-head"><div><span class="archive-mini-label">RECORDED PLACES · ' + item.events.length + ' event(s)</span><h4>' + esc(item.name) + '</h4></div>' + archiveButton("Open profile", item.personId) + '</div><ol>' + item.events.map((itemEvent) => '<li><div><strong>' + esc(itemEvent.event.title || itemEvent.event.type || "Recorded event") + '</strong><span class="migration-event-place">' + esc(itemEvent.place) + ' · ' + esc(itemEvent.event.date || "Date not recorded") + '</span><p>' + esc(itemEvent.event.detail || "The current map associates this person with this place and event.") + '</p><small>' + esc(itemEvent.event.status || "Evidence status not stated") + (itemEvent.event.source ? ' · <a href="' + esc(itemEvent.event.source) + '" target="_blank" rel="noopener">Source ↗</a>' : '') + '</small></div></li>').join("") + '</ol><p class="migration-caution">Place associations are shown in recorded-date order where dates are available. This is not proof of a direct travel route.</p></article>').join("");
  target.innerHTML = cards || '<p class="archive-empty">No person-linked place events are available in the current geography register yet.</p>';
  renderSavedArchiveEntries();
}
function contributionStatusLabel(row) {
  if (row.status === "approved" && row.publish_to_site) return "Approved · public";
  if (row.status === "approved") return "Approved · private";
  if (row.status === "rejected") return "Not approved";
  return "Awaiting review";
}
function contributionTypeLabel(type) {
  return ({missing_relative:"Missing family member",relationship_correction:"Relationship correction",birth_marriage_death_record:"Birth / marriage / death record",photograph:"Family photograph",historical_document:"Historical document",family_story:"Family story / oral history",migration_story:"Migration or place history",achievement:"Achievement or biography",other_research:"Other research lead"})[type] || type || "Family submission";
}
async function renderContributionPortal() {
  const access = $("#contributionAccessMessage");
  const workspace = $("#contributorWorkspace");
  const reviewPanel = $("#contributionReviewPanel");
  const myList = $("#myContributionList");
  const queue = $("#contributionAdminQueue");
  const publicList = $("#publishedFamilyContributions");
  const museumList = $("#museumCommunityExhibits");
  const cloud = window.FamilyCloud;
  const configured = !!(cloud && cloud.configured);
  const admin = configured && cloud.isAdmin;
  const contributor = configured && (cloud.isContributor || admin);
  if (workspace) workspace.hidden = !contributor;
  if (reviewPanel) reviewPanel.hidden = !admin;
  if (access) {
    if (!configured) access.textContent = "The cloud contribution portal is unavailable until Supabase is configured.";
    else if (admin) access.textContent = "Administrator mode: you can submit family information, review every submission, and decide what may be published.";
    else if (cloud.isContributor) access.textContent = "Contributor access is active. Your submissions are private until an administrator reviews them.";
    else access.textContent = "Sign in using an invited family contributor account. Public sign-ups are disabled to keep submissions moderated.";
  }
  if (publicList) publicList.innerHTML = '<p class="archive-empty">Loading approved family contributions…</p>';
  if (museumList) museumList.innerHTML = '<p class="archive-empty">Loading community exhibits…</p>';
  try {
    const published = configured ? await cloud.loadPublishedContributions() : [];
    const publicMarkup = published.length ? published.map((row) => '<article class="contribution-entry"><span class="archive-mini-label">' + esc(contributionTypeLabel(row.submission_type)) + ' · FAMILY CONTRIBUTION</span><h4>' + esc(row.title) + '</h4>' + (row.person_name ? '<p class="archive-entry-meta">' + esc(row.person_name) + '</p>' : '') + '<p>' + esc(row.details) + '</p><p class="contribution-meta">' + esc([row.event_period,row.location].filter(Boolean).join(" · ")) + '</p>' + (row.source_note ? '<p class="archive-source-text">' + esc(row.source_note) + '</p>' : '') + (row.source_url ? '<a href="' + esc(row.source_url) + '" target="_blank" rel="noopener">Open supporting source ↗</a>' : '') + '</article>').join("") : '<p class="archive-empty">No family contributions have been approved for public display yet.</p>';
    if (publicList) publicList.innerHTML = publicMarkup;
    if (museumList) museumList.innerHTML = published.length ? publicMarkup : '<p class="archive-empty">New family discoveries approved for public display will appear here.</p>';
  } catch (error) {
    if (publicList) publicList.innerHTML = '<p class="archive-empty">Approved contributions could not be loaded. Check the Supabase contribution migration and table permissions.</p>';
    if (museumList) museumList.innerHTML = '<p class="archive-empty">Community exhibits are temporarily unavailable.</p>';
  }
  if (!contributor) {
    if (myList) myList.innerHTML = '';
    if (queue) queue.innerHTML = '';
    return;
  }
  try {
    const rows = await cloud.loadMyContributions();
    const mine = admin ? rows.filter((row) => row.contributor_id === cloud.user?.id) : rows;
    if (myList) myList.innerHTML = mine.length ? mine.map((row) => '<article class="contribution-entry"><span class="archive-mini-label">' + esc(contributionTypeLabel(row.submission_type)) + '</span><h4>' + esc(row.title) + '</h4><p>' + esc(row.details) + '</p><span class="contribution-status ' + esc(row.status) + '">' + esc(contributionStatusLabel(row)) + '</span>' + (row.admin_note ? '<p class="contribution-admin-note">Administrator note: ' + esc(row.admin_note) + '</p>' : '') + (row.source_url ? '<p><a href="' + esc(row.source_url) + '" target="_blank" rel="noopener">Supporting source ↗</a></p>' : '') + '</article>').join("") : '<p class="archive-empty">You have not submitted anything yet.</p>';
    if (admin && queue) {
      const pending = rows.filter((row) => row.status === "pending");
      const cards = await Promise.all(pending.map(async (row) => {
        let attachment = "";
        if (row.attachment_path) {
          try { const url = await cloud.contributionAttachmentUrl(row.attachment_path); if (url) attachment = '<p><a href="' + esc(url) + '" target="_blank" rel="noopener">Review private attachment ↗</a></p>'; }
          catch (e) { attachment = '<p class="archive-source-text">Attachment link could not be generated.</p>'; }
        }
        return '<article class="contribution-entry contribution-review-entry"><span class="archive-mini-label">PENDING · ' + esc(contributionTypeLabel(row.submission_type)) + '</span><h4>' + esc(row.title) + '</h4><p class="contribution-meta">Submitted by ' + esc(row.contributor_name) + ' · ' + esc(new Date(row.created_at).toLocaleString()) + '</p>' + (row.person_name ? '<p class="archive-entry-meta">' + esc(row.person_name) + '</p>' : '') + '<p>' + esc(row.details) + '</p><p class="contribution-meta">' + esc([row.event_period,row.location].filter(Boolean).join(" · ")) + '</p>' + (row.source_note ? '<p>' + esc(row.source_note) + '</p>' : '') + (row.source_url ? '<p><a href="' + esc(row.source_url) + '" target="_blank" rel="noopener">Supporting source ↗</a></p>' : '') + attachment + '<label class="contribution-review-note">Administrator note<textarea rows="2" maxlength="1000" data-contribution-note="' + esc(row.id) + '" placeholder="Explain approval, correction, or rejection"></textarea></label><div class="contribution-review-actions"><button type="button" class="archive-action secondary subtle" data-review-contribution="private" data-id="' + esc(row.id) + '">Approve privately</button><button type="button" class="archive-action" data-review-contribution="publish" data-id="' + esc(row.id) + '" ' + (row.publish_requested ? '' : 'disabled title="Contributor did not request public display"') + '>Approve & publish</button><button type="button" class="archive-remove" data-review-contribution="reject" data-id="' + esc(row.id) + '">Reject</button></div></article>';
      }));
      queue.innerHTML = cards.join("") || '<p class="archive-empty">No pending family contributions.</p>';
    }
  } catch (error) {
    if (myList) myList.innerHTML = '<p class="archive-empty">Your submissions could not be loaded. Confirm that the family_contributors migration has been run.</p>';
    if (queue && admin) queue.innerHTML = '<p class="archive-empty">The review queue could not be loaded. Check the Supabase contribution schema and policies.</p>';
  }
}
function initContributionPortal() {
  const form = $("#familyContributionForm");
  if (form) form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#contributionFormStatus");
    const button = $("#submitFamilyContribution");
    const sourceUrl = $("#contributionSourceUrl").value.trim();
    if (sourceUrl) {
      try { const parsed = new URL(sourceUrl); if (!/^https?:$/.test(parsed.protocol)) throw new Error("url"); }
      catch (e) { if (status) status.textContent = "Enter a valid http or https source URL."; return; }
    }
    const file = $("#contributionAttachment").files[0] || null;
    if (file && !["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type)) { if (status) status.textContent = "Use a JPG, PNG, WebP, or PDF attachment."; return; }
    const entry = {
      submission_type: $("#contributionType").value,
      title: $("#contributionTitle").value.trim(),
      person_name: $("#contributionPerson").value.trim(),
      event_period: $("#contributionPeriod").value.trim(),
      location: $("#contributionLocation").value.trim(),
      details: $("#contributionDetails").value.trim(),
      source_url: sourceUrl,
      source_note: $("#contributionSourceNote").value.trim(),
      publish_requested: $("#contributionPublishRequest").checked
    };
    if (!entry.title || !entry.details) { if (status) status.textContent = "Add a title and details before submitting."; return; }
    if (button) button.disabled = true;
    if (status) status.textContent = "Sending your contribution securely…";
    try {
      await window.FamilyCloud.submitContribution(entry, file);
      form.reset();
      if (status) status.textContent = "Submitted. Your contribution is private and awaiting administrator review.";
      await renderContributionPortal();
    } catch (error) {
      if (status) status.textContent = error.message || "Submission failed. Check your contributor access and try again.";
    } finally { if (button) button.disabled = false; }
  });
  $("#refreshContributionsBtn")?.addEventListener("click", renderContributionPortal);
  $("#refreshContributionQueueBtn")?.addEventListener("click", renderContributionPortal);
  document.addEventListener("click", async (event) => {
    const review = event.target.closest("[data-review-contribution]");
    if (!review) return;
    const id = review.dataset.id;
    const action = review.dataset.reviewContribution;
    const note = document.querySelector('[data-contribution-note="' + CSS.escape(id) + '"]')?.value || "";
    const status = action === "reject" ? "rejected" : "approved";
    const publish = action === "publish";
    if (!window.FamilyCloud?.isAdmin) return;
    if (publish && !window.confirm("Approve and publish this contribution publicly? Confirm that the information and any related living-person details or images have permission to be shared.")) return;
    if (action === "reject" && !window.confirm("Reject this family contribution?")) return;
    review.disabled = true;
    try {
      await window.FamilyCloud.reviewContribution(id, status, publish, note);
      await renderContributionPortal();
    } catch (error) {
      window.alert("Could not update contribution: " + (error.message || "Unknown error"));
      review.disabled = false;
    }
  });
  renderContributionPortal();
}

function initExpansionFeatures() {
  renderMigrationStories();
  ["worldPersonSelect","homePersonSelect","portraitPersonSelect","institutionPersonSelect","lifePersonSelect","lifeNotePersonSelect","migrationStoryPerson"].forEach((id) => populateArchivePersonSelect(id, id === "homePersonSelect"));
  const worldSelect = $("#worldPersonSelect"); if (worldSelect) { worldSelect.value = PEOPLE["evaristo-guadalupe"] ? "evaristo-guadalupe" : worldSelect.options[0]?.value; worldSelect.addEventListener("change", renderWorldExplorer); }
  const region = $("#worldRegionSelect"); if (region) region.addEventListener("change", renderWorldExplorer);
  const lifeSelect = $("#lifePersonSelect"); if (lifeSelect) { lifeSelect.value = PEOPLE.leon ? "leon" : lifeSelect.options[0]?.value; lifeSelect.addEventListener("change", renderLifeStory); }
  const bookButton = $("#generateLegacyBookBtn"); if (bookButton) bookButton.addEventListener("click", generateLegacyBook);
  const migrationForm = $("#migrationStoryForm");
  if (migrationForm) migrationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const pid = $("#migrationStoryPerson").value;
    const entry = { id: archiveId("migration"), personId: pid, person: PEOPLE[pid] ? nameOf(PEOPLE[pid]) : "Family branch", title: $("#migrationStoryTitle").value.trim(), from: $("#migrationStoryFrom").value.trim(), to: $("#migrationStoryTo").value.trim(), period: $("#migrationStoryPeriod").value.trim(), evidence: $("#migrationStoryEvidence").value, body: $("#migrationStoryBody").value.trim(), source: $("#migrationStorySource").value.trim(), date: new Date().toISOString() };
    if (!entry.title || !entry.body) return;
    archiveStore.migrationStories.unshift(entry); saveArchiveStore(); renderMigrationStories(); migrationForm.reset(); $("#migrationStoryStatus").textContent = "Place story saved to the shared archive notes.";
  });
  initContributionPortal();
  const homeForm = $("#ancestralHomeForm");
  if (homeForm) homeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = $("#homePhotoFile").files[0];
    const entry = {id:archiveId("home"),title:$("#homeTitle").value.trim(),place:$("#homePlace").value.trim(),personId:$("#homePersonSelect").value,category:$("#homeCategory").value,period:$("#homePeriod").value.trim(),note:$("#homeNote").value.trim(),source:$("#homeSource").value.trim(),date:new Date().toISOString()};
    if (file) {
      if (!file.type.startsWith("image/") || file.size > 20*1024*1024) { $("#homeFormStatus").textContent = "Choose an image no larger than 20 MB."; return; }
      try { await saveArchiveFile({id:archiveId("homeimg"),category:"home",title:entry.title,place:entry.place,personId:entry.personId,note:entry.note,source:entry.source,blob:file,mime:file.type,size:file.size,added:new Date().toISOString()}); }
      catch (e) { $("#homeFormStatus").textContent = "The image could not be saved. The place record itself will still be saved."; }
    }
    archiveStore.homeEntries.unshift(entry); saveArchiveStore(); renderAncestralHomeGallery(); await renderMediaGalleries(); homeForm.reset(); $("#homeFormStatus").textContent = "Ancestral place saved in this browser.";
  });
  const portraitForm = $("#portraitForm");
  if (portraitForm) portraitForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const file = $("#portraitFile").files[0], pid = $("#portraitPersonSelect").value;
    if (!file || !pid || !PEOPLE[pid]) { $("#portraitFormStatus").textContent = "Choose a person and an image."; return; }
    if (!file.type.startsWith("image/") || file.size > 20*1024*1024) { $("#portraitFormStatus").textContent = "Choose an image no larger than 20 MB."; return; }
    try {
      await saveArchiveFile({id:archiveId("portrait"),category:"portrait",title:nameOf(PEOPLE[pid]),personId:pid,generation:$("#portraitGeneration").value,date:$("#portraitDate").value.trim(),caption:$("#portraitCaption").value.trim(),source:$("#portraitSource").value.trim(),blob:file,mime:file.type,size:file.size,added:new Date().toISOString()});
      portraitForm.reset(); $("#portraitFormStatus").textContent = "Portrait saved. It will appear under its assigned generation."; await renderMediaGalleries();
    } catch (e) { $("#portraitFormStatus").textContent = "The browser could not store this image. Try a smaller file."; }
  });
  const institutionForm = $("#institutionForm");
  if (institutionForm) institutionForm.addEventListener("submit", (event) => {
    event.preventDefault(); const pid = $("#institutionPersonSelect").value; if (!pid || !PEOPLE[pid]) { $("#institutionStatus").textContent = "Choose a person."; return; }
    archiveStore.institutions.unshift({id:archiveId("institution"),name:$("#institutionName").value.trim(),person: nameOf(PEOPLE[pid]),personId:pid,type:$("#institutionType").value,period:$("#institutionPeriod").value.trim(),note:$("#institutionNote").value.trim(),source:$("#institutionSource").value.trim(),added:new Date().toISOString()});
    saveArchiveStore(); renderInstitutionDirectory(); institutionForm.reset(); $("#institutionStatus").textContent = "Affiliation saved locally with its evidence note.";
  });
  const lifeForm = $("#lifeStoryForm");
  if (lifeForm) lifeForm.addEventListener("submit", (event) => {
    event.preventDefault(); const pid = $("#lifeNotePersonSelect").value; if (!pid || !PEOPLE[pid]) { $("#lifeNoteStatus").textContent = "Choose a person."; return; }
    archiveStore.lifeStories.unshift({id:archiveId("life"),personId:pid,person:nameOf(PEOPLE[pid]),title:$("#lifeNoteTitle").value.trim(),date:$("#lifeNoteDate").value.trim(),type:$("#lifeNoteEvidence").value,body:$("#lifeNoteBody").value.trim(),source:$("#lifeNoteSource").value.trim(),added:new Date().toISOString()});
    saveArchiveStore(); renderLifeStory(); renderCustomLifeNotes(); lifeForm.reset(); $("#lifeNotePersonSelect").value = pid; $("#lifeNoteStatus").textContent = "Biographical episode saved locally.";
  });
  renderWorldExplorer(); renderAncestralHomeGallery(); renderInstitutionDirectory(); renderLifeStory(); renderCustomLifeNotes(); renderMediaGalleries(); renderMigrationStories();
  document.addEventListener("click", async (event) => {
    const removeEntry = event.target.closest("[data-remove-archive]");
    if (removeEntry && ["homeEntries","institutions","lifeStories","migrationStories"].includes(removeEntry.dataset.removeArchive)) {
      const bucket = removeEntry.dataset.removeArchive, id = removeEntry.dataset.id;
      archiveStore[bucket] = archiveStore[bucket].filter((item) => item.id !== id); saveArchiveStore();
      if (bucket === "homeEntries") renderAncestralHomeGallery();
      if (bucket === "institutions") renderInstitutionDirectory();
      if (bucket === "lifeStories") renderCustomLifeNotes();
      if (bucket === "migrationStories") renderMigrationStories();
    }
  });
}
function renderCustomLifeNotes() {
  const target = $("#customLifeNotes"); if (!target) return;
  target.innerHTML = archiveStore.lifeStories.length ? archiveStore.lifeStories.map((item) => '<article class="archive-saved-entry"><span class="archive-mini-label">' + expansionEscape(item.type) + ' · ' + expansionEscape(item.date || "Date not recorded") + '</span><h4>' + expansionEscape(item.title) + '</h4><p class="archive-entry-meta">' + expansionEscape(item.person) + '</p><p>' + expansionEscape(item.body) + '</p>' + (item.source ? '<p class="archive-source-text">Source: ' + expansionEscape(item.source) + '</p>' : '') + '<button type="button" class="archive-remove" data-remove-archive="lifeStories" data-id="' + expansionEscape(item.id) + '">Remove</button></article>').join("") : '<p class="archive-empty">No additional biographical episodes added yet.</p>';
}
function renderLifeStory() {
  const target = $("#lifeStoryView"), select = $("#lifePersonSelect"); if (!target || !select) return;
  const id = select.value || "leon", p = PEOPLE[id]; if (!p) return;
  const parents = (kinshipIndex.parents.get(id) || []).map((r) => PEOPLE[r.id]).filter(Boolean);
  const kin = kinshipSummary(id);
  const spouseList = spousesOf(id).map((r) => PEOPLE[r.id]).filter(Boolean);
  const children = kidsOf(id).map((r) => PEOPLE[r.id]).filter(Boolean);
  const events = ARCHIVE_EVENTS.filter((event) => event.people.includes(id)).slice().sort((a,b) => a.sort.localeCompare(b.sort));
  const places = GEOGRAPHY.flatMap((place) => (place.events || []).filter((event) => (event.personIds || []).includes(id)).map((event) => ({place:place.place,event})));
  const notes = archiveStore.lifeStories.filter((item) => item.personId === id);
  target.innerHTML = '<header class="life-story-header"><span class="archive-mini-label">' + expansionEscape(p.status || p.k || "Family profile") + '</span><h4>' + expansionEscape(nameOf(p)) + '</h4><p>' + expansionEscape(roleOf(p)) + (p.d ? ' · ' + expansionEscape(p.d) : '') + '</p><p>' + expansionEscape(p.n || "No biographical narrative has been added to this profile yet.") + '</p></header>' + historicalSectionsMarkup(id, expansionEscape) + '<div class="life-story-columns"><section class="life-story-block"><h5>Family connections</h5><p><strong>Parents:</strong> ' + expansionEscape(parents.map(nameOf).join(" · ") || "Not established") + '</p><p><strong>Spouse(s):</strong> ' + expansionEscape(spouseList.map(nameOf).join(" · ") || "Not established") + '</p><p><strong>Children:</strong> ' + expansionEscape(children.map(nameOf).join(" · ") || "No children recorded") + '</p><p><strong>Siblings:</strong> ' + expansionEscape(kin.siblings.map((sid) => PEOPLE[sid] ? nameOf(PEOPLE[sid]) : "").filter(Boolean).join(" · ") || "Not established") + '</p></section><section class="life-story-block"><h5>Recorded life events</h5>' + (events.length ? events.map((e) => '<div class="life-event-row"><strong>' + expansionEscape(e.date + " · " + e.title) + '</strong><span>' + expansionEscape(e.status) + '</span></div>').join("") : '<p>No dated family timeline events are currently linked to this person.</p>') + '</section><section class="life-story-block"><h5>Recorded places</h5>' + (places.length ? places.map((item) => '<div class="life-event-row"><strong>' + expansionEscape(item.place) + '</strong><span>' + expansionEscape(item.event.title + " · " + item.event.date + " · " + item.event.status) + '</span></div>').join("") : '<p>No birthplace, residence, marriage, or deathplace entry is connected in the current map.</p>') + '</section><section class="life-story-block"><h5>Additional biographical episodes</h5>' + (notes.length ? notes.map((item) => '<div class="life-event-row"><strong>' + expansionEscape(item.date + " · " + item.title) + '</strong><p>' + expansionEscape(item.body) + '</p><span>' + expansionEscape(item.type + " · " + (item.source || "No source supplied")) + '</span></div>').join("") : '<p>No additional biography episodes have been added for this person.</p>') + '</section></div>';
}

function renderArchiveSections() {
  renderSurnameRegister(); renderTimeline(); setupFamilyMapControls(); renderGeography(); renderUnidentified(); renderBiographies(); renderKnownSources(); renderAncestralPlaces(); renderSavedArchiveEntries();
  initArchiveForms(); initExpansionFeatures(); renderArchiveFiles();
}

/* ---------- V16 premium interaction layer ---------- */
function initPremiumInteractions() {
  if (document.documentElement.dataset.premiumUXReady === "true") return;
  document.documentElement.dataset.premiumUXReady = "true";

  const progressTrack = document.createElement("div");
  progressTrack.className = "reading-progress-track";
  progressTrack.setAttribute("aria-hidden", "true");
  progressTrack.innerHTML = '<span class="reading-progress-bar" id="readingProgressBar"></span>';
  document.body.appendChild(progressTrack);

  const backTop = document.createElement("button");
  backTop.type = "button";
  backTop.className = "back-to-top";
  backTop.id = "backToTop";
  backTop.setAttribute("aria-label", "Back to top");
  backTop.title = "Back to top";
  backTop.textContent = "↑";
  document.body.appendChild(backTop);
  backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  const progressBar = $("#readingProgressBar");
  let scrollFrame = 0;
  const updateScrollChrome = () => {
    scrollFrame = 0;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    if (progressBar) progressBar.style.width = (ratio * 100).toFixed(2) + "%";
    backTop.classList.toggle("is-visible", window.scrollY > 500);
  };
  window.addEventListener("scroll", () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollChrome);
  }, { passive: true });
  updateScrollChrome();

  // Mark the current archive subsection while reading; the sticky index stays in sync.
  const archiveLinks = Array.from(document.querySelectorAll('.archive-index a[href^="#"]'));
  const sectionMap = new Map();
  archiveLinks.forEach((link) => {
    const target = document.getElementById(decodeURIComponent(link.getAttribute("href").slice(1)));
    if (target) sectionMap.set(target, link);
  });
  if ("IntersectionObserver" in window && sectionMap.size) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const activeLink = sectionMap.get(visible[0].target);
      archiveLinks.forEach((link) => {
        const active = link === activeLink;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0, .15, .35, .6] });
    sectionMap.forEach((_link, target) => observer.observe(target));
  }

  // Dialog focus handling for profile and sign-in overlays.
  const loginPanel = $("#cloudLoginPanel");
  const loginButton = $("#cloudLoginBtn");
  if (loginPanel && "MutationObserver" in window) {
    const loginObserver = new MutationObserver(() => {
      if (!loginPanel.hidden) {
        setTimeout(() => $("#cloudEmail")?.focus({ preventScroll: true }), 30);
      } else if (loginButton) {
        loginButton.focus({ preventScroll: true });
      }
    });
    loginObserver.observe(loginPanel, { attributes: true, attributeFilter: ["hidden"] });
  }

  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function keepFocusInside(container, event) {
    if (event.key !== "Tab" || !container || container.hidden) return;
    const items = Array.from(container.querySelectorAll(focusableSelector)).filter((node) => node.offsetWidth || node.offsetHeight || node === document.activeElement);
    if (!items.length) { event.preventDefault(); container.focus?.(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }
  document.addEventListener("keydown", (event) => {
    const loginOpen = loginPanel && !loginPanel.hidden;
    const drawer = $("#profileDrawer");
    const drawerOpen = drawer && !drawer.hidden;
    if (event.key === "Escape") {
      if (loginOpen) { $("#cloudLoginClose")?.click(); event.preventDefault(); return; }
      if (drawerOpen) { closeProfileDrawer(); event.preventDefault(); return; }
      if ($("#cousinExplorer") && !$("#cousinExplorer").hidden) { setCousinMode(false); event.preventDefault(); return; }
      if ($("#qres") && !$("#qres").hidden) { $("#qres").hidden = true; $("#q")?.setAttribute("aria-expanded", "false"); }
      if ($(".family-map-shell.map-expanded")) $("#familyMapExpand")?.click();
    }
    if (loginOpen) { keepFocusInside($(".cloud-login-card", loginPanel), event); return; }
    if (drawerOpen) { keepFocusInside(drawer, event); return; }
    const target = event.target;
    const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (!typing && ((event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) || event.key === "/")) {
      event.preventDefault(); $("#q")?.focus({ preventScroll: true });
    }
  });

  // Keep pressed/selected states and labels understandable to assistive technology.
  document.querySelectorAll("[aria-pressed]").forEach((control) => {
    const sync = () => control.classList.toggle("is-pressed", control.getAttribute("aria-pressed") === "true");
    sync();
    new MutationObserver(sync).observe(control, { attributes: true, attributeFilter: ["aria-pressed"] });
  });
  document.querySelectorAll("a[href^=\"#\"]").forEach((link) => {
    link.addEventListener("click", () => {
      const id = decodeURIComponent(link.getAttribute("href").slice(1));
      const destination = document.getElementById(id);
      if (destination && !destination.hasAttribute("tabindex")) destination.setAttribute("tabindex", "-1");
    });
  });
}

/* ---------- cloud-aware startup ---------- */
async function bootFamilyArchive() {
  loadStore();
  loadArchiveStore();
  if (window.FamilyCloud && window.FamilyCloud.configured && !window.FamilyCloud.isAdmin) {
    // Do not display this browser's old private archive cache to a public visitor.
    archiveStore = emptyArchiveStore();
  }
  if (!REMOTE_BASE_DATA || !REMOTE_BASE_DATA.people || !Object.keys(PEOPLE).length) {
    const stat = $("#stat");
    if (stat) stat.textContent = "Family database is not seeded yet. Follow README-DEPLOY.md to load the genealogy records.";
    const status = $("#cloudStatus");
    if (status) { status.textContent = "Database setup required · family data not seeded"; status.dataset.state = "warning"; }
    return;
  }
  if (window.FamilyCloud && window.FamilyCloud.ready) {
    await window.FamilyCloud.ready;
    try {
      const remoteTree = await window.FamilyCloud.loadTreeEdits();
      if (remoteTree && remoteTree.over && Array.isArray(remoteTree.add)) {
        store = { over: remoteTree.over || {}, add: remoteTree.add || [] };
        localStorage.setItem(KEY, JSON.stringify(store));
      }
    } catch (error) { console.warn("Cloud tree state could not be loaded; using this browser's saved copy.", error); }
    try {
      const remoteArchive = await window.FamilyCloud.loadArchiveState();
      if (remoteArchive) {
        const buckets = ["stories", "achievements", "properties", "links", "institutions", "lifeStories", "homeEntries", "migrationStories"];
        buckets.forEach((key) => { if (Array.isArray(remoteArchive[key])) archiveStore[key] = remoteArchive[key]; });
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archiveStore));
      }
    } catch (error) { console.warn("Cloud archive notes could not be loaded; using this browser's saved copy.", error); }
  }
  resetData();
  applyStore();
  renderAll();
  buildFamilies();
  renderArchiveSections();
  layoutTop();
  drawLines();
  startView();
  showPersonDetails("adrian", true);
  if ("ResizeObserver" in window) new ResizeObserver(scheduleLines).observe(treeMap);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { scheduleLines(); if (!touched) setTimeout(startView, 60); });
  }
  window.addEventListener("resize", () => { if (!touched) startView(); });
  window.FamilyTree = {
    people: PEOPLE, unions: UNIONS, index: FAMILY_INDEX,
    store: () => store, focus: focusPeople, fit: fitTree, nav: (k) => NAV[k](),
    view: () => ({ zoom, panX, panY }), redraw: scheduleLines,
    cousins: (id) => kinshipSummary(id), cousinLabel,
  };
  window.dispatchEvent(new Event("family-archive-ready"));
}

window.addEventListener("family-cloud-permission-change", async () => {
  if (!window.FamilyCloud || !window.FamilyCloud.configured) return;
  try {
    const remoteArchive = await window.FamilyCloud.loadArchiveState();
    if (remoteArchive) {
      const clean = emptyArchiveStore();
      Object.keys(clean).forEach((key) => { if (Array.isArray(remoteArchive[key])) clean[key] = remoteArchive[key]; });
      archiveStore = clean;
    } else if (!window.FamilyCloud.isAdmin) {
      // A signed-out/public session sees no previously cached private admin notes.
      archiveStore = emptyArchiveStore();
    }
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archiveStore));
    renderSavedArchiveEntries(); renderAncestralPlaces(); renderInstitutionDirectory(); renderCustomLifeNotes(); renderAncestralHomeGallery(); renderMediaGalleries(); renderBiographies(); renderMigrationStories();
  } catch (error) { console.warn("Cloud archive notes could not be loaded.", error); }
  await renderContributionPortal();
});
window.addEventListener("family-cloud-sync-request", async () => {
  if (!window.FamilyCloud || !window.FamilyCloud.isAdmin) return;
  const ok = window.confirm("Upload this browser's current tree edits and archive notes to the shared Supabase database? This replaces the cloud copies for these two records.");
  if (!ok) return;
  const status = document.getElementById("cloudStatus");
  try {
    await window.FamilyCloud.syncAll(store, archiveStore);
    if (status) { status.textContent = "Cloud: synced just now"; status.dataset.state = "online"; }
  } catch (error) {
    if (status) { status.textContent = "Cloud sync failed · check setup"; status.dataset.state = "warning"; }
    window.alert("The cloud sync failed: " + (error.message || "Unknown error"));
  }
});

initPremiumInteractions();

bootFamilyArchive().catch((error) => {
  console.error("Family archive startup failed", error);
  const status = document.getElementById("cloudStatus");
  if (status) { status.textContent = "Startup issue · check browser console"; status.dataset.state = "warning"; }
});

})();
    