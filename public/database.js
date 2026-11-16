/*
 * Lacsamana–Ortega Family Archive cloud client.
 * The browser uses only the Supabase publishable key. RLS is the authority.
 * Never place a service_role / secret key in this file.
 */
(() => {
  "use strict";
  const state = { client: null, configured: false, isAdmin: false, isContributor: false, user: null, error: null, baseData: null, treePayload: null, treeLoaded: false };
  let treeTimer = null;
  let archiveTimer = null;
  let pendingTree = null;
  let pendingArchive = null;

  function setStatus(text, mode) {
    const node = document.getElementById("cloudStatus");
    if (!node) return;
    node.textContent = text;
    node.dataset.state = mode || "";
  }
  function updatePermissionUI() {
    document.body.classList.toggle("cloud-configured", state.configured);
    document.body.classList.toggle("cloud-admin", state.isAdmin);
    document.body.classList.toggle("cloud-contributor", state.isContributor && !state.isAdmin);
    document.body.classList.toggle("cloud-readonly", state.configured && !state.isAdmin);
    const login = document.getElementById("cloudLoginBtn");
    const logout = document.getElementById("cloudLogoutBtn");
    const sync = document.getElementById("cloudSyncBtn");
    if (login) login.hidden = !state.configured || state.isAdmin || state.isContributor;
    if (logout) logout.hidden = !state.configured || (!state.isAdmin && !state.isContributor);
    if (sync) sync.hidden = !state.configured || !state.isAdmin;
    if (!state.configured) setStatus("Local mode · database not configured", "warning");
    else if (!state.baseData) setStatus("Database ready · genealogy seed required", "warning");
    else if (state.isAdmin) setStatus("Cloud connected · administrator mode", "online");
    else if (state.isContributor) setStatus("Cloud connected · family contributor", "online");
    else setStatus("Public view · family sign-in available", "online");
  }
  function showLogin() {
    const panel = document.getElementById("cloudLoginPanel");
    if (panel) { panel.hidden = false; document.getElementById("cloudEmail")?.focus(); }
  }
  function hideLogin() {
    const panel = document.getElementById("cloudLoginPanel");
    if (panel) panel.hidden = true;
    const message = document.getElementById("cloudLoginMessage");
    if (message) message.textContent = "";
  }
  function emitPermissionChange() {
    window.dispatchEvent(new CustomEvent("family-cloud-permission-change", { detail: { isAdmin: state.isAdmin, isContributor: state.isContributor } }));
  }
  async function checkAdmin(user) {
    if (!state.client || !user) return false;
    const { data, error } = await state.client.from("family_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) return false;
    return !!data;
  }
  async function checkContributor(user) {
    if (!state.client || !user) return false;
    const { data, error } = await state.client.from("family_contributors").select("user_id,display_name").eq("user_id", user.id).maybeSingle();
    if (error) return false;
    state.contributorProfile = data || null;
    return !!data;
  }
  async function applyUser(user) {
    state.user = user || null;
    state.isAdmin = await checkAdmin(state.user);
    state.isContributor = state.isAdmin ? false : await checkContributor(state.user);
    updatePermissionUI();
    emitPermissionChange();
  }
  async function fetchTreeState() {
    if (!state.client) return null;
    const { data, error } = await state.client.from("family_tree_state").select("payload,updated_at,is_published").eq("id", "main").maybeSingle();
    if (error) throw error;
    state.treePayload = data?.payload || null;
    state.treeLoaded = true;
    state.baseData = state.treePayload?.baseData || null;
    state.treePublished = data?.is_published === true;
    updatePermissionUI();
    return state.treePayload;
  }
  async function loadTreeEdits() {
    const payload = state.treeLoaded ? state.treePayload : await fetchTreeState();
    if (!payload) return null;
    if (payload.treeEdits && typeof payload.treeEdits === "object") return payload.treeEdits;
    // Backwards compatibility for an early edit-only cloud row.
    if (payload.over && Array.isArray(payload.add)) return payload;
    return null;
  }
  async function fetchArchiveState() {
    if (!state.client) return null;
    const { data, error } = await state.client.from("family_archive_state").select("payload,is_published,updated_at").eq("id", "main").maybeSingle();
    if (error) throw error;
    return data?.payload || null;
  }
  async function saveTreeState(payload) {
    if (!state.client || !state.isAdmin) throw new Error("Administrator access is required to save shared tree edits.");
    if (!state.baseData) throw new Error("The base genealogy has not been seeded into Supabase yet. Run npm run seed first.");
    const fullPayload = { baseData: state.baseData, treeEdits: payload };
    const row = { id: "main", payload: fullPayload, is_published: true, updated_at: new Date().toISOString(), updated_by: state.user.id };
    const { error } = await state.client.from("family_tree_state").upsert(row, { onConflict: "id" });
    if (error) throw error;
    state.treePayload = fullPayload; state.treeLoaded = true;
    setStatus("Cloud: shared tree changes saved", "online");
  }
  async function saveArchiveState(payload) {
    if (!state.client || !state.isAdmin) throw new Error("Administrator access is required to save archive notes.");
    const row = { id: "main", payload, updated_at: new Date().toISOString(), updated_by: state.user.id };
    const { error } = await state.client.from("family_archive_state").upsert(row, { onConflict: "id" });
    if (error) throw error;
    setStatus("Cloud: private archive notes saved", "online");
  }
  function queueTreeEdits(payload) {
    if (!state.isAdmin) return;
    pendingTree = JSON.parse(JSON.stringify(payload));
    clearTimeout(treeTimer);
    treeTimer = setTimeout(async () => {
      try { await saveTreeState(pendingTree); }
      catch (error) { console.error("Could not sync tree edits", error); setStatus("Cloud save failed · edits remain in this browser", "warning"); }
    }, 700);
  }
  function queueArchiveState(payload) {
    if (!state.isAdmin) return;
    pendingArchive = JSON.parse(JSON.stringify(payload));
    clearTimeout(archiveTimer);
    archiveTimer = setTimeout(async () => {
      try { await saveArchiveState(pendingArchive); }
      catch (error) { console.error("Could not sync archive notes", error); setStatus("Archive sync failed · local copy retained", "warning"); }
    }, 900);
  }
  async function syncAll(treePayload, archivePayload) {
    if (!state.isAdmin) throw new Error("Sign in with an authorized administrator account first.");
    clearTimeout(treeTimer); clearTimeout(archiveTimer);
    await saveTreeState(treePayload);
    await saveArchiveState(archivePayload);
  }
  async function login(email, password) {
    if (!state.client) throw new Error("Supabase is not configured yet. Add the Vercel environment variables first.");
    const { data, error } = await state.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const admin = await checkAdmin(data.user);
    const contributor = admin ? false : await checkContributor(data.user);
    if (!admin && !contributor) {
      await state.client.auth.signOut();
      state.user = null; state.isAdmin = false; state.isContributor = false; updatePermissionUI();
      throw new Error("This account has not been invited as a family contributor or administrator. Ask the archive administrator to add it.");
    }
    state.user = data.user; state.isAdmin = admin; state.isContributor = contributor;
    updatePermissionUI(); hideLogin(); emitPermissionChange();
    return true;
  }
  async function logout() {
    if (!state.client) return;
    const { error } = await state.client.auth.signOut();
    if (error) throw error;
    state.user = null; state.isAdmin = false; state.isContributor = false; state.contributorProfile = null; updatePermissionUI(); emitPermissionChange();
  }
  async function loadMyContributions() {
    if (!state.client || (!state.isAdmin && !state.isContributor) || !state.user) return [];
    let query = state.client.from("family_contributions").select("id,contributor_id,contributor_name,submission_type,title,person_name,details,event_period,location,source_url,source_note,attachment_path,publish_requested,status,admin_note,created_at,reviewed_at,publish_to_site").order("created_at", { ascending: false });
    if (!state.isAdmin) query = query.eq("contributor_id", state.user.id);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  async function loadPublishedContributions() {
    if (!state.client) return [];
    const { data, error } = await state.client.from("family_public_contributions").select("id,submission_type,title,person_name,details,event_period,location,source_url,source_note,created_at,reviewed_at").order("reviewed_at", { ascending: false }).limit(40);
    if (error) throw error;
    return data || [];
  }
  async function submitContribution(entry, file) {
    if (!state.client || !state.user || (!state.isAdmin && !state.isContributor)) throw new Error("Sign in with an invited family contributor or administrator account first.");
    let attachmentPath = null;
    if (file) {
      if (file.size > 15 * 1024 * 1024) throw new Error("Attachments must be 15 MB or smaller.");
      const safeName = String(file.name || "attachment").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
      const path = state.user.id + "/" + (window.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())) + "-" + safeName;
      const { data: uploaded, error: uploadError } = await state.client.storage.from("family-contribution-files").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      attachmentPath = uploaded.path;
    }
    const contributorName = (state.contributorProfile && state.contributorProfile.display_name) || state.user.user_metadata?.full_name || state.user.email || "Family contributor";
    const row = {
      contributor_id: state.user.id,
      contributor_name: String(contributorName).slice(0, 120),
      submission_type: entry.submission_type,
      title: entry.title,
      person_name: entry.person_name || null,
      details: entry.details,
      event_period: entry.event_period || null,
      location: entry.location || null,
      source_url: entry.source_url || null,
      source_note: entry.source_note || null,
      attachment_path: attachmentPath,
      publish_requested: entry.publish_requested === true,
      status: "pending",
      publish_to_site: false
    };
    const { data, error } = await state.client.from("family_contributions").insert(row).select("id").single();
    if (error) {
      if (attachmentPath) await state.client.storage.from("family-contribution-files").remove([attachmentPath]).catch(() => {});
      throw error;
    }
    return data;
  }
  async function reviewContribution(id, status, publishToSite, adminNote) {
    if (!state.client || !state.isAdmin) throw new Error("Only an archive administrator can review contributions.");
    if (!["approved", "rejected"].includes(status)) throw new Error("Invalid review status.");
    const { error } = await state.client.from("family_contributions").update({
      status,
      publish_to_site: status === "approved" && publishToSite === true,
      admin_note: String(adminNote || "").slice(0, 1000) || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: state.user.id
    }).eq("id", id);
    if (error) throw error;
  }
  async function contributionAttachmentUrl(path) {
    if (!state.client || !path || (!state.isAdmin && !state.isContributor)) return null;
    const { data, error } = await state.client.storage.from("family-contribution-files").createSignedUrl(path, 900);
    if (error) throw error;
    return data?.signedUrl || null;
  }
  const RESEARCH_ALLOWED_TYPES = new Set([
    "application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]);
  function requireAdminForResearch() {
    if (!state.client || !state.isAdmin || !state.user) throw new Error("Only an authenticated family administrator can add, change, or remove official research records and timeline events.");
  }
  function makeStorageName(file) {
    const safeName = String(file.name || "research-document").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
    const token = window.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
    return state.user.id + "/" + token + "-" + safeName;
  }
  async function loadResearchWorkspace() {
    if (!state.client) return { records: [], timelineEvents: [], tasks: [], errors: ["Supabase is not configured."] };
    const requests = [
      state.client.from("family_research_records").select("*").order("created_at", { ascending: false }),
      state.client.from("family_timeline_events").select("*").order("sort_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true })
    ];
    if (state.isAdmin) requests.push(state.client.from("family_research_tasks").select("*").order("created_at", { ascending: false }));
    const results = await Promise.all(requests);
    const recordsResult = results[0];
    const timelineResult = results[1];
    const tasksResult = results[2] || { data: [], error: null };
    const errors = [recordsResult.error, timelineResult.error, tasksResult.error].filter(Boolean).map((e) => e.message || "Research database request failed.");
    return {
      records: recordsResult.data || [],
      timelineEvents: timelineResult.data || [],
      tasks: tasksResult.data || [],
      errors
    };
  }
  async function createResearchRecord(entry, file) {
    requireAdminForResearch();
    let storagePath = null;
    if (file) {
      if (file.size > 25 * 1024 * 1024) throw new Error("Research files must be 25 MB or smaller.");
      if (!RESEARCH_ALLOWED_TYPES.has(file.type)) throw new Error("Use a PDF, JPG, PNG, WebP, TXT, DOC/DOCX, or XLS/XLSX file.");
      const path = makeStorageName(file);
      const { data: uploaded, error: uploadError } = await state.client.storage.from("family-research-files").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      storagePath = uploaded.path;
    }
    const row = {
      title: entry.title,
      record_type: entry.record_type,
      person_ids: entry.person_ids || [],
      repository: entry.repository || null,
      collection_title: entry.collection_title || null,
      reference_code: entry.reference_code || null,
      record_date: entry.record_date || null,
      place: entry.place || null,
      description: entry.description,
      source_url: entry.source_url || null,
      evidence_status: entry.evidence_status || "partially_verified",
      visibility: entry.visibility || "private",
      is_published: entry.is_published === true,
      storage_path: storagePath
    };
    const { data, error } = await state.client.from("family_research_records").insert(row).select("*").single();
    if (error) {
      if (storagePath) await state.client.storage.from("family-research-files").remove([storagePath]).catch(() => {});
      throw error;
    }
    return data;
  }
  async function deleteResearchRecord(id) {
    requireAdminForResearch();
    const { data, error: readError } = await state.client.from("family_research_records").select("id,storage_path").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!data) return;
    const { error } = await state.client.from("family_research_records").delete().eq("id", id);
    if (error) throw error;
    if (data.storage_path) {
      const { error: storageError } = await state.client.storage.from("family-research-files").remove([data.storage_path]);
      if (storageError) console.warn("Research row was deleted, but its stored file could not be removed.", storageError);
    }
  }
  async function researchFileUrl(path) {
    if (!state.client || !path) return null;
    const { data, error } = await state.client.storage.from("family-research-files").createSignedUrl(path, 900);
    if (error) throw error;
    return data?.signedUrl || null;
  }
  async function createTimelineEvent(entry) {
    requireAdminForResearch();
    const row = {
      title: entry.title,
      event_type: entry.event_type || "historical_milestone",
      event_date: entry.event_date || "Date not established",
      sort_date: entry.sort_date || null,
      date_precision: entry.date_precision || "undated",
      person_ids: entry.person_ids || [],
      location: entry.location || null,
      description: entry.description,
      evidence_status: entry.evidence_status || "partially_verified",
      source_record_id: entry.source_record_id || null,
      source_label: entry.source_label || null,
      source_url: entry.source_url || null,
      visibility: entry.visibility || "private",
      is_published: entry.is_published === true
    };
    const { data, error } = await state.client.from("family_timeline_events").insert(row).select("*").single();
    if (error) throw error;
    return data;
  }
  async function deleteTimelineEvent(id) {
    requireAdminForResearch();
    const { error } = await state.client.from("family_timeline_events").delete().eq("id", id);
    if (error) throw error;
  }
  async function createResearchTask(entry) {
    requireAdminForResearch();
    const row = {
      title: entry.title,
      person_id: entry.person_id || null,
      research_question: entry.research_question || null,
      priority: entry.priority || "normal",
      status: entry.status || "open",
      source_hint: entry.source_hint || null
    };
    const { data, error } = await state.client.from("family_research_tasks").insert(row).select("*").single();
    if (error) throw error;
    return data;
  }
  async function updateResearchTask(id, changes) {
    requireAdminForResearch();
    const update = {};
    if (changes.status) update.status = changes.status;
    if (changes.priority) update.priority = changes.priority;
    const { error } = await state.client.from("family_research_tasks").update(update).eq("id", id);
    if (error) throw error;
  }
  async function deleteResearchTask(id) {
    requireAdminForResearch();
    const { error } = await state.client.from("family_research_tasks").delete().eq("id", id);
    if (error) throw error;
  }

  async function initialize() {
    try {
      const response = await fetch("/api/config", { cache: "no-store" });
      const config = await response.json().catch(() => ({}));
      if (!response.ok || !config.configured || !config.supabaseUrl || !config.publishableKey) {
        state.error = config.error || "Supabase environment variables are not configured.";
        updatePermissionUI();
        return false;
      }
      if (!window.supabase || typeof window.supabase.createClient !== "function") throw new Error("Supabase client library did not load. Check the internet connection or CDN script.");
      state.client = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      state.configured = true;
      const { data: sessionData, error: sessionError } = await state.client.auth.getSession();
      if (sessionError) throw sessionError;
      await fetchTreeState();
      await applyUser(sessionData.session?.user || null);
      state.client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => applyUser(session?.user || null), 0);
      });
      const loginButton = document.getElementById("cloudLoginBtn");
      if (loginButton) loginButton.textContent = "Family / admin sign in";
      document.getElementById("cloudLoginBtn")?.addEventListener("click", showLogin);
      document.getElementById("cloudLoginClose")?.addEventListener("click", hideLogin);
      document.getElementById("cloudLoginPanel")?.addEventListener("click", (event) => { if (event.target.id === "cloudLoginPanel") hideLogin(); });
      document.getElementById("cloudLoginForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = document.getElementById("cloudLoginMessage");
        const submit = event.currentTarget.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;
        if (message) message.textContent = "Signing in…";
        try {
          await login(document.getElementById("cloudEmail").value.trim(), document.getElementById("cloudPassword").value);
          document.getElementById("cloudPassword").value = "";
        } catch (error) { if (message) message.textContent = error.message || "Sign-in failed."; }
        finally { if (submit) submit.disabled = false; }
      });
      document.getElementById("cloudLogoutBtn")?.addEventListener("click", async () => {
        try { await logout(); } catch (error) { setStatus("Sign-out failed", "warning"); }
      });
      document.getElementById("cloudSyncBtn")?.addEventListener("click", () => window.dispatchEvent(new Event("family-cloud-sync-request")));
      updatePermissionUI();
      return true;
    } catch (error) {
      state.error = error.message || "Cloud configuration could not be loaded.";
      state.configured = false; state.isAdmin = false;
      updatePermissionUI();
      console.warn("Family cloud database is unavailable; this browser will use local storage.", error);
      return false;
    }
  }
  const api = {
    get configured() { return state.configured; },
    get isAdmin() { return state.isAdmin; },
    get isContributor() { return state.isContributor; },
    get user() { return state.user; },
    get error() { return state.error; },
    get baseData() { return state.baseData; },
    ready: null,
    loadTreeEdits,
    loadArchiveState: fetchArchiveState,
    saveTreeState,
    saveArchiveState,
    queueTreeEdits,
    queueArchiveState,
    syncAll,
    login,
    logout,
    loadMyContributions,
    loadPublishedContributions,
    submitContribution,
    reviewContribution,
    contributionAttachmentUrl,
    loadResearchWorkspace,
    createResearchRecord,
    deleteResearchRecord,
    researchFileUrl,
    createTimelineEvent,
    deleteTimelineEvent,
    createResearchTask,
    updateResearchTask,
    deleteResearchTask,
  };
  window.FamilyCloud = api;
  api.ready = initialize();
})();
