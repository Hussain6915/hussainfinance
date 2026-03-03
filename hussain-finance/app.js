import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, getDocs,
  deleteDoc, query, where, orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const auth = window.__firebase.auth;
const db = window.__firebase.db;
const storage = getStorage(window.__firebase.app);
window.__firebase.storage = storage;

/* -------------------- UI helpers -------------------- */
lucide.createIcons();

const $ = (id) => document.getElementById(id);
const toastEl = $("toast");
let toastTimer = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2600);
}

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  // update icon
  const icon = theme === "light" ? "sun" : "moon";
  $("themeBtn").innerHTML = `<i data-lucide="${icon}"></i>`;
  lucide.createIcons();
}

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function islamicDateString() {
  // Umalqura is most accurate in many regions
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" });
  return fmt.format(d);
}

/* -------------------- Routing -------------------- */
const views = {
  home: "homeView",
  todo: "todoView",
  notes: "notesView",
  finance: "financeView",
  plans: "plansView",
  focus: "focusView",
  water: "waterView",
  mood: "moodView",
  friend: "friendView"
};

function nav(to) {
  // hide all
  Object.values(views).forEach(v => hide(v));
  show(views[to] || views.home);

  if (to !== "focus") {
    // make sure focus view not overlaying
    $("focusView").classList.add("hidden");
  }
  window.location.hash = `#${to}`;
}

function initNavButtons() {
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => nav(btn.getAttribute("data-nav")));
  });
}

/* -------------------- Auth UI -------------------- */
const authView = $("authView");
const appView = $("appView");

document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    if (tab === "login") { show("loginBox"); hide("signupBox"); }
    else { show("signupBox"); hide("loginBox"); }
  });
});

$("loginBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  const pass = $("loginPass").value;
  if (!email || !pass) return toast("Enter email and password");
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    toast("Welcome back ✨");
  } catch (e) {
    toast("Login failed. Check email/password.");
  }
});

$("signupBtn").addEventListener("click", async () => {
  const email = $("signupEmail").value.trim();
  const pass = $("signupPass").value;
  if (!email || !pass || pass.length < 6) return toast("Use email + password (6+ chars)");
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    toast("Account created ✅ Now set your name in Settings");
  } catch (e) {
    toast("Signup failed. Try another email/password.");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  toast("Logged out.");
});

/* -------------------- Settings -------------------- */
const modalBack = $("modalBackdrop");
const settingsModal = $("settingsModal");

function openSettings() { modalBack.classList.remove("hidden"); settingsModal.classList.remove("hidden"); }
function closeSettings() { modalBack.classList.add("hidden"); settingsModal.classList.add("hidden"); }

$("settingsBtn").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettings);
modalBack.addEventListener("click", closeSettings);

$("themeBtn").addEventListener("click", () => {
  const cur = localStorage.getItem("theme") || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
});
$("themeLight").addEventListener("click", () => setTheme("light"));
$("themeDark").addEventListener("click", () => setTheme("dark"));

$("changePasswordBtn").addEventListener("click", async () => {
  const np = $("newPassword").value;
  if (!np || np.length < 6) return toast("Password must be 6+ characters");
  try {
    if (!auth.currentUser) return toast("Not logged in");
    await updatePassword(auth.currentUser, np);
    $("newPassword").value = "";
    toast("Password updated ✅");
  } catch (e) {
    toast("Could not update password (re-login may be required).");
  }
});

/* -------------------- User Profile -------------------- */
async function ensureProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: "",
      theme: localStorage.getItem("theme") || "dark",
      createdAt: serverTimestamp()
    });
  }
  return (await getDoc(ref)).data();
}

async function saveProfile(uid, patch) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, patch);
}

/* -------------------- Header widgets -------------------- */
async function updateWeather() {
  // Simple lightweight demo weather without API key:
  // Use browser geolocation if allowed; otherwise keep "—".
  // If you want real weather, we can add OpenWeather server route (safe).
  $("weatherPill").textContent = "Temp: —";
}

/* -------------------- Quotes (local set) -------------------- */
const QUOTES = [
  "Small steps daily become big wins.",
  "You don’t need motivation. You need a system.",
  "Discipline is self-respect in action.",
  "Today is a good day to build your future.",
  "Consistency beats intensity."
];

function setQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $("quoteBox").textContent = q;
  $("moodQuote").textContent = q;
}

/* -------------------- Firestore paths -------------------- */
function col(uid, name) { return collection(db, "users", uid, name); }

/* -------------------- ToDo -------------------- */
let taskAddLock = false;

async function loadTasks(uid) {
  const qy = query(col(uid, "tasks"), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);
  const list = $("taskList");
  list.innerHTML = "";
  let countOpen = 0;

  let i = 1;
  snap.forEach(d => {
    const t = d.data();
    if (!t.done) countOpen++;
    const pr = (t.priority || "Medium");
    const tagClass = pr === "High" ? "high" : pr === "Low" ? "low" : "med";
    const due = [t.date || "", t.time || ""].filter(Boolean).join(" ");
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div style="font-weight:700">${i}. ${escapeHtml(t.name || "")}</div>
        <div class="muted small">${escapeHtml(due || "No due time")}</div>
        <div class="tag ${tagClass}">${escapeHtml(pr)}</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn btn-ghost" data-done="${d.id}"><i data-lucide="check"></i></button>
        <button class="btn btn-danger" data-del="${d.id}"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    list.appendChild(el);
    i++;
  });

  $("tileTasks").textContent = String(countOpen);
  lucide.createIcons();

  list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    await deleteDoc(doc(db, "users", uid, "tasks", b.dataset.del));
    toast("Deleted");
    await loadTasks(uid);
  }));

  list.querySelectorAll("[data-done]").forEach(b => b.addEventListener("click", async () => {
    const ref = doc(db, "users", uid, "tasks", b.dataset.done);
    const snap = await getDoc(ref);
    const cur = snap.data();
    await updateDoc(ref, { done: !cur.done });
    toast(cur.done ? "Marked undone" : "Done ✅");
    await loadTasks(uid);
  }));
}

$("addTaskBtn").addEventListener("click", async () => {
  if (taskAddLock) return; // prevents double-add
  taskAddLock = true;
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const name = $("taskName").value.trim();
    const priority = $("taskPriority").value;
    const date = $("taskDate").value;
    const time = $("taskTime").value;

    if (!name) { toast("Enter a task name"); return; }

    await addDoc(col(uid, "tasks"), {
      name, priority, date, time,
      done: false,
      createdAt: serverTimestamp()
    });

    $("taskName").value = "";
    toast("Task added ✅");
    await loadTasks(uid);
  } finally {
    taskAddLock = false;
  }
});

$("todoReset").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const snap = await getDocs(col(uid, "tasks"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  toast("To-Do cleared");
  await loadTasks(uid);
});

/* -------------------- Notes (with EDIT) -------------------- */
let editingNoteId = null;

function setEditHint() {
  $("editHint").textContent = editingNoteId ? "Editing existing note (Save to update)" : "";
}

async function loadNotes(uid) {
  const qy = query(col(uid, "notes"), orderBy("updatedAt", "desc"));
  const snap = await getDocs(qy);
  const list = $("notesList");
  list.innerHTML = "";

  snap.forEach(d => {
    const n = d.data();
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div style="font-weight:700">${escapeHtml(n.title || "Untitled")}</div>
        <div class="muted small">${new Date(n.updatedAt?.toDate?.() || Date.now()).toLocaleString()}</div>
        <div class="muted small">${escapeHtml((n.body || "").slice(0, 120))}${(n.body || "").length > 120 ? "…" : ""}</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn btn-ghost" data-edit="${d.id}"><i data-lucide="pencil"></i></button>
        <button class="btn btn-danger" data-del="${d.id}"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    list.appendChild(el);
  });

  lucide.createIcons();

  list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    await deleteDoc(doc(db, "users", uid, "notes", b.dataset.del));
    toast("Deleted");
    if (editingNoteId === b.dataset.del) {
      editingNoteId = null;
      $("noteTitle").value = "";
      $("noteBody").value = "";
      setEditHint();
    }
    await loadNotes(uid);
  }));

  list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", async () => {
    const ref = doc(db, "users", uid, "notes", b.dataset.edit);
    const snap = await getDoc(ref);
    const n = snap.data();
    editingNoteId = b.dataset.edit;
    $("noteTitle").value = n.title || "";
    $("noteBody").value = n.body || "";
    setEditHint();
    toast("Editing note ✍️");
  }));
}

$("saveNoteBtn").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const title = $("noteTitle").value.trim();
  const body = $("noteBody").value.trim();
  if (!title && !body) return toast("Write something first.");

  if (editingNoteId) {
    await updateDoc(doc(db, "users", uid, "notes", editingNoteId), {
      title, body, updatedAt: serverTimestamp()
    });
    toast("Note updated ✅");
  } else {
    await addDoc(col(uid, "notes"), {
      title, body, updatedAt: serverTimestamp()
    });
    toast("Note saved ✅");
  }

  editingNoteId = null;
  setEditHint();
  $("noteTitle").value = "";
  $("noteBody").value = "";
  await loadNotes(uid);
});

$("clearNoteBtn").addEventListener("click", () => {
  editingNoteId = null;
  setEditHint();
  $("noteTitle").value = "";
  $("noteBody").value = "";
});

$("notesReset").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const snap = await getDocs(col(uid, "notes"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  toast("Notes cleared");
  await loadNotes(uid);
});

$("noteSearch").addEventListener("input", () => {
  const q = $("noteSearch").value.trim().toLowerCase();
  document.querySelectorAll("#notesList .item").forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

$("saveQuickNote").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const body = $("quickNote").value.trim();
  if (!body) return toast("Write something first.");
  await addDoc(col(uid, "notes"), { title: "Quick Note", body, updatedAt: serverTimestamp() });
  $("quickNote").value = "";
  toast("Saved to Notes ✅");
  await loadNotes(uid);
});

/* -------------------- Finance (stacked services + custom expenses) -------------------- */
let financeChart = null;

function sum(arr) { return arr.reduce((a,b) => a + Number(b.amount || 0), 0); }

function renderChips(el, items, onRemove) {
  el.innerHTML = "";
  items.forEach((x, idx) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${escapeHtml(x.name)}: ${fmtMoney(x.amount)}</span>
      <button title="Remove" data-i="${idx}">✕</button>
    `;
    chip.querySelector("button").addEventListener("click", () => onRemove(idx));
    el.appendChild(chip);
  });
}

let finServices = [];
let finCustoms = [];

$("addServiceBtn").addEventListener("click", () => {
  const name = $("serviceName").value;
  const amount = Number($("serviceAmount").value || 0);
  if (!amount || amount < 0) return toast("Enter service amount");

  // If service already exists, update amount instead of duplicate
  const ex = finServices.find(s => s.name === name);
  if (ex) ex.amount = amount;
  else finServices.push({ name, amount });

  $("serviceAmount").value = "";
  renderChips($("serviceChips"), finServices, (i) => {
    finServices.splice(i,1);
    renderChips($("serviceChips"), finServices, arguments.callee);
    recalcFinancePreview();
  });
  recalcFinancePreview();
  toast("Added subscription ✅");
});

$("addCustomBtn").addEventListener("click", () => {
  const name = $("customName").value.trim();
  const amount = Number($("customAmount").value || 0);
  if (!name) return toast("Enter expense name");
  if (!amount || amount < 0) return toast("Enter amount");

  finCustoms.push({ name, amount });
  $("customName").value = "";
  $("customAmount").value = "";

  renderChips($("customChips"), finCustoms, (i) => {
    finCustoms.splice(i,1);
    renderChips($("customChips"), finCustoms, arguments.callee);
    recalcFinancePreview();
  });
  recalcFinancePreview();
  toast("Added expense ✅");
});

function recalcFinancePreview() {
  const balance = Number($("finBalance").value || 0);
  const daily = Number($("finDaily").value || 0);

  const servicesTotal = sum(finServices);
  const customsTotal = sum(finCustoms);
  const dailyTotalMonth = daily * 30; // daily expense per day -> monthly
  const expenses = servicesTotal + customsTotal + dailyTotalMonth;
  const savings = balance - expenses;
  const dailyBudget = (balance - expenses) / 30; // as requested

  $("statBalance").textContent = fmtMoney(balance);
  $("statExpenses").textContent = fmtMoney(expenses);
  $("statSavings").textContent = fmtMoney(savings);
  $("statDailyBudget").textContent = fmtMoney(dailyBudget);

  // home tiles
  $("tileSavings").textContent = fmtMoney(savings);

  const labels = ["Balance", "Expenses", "Savings"];
  const data = [balance, expenses, savings];

  if (financeChart) financeChart.destroy();
  financeChart = new Chart($("financeChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "PKR", data }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { color: getComputedStyle(document.body).color } },
                x: { ticks: { color: getComputedStyle(document.body).color } } }
    }
  });
}

["finBalance","finDaily","finMonth"].forEach(id => {
  $(id).addEventListener("input", recalcFinancePreview);
});

$("saveFinanceBtn").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;

  const month = $("finMonth").value;
  if (!month) return toast("Choose month");

  const balance = Number($("finBalance").value || 0);
  const daily = Number($("finDaily").value || 0);

  const servicesTotal = sum(finServices);
  const customsTotal = sum(finCustoms);
  const dailyTotalMonth = daily * 30;
  const expenses = servicesTotal + customsTotal + dailyTotalMonth;
  const savings = balance - expenses;

  await setDoc(doc(db, "users", uid, "finance", month), {
    month,
    balance,
    daily,
    services: finServices,
    customs: finCustoms,
    expenses,
    savings,
    updatedAt: serverTimestamp()
  });

  toast("Finance saved ✅");
  $("tileSavings").textContent = fmtMoney(savings);
});

$("financeReset").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const snap = await getDocs(col(uid, "finance"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  finServices = []; finCustoms = [];
  renderChips($("serviceChips"), [], () => {});
  renderChips($("customChips"), [], () => {});
  toast("Finance cleared");
  recalcFinancePreview();
});

/* -------------------- Plans -------------------- */
async function loadPlans(uid) {
  const qy = query(col(uid, "plans"), orderBy("createdAt", "desc"));
  const snap = await getDocs(qy);
  const list = $("plansList");
  list.innerHTML = "";
  let i = 1;

  snap.forEach(d => {
    const p = d.data();
    const when = [p.date, p.time].filter(Boolean).join(" ");
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div style="font-weight:700">${i}. ${escapeHtml(p.type || "Plan")}</div>
        <div class="muted small">${escapeHtml(when || "")}</div>
        <div class="muted small">${escapeHtml(p.desc || "")}</div>
        <div class="muted small">Funds: ${fmtMoney(p.funds || 0)}</div>
      </div>
      <button class="btn btn-danger" data-del="${d.id}"><i data-lucide="trash-2"></i></button>
    `;
    list.appendChild(el);
    i++;
  });

  lucide.createIcons();
  list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    await deleteDoc(doc(db, "users", uid, "plans", b.dataset.del));
    toast("Deleted");
    await loadPlans(uid);
  }));
}

$("savePlanBtn").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const type = $("planType").value;
  const date = $("planDate").value;
  const time = $("planTime").value;
  const desc = $("planDesc").value.trim();
  const funds = Number($("planFunds").value || 0);
  const place = $("planPlace").value.trim();

  await addDoc(col(uid, "plans"), { type, date, time, desc, funds, place, createdAt: serverTimestamp() });

  if (place) $("mapFrame").src = `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed`;

  $("planDesc").value = "";
  $("planFunds").value = "";
  toast("Plan saved ✅");
  await loadPlans(uid);
});

$("plansReset").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const snap = await getDocs(col(uid, "plans"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  toast("Plans cleared");
  await loadPlans(uid);
});

/* -------------------- Water -------------------- */
async function loadWater(uid) {
  const today = getTodayKey();
  const ref = doc(db, "users", uid, "water", today);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { target: 2000, total: 0 };
  const target = Number(data.target || 2000);
  const total = Number(data.total || 0);

  $("waterTarget").value = target;
  $("waterToday").textContent = `${total} ml`;
  const pct = target ? Math.min(100, Math.round((total / target) * 100)) : 0;
  $("waterPct").textContent = `${pct}%`;
  $("tileWater").textContent = `${pct}%`;

  // cups visual (8 cups = 2000ml default, each 250ml)
  const cups = 8;
  const perCup = Math.max(250, Math.round(target / cups));
  const filledCups = Math.floor(total / perCup);
  const grid = $("cupsGrid");
  grid.innerHTML = "";
  for (let i = 0; i < cups; i++) {
    const cup = document.createElement("div");
    cup.className = "cup";
    if (pct >= 100) cup.classList.add("gold");
    else if (i < filledCups) cup.style.opacity = "1";
    else cup.style.opacity = "0.55";
    grid.appendChild(cup);
  }

  // history (last 7 days)
  const list = $("waterHistory");
  list.innerHTML = "";
  const snapAll = await getDocs(col(uid, "water"));
  const rows = snapAll.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (a.id > b.id ? -1 : 1))
    .slice(0, 7);

  rows.forEach(r => {
    const el = document.createElement("div");
    el.className = "item";
    const p = r.target ? Math.round((r.total / r.target) * 100) : 0;
    el.innerHTML = `
      <div class="meta">
        <div style="font-weight:700">${escapeHtml(r.id)}</div>
        <div class="muted small">${r.total || 0} ml / ${r.target || 0} ml (${p}%)</div>
      </div>
    `;
    list.appendChild(el);
  });
}

async function addWater(uid, inc) {
  const today = getTodayKey();
  const ref = doc(db, "users", uid, "water", today);
  const snap = await getDoc(ref);
  const target = Number($("waterTarget").value || 2000);

  if (!snap.exists()) {
    await setDoc(ref, { target, total: inc, updatedAt: serverTimestamp() });
  } else {
    const cur = snap.data();
    const total = Number(cur.total || 0) + inc;
    await updateDoc(ref, { target, total, updatedAt: serverTimestamp() });
  }
  toast(`+${inc}ml ✅`);
  await loadWater(uid);
}

$("addWater250").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  await addWater(uid, 250);
});
$("addWater500").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  await addWater(uid, 500);
});
$("waterTarget").addEventListener("change", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const today = getTodayKey();
  const ref = doc(db, "users", uid, "water", today);
  const snap = await getDoc(ref);
  const target = Number($("waterTarget").value || 2000);
  if (!snap.exists()) await setDoc(ref, { target, total: 0, updatedAt: serverTimestamp() });
  else await updateDoc(ref, { target, updatedAt: serverTimestamp() });
  toast("Target updated");
  await loadWater(uid);
});
$("waterReset").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const snap = await getDocs(col(uid, "water"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  toast("Water cleared");
  await loadWater(uid);
});

/* -------------------- Mood (analytics) -------------------- */
const MOODS = [
  { label: "Amazing", score: 5, icon: "😄" },
  { label: "Good", score: 4, icon: "🙂" },
  { label: "Okay", score: 3, icon: "😐" },
  { label: "Low", score: 2, icon: "😞" },
  { label: "Stressed", score: 1, icon: "😣" },
];

let moodSelected = null;
let moodChart = null;

function renderMoodButtons() {
  const wrap = $("moodButtons");
  wrap.innerHTML = "";
  MOODS.forEach(m => {
    const b = document.createElement("button");
    b.className = "moodBtn";
    b.innerHTML = `<span>${m.icon}</span><span>${m.label}</span>`;
    b.addEventListener("click", () => {
      moodSelected = m;
      document.querySelectorAll(".moodBtn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    });
    wrap.appendChild(b);
  });
}

async function loadMood(uid) {
  const today = getTodayKey();
  const qy = query(col(uid, "mood"), orderBy("date", "desc"));
  const snap = await getDocs(qy);
  const list = $("moodHistory");
  list.innerHTML = "";

  const rows = snap.docs.map(d => d.data()).slice(0, 14);
  const last7 = [...rows].slice(0,7).reverse();

  // streak
  let streak = 0;
  let cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0,10);
    if (rows.some(r => r.date === key)) streak++;
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  $("moodStreak").textContent = `Streak: ${streak}`;

  // home tile for today
  const todayRow = rows.find(r => r.date === today);
  $("tileMood").textContent = todayRow ? todayRow.mood : "—";
  $("heroMood").textContent = todayRow ? todayRow.mood : "—";

  // list
  rows.forEach(r => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div style="font-weight:700">${escapeHtml(r.date)} • ${escapeHtml(r.mood)}</div>
        <div class="muted small">${escapeHtml(r.note || "")}</div>
      </div>
    `;
    list.appendChild(el);
  });

  // chart
  const labels = last7.map(r => r.date.slice(5));
  const data = last7.map(r => r.score);
  if (moodChart) moodChart.destroy();
  moodChart = new Chart($("moodChart"), {
    type: "line",
    data: { labels, datasets: [{ label: "Mood", data, tension: 0.35 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 5 } }
    }
  });

  // also update home tiles
  await loadTasks(uid);
  await loadWater(uid);
}

$("saveMoodBtn").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  if (!moodSelected) return toast("Select a mood first");
  const date = getTodayKey();
  const note = $("moodNote").value.trim();

  await setDoc(doc(db, "users", uid, "mood", date), {
    date,
    mood: moodSelected.label,
    score: moodSelected.score,
    note,
    updatedAt: serverTimestamp()
  });

  $("moodNote").value = "";
  toast("Mood saved ✅");
  await loadMood(uid);
});

$("moodReset").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const snap = await getDocs(col(uid, "mood"));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  toast("Mood cleared");
  await loadMood(uid);
});

/* -------------------- Focus (real fullscreen) -------------------- */
let focusSeconds = 25 * 60;
let focusInterval = null;

function renderFocus() {
  const m = String(Math.floor(focusSeconds / 60)).padStart(2, "0");
  const s = String(focusSeconds % 60).padStart(2, "0");
  $("focusTimer").textContent = `${m}:${s}`;
  $("heroFocus").textContent = focusInterval ? "Running" : "Ready";
}

$("focusStart").addEventListener("click", () => {
  if (focusInterval) return;
  focusInterval = setInterval(() => {
    focusSeconds--;
    if (focusSeconds <= 0) {
      clearInterval(focusInterval);
      focusInterval = null;
      focusSeconds = 0;
      toast("Focus complete ✅");
    }
    renderFocus();
  }, 1000);
  toast("Focus started");
  renderFocus();
});

$("focusPause").addEventListener("click", () => {
  if (focusInterval) {
    clearInterval(focusInterval);
    focusInterval = null;
    toast("Paused");
    renderFocus();
  }
});

$("focusReset").addEventListener("click", () => {
  clearInterval(focusInterval);
  focusInterval = null;
  focusSeconds = 25 * 60;
  toast("Reset");
  renderFocus();
});

$("enterFullscreen").addEventListener("click", async () => {
  try {
    await document.documentElement.requestFullscreen();
    toast("Fullscreen ✅");
  } catch {
    toast("Fullscreen not allowed by browser");
  }
});
$("exitFocus").addEventListener("click", () => nav("home"));

/* -------------------- AI Friend (Gemini via server route) -------------------- */
async function loadFriendSettings(uid) {
  const ref = doc(db, "users", uid, "settings", "friend");
  const snap = await getDoc(ref);
  const d = snap.exists() ? snap.data() : { name: "Nova", lang: "English", avatar: "minimal", bio: "" };

  $("friendName").value = d.name || "Nova";
  $("friendLang").value = d.lang || "English";
  $("friendAvatar").value = d.avatar || "minimal";
  $("userBio").value = d.bio || "";
}

$("saveFriendSettings").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  await setDoc(doc(db, "users", uid, "settings", "friend"), {
    name: $("friendName").value.trim() || "Nova",
    lang: $("friendLang").value,
    avatar: $("friendAvatar").value,
    bio: $("userBio").value.trim(),
    updatedAt: serverTimestamp()
  });
  toast("Saved ✅");
});

function addChat(role, text) {
  const box = $("chatBox");
  const el = document.createElement("div");
  el.className = `msg ${role === "me" ? "me" : "ai"}`;
  el.textContent = text;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

async function buildDashboardSummary(uid) {
  // Small summary to send to AI (not your full data dump)
  // Tasks count
  const tasksSnap = await getDocs(col(uid, "tasks"));
  let open = 0;
  tasksSnap.forEach(d => { if (!d.data().done) open++; });

  // Today's mood
  const today = getTodayKey();
  const moodSnap = await getDoc(doc(db, "users", uid, "mood", today));
  const mood = moodSnap.exists() ? moodSnap.data().mood : "Unknown";

  // Today's water
  const waterSnap = await getDoc(doc(db, "users", uid, "water", today));
  const water = waterSnap.exists() ? `${waterSnap.data().total}ml` : "0ml";

  return { openTasks: open, moodToday: mood, waterToday: water };
}

$("sendChat").addEventListener("click", async () => {
  const uid = auth.currentUser?.uid; if (!uid) return;
  const msg = $("chatInput").value.trim();
  if (!msg) return;

  $("chatInput").value = "";
  addChat("me", msg);

  try {
    const friendRef = doc(db, "users", uid, "settings", "friend");
    const friendSnap = await getDoc(friendRef);
    const f = friendSnap.exists() ? friendSnap.data() : { name:"Nova", lang:"English", bio:"" };

    const summary = await buildDashboardSummary(uid);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        message: msg,
        friendName: f.name || "Nova",
        language: f.lang || "English",
        userBio: f.bio || "",
        dashboardSummary: summary
      })
    });

    if (!res.ok) {
      addChat("ai", "AI is not ready yet. Deploy to Vercel and set GEMINI_API_KEY.");
      return;
    }

    const data = await res.json();
    addChat("ai", data.reply || "…");
  } catch (e) {
    addChat("ai", "AI is not ready yet. Deploy to Vercel and set GEMINI_API_KEY.");
  }
});

$("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("sendChat").click();
});

/* -------------------- Startup -------------------- */
function updateClock() {
  const now = new Date();
  $("clockPill").textContent = now.toLocaleString();
  $("heroToday").textContent = now.toLocaleDateString();
}
setInterval(updateClock, 1000);
updateClock();
$("ramadanPill").textContent = islamicDateString();
updateWeather();
setQuote();

/* -------------------- Auth State -------------------- */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    show("authView");
    hide("appView");
    $("logoutBtn").classList.add("hidden"); // only show when logged in
    return;
  }

  $("logoutBtn").classList.remove("hidden");
  hide("authView");
  show("appView");

  // profile
  const profile = await ensureProfile(user.uid);
  const theme = profile.theme || localStorage.getItem("theme") || "dark";
  setTheme(theme);

  // Load display name
  const display = profile.displayName?.trim() || "";
  $("displayName").value = display;

  const finalName = display || "Turail";
  $("brandTitle").textContent = `${finalName}'s Personal Dashboard`;
  $("welcomeTitle").textContent = `Welcome, ${finalName} ✨`;
  $("welcomeSubtitle").textContent = "Designed to feel calm, premium, and fast.";

  // Settings save name
  $("displayName").addEventListener("change", async () => {
    const val = $("displayName").value.trim();
    await saveProfile(user.uid, { displayName: val });
    $("brandTitle").textContent = `${(val || "Turail")}'s Personal Dashboard`;
    $("welcomeTitle").textContent = `Welcome, ${(val || "Turail")} ✨`;
    toast("Name updated ✅");
  });

  // Save theme to Firestore too
  const themeSaver = async () => {
    const t = localStorage.getItem("theme") || "dark";
    await saveProfile(user.uid, { theme: t });
  };
  $("themeLight").addEventListener("click", themeSaver);
  $("themeDark").addEventListener("click", themeSaver);
  $("themeBtn").addEventListener("click", themeSaver);

  // init modules
  initNavButtons();
  renderMoodButtons();
  setEditHint();

  // default month in finance
  const d = new Date();
  $("finMonth").value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  $("taskDate").value = getTodayKey();

  // load data
  await loadTasks(user.uid);
  await loadNotes(user.uid);
  await loadPlans(user.uid);
  await loadWater(user.uid);
  await loadMood(user.uid);
  await loadFriendSettings(user.uid);

  recalcFinancePreview();

  // nav by hash
  const hash = (window.location.hash || "#home").replace("#","");
  nav(views[hash] ? hash : "home");

  toast("You're in ✅");
});

/* -------------------- utils -------------------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

window.addEventListener("hashchange", () => {
  const hash = (window.location.hash || "#home").replace("#","");
  if (views[hash]) nav(hash);
});
const avatarWrap = document.getElementById("avatarWrap");
const avatarInput = document.getElementById("avatarInput");
const userAvatar = document.getElementById("userAvatar");

if (avatarWrap && avatarInput && userAvatar) {

  avatarWrap.addEventListener("click", () => {
    avatarInput.click();
  });

  avatarInput.addEventListener("change", async () => {
    const file = avatarInput.files[0];
    if (!file) return;

    const uid = window.__firebase.auth.currentUser.uid;

    const storageRef = ref(
      window.__firebase.storage,
      "avatars/" + uid + ".jpg"
    );

    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    userAvatar.src = url;

    // Save URL in Firestore
    const { doc, setDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js"
    );

    await setDoc(
      doc(window.__firebase.db, "users", uid),
      { photoURL: url },
      { merge: true }
    );
  });

}