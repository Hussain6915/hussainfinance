const $ = (sel) => document.querySelector(sel);

/** =========================
 *  Remote Sync (optional)
 *  =========================
 * If /api/state exists, we use it.
 * Otherwise fallback to localStorage.
 */
const STORAGE_KEY = "hussain_finance_dashboard_v2";
let USE_REMOTE = false;
let saveTimer = null;

const state = {
  overall: { current: 0, savings: 0, monthly: 0 },
  current: { balance: 0, savings: 0 },
  daily: {
    base: 10500,
    updated: 10500,
    workingDaysRemaining: null,
    perDayManual: null,
    weeklyManual: null,
    perWeekManual: null
  },
  notes: [],
  docs: [],
  expenses: [] // { id, kind:"Expense"|"Service", name, note, amount, occurred }
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function fmt(n) {
  const num = Number(n || 0);
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(str) {
  return escapeHtml(str).replaceAll("\n", " ");
}

/** =========================
 *  Persistence
 *  ========================= */
async function detectRemote() {
  try {
    const res = await fetch("/api/state", { method: "GET" });
    USE_REMOTE = res.ok;
  } catch {
    USE_REMOTE = false;
  }
}

async function loadState() {
  if (USE_REMOTE) {
    try {
      const res = await fetch("/api/state");
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === "object") Object.assign(state, data);
        return;
      }
    } catch {}
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
  } catch {}
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 250);
}

async function saveState() {
  // always local backup
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (!USE_REMOTE) return;
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
  } catch {}
}

/** =========================
 *  Calculations
 *  ========================= */
function remainBalance() {
  return toNum(state.current.balance) - toNum(state.current.savings);
}
function allExpensesTotal() {
  return state.expenses.reduce((sum, e) => sum + toNum(e.amount), 0);
}
function occurredExpensesTotal() {
  return state.expenses.filter(e => !!e.occurred).reduce((sum, e) => sum + toNum(e.amount), 0);
}
function mainAvailable() {
  return remainBalance() - occurredExpensesTotal();
}
function personalBalance() {
  return remainBalance() - allExpensesTotal();
}
function weeklyBalanceComputed() {
  return personalBalance() - toNum(state.daily.updated);
}
function perWeekComputed() {
  return (personalBalance() - toNum(state.daily.updated)) / 4;
}
function workingDaysRemainingAuto() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // start tomorrow
  const start = new Date(y, m, now.getDate() + 1);
  const end = new Date(y, m + 1, 1);

  let count = 0;
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay(); // 0 Sun .. 6 Sat
    if (day >= 1 && day <= 5) count++;
  }
  return count;
}

/** =========================
 *  Tabs
 *  ========================= */
function setTab(which) {
  const overall = $("#viewOverall");
  const current = $("#viewCurrent");
  const notes = $("#viewNotes");

  const tabOverall = $("#tabOverall");
  const tabCurrent = $("#tabCurrent");
  const tabNotes = $("#tabNotes");

  const activate = (btn, on) => {
    if (!btn) return;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  };

  overall.classList.toggle("hidden", which !== "overall");
  current.classList.toggle("hidden", which !== "current");
  notes.classList.toggle("hidden", which !== "notes");

  activate(tabOverall, which === "overall");
  activate(tabCurrent, which === "current");
  activate(tabNotes, which === "notes");
}

/** =========================
 *  Charts
 *  ========================= */
let chartOverallSplit, chartOverallBars, chartServicesByName, chartTopNamesAll;

function ensureCharts() {
  const ctxSplit = $("#chartOverallSplit");
  const ctxBars = $("#chartOverallBars");
  const ctxSvc = $("#chartServicesByName");
  const ctxNames = $("#chartTopNamesAll");

  if (ctxSplit && !chartOverallSplit) {
    chartOverallSplit = new Chart(ctxSplit, {
      type: "doughnut",
      data: { labels: ["Current", "Savings"], datasets: [{ data: [0, 0] }] },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } }
    });
  }

  if (ctxBars && !chartOverallBars) {
    chartOverallBars = new Chart(ctxBars, {
      type: "bar",
      data: {
        labels: ["Overall"],
        datasets: [
          { label: "Monthly", data: [0] },
          { label: "Current", data: [0] },
          { label: "Savings", data: [0] }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: "bottom" } } }
    });
  }

  if (ctxSvc && !chartServicesByName) {
    chartServicesByName = new Chart(ctxSvc, {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Occurred (Services)", data: [] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }

  if (ctxNames && !chartTopNamesAll) {
    chartTopNamesAll = new Chart(ctxNames, {
      type: "bar",
      data: { labels: [], datasets: [{ label: "All expenses (by name)", data: [] }] },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });
  }
}

function sumBy(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    map.set(k, (map.get(k) || 0) + toNum(it.amount));
  }
  return map;
}

function updateCharts() {
  ensureCharts();

  if (chartOverallSplit) {
    chartOverallSplit.data.datasets[0].data = [toNum(state.overall.current), toNum(state.overall.savings)];
    chartOverallSplit.update();
  }

  if (chartOverallBars) {
    chartOverallBars.data.datasets[0].data = [toNum(state.overall.monthly)];
    chartOverallBars.data.datasets[1].data = [toNum(state.overall.current)];
    chartOverallBars.data.datasets[2].data = [toNum(state.overall.savings)];
    chartOverallBars.update();
  }

  if (chartServicesByName) {
    const occurredServices = state.expenses.filter(e => e.kind === "Service" && e.occurred);
    const svcMap = sumBy(occurredServices, e => (e.name || "Service").trim() || "Service");
    const labels = Array.from(svcMap.keys());
    const values = labels.map(l => svcMap.get(l));
    chartServicesByName.data.labels = labels;
    chartServicesByName.data.datasets[0].data = values;
    chartServicesByName.update();
  }

  if (chartTopNamesAll) {
    const all = state.expenses.filter(e => (e.name || "").trim().length > 0);
    const map = sumBy(all, e => e.name.trim());
    const sorted = Array.from(map.entries()).sort((a,b) => b[1]-a[1]).slice(0, 8);
    chartTopNamesAll.data.labels = sorted.map(x => x[0]);
    chartTopNamesAll.data.datasets[0].data = sorted.map(x => x[1]);
    chartTopNamesAll.update();
  }
}

/** =========================
 *  Rendering
 *  ========================= */
function renderOverallCards() {
  $("#overallCurrentDisplay").textContent = fmt(state.overall.current);
  $("#overallSavingsDisplay").textContent = fmt(state.overall.savings);
  $("#overallMonthlyDisplay").textContent = fmt(state.overall.monthly);

  $("#overallCurrent").value = state.overall.current || "";
  $("#overallSavings").value = state.overall.savings || "";
  $("#overallMonthly").value = state.overall.monthly || "";
}

function renderCurrentTop() {
  $("#balanceInput").value = state.current.balance || "";
  $("#savingsInput").value = state.current.savings || "";

  $("#savingsDisplay").textContent = fmt(state.current.savings);
  $("#remainDisplay").textContent = fmt(remainBalance());

  $("#mainAvailableDisplay").textContent = fmt(mainAvailable());
  $("#personalBalanceDisplay").textContent = fmt(personalBalance());
}

function renderDailyWeekly() {
  $("#dailyBaseInput").value = state.daily.base ?? 10500;
  $("#dailyUpdatedDisplay").textContent = fmt(state.daily.updated);

  const wdr = state.daily.workingDaysRemaining;
  $("#workingDaysRemainingInput").value = (wdr === null || wdr === undefined) ? "" : wdr;

  const computedPerDay = (() => {
    const raw = toNum(state.daily.workingDaysRemaining);
    const days = raw <= 0 ? 0 : raw;
    if (state.daily.perDayManual !== null && state.daily.perDayManual !== undefined) return toNum(state.daily.perDayManual);
    if (days <= 0) return 0;
    return toNum(state.daily.updated) / days;
  })();
  $("#perDayDisplay").textContent = fmt(computedPerDay);

  const weekly = (state.daily.weeklyManual !== null && state.daily.weeklyManual !== undefined)
    ? toNum(state.daily.weeklyManual)
    : weeklyBalanceComputed();
  $("#weeklyBalanceDisplay").textContent = fmt(weekly);

  const perWeek = (state.daily.perWeekManual !== null && state.daily.perWeekManual !== undefined)
    ? toNum(state.daily.perWeekManual)
    : perWeekComputed();
  $("#perWeekDisplay").textContent = fmt(perWeek);
}

function renderExpenses() {
  const list = $("#expenseList");
  list.innerHTML = "";

  for (const e of state.expenses) {
    const row = document.createElement("div");
    row.className = "expRow";

    const kindLabel = (e.kind === "Service") ? "Service" : "Expense";

    row.innerHTML = `
      <div>
        <input class="chk" type="checkbox" ${e.occurred ? "checked" : ""} data-action="toggle" data-id="${e.id}" title="Occurred ✅">
      </div>

      <div><strong>${escapeHtml(kindLabel)}</strong></div>

      <div>
        <input class="input" data-action="name" data-id="${e.id}" value="${escapeAttr(e.name || "")}" placeholder="Name..." />
      </div>

      <div>
        <input class="input" data-action="note" data-id="${e.id}" value="${escapeAttr(e.note || "")}" placeholder="Notes..." />
      </div>

      <div class="right">
        <input class="input" data-action="amount" data-id="${e.id}" type="number" min="0" step="1" value="${toNum(e.amount)}" />
      </div>

      <div class="rowActions">
        <button class="smallBtn" data-action="update" data-id="${e.id}">Update</button>
        <button class="smallBtn danger" data-action="delete" data-id="${e.id}">Delete</button>
      </div>
    `;

    list.appendChild(row);
  }
}

function renderNotes() {
  const list = $("#notesList");
  if (!list) return;

  const raw = ($("#noteSearchInput")?.value || "").trim().toLowerCase();
  const q = raw.length >= 2 ? raw : "";

  const items = state.notes
    .filter(n => {
      if (!q) return true;
      return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
    })
    .sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  list.innerHTML = "";

  if (items.length === 0) {
    list.innerHTML = `<div class="muted tiny">No notes yet.</div>`;
    return;
  }

  for (const n of items) {
    const el = document.createElement("div");
    el.className = "noteItem";
    el.innerHTML = `
      <div class="noteTop">
        <div style="min-width:0;">
          <div class="noteTitle">${escapeHtml(n.title || "Untitled")}</div>
          <div class="noteMeta">${new Date(n.updatedAt || n.createdAt || Date.now()).toLocaleString()}</div>
        </div>
        <div class="rowActions">
          <button class="smallBtn" data-note-action="edit" data-note-id="${n.id}">Edit</button>
          <button class="smallBtn danger" data-note-action="delete" data-note-id="${n.id}">Delete</button>
        </div>
      </div>
      <div class="noteBody">${escapeHtml(n.body || "")}</div>
    `;
    list.appendChild(el);
  }
}

function renderDocs() {
  const list = $("#docsList");
  const preview = $("#docPreviewBox");
  if (!list || !preview) return;

  list.innerHTML = "";

  if (!state.docs.length) {
    list.innerHTML = `<div class="muted tiny">No files attached.</div>`;
    return;
  }

  const sorted = state.docs.slice().sort((a,b)=> (b.addedAt||0)-(a.addedAt||0));
  for (const d of sorted) {
    const row = document.createElement("div");
    row.className = "docItem";
    row.innerHTML = `
      <div style="min-width:0;">
        <div class="docName" title="${escapeAttr(d.name)}">${escapeHtml(d.name)}</div>
        <div class="tiny muted">${escapeHtml(d.type || "file")} • ${Math.round((d.size||0)/1024)} KB</div>
      </div>
      <div class="rowActions">
        <button class="smallBtn" data-doc-action="view" data-doc-id="${d.id}">View</button>
        <button class="smallBtn danger" data-doc-action="delete" data-doc-id="${d.id}">Delete</button>
      </div>
    `;
    list.appendChild(row);
  }
}

function renderAll() {
  renderOverallCards();
  renderCurrentTop();
  renderDailyWeekly();
  renderExpenses();
  renderNotes();
  renderDocs();
  updateCharts();
}

/** =========================
 *  Events / Bindings
 *  ========================= */
function bindTabs() {
  $("#tabOverall").addEventListener("click", () => setTab("overall"));
  $("#tabCurrent").addEventListener("click", () => setTab("current"));
  $("#tabNotes").addEventListener("click", () => setTab("notes"));
}

function bindOverallInputs() {
  const bind = (id, key) => {
    const el = $("#" + id);
    el.addEventListener("input", () => {
      state.overall[key] = toNum(el.value);
      scheduleSave();
      renderOverallCards();
      updateCharts();
    });
  };
  bind("overallCurrent", "current");
  bind("overallSavings", "savings");
  bind("overallMonthly", "monthly");
}

function bindCurrentInputs() {
  $("#balanceInput").addEventListener("input", (e) => {
    state.current.balance = toNum(e.target.value);
    scheduleSave();
    renderAll();
  });

  $("#savingsInput").addEventListener("input", (e) => {
    state.current.savings = toNum(e.target.value);
    scheduleSave();
    renderAll();
  });

  $("#recalcBtn").addEventListener("click", () => {
    scheduleSave();
    renderAll();
  });
}

function bindDailyWeeklyControls() {
  $("#dailyBaseInput").addEventListener("input", (e) => {
    state.daily.base = toNum(e.target.value);
    if (state.daily.updated === null || state.daily.updated === undefined) state.daily.updated = state.daily.base;
    scheduleSave();
    renderDailyWeekly();
  });

  $("#applySpentBtn").addEventListener("click", () => {
    const spent = toNum($("#spentTodayInput").value);
    state.daily.updated = Math.max(0, toNum(state.daily.updated ?? state.daily.base) - spent);
    $("#spentTodayInput").value = "";
    scheduleSave();
    renderAll();
  });

  $("#resetDailyBtn").addEventListener("click", () => {
    state.daily.updated = toNum(state.daily.base ?? 10500);
    state.daily.perDayManual = null;
    scheduleSave();
    renderAll();
  });

  $("#autoDaysBtn").addEventListener("click", () => {
    state.daily.workingDaysRemaining = workingDaysRemainingAuto();
    scheduleSave();
    renderAll();
  });

  $("#workingDaysRemainingInput").addEventListener("input", (e) => {
    const v = e.target.value === "" ? null : toNum(e.target.value);
    state.daily.workingDaysRemaining = v;
    scheduleSave();
    renderDailyWeekly();
    updateCharts();
  });

  const toggleManual = (btnId, inputId, stateKey) => {
    const btn = $(btnId);
    const inp = $(inputId);

    btn.addEventListener("click", () => {
      inp.classList.toggle("hidden");
      if (!inp.classList.contains("hidden")) inp.focus();
      else {
        state.daily[stateKey] = null;
        inp.value = "";
        scheduleSave();
        renderAll();
      }
    });

    inp.addEventListener("input", () => {
      state.daily[stateKey] = inp.value === "" ? null : toNum(inp.value);
      scheduleSave();
      renderAll();
    });
  };

  toggleManual("#editPerDayBtn", "#perDayManualInput", "perDayManual");
  toggleManual("#editWeeklyBtn", "#weeklyManualInput", "weeklyManual");
  toggleManual("#editPerWeekBtn", "#perWeekManualInput", "perWeekManual");
}

function bindExpenses() {
  $("#addExpenseBtn").addEventListener("click", () => {
    const name = $("#expenseNameInput").value.trim();
    const note = $("#expenseNoteInput").value.trim();
    const amt = toNum($("#expenseAmountInput").value);
    if (amt <= 0) return;

    state.expenses.unshift({
      id: uid(),
      kind: "Expense",
      name: name || "Expense",
      note,
      amount: amt,
      occurred: false
    });

    $("#expenseNameInput").value = "";
    $("#expenseNoteInput").value = "";
    $("#expenseAmountInput").value = "";
    scheduleSave();
    renderAll();
  });

  $("#addServiceExpenseBtn").addEventListener("click", () => {
    const service = $("#serviceSelect").value;
    const note = $("#serviceNoteInput").value.trim();
    const amt = toNum($("#serviceAmountInput").value);
    if (amt <= 0) return;

    state.expenses.unshift({
      id: uid(),
      kind: "Service",
      name: service,
      note,
      amount: amt,
      occurred: false
    });

    $("#serviceNoteInput").value = "";
    $("#serviceAmountInput").value = "";
    scheduleSave();
    renderAll();
  });

  // Edit/delete/toggle + live input updates (event delegation)
  document.body.addEventListener("input", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.getAttribute("data-action");
    const id = el.getAttribute("data-id");
    const exp = state.expenses.find(x => x.id === id);
    if (!exp) return;

    if (action === "name") exp.name = el.value;
    if (action === "note") exp.note = el.value;
    if (action === "amount") exp.amount = toNum(el.value);

    scheduleSave();
    renderCurrentTop();
    updateCharts();
  });

  document.body.addEventListener("change", (e) => {
    const el = e.target.closest("[data-action='toggle']");
    if (!el) return;

    const id = el.getAttribute("data-id");
    const exp = state.expenses.find(x => x.id === id);
    if (!exp) return;

    exp.occurred = !!el.checked;
    scheduleSave();
    renderAll();
  });

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");

    if (action === "delete") {
      state.expenses = state.expenses.filter(x => x.id !== id);
      scheduleSave();
      renderAll();
    }

    if (action === "update") {
      scheduleSave();
      renderAll();
    }
  });
}

function bindEditButtons() {
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const id = btn.getAttribute("data-edit");
    const el = $("#" + id);
    if (el) el.focus();
  });
}

/** Notes & Docs bindings */
function bindNotesAndDocs() {
  // search
  $("#noteSearchInput")?.addEventListener("input", () => renderNotes());

  // save/update note
  $("#addNoteBtn")?.addEventListener("click", () => {
    const titleEl = $("#noteTitleInput");
    const bodyEl = $("#noteBodyInput");
    const btn = $("#addNoteBtn");

    const title = (titleEl.value || "").trim();
    const body = (bodyEl.value || "").trim();
    if (!title && !body) return;

    const editingId = btn.getAttribute("data-editing-id");
    if (editingId) {
      const note = state.notes.find(x => x.id === editingId);
      if (note) {
        note.title = title;
        note.body = body;
        note.updatedAt = Date.now();
      }
    } else {
      state.notes.push({
        id: uid(),
        title,
        body,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    titleEl.value = "";
    bodyEl.value = "";
    btn.textContent = "Save Note";
    btn.removeAttribute("data-editing-id");

    scheduleSave();
    renderNotes();
  });

  // clear
  $("#clearNoteBtn")?.addEventListener("click", () => {
    $("#noteTitleInput").value = "";
    $("#noteBodyInput").value = "";
    const btn = $("#addNoteBtn");
    btn.textContent = "Save Note";
    btn.removeAttribute("data-editing-id");
  });

  // note edit/delete delegation
  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-note-action]");
    if (!b) return;

    const action = b.getAttribute("data-note-action");
    const id = b.getAttribute("data-note-id");
    const note = state.notes.find(x => x.id === id);
    if (!note) return;

    if (action === "delete") {
      state.notes = state.notes.filter(x => x.id !== id);
      scheduleSave();
      renderNotes();
      return;
    }

    if (action === "edit") {
      $("#noteTitleInput").value = note.title || "";
      $("#noteBodyInput").value = note.body || "";
      const btn = $("#addNoteBtn");
      btn.textContent = "Update Note";
      btn.setAttribute("data-editing-id", note.id);
      $("#noteTitleInput").focus();
      return;
    }
  });

  // attach docs
  $("#docFileInput")?.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const f of files) {
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(f);
      });

      state.docs.push({
        id: uid(),
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size || 0,
        addedAt: Date.now(),
        dataUrl
      });
    }

    e.target.value = "";
    scheduleSave();
    renderDocs();
  });

  // docs view/delete delegation
  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-doc-action]");
    if (!b) return;

    const action = b.getAttribute("data-doc-action");
    const id = b.getAttribute("data-doc-id");

    const doc = state.docs.find(x => x.id === id);
    const preview = $("#docPreviewBox");
    if (!doc || !preview) return;

    if (action === "delete") {
      state.docs = state.docs.filter(x => x.id !== id);
      scheduleSave();
      preview.innerHTML = `<div class="muted tiny">Select a file to preview.</div>`;
      renderDocs();
      return;
    }

    if (action === "view") {
      if (doc.type?.includes("pdf")) {
        preview.innerHTML = `<iframe src="${doc.dataUrl}"></iframe>`;
      } else if (doc.type?.startsWith("image/")) {
        preview.innerHTML = `<img src="${doc.dataUrl}" alt="${escapeAttr(doc.name)}" />`;
      } else {
        preview.innerHTML = `
          <div class="muted tiny" style="margin-bottom:10px;">
            Preview not supported in-browser for this file type.
          </div>
          <a class="ghostBtn" href="${doc.dataUrl}" download="${escapeAttr(doc.name)}"
             style="display:inline-block; text-decoration:none;">
            Download ${escapeHtml(doc.name)}
          </a>
        `;
      }
      return;
    }
  });
}

/** =========================
 *  Init / Fix old data
 *  ========================= */
function normalizeState() {
  // make sure daily updated exists
  if (state.daily.updated === null || state.daily.updated === undefined) {
    state.daily.updated = toNum(state.daily.base ?? 10500);
  }

  // normalize old "Other" -> "Expense"
  for (const e of state.expenses) {
    if (!e.kind || e.kind === "Other") e.kind = "Expense";
    if (e.kind !== "Service") e.kind = "Expense";
    e.amount = toNum(e.amount);
    e.occurred = !!e.occurred;
    e.name = (e.name || "").trim() || (e.kind === "Service" ? "Service" : "Expense");
    e.note = e.note || "";
  }

  // ensure arrays exist
  if (!Array.isArray(state.notes)) state.notes = [];
  if (!Array.isArray(state.docs)) state.docs = [];
  if (!Array.isArray(state.expenses)) state.expenses = [];
}

async function boot() {
  await detectRemote();
  await loadState();
  normalizeState();

  bindTabs();
  bindOverallInputs();
  bindCurrentInputs();
  bindDailyWeeklyControls();
  bindExpenses();
  bindEditButtons();
  bindNotesAndDocs();

  renderAll();
  setTab("overall");
}

boot();