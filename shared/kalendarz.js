// shared/kalendarz.js
//
// MANA — wspólny komponent-widok KALENDARZ
//
// Zasada "DANE != WIDOK": kafel EVENT to DANE, kalendarz to WIDOK.
// Reużywalny: Horyzont, Puls (kalendarz wizyt)...
//
// 23.05.2026 — ETAP 2b: komponent wydzielony z horyzont.js.
// 23.05.2026 — wydarzenia całodzienne: pasek na górze (sticky).
// 23.05.2026 — Paczka 1: klik w dzień → przejście do widoku Dnia.
// 23.05.2026 — Paczka 2: wydarzenia godzinowe jako BLOKI o wysokości
//   równej czasowi trwania; nakładające się wydarzenia obok siebie.
// 23.05.2026 — Z1: handler .m-toggle ignoruje widoki spoza kalendarza
//   (np. "zadania" — obsługuje go pokój Horyzont, nie ten komponent).
//
// Szkielet DOM (w mana-app: index.html):
//   .m-toggle[data-view], #m-prev #m-today #m-next #m-period-label
//   #m-view-day #m-view-week #m-view-month  #m-status
//
// Użycie:
//   const kal = montujKalendarz({
//     zaladujEventy: async (from, to) => ({ ok, events, error }),
//     onSlotClick:   (date, opcje) => {...},
//     onEventClick:  (event) => {...},
//     startowyWidok: "week",
//   });
//   kal.odswiez();

/* ============================================================
   STAŁE
   ============================================================ */

const MIESIACE = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

const DNI_KROTKO = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

const GODZINY = Array.from({ length: 24 }, (_, i) => i);

// Wysokość jednej godziny w px. MUSI być zgodna z kalendarz.css.
const H = 52;
// Minimalna wysokość bloku wydarzenia (żeby krótkie były klikalne).
const MIN_BLOK = 20;

/* ============================================================
   POMOCNICZE — daty
   ============================================================ */

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return x;
}
function endOfWeek(d) { const x = startOfWeek(d); x.setDate(x.getDate() + 6); return endOfDay(x); }
function startOfMonth(d) { return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)); }
function endOfMonth(d) { return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}
function isToday(d) { return isSameDay(d, new Date()); }
function pad2(n) { return String(n).padStart(2, "0"); }
function fmtTime(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtDateLabel(d) { return `${d.getDate()} ${MIESIACE[d.getMonth()]} ${d.getFullYear()}`; }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---- karta wydarzenia: statyczna (pasek całodzienny, miesiąc) ---- */

function renderEventCard(ev) {
  const tytul = escapeHtml(ev.tytul || "");
  const klasa = ev.caly_dzien ? "m-event m-event--allday" : "m-event";
  const czas = ev.caly_dzien
    ? ""
    : `<span class="m-event__time">${fmtTime(new Date(ev.data_czas))}</span>`;
  return `<a class="${klasa}" data-event-id="${ev.id}" title="${tytul}">${czas}${tytul}</a>`;
}

/* ---- blok wydarzenia godzinowego: pozycjonowany (Dzień / Tydzień) ---- */

function renderEventBlock(b) {
  const ev = b.ev;
  const tytul = escapeHtml(ev.tytul || "");
  const czas = fmtTime(new Date(ev.data_czas));
  const styl =
    `top:${b.topPx}px; height:${b.heightPx}px;` +
    `left:${b.leftPct}%; width:calc(${b.widthPct}% - 3px);`;
  return `<a class="m-event m-event--blok" data-event-id="${ev.id}" style="${styl}" `
       + `title="${czas} ${tytul}"><span class="m-event__time">${czas}</span>${tytul}</a>`;
}

/* ---- układ nakładających się wydarzeń ---- */

function ulozBloki(evs, dzien) {
  const dayStart = startOfDay(dzien).getTime();

  const items = evs.map((ev) => {
    const s = new Date(ev.data_czas).getTime();
    let e = ev.koniec ? new Date(ev.koniec).getTime() : s + 60 * 60000;
    if (e <= s) e = s + 30 * 60000;
    let startMin = (s - dayStart) / 60000;
    let endMin = (e - dayStart) / 60000;
    if (startMin < 0) startMin = 0;
    if (endMin > 1440) endMin = 1440;
    return { ev, startMin, endMin };
  });

  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = [];
    for (const it of cluster) {
      let li = lanes.findIndex((end) => end <= it.startMin);
      if (li === -1) { li = lanes.length; lanes.push(it.endMin); }
      else lanes[li] = it.endMin;
      it._lane = li;
    }
    const kol = lanes.length || 1;
    for (const it of cluster) {
      out.push({
        ev: it.ev,
        topPx: (it.startMin / 60) * H,
        heightPx: Math.max(((it.endMin - it.startMin) / 60) * H, MIN_BLOK),
        leftPct: (it._lane * 100) / kol,
        widthPct: 100 / kol,
      });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length) flush();

  return out;
}

/* ============================================================
   KOMPONENT — montujKalendarz
   ============================================================ */

export function montujKalendarz(opcje) {
  const {
    zaladujEventy,
    onSlotClick = () => {},
    onEventClick = () => {},
    startowyWidok = "week",
  } = opcje || {};

  if (typeof zaladujEventy !== "function") {
    throw new Error("montujKalendarz: wymagana funkcja zaladujEventy(from, to)");
  }

  const state = {
    view: ["day", "week", "month"].includes(startowyWidok) ? startowyWidok : "week",
    refDate: new Date(),
    events: [],
    didInitialScroll: false,
  };

  function calodzienneDnia(d) {
    return state.events.filter((e) => e.caly_dzien && isSameDay(new Date(e.data_czas), d));
  }
  function godzinoweDnia(d) {
    return state.events.filter((e) => !e.caly_dzien && isSameDay(new Date(e.data_czas), d));
  }

  function setStatus(msg) {
    const el = document.getElementById("m-status");
    if (el) el.textContent = msg || "";
  }

  function getViewRange() {
    const ref = state.refDate;
    switch (state.view) {
      case "day":   return { from: startOfDay(ref),  to: endOfDay(ref) };
      case "week":  return { from: startOfWeek(ref), to: endOfWeek(ref) };
      case "month": {
        const from = startOfWeek(startOfMonth(ref));
        const to = endOfWeek(endOfMonth(ref));
        return { from, to };
      }
    }
  }

  function getPeriodLabel() {
    const { from, to } = getViewRange();
    switch (state.view) {
      case "day":   return fmtDateLabel(from);
      case "week":  return `${from.getDate()} ${MIESIACE[from.getMonth()]} – ${to.getDate()} ${MIESIACE[to.getMonth()]} ${to.getFullYear()}`;
      case "month": return `${MIESIACE[state.refDate.getMonth()]} ${state.refDate.getFullYear()}`;
    }
  }

  async function loadEvents() {
    setStatus("Ładuję eventy…");
    const { from, to } = getViewRange();

    let wynik;
    try {
      wynik = await zaladujEventy(from, to);
    } catch (err) {
      console.error("kalendarz: zaladujEventy wyjątek:", err);
      setStatus(`Błąd: ${err.message}`);
      state.events = [];
      return;
    }

    if (!wynik || !wynik.ok) {
      const msg = (wynik && wynik.error) || "nie udało się pobrać eventów";
      console.error("kalendarz: loadEvents:", msg);
      setStatus(`Błąd: ${msg}`);
      state.events = [];
      return;
    }

    state.events = wynik.events || [];
    setStatus(state.events.length === 0
      ? "Brak eventów w tym zakresie. Kliknij + Nowy event lub puste miejsce w kalendarzu."
      : `${state.events.length} event(y) załadowane.`);
  }

  function render() {
    ["day", "week", "month"].forEach((v) => {
      const panel = document.getElementById(`m-view-${v}`);
      if (panel) panel.hidden = (v !== state.view);
    });

    document.querySelectorAll(".m-toggle").forEach((btn) => {
      if (!["day", "week", "month"].includes(btn.dataset.view)) return;
      btn.setAttribute("aria-pressed", btn.dataset.view === state.view ? "true" : "false");
    });

    const lbl = document.getElementById("m-period-label");
    if (lbl) lbl.textContent = getPeriodLabel();

    switch (state.view) {
      case "day":   renderDay(); break;
      case "week":  renderWeek(); break;
      case "month": renderMonth(); break;
    }
  }

  function renderDay() {
    const panel = document.getElementById("m-view-day");
    const day = state.refDate;
    const dayStart = startOfDay(day);

    const head = `
      <div class="day-head">
        <div class="day-allday">
          <div class="day-allday__label">cały dzień</div>
          <div class="day-allday__cell" data-slot-time="${dayStart.toISOString()}" data-allday="1">
            ${calodzienneDnia(day).map(renderEventCard).join("")}
          </div>
        </div>
      </div>`;

    let grid = `<div class="day-grid">`;
    for (const h of GODZINY) {
      const slot = new Date(dayStart);
      slot.setHours(h, 0, 0, 0);
      grid += `
        <div class="day-row">
          <div class="day-hour">${pad2(h)}:00</div>
          <div class="day-slot" data-slot-time="${slot.toISOString()}"></div>
        </div>`;
    }
    grid += `</div>`;

    const bloki = ulozBloki(godzinoweDnia(day), day);
    const overlay = `<div class="day-events">${bloki.map(renderEventBlock).join("")}</div>`;

    panel.innerHTML = `<div class="day-view">${head}<div class="day-body">${grid}${overlay}</div></div>`;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    attachGotoDay(panel);
    renderNowLine(panel, "day");
    maybeInitialScroll(panel, "day");
  }

  function renderWeek() {
    const panel = document.getElementById("m-view-week");
    const weekStart = startOfWeek(state.refDate);
    const dni = [];
    for (let i = 0; i < 7; i++) dni.push(addDays(weekStart, i));

    let header = `<div class="week-header"><div></div>`;
    for (let i = 0; i < 7; i++) {
      const d = dni[i];
      const todayCls = isToday(d) ? "week-header__day-num--today" : "";
      const selCls = isSameDay(d, state.refDate) ? " week-header__col--selected" : "";
      header += `
        <div class="week-header__col${selCls}" data-goto-day="${d.toISOString()}">
          ${DNI_KROTKO[i]}
          <span class="week-header__day-num ${todayCls}">${d.getDate()}</span>
        </div>`;
    }
    header += `</div>`;

    let allday = `<div class="week-allday"><div class="week-allday__label">cały dzień</div>`;
    for (let i = 0; i < 7; i++) {
      const d = dni[i];
      allday += `
        <div class="week-allday__cell" data-slot-time="${startOfDay(d).toISOString()}" data-allday="1">
          ${calodzienneDnia(d).map(renderEventCard).join("")}
        </div>`;
    }
    allday += `</div>`;

    let hoursCol = `<div class="week-hours">`;
    for (const h of GODZINY) hoursCol += `<div class="week-hour">${pad2(h)}:00</div>`;
    hoursCol += `</div>`;

    let dayCols = "";
    for (let i = 0; i < 7; i++) {
      const d = dni[i];
      let bg = `<div class="week-day-bg">`;
      for (const h of GODZINY) {
        const slot = new Date(d);
        slot.setHours(h, 0, 0, 0);
        bg += `<div class="week-cell" data-slot-time="${slot.toISOString()}"></div>`;
      }
      bg += `</div>`;
      const bloki = ulozBloki(godzinoweDnia(d), d);
      const overlay = `<div class="week-day-events">${bloki.map(renderEventBlock).join("")}</div>`;
      dayCols += `<div class="week-day-col">${bg}${overlay}</div>`;
    }

    panel.innerHTML = `
      <div class="week-grid">
        <div class="week-head">${header}${allday}</div>
        <div class="week-body">${hoursCol}${dayCols}</div>
      </div>`;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    attachGotoDay(panel);
    renderNowLine(panel, "week");
    maybeInitialScroll(panel, "week");
  }

  function renderMonth() {
    const panel = document.getElementById("m-view-month");
    const ref = state.refDate;
    const gridStart = startOfWeek(startOfMonth(ref));
    const gridEnd = endOfWeek(endOfMonth(ref));

    const totalDays = Math.round((gridEnd - gridStart) / (1000 * 60 * 60 * 24)) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);

    let html = `<div class="month-grid">`;
    for (const dn of DNI_KROTKO) {
      html += `<div class="month-header__day">${dn}</div>`;
    }

    for (let w = 0; w < totalWeeks; w++) {
      for (let i = 0; i < 7; i++) {
        const d = addDays(gridStart, w * 7 + i);
        const isOther = d.getMonth() !== ref.getMonth();
        const todayClass = isToday(d) ? "month-cell__num--today" : "";
        const otherClass = isOther ? " month-cell--other" : "";
        const selClass = isSameDay(d, state.refDate) ? " month-cell--selected" : "";

        const eventsToday = state.events.filter((ev) => isSameDay(new Date(ev.data_czas), d));
        const visible = eventsToday.slice(0, 2);
        const more = eventsToday.length - visible.length;

        html += `
          <div class="month-cell${otherClass}${selClass}" data-goto-day="${startOfDay(d).toISOString()}">
            <span class="month-cell__num ${todayClass}">${d.getDate()}</span>
            ${visible.map(renderEventCard).join("")}
            ${more > 0 ? `<span class="month-cell__more">+ ${more} więcej</span>` : ""}
          </div>`;
      }
    }
    html += `</div>`;

    panel.innerHTML = html;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    attachGotoDay(panel);
  }

  function renderNowLine(panel, view) {
    panel.querySelectorAll(".m-now-line, .m-now-label").forEach((e) => e.remove());

    const now = new Date();

    if (view === "day" && !isToday(state.refDate)) return;
    if (view === "week") {
      const ws = startOfWeek(state.refDate);
      const we = endOfWeek(state.refDate);
      if (now < ws || now > we) return;
    }

    const container = panel.querySelector(view === "day" ? ".day-body" : ".week-body");
    if (!container) return;

    const minutes = now.getHours() * 60 + now.getMinutes();
    const top = (minutes / 60) * H;
    const left = (view === "day") ? 64 : 56;

    const line = document.createElement("div");
    line.className = "m-now-line";
    line.style.cssText =
      `position:absolute; top:${top}px; left:${left}px; right:0;` +
      `height:2px; background:var(--m-dzis, #dc2626); z-index:5; pointer-events:none;`;
    const dot = document.createElement("div");
    dot.style.cssText =
      `position:absolute; left:-4px; top:-3px; width:8px; height:8px;` +
      `border-radius:50%; background:var(--m-dzis, #dc2626);`;
    line.appendChild(dot);

    const label = document.createElement("div");
    label.className = "m-now-label";
    label.textContent = fmtTime(now);
    label.style.cssText =
      `position:absolute; top:${top - 8}px; left:2px;` +
      `font-family:var(--m-font-mono, monospace); font-size:10px; font-weight:600;` +
      `color:var(--m-dzis, #dc2626); background:var(--m-bg, #fff); padding:0 3px;` +
      `z-index:6; pointer-events:none;`;

    container.appendChild(line);
    container.appendChild(label);
  }

  function maybeInitialScroll(panel, view) {
    if (state.didInitialScroll) return;
    state.didInitialScroll = true;

    const now = new Date();
    const h = isToday(state.refDate) ? now.getHours() : 8;
    let cell = null;

    if (view === "day") {
      cell = panel.querySelectorAll(".day-slot")[h] || null;
    } else if (view === "week") {
      const ws = startOfWeek(state.refDate);
      let idx = Math.round((startOfDay(now) - ws) / 86400000);
      if (idx < 0 || idx > 6) idx = 0;
      const col = panel.querySelectorAll(".week-day-col")[idx];
      if (col) cell = col.querySelectorAll(".week-cell")[h] || null;
    }

    if (cell) {
      requestAnimationFrame(() => cell.scrollIntoView({ behavior: "auto", block: "center" }));
    }
  }

  function attachSlotClicks(scope) {
    scope.querySelectorAll("[data-slot-time]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".m-event")) return;
        if (e.target.closest("[data-goto-day]")) return;
        const iso = el.getAttribute("data-slot-time");
        onSlotClick(new Date(iso), { calyDzien: el.hasAttribute("data-allday") });
      });
    });
  }

  function attachEventClicks(scope) {
    scope.querySelectorAll(".m-event").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.getAttribute("data-event-id");
        const ev = state.events.find((x) => x.id === id);
        if (ev) onEventClick(ev);
      });
    });
  }

  function attachGotoDay(scope) {
    scope.querySelectorAll("[data-goto-day]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        state.refDate = new Date(el.getAttribute("data-goto-day"));
        state.view = "day";
        state.didInitialScroll = false;
        reloadAndRender();
      });
    });
  }

  function shiftDate(direction) {
    const d = new Date(state.refDate);
    switch (state.view) {
      case "day":   d.setDate(d.getDate() + direction); break;
      case "week":  d.setDate(d.getDate() + direction * 7); break;
      case "month": d.setMonth(d.getMonth() + direction); break;
    }
    state.refDate = d;
  }

  async function reloadAndRender() {
    await loadEvents();
    render();
  }

  function init() {
    document.querySelectorAll(".m-toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
        // Z1: ignoruj widoki spoza kalendarza (np. "zadania" — obsługuje Horyzont).
        if (!["day", "week", "month"].includes(btn.dataset.view)) return;
        state.view = btn.dataset.view;
        state.didInitialScroll = false;
        await reloadAndRender();
      });
    });

    const prev = document.getElementById("m-prev");
    const next = document.getElementById("m-next");
    const today = document.getElementById("m-today");
    if (prev)  prev.addEventListener("click", async () => { shiftDate(-1); await reloadAndRender(); });
    if (next)  next.addEventListener("click", async () => { shiftDate(+1); await reloadAndRender(); });
    if (today) today.addEventListener("click", async () => {
      state.refDate = new Date();
      state.didInitialScroll = false;
      await reloadAndRender();
    });

    setInterval(() => {
      if (state.view === "day" || state.view === "week") {
        const panel = document.getElementById(`m-view-${state.view}`);
        if (panel && !panel.hidden) renderNowLine(panel, state.view);
      }
    }, 60000);

    reloadAndRender();
  }

  init();

  return {
    odswiez: reloadAndRender,
    get widok() { return state.view; },
  };
}
