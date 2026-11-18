/*
 * Lacsamana–Ortega Research Workspace.
 * Handles the interactive research register, cloud timeline additions and
 * administrator research queue used by the current index.html.
 * All authorization is enforced again by Supabase RLS; hidden UI is not security.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { records: [], timelineEvents: [], tasks: [], people: {}, booted: false, loading: false };

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) { return ""; }
  }

  function selectedValues(select) {
    if (!select) return [];
    return Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean);
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function peopleList() {
    const source = window.FamilyCloud?.baseData?.people || window.FamilyTree?.people || {};
    return Object.entries(source)
      .filter(([id, person]) => person && !person.same && (person.id === id || !person.id))
      .map(([id, person]) => ({ id, name: person.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getPersonName(id) {
    return state.people[id]?.name || id || "Unassigned";
  }

  function fillPeopleSelect(select, includeAllOption, multiple) {
    if (!select) return;
    const old = multiple ? selectedValues(select) : [select.value];
    select.replaceChildren();
    if (includeAllOption) addOption(select, "", includeAllOption);
    peopleList().forEach((person) => addOption(select, person.id, person.name));
    if (multiple) {
      Array.from(select.options).forEach((option) => { option.selected = old.includes(option.value); });
    } else if (old[0]) {
      select.value = old[0];
    }
  }

  function populatePeopleControls() {
    state.people = Object.fromEntries(peopleList().map((person) => [person.id, person]));
    fillPeopleSelect($("timelinePersonFilter"), "All family members", false);
    fillPeopleSelect($("timelineEventPeople"), null, true);
    fillPeopleSelect($("researchRecordPeople"), null, true);
    fillPeopleSelect($("researchTaskPerson"), "No person assigned", false);
  }

  function updateAdminControls() {
    const isAdmin = !!window.FamilyCloud?.isAdmin;
    ["timelineEventForm", "researchRecordForm", "researchTaskForm"].forEach((id) => {
      const form = $(id);
      if (form) form.hidden = !isAdmin;
    });
    const taskCount = $("researchTaskCount");
    if (taskCount && !isAdmin) taskCount.textContent = "Administrator workspace";
    const access = $("researchAccessMessage");
    if (!access) return;
    if (!window.FamilyCloud?.configured) {
      access.textContent = "Research Center requires the configured Supabase database. Existing built-in family records remain available.";
    } else if (isAdmin) {
      access.textContent = "Administrator access · you can register sources, publish reviewed records, add timeline events, and manage research tasks.";
    } else if (window.FamilyCloud?.isContributor) {
      access.textContent = "Family contributor access · you can view family-visible research records. Official source registration and research tasks are administrator-only.";
    } else {
      access.textContent = "Public archive view · only records deliberately published for public access are shown.";
    }
  }

  function evidenceLabel(value) {
    return ({ verified: "Verified", partially_verified: "Partially verified", unverified: "Unverified", disputed: "Disputed" })[value] || "Evidence status not set";
  }

  function visibilityLabel(value) {
    return ({ public: "Public", family: "Family", private: "Private" })[value] || "Restricted";
  }

  function createExternalLink(url, label) {
    const valid = safeUrl(url);
    if (!valid) return null;
    const a = node("a", "research-external-link", label || "Open source ↗");
    a.href = valid;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function personLinks(ids) {
    const wrap = node("div", "research-person-links");
    (ids || []).forEach((id) => {
      const btn = node("button", "archive-person-link", getPersonName(id));
      btn.type = "button";
      btn.dataset.archivePerson = id;
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderRecords() {
    const target = $("researchRecordList");
    if (!target) return;
    const query = ($("researchRecordSearch")?.value || "").trim().toLowerCase();
    const type = $("researchRecordTypeFilter")?.value || "";
    const evidence = $("researchRecordEvidenceFilter")?.value || "";
    const visible = state.records.filter((record) => {
      if (type && record.record_type !== type) return false;
      if (evidence && record.evidence_status !== evidence) return false;
      if (!query) return true;
      const names = (record.person_ids || []).map(getPersonName).join(" ");
      const haystack = [record.title, record.record_type, record.repository, record.collection_title, record.reference_code, record.record_date, record.place, record.description, names].join(" ").toLowerCase();
      return haystack.includes(query);
    });
    target.replaceChildren();
    const count = $("researchRecordCount");
    if (count) count.textContent = visible.length + (visible.length === 1 ? " record" : " records");
    if (!visible.length) {
      target.appendChild(node("p", "archive-empty", state.records.length ? "No records match the current filters." : "No cloud research records are available to this account yet."));
      return;
    }
    visible.forEach((record) => {
      const card = node("article", "research-record-card");
      const top = node("div", "research-card-top");
      top.appendChild(node("span", "archive-mini-label", String(record.record_type || "record").replaceAll("_", " ")));
      top.appendChild(node("span", "research-visibility " + (record.visibility || "private"), visibilityLabel(record.visibility)));
      card.appendChild(top);
      card.appendChild(node("h4", "research-card-title", record.title));
      card.appendChild(node("p", "research-card-description", record.description));
      const meta = node("dl", "research-record-meta");
      const fields = [
        ["Evidence", evidenceLabel(record.evidence_status)],
        ["Repository", record.repository],
        ["Collection", record.collection_title],
        ["Reference", record.reference_code],
        ["Date / period", record.record_date],
        ["Place", record.place]
      ].filter((entry) => entry[1]);
      fields.forEach(([label, value]) => {
        const row = node("div", "research-meta-row");
        row.appendChild(node("dt", "", label));
        row.appendChild(node("dd", "", value));
        meta.appendChild(row);
      });
      card.appendChild(meta);
      if (record.person_ids?.length) card.appendChild(personLinks(record.person_ids));
      const actions = node("div", "research-card-actions");
      const external = createExternalLink(record.source_url, "External source ↗");
      if (external) actions.appendChild(external);
      if (record.storage_path && window.FamilyCloud?.researchFileUrl) {
        const file = node("a", "research-external-link", "Open stored file ↗");
        file.href = "#";
        file.addEventListener("click", async (event) => {
          event.preventDefault();
          file.setAttribute("aria-busy", "true");
          try {
            const url = await window.FamilyCloud.researchFileUrl(record.storage_path);
            if (url) window.open(url, "_blank", "noopener,noreferrer");
          } catch (error) {
            window.alert("The file could not be opened: " + (error.message || "Access denied."));
          } finally { file.removeAttribute("aria-busy"); }
        });
        actions.appendChild(file);
      }
      if (window.FamilyCloud?.isAdmin) {
        const remove = node("button", "archive-action secondary research-delete", "Delete record");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Delete this research record and its uploaded file, if any? This cannot be undone.")) return;
          remove.disabled = true;
          try {
            await window.FamilyCloud.deleteResearchRecord(record.id);
            await loadWorkspace();
          } catch (error) {
            window.alert("Could not delete the record: " + (error.message || "Unknown error."));
            remove.disabled = false;
          }
        });
        actions.appendChild(remove);
      }
      if (actions.childElementCount) card.appendChild(actions);
      target.appendChild(card);
    });
  }

  function yearFrom(value) {
    const match = String(value || "").match(/(?:^|[^0-9])((?:17|18|19|20)\d{2})(?:[^0-9]|$)/);
    return match ? match[1] : "";
  }

  function classifyStaticType(title, status) {
    const t = String(title || "").toLowerCase();
    const s = String(status || "").toLowerCase();
    if (/research gap|awaiting documentation/.test(t + " " + s)) return "research_gap";
    if (/\b(born|birth)\b/.test(t)) return "birth";
    if (/\b(baptized|baptism|ordained|ordination)\b/.test(t)) return "baptism";
    if (/\b(marry|marries|married|marriage|wedding)\b/.test(t)) return "marriage";
    if (/\b(dies|died|death|passes away|passed away|buried)\b/.test(t)) return "death";
    if (/\b(governor|councilor|councillor|ambassador|appointed|appointment|serves|served|public service|elevated)\b/.test(t)) return "public_service";
    if (/\b(residence|migration|migrates|visits|visit|moves to|relocated)\b/.test(t)) return "residence";
    if (/\b(education|degree|school|university|graduates)\b/.test(t)) return "education";
    return "historical_milestone";
  }

  function classifyStaticEvidence(status) {
    const s = String(status || "").toLowerCase();
    if (/discrepancy|conflict|identity.*review|unresolved/.test(s)) return "disputed";
    if (/research gap|not established|not yet established|no exact|unverified|needs review/.test(s)) return "unverified";
    return "partially_verified";
  }

  function tagStaticTimeline() {
    const target = $("timelineList");
    if (!target) return;
    target.querySelectorAll(".timeline-event:not(.cloud-timeline-event)").forEach((item) => {
      const title = item.querySelector("h4")?.textContent || "";
      const date = item.querySelector(".timeline-date")?.textContent || "";
      const status = item.querySelector(".archive-mini-label")?.textContent || "";
      const people = Array.from(item.querySelectorAll("[data-archive-person]")).map((button) => button.dataset.archivePerson);
      item.dataset.timelineType = classifyStaticType(title, status);
      item.dataset.timelineEvidence = classifyStaticEvidence(status);
      item.dataset.timelineYear = yearFrom(date);
      item.dataset.timelinePeople = people.join("|");
    });
  }

  function fillTimelineYearFilter() {
    const select = $("timelineYearFilter");
    if (!select) return;
    const years = new Set();
    document.querySelectorAll("#timelineList .timeline-event").forEach((item) => {
      const year = item.dataset.timelineYear || yearFrom(item.querySelector(".timeline-date")?.textContent);
      if (year) years.add(year);
    });
    state.timelineEvents.forEach((event) => {
      const year = yearFrom(event.sort_date || event.event_date);
      if (year) years.add(year);
    });
    const current = select.value;
    select.replaceChildren();
    addOption(select, "", "All years");
    [...years].sort((a, b) => Number(b) - Number(a)).forEach((year) => addOption(select, year, year));
    if (years.has(current)) select.value = current;
  }

  function renderRemoteTimeline() {
    const target = $("timelineList");
    if (!target) return;
    target.querySelectorAll(".cloud-timeline-event").forEach((item) => item.remove());
    state.timelineEvents.forEach((event) => {
      const item = node("article", "timeline-event cloud-timeline-event");
      const date = node("div", "timeline-date", event.event_date || "Date not established");
      const mark = node("div", "timeline-mark");
      mark.appendChild(node("i"));
      const body = node("div", "timeline-body");
      body.appendChild(node("h4", "", event.title));
      body.appendChild(node("p", "", event.description));
      body.appendChild(node("span", "archive-mini-label", evidenceLabel(event.evidence_status)));
      const links = node("div", "archive-inline-links");
      if (event.person_ids?.length) event.person_ids.forEach((id) => {
        const btn = node("button", "archive-person-link", getPersonName(id));
        btn.type = "button";
        btn.dataset.archivePerson = id;
        links.appendChild(btn);
      });
      const sourceUrl = createExternalLink(event.source_url, event.source_label || "Source ↗");
      if (sourceUrl) links.appendChild(sourceUrl);
      if (links.childElementCount) body.appendChild(links);
      if (window.FamilyCloud?.isAdmin) {
        const remove = node("button", "archive-action secondary research-delete", "Remove event");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          if (!window.confirm("Remove this timeline event?")) return;
          remove.disabled = true;
          try { await window.FamilyCloud.deleteTimelineEvent(event.id); await loadWorkspace(); }
          catch (error) { window.alert("Could not remove event: " + (error.message || "Unknown error.")); remove.disabled = false; }
        });
        body.appendChild(remove);
      }
      item.append(date, mark, body);
      item.dataset.timelineType = event.event_type || "historical_milestone";
      item.dataset.timelineEvidence = event.evidence_status || "partially_verified";
      item.dataset.timelineYear = yearFrom(event.sort_date || event.event_date);
      item.dataset.timelinePeople = (event.person_ids || []).join("|");
      target.appendChild(item);
    });
    tagStaticTimeline();
    fillTimelineYearFilter();
    applyTimelineFilters();
  }

  function applyTimelineFilters() {
    const target = $("timelineList");
    if (!target) return;
    const query = ($("timelineSearch")?.value || "").trim().toLowerCase();
    const person = $("timelinePersonFilter")?.value || "";
    const year = $("timelineYearFilter")?.value || "";
    const type = $("timelineTypeFilter")?.value || "";
    const evidence = $("timelineEvidenceFilter")?.value || "";
    const includeUndated = $("timelineShowUndated")?.checked !== false;
    let count = 0;
    target.querySelectorAll(".timeline-event").forEach((item) => {
      const itemYear = item.dataset.timelineYear || "";
      const people = (item.dataset.timelinePeople || "").split("|").filter(Boolean);
      const haystack = item.textContent.toLowerCase();
      const matches = (!query || haystack.includes(query))
        && (!person || people.includes(person))
        && (!year || itemYear === year)
        && (!type || item.dataset.timelineType === type)
        && (!evidence || item.dataset.timelineEvidence === evidence)
        && (includeUndated || !!itemYear);
      item.hidden = !matches;
      if (matches) count++;
    });
    const summary = $("timelineResultsSummary");
    if (summary) summary.textContent = count + (count === 1 ? " event" : " events");
  }

  function renderTasks() {
    const target = $("researchTaskList");
    if (!target) return;
    target.replaceChildren();
    if (!window.FamilyCloud?.isAdmin) return;
    const count = $("researchTaskCount");
    if (count) count.textContent = state.tasks.length + (state.tasks.length === 1 ? " open task" : " research tasks");
    if (!state.tasks.length) {
      target.appendChild(node("p", "archive-empty", "No research tasks have been created."));
      return;
    }
    state.tasks.forEach((task) => {
      const card = node("article", "research-task-card");
      const top = node("div", "research-card-top");
      top.appendChild(node("span", "archive-mini-label", String(task.priority || "normal").toUpperCase() + " PRIORITY"));
      top.appendChild(node("span", "research-task-status", String(task.status || "open").replaceAll("_", " ")));
      card.appendChild(top);
      card.appendChild(node("h4", "research-card-title", task.title));
      if (task.research_question) card.appendChild(node("p", "research-card-description", task.research_question));
      if (task.person_id) card.appendChild(personLinks([task.person_id]));
      if (task.source_hint) card.appendChild(node("p", "research-task-source", "Next source: " + task.source_hint));
      const actions = node("div", "research-card-actions");
      const status = document.createElement("select");
      status.setAttribute("aria-label", "Research task status");
      [["open", "Open"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["complete", "Complete"]].forEach(([value, label]) => addOption(status, value, label));
      status.value = task.status || "open";
      status.addEventListener("change", async () => {
        status.disabled = true;
        try { await window.FamilyCloud.updateResearchTask(task.id, { status: status.value }); await loadWorkspace(); }
        catch (error) { window.alert("Could not update task: " + (error.message || "Unknown error.")); status.disabled = false; }
      });
      actions.appendChild(status);
      const remove = node("button", "archive-action secondary research-delete", "Delete task");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm("Delete this research task?")) return;
        remove.disabled = true;
        try { await window.FamilyCloud.deleteResearchTask(task.id); await loadWorkspace(); }
        catch (error) { window.alert("Could not delete task: " + (error.message || "Unknown error.")); remove.disabled = false; }
      });
      actions.appendChild(remove);
      card.appendChild(actions);
      target.appendChild(card);
    });
  }

  function populateSourceRecords() {
    const select = $("timelineEventSourceRecord");
    if (!select) return;
    const current = select.value;
    select.replaceChildren();
    addOption(select, "", "No linked research record");
    state.records.forEach((record) => addOption(select, record.id, record.title));
    if (state.records.some((record) => record.id === current)) select.value = current;
  }

  async function loadWorkspace() {
    if (state.loading) return;
    state.loading = true;
    updateAdminControls();
    if (!window.FamilyCloud?.configured) {
      state.records = []; state.timelineEvents = []; state.tasks = [];
      renderRecords(); renderRemoteTimeline(); renderTasks();
      state.loading = false;
      return;
    }
    try {
      const result = await window.FamilyCloud.loadResearchWorkspace();
      state.records = result.records || [];
      state.timelineEvents = result.timelineEvents || [];
      state.tasks = result.tasks || [];
      if (result.errors?.length) {
        const access = $("researchAccessMessage");
        if (access) access.textContent = "Research workspace could not load completely: " + result.errors.join(" · ") + ". Run Supabase migration 003 and confirm Data API grants and RLS policies.";
      }
    } catch (error) {
      const access = $("researchAccessMessage");
      if (access) access.textContent = "Research workspace unavailable: " + (error.message || "Database request failed.");
      state.records = []; state.timelineEvents = []; state.tasks = [];
    } finally {
      state.loading = false;
    }
    renderRecords();
    populateSourceRecords();
    renderRemoteTimeline();
    renderTasks();
  }

  function setStatus(id, message, isError) {
    const target = $(id);
    if (!target) return;
    target.textContent = message;
    target.classList.toggle("is-error", !!isError);
  }

  function bindForms() {
    const timelineForm = $("timelineEventForm");
    timelineForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("saveTimelineEvent");
      button.disabled = true;
      setStatus("timelineEventStatus", "Saving timeline event…");
      try {
        const recordId = $("timelineEventSourceRecord")?.value || null;
        const record = state.records.find((item) => item.id === recordId);
        await window.FamilyCloud.createTimelineEvent({
          title: $("timelineEventTitle").value.trim(),
          event_type: $("timelineEventType").value,
          event_date: $("timelineEventDateLabel").value.trim(),
          sort_date: $("timelineEventSortDate").value || null,
          date_precision: $("timelineEventPrecision").value,
          person_ids: selectedValues($("timelineEventPeople")),
          location: $("timelineEventLocation").value.trim() || null,
          description: $("timelineEventDescription").value.trim(),
          evidence_status: $("timelineEventEvidence").value,
          source_record_id: recordId,
          source_label: record?.title || null,
          source_url: $("timelineEventSourceUrl").value.trim() || null,
          visibility: $("timelineEventVisibility").value,
          is_published: $("timelineEventPublish").checked
        });
        timelineForm.reset();
        setStatus("timelineEventStatus", "Timeline event saved.");
        await loadWorkspace();
      } catch (error) {
        setStatus("timelineEventStatus", error.message || "Could not save the event.", true);
      } finally { button.disabled = false; }
    });

    const recordForm = $("researchRecordForm");
    $("researchIncludeTimeline")?.addEventListener("change", () => {
      const fields = $("researchTimelineFields");
      if (fields) fields.hidden = !$("researchIncludeTimeline").checked;
    });
    recordForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("saveResearchRecord");
      const file = $("researchRecordFile")?.files?.[0] || null;
      button.disabled = true;
      setStatus("researchRecordStatus", "Saving research record…");
      try {
        const record = await window.FamilyCloud.createResearchRecord({
          title: $("researchRecordTitle").value.trim(),
          record_type: $("researchRecordType").value,
          person_ids: selectedValues($("researchRecordPeople")),
          repository: $("researchRepository").value.trim() || null,
          collection_title: $("researchCollection").value.trim() || null,
          reference_code: $("researchReferenceCode").value.trim() || null,
          record_date: $("researchRecordDate").value.trim() || null,
          place: $("researchRecordPlace").value.trim() || null,
          description: $("researchRecordDescription").value.trim(),
          source_url: $("researchRecordSourceUrl").value.trim() || null,
          evidence_status: $("researchRecordEvidence").value,
          visibility: $("researchRecordVisibility").value,
          is_published: $("researchRecordPublish").checked
        }, file);
        let timelineWarning = "";
        if ($("researchIncludeTimeline")?.checked) {
          try {
            const displayedDate = $("researchEventDateLabel").value.trim() || record.record_date || "Date not established";
            const publicEvent = record.visibility === "public" && record.is_published === true;
            await window.FamilyCloud.createTimelineEvent({
              title: $("researchEventTitle").value.trim() || record.title,
              event_type: $("researchEventType").value,
              event_date: displayedDate,
              sort_date: $("researchEventSortDate").value || null,
              date_precision: $("researchEventPrecision").value,
              person_ids: record.person_ids || [],
              location: record.place || null,
              description: $("researchEventDescription").value.trim() || record.description,
              evidence_status: record.evidence_status,
              source_record_id: record.id,
              source_label: record.title,
              source_url: record.source_url || null,
              visibility: record.visibility,
              is_published: publicEvent
            });
          } catch (error) {
            timelineWarning = " The research record was saved, but its timeline event could not be created: " + (error.message || "Unknown error.");
          }
        }
        recordForm.reset();
        if ($("researchTimelineFields")) $("researchTimelineFields").hidden = true;
        setStatus("researchRecordStatus", "Research record saved." + timelineWarning, !!timelineWarning);
        await loadWorkspace();
      } catch (error) {
        setStatus("researchRecordStatus", error.message || "Could not save the research record.", true);
      } finally { button.disabled = false; }
    });

    const taskForm = $("researchTaskForm");
    taskForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = $("saveResearchTask");
      button.disabled = true;
      setStatus("researchTaskStatusMessage", "Saving research task…");
      try {
        await window.FamilyCloud.createResearchTask({
          title: $("researchTaskTitle").value.trim(),
          person_id: $("researchTaskPerson").value || null,
          priority: $("researchTaskPriority").value,
          status: $("researchTaskStatus").value,
          research_question: $("researchTaskQuestion").value.trim() || null,
          source_hint: $("researchTaskSourceHint").value.trim() || null
        });
        taskForm.reset();
        setStatus("researchTaskStatusMessage", "Research task added.");
        await loadWorkspace();
      } catch (error) {
        setStatus("researchTaskStatusMessage", error.message || "Could not save the research task.", true);
      } finally { button.disabled = false; }
    });

    ["researchRecordSearch", "researchRecordTypeFilter", "researchRecordEvidenceFilter"].forEach((id) => {
      $(id)?.addEventListener(id === "researchRecordSearch" ? "input" : "change", renderRecords);
    });
    ["timelineSearch", "timelinePersonFilter", "timelineYearFilter", "timelineTypeFilter", "timelineEvidenceFilter", "timelineShowUndated"].forEach((id) => {
      $(id)?.addEventListener(id === "timelineSearch" ? "input" : "change", applyTimelineFilters);
    });
    $("timelineClearFilters")?.addEventListener("click", () => {
      ["timelineSearch", "timelinePersonFilter", "timelineYearFilter", "timelineTypeFilter", "timelineEvidenceFilter"].forEach((id) => { if ($(id)) $(id).value = ""; });
      if ($("timelineShowUndated")) $("timelineShowUndated").checked = true;
      applyTimelineFilters();
    });
  }

  async function initialize() {
    if (state.booted) return;
    state.booted = true;
    try { await (window.FamilyCloud?.ready || Promise.resolve()); } catch (_) { /* The UI below reports cloud availability. */ }
    populatePeopleControls();
    updateAdminControls();
    bindForms();
    tagStaticTimeline();
    fillTimelineYearFilter();
    applyTimelineFilters();
    await loadWorkspace();
  }

  window.addEventListener("family-archive-ready", initialize, { once: true });
  window.addEventListener("family-cloud-permission-change", async () => {
    if (!state.booted) return;
    updateAdminControls();
    populatePeopleControls();
    await loadWorkspace();
  });

  // Graceful fallback if the main archive script is not present for a reduced page.
  if (document.readyState === "complete" && window.FamilyTree) initialize();
})();
