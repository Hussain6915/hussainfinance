const $ = (sel) => document.querySelector(sel);

/* =========================
   Remote Sync
========================= */
const STORAGE_KEY = "hussain_finance_dashboard_v3";
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
  expenses: [],

  // NEW MODULES
  water: { targetMl: 3000, glasses: 0, mlPerGlass: 250, lastDate: null },
  quotes: { items: [], reflection: "" },
  focus: { running: false, endAt: null, overlay: false },
  plans: { items: [], pin: null }
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/* =========================
   Persistence
========================= */
async function detectRemote() {
  try {
    const res = await fetch("/api/state");
    USE_REMOTE = res.ok;
  } catch {
    USE_REMOTE = false;
  }
}

async function loadState() {
  if (USE_REMOTE) {
    try {
      const res = await fetch("/api/state");
      if (res.ok) Object.assign(state, await res.json());
    } catch {}
  } else {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 250);
}

async function saveState() {
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

/* ======================================================
   WATER TRACKER
====================================================== */
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function ensureWaterReset() {
  if (state.water.lastDate !== todayKey()) {
    state.water.lastDate = todayKey();
    state.water.glasses = 0;
  }
}

function renderWater() {
  if (!$("#waterConsumedText")) return;

  ensureWaterReset();

  const consumed = state.water.glasses * state.water.mlPerGlass;
  const pct = Math.min(
    100,
    Math.round((consumed / state.water.targetMl) * 100)
  );

  $("#waterConsumedText").textContent = consumed + " ml";
  $("#waterProgressText").textContent = pct + "%";
  $("#waterFill").style.width = pct + "%";
  $("#waterTrophy").hidden = consumed < state.water.targetMl;

  const grid = $("#glassGrid");
  grid.innerHTML = "";

  const totalGlasses = Math.ceil(state.water.targetMl / state.water.mlPerGlass);

  for (let i = 1; i <= totalGlasses; i++) {
    const btn = document.createElement("button");
    btn.textContent = "🥛";
    btn.className = "glassBtn" + (i <= state.water.glasses ? " active" : "");
    btn.onclick = () => {
      state.water.glasses = i;
      renderWater();
      scheduleSave();
    };
    grid.appendChild(btn);
  }
}

/* ======================================================
   DAILY QURAN QUOTES
====================================================== */
async function fetchQuotes() {
  try {
    const r = await fetch("/api/quotes");
    const data = await r.json();
    state.quotes.items = data.items || [];
    renderQuotes();
    scheduleSave();
  } catch {}
}

function renderQuotes() {
  if (!$("#quoteList")) return;
  const list = $("#quoteList");
  list.innerHTML = "";

  state.quotes.items.forEach(q => {
    const div = document.createElement("div");
    div.className = "quoteCard";
    div.innerHTML = `
      <div>${q.text}</div>
      <div class="small muted">${q.meta}</div>
    `;
    list.appendChild(div);
  });

  $("#quoteReflection").value = state.quotes.reflection || "";
}

/* ======================================================
   FOCUS MODE
====================================================== */
let focusTimer = null;

function renderFocus() {
  if (!$("#focusCountdown")) return;

  const left = state.focus.endAt
    ? Math.max(0, state.focus.endAt - Date.now())
    : 0;

  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  $("#focusCountdown").textContent =
    String(mins).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0");

 const ov = $("#focusOverlay");
if (ov) {
  ov.classList.toggle("hidden", !state.focus.overlay);
  ov.hidden = !state.focus.overlay;
}

function startFocus(min) {
  state.focus.running = true;
  state.focus.endAt = Date.now() + min * 60000;

  if (!focusTimer)
    focusTimer = setInterval(() => {
      renderFocus();
      if (Date.now() >= state.focus.endAt) {
        clearInterval(focusTimer);
        focusTimer = null;
        alert("Focus Complete ✅");
      }
    }, 500);

  scheduleSave();
}

function stopFocus() {
  state.focus.running = false;
  state.focus.endAt = null;
  clearInterval(focusTimer);
  focusTimer = null;
  renderFocus();
  scheduleSave();
}

/* ======================================================
   PLANS + MAP
====================================================== */
let map, marker;

function initMap() {
  if (map) return;
  map = L.map("plansMap").setView([24.8607, 67.0011], 11);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  ).addTo(map);

  map.on("click", e => {
    state.plans.pin = {
      lat: e.latlng.lat,
      lng: e.latlng.lng
    };
    if (!marker)
      marker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(map);
    marker.setLatLng([e.latlng.lat, e.latlng.lng]);
    scheduleSave();
  });
}

function renderPlans() {
  if (!$("#plansList")) return;
  const list = $("#plansList");
  list.innerHTML = "";

  state.plans.items.forEach(p => {
    const row = document.createElement("div");
    row.className = "planRow";
    row.innerHTML = `
      <strong>${p.name}</strong>
      <span>${p.date} ${p.time}</span>
      <button class="smallBtn danger">Delete</button>
    `;
    row.querySelector("button").onclick = () => {
      state.plans.items =
        state.plans.items.filter(x => x.id !== p.id);
      renderPlans();
      scheduleSave();
    };
    list.appendChild(row);
  });
}

/* ======================================================
   TAB EXTENSION
====================================================== */
function setTab(which) {
  document.querySelectorAll(".view")
    .forEach(v => v.classList.add("hidden"));

  const view = $("#view" + which.charAt(0).toUpperCase() + which.slice(1));
  if (view) view.classList.remove("hidden");

  if (which === "water") renderWater();
  if (which === "quote") renderQuotes();
  if (which === "focus") renderFocus();
  if (which === "plans") setTimeout(initMap, 100);
}

/* ======================================================
   INIT
====================================================== */
async function boot() {
  await detectRemote();
  await loadState();

  renderWater();
  renderQuotes();
  renderFocus();
  renderPlans();

  setTab("overall");
}
// ===== Focus Buttons Fix =====
document.addEventListener("click", (e) => {
  if (e.target.id === "overlayHide") {
    state.focus.overlay = false;
    renderFocus();
    scheduleSave();
  }

  if (e.target.id === "overlayStop") {
    state.focus.running = false;
    state.focus.overlay = false;
    state.focus.endAt = null;
    renderFocus();
    scheduleSave();
  }

  if (e.target.id === "toggleFocusOverlay") {
    state.focus.overlay = !state.focus.overlay;
    renderFocus();
    scheduleSave();
  }
});
   // Focus overlay controls (works even if button IDs are missing)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const label = (btn.textContent || "").trim().toLowerCase();
  const id = (btn.id || "").toLowerCase();
  const action = (btn.dataset?.action || "").toLowerCase();

  // Hide button
  if (id.includes("hide") || action === "hide" || label === "hide") {
    state.focus.overlay = false;
    renderFocus();
    scheduleSave();
    return;
  }

  // Stop button
  if (id.includes("stop") || action === "stop" || label === "stop") {
    state.focus.running = false;
    state.focus.overlay = false;
    state.focus.endAt = null;

    if (window.focusTimer) {
      clearInterval(window.focusTimer);
      window.focusTimer = null;
    }

    renderFocus();
    scheduleSave();
    return;
  }
});
boot();


