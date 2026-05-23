// shared/kalendarz.js
//
// MANA — wspólny komponent-widok KALENDARZ
//
// Zasada "DANE != WIDOK": kafel EVENT to DANE, kalendarz to WIDOK.
// Reużywalny: Horyzont, Puls (kalendarz wizyt)...
//
// 23.05.2026 — ETAP 2b: logika kalendarza wyjęta z horyzont.js.
// 23.05.2026 — wydarzenia całodzienne: osobny pasek na górze, poza siatką
//   godzin, przyklejony (sticky) razem z nagłówkiem daty.
//
// Komponent zakłada szkielet DOM (w mana-app: index.html):
//   nawigacja: .m-toggle[data-view], #m-prev #m-today #m-next #m-period-label
//   widoki:    #m-view-day #m-view-week #m-view-month
//   status:    #m-status
//
// Wygląd: shared/kalendarz.css. Kolory przez tokeny --m-*.
//
// Użycie:
//   const kal = montujKalendarz({
//     zaladujEventy: async (from, to) => ({ ok, events, error }),
//     onSlotClick:   (date, opcje) => { ... },   // opcje.calyDzien = true gdy pasek całodzienny
//     onEventClick:  (event) => { ... },
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

/* ============================================================
   POMOCNICZE — daty (czyste funkcje)
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
function fmtTime(d) { return d.toTimeString().slice(0, 5); }
function fmtDateLabel(d) { return `${d.getDate()} ${MIESIACE[d.getMonth()]} ${d.getFullYear()}`; }

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---- karta eventu (czysta funkcja) ----
   Wydarzenie całodzienne: bez godziny. */

function renderEventCard(ev) {
  const tytul = escapeHtml(ev.tytul || "");
  const klasa = ev.caly_dzien ? "m-event m-event--allday" : "m-event";
  const czas = ev.caly_dzien
    ? ""
    : `<span class="m-event__time">${fmtTime(new Date(ev.data_czas))}</span>`;
  return `<a class="${klasa}" data-event-id="${ev.id}" title="${tytul}">${czas}${tytul}</a>`;
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

  /* ---- podział eventów: całodzienne / godzinowe ---- */

  function calodzienneDnia(d) {
    return state.events.filter((e) => e.caly_dzien && isSameDay(new Date(e.data_czas), d));
  }
  function godzinoweWZakresie(from, to) {
    return state.events.filter((e) => {
      if (e.caly_dzien) return false;
      const t = new Date(e.data_czas);
      return t >= from && t < to;
    });
  }

  /* ---- status ---- */

  function setStatus(msg) {
    const el = document.getElementById("m-status");
    if (el) el.textContent = msg || "";
  }

  /* ---- zakres widoku ---- */

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

  /* ---- pobranie eventów ---- */

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

  /* ---- render — wybór widoku ---- */

  function render() {
    ["day", "week", "month"].forEach((v) => {
      const panel = document.getElementById(`m-view-${v}`);
      if (panel) panel.hidden = (v !== state.view);
    });

    document.querySelectorAll(".m-toggle").forEach((btn) => {
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

  /* ---- render DZIEŃ ---- */

  function renderDay() {
    const panel = document.getElementById("m-view-day");
    const day = state.refDate;
    const dayStart = startOfDay(day);

    // pasek całodzienny (sticky)
    const calodzienne = calodzienneDnia(day);
    const head = `
      <div class="day-head">
        <div class="day-allday">
          <div class="day-allday__label">cały dzień</div>
          <div class="day-allday__cell" data-slot-time="${dayStart.toISOString()}" data-allday="1">
            ${calodzienne.map(renderEventCard).join("")}
          </div>
        </div>
      </div>`;

    // ciało — godziny
    let body = `<div class="day-body">`;
    for (const h of GODZINY) {
      const slotStart = new Date(dayStart);
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(h + 1);
      const evs = godzinoweWZakresie(slotStart, slotEnd);
      body += `
        <div class="day-row">
          <div class="day-hour">${String(h).padStart(2, "0")}:00</div>
          <div class="day-slot" data-slot-time="${slotStart.toISOString()}">
            ${evs.map(renderEventCard).join("")}
          </div>
        </div>`;
    }
    body += `</div>`;

    panel.innerHTML = `<div class="day-view">${head}${body}</div>`;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    renderNowLine(panel, "day");
    maybeInitialScroll(panel, "day");
  }

  /* ---- render TYDZIEŃ ---- */

  function renderWeek() {
    const panel = document.getElementById("m-view-week");
    const weekStart = startOfWeek(state.refDate);
    const dni = [];
    for (let i = 0; i < 7; i++) dni.push(addDays(weekStart, i));

    // nagłówek dat
    let header = `<div class="week-header"><div></div>`;
    for (let i = 0; i < 7; i++) {
      const d = dni[i];
      const todayClass = isToday(d) ? "week-header__day-num--today" : "";
      header += `
        <div>
          ${DNI_KROTKO[i]}
          <span class="week-header__day-num ${todayClass}">${d.getDate()}</span>
        </div>`;
    }
    header += `</div>`;

    // pasek całodzienny
    let allday = `<div class="week-allday"><div class="week-allday__label">cały dzień</div>`;
    for (let i = 0; i < 7; i++) {
      const d = dni[i];
      const evs = calodzienneDnia(d);
      allday += `
        <div class="week-allday__cell" data-slot-time="${startOfDay(d).toISOString()}" data-allday="1">
          ${evs.map(renderEventCard).join("")}
        </div>`;
    }
    allday += `</div>`;

    // ciało — godziny
    let body = "";
    for (const h of GODZINY) {
      body += `<div class="week-hour">${String(h).padStart(2, "0")}:00</div>`;
      for (let i = 0; i < 7; i++) {
        const cellStart = new Date(dni[i]);
        cellStart.setHours(h, 0, 0, 0);
        const cellEnd = new Date(cellStart);
        cellEnd.setHours(h + 1);
        const evs = godzinoweWZakresie(cellStart, cellEnd);
        body += `
          <div class="week-cell" data-slot-time="${cellStart.toISOString()}">
            ${evs.map(renderEventCard).join("")}
          </div>`;
      }
    }

    panel.innerHTML = `
      <div class="week-grid">
        <div class="week-head">${header}${allday}</div>
        <div class="week-body">${body}</div>
      </div>`;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    renderNowLine(panel, "week");
    maybeInitialScroll(panel, "week");
  }

  /* ---- render MIESIĄC ---- */

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
        const otherClass = isOther ? "month-cell--other" : "";

        const eventsToday = state.events.filter((ev) => isSameDay(new Date(ev.data_czas), d));
        const visible = eventsToday.slice(0, 2);
        const more = eventsToday.length - visible.length;

        html += `
          <div class="month-cell ${otherClass}" data-slot-time="${startOfDay(d).toISOString()}">
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
  }

  /* ---- czerwona linia "teraz" (Dzień + Tydzień) ---- */

  function renderNowLine(panel, view) {
    panel.querySelectorAll(".m-now-line, .m-now-label").forEach((e) => e.remove());

    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (h < GODZINY[0] || h > GODZINY[GODZINY.length - 1]) return;

    let proby = 0;
    const rysuj = () => {
      let cell = null;
      if (view === "day") {
        const slots = panel.querySelectorAll(".day-slot");
        cell = slots[h - GODZINY[0]] || null;
      } else if (view === "week") {
        const weekStart = startOfWeek(state.refDate);
        const dayIdx = Math.round((startOfDay(now) - weekStart) / 86400000);
        if (dayIdx < 0 || dayIdx > 6) return;
        const cells = panel.querySelectorAll(".week-cell");
        cell = cells[(h - GODZINY[0]) * 7 + dayIdx] || null;
      }
      if (!cell) return;

      const cellRect = cell.getBoundingClientRect();
      if (cellRect.height === 0 && proby < 10) {
        proby++;
        requestAnimationFrame(rysuj);
        return;
      }

      panel.style.position = "relative";
      const panelRect = panel.getBoundingClientRect();
      const wysWiersza = cellRect.height || (view === "day" ? 56 : 44);
      const top = (cellRect.top - panelRect.top) + (m / 60) * wysWiersza;
      const left = cellRect.left - panelRect.left;
      const width = cellRect.width || panel.clientWidth;

      const line = document.createElement("div");
      line.className = "m-now-line";
      line.style.cssText =
        `position:absolute; top:${top}px; left:${left}px; width:${width}px;` +
        `height:2px; background:var(--m-dzis, #dc2626); z-index:5; pointer-events:none;`;
      const dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute; left:-4px; top:-3px; width:8px; height:8px;` +
        `border-radius:50%; background:var(--m-dzis, #dc2626);`;
      line.appendChild(dot);

      const label = document.createElement("div");
      label.className = "m-now-label";
      label.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      label.style.cssText =
        `position:absolute; top:${top - 8}px; left:2px;` +
        `font-family:var(--m-font-mono, monospace); font-size:10px; font-weight:600;` +
        `color:var(--m-dzis, #dc2626); background:var(--m-bg, #fff); padding:0 3px;` +
        `z-index:6; pointer-events:none;`;

      panel.appendChild(line);
      panel.appendChild(label);
    };

    requestAnimationFrame(rysuj);
  }

  /* ---- auto-scroll do aktualnej godziny (raz, przy otwarciu) ---- */

  function maybeInitialScroll(panel, view) {
    if (state.didInitialScroll) return;
    state.didInitialScroll = true;

    const now = new Date();
    const h = now.getHours();
    let cell = null;

    if (view === "day") {
      cell = panel.querySelectorAll(".day-slot")[h - GODZINY[0]] || null;
    } else if (view === "week") {
      const weekStart = startOfWeek(state.refDate);
      const dayIdx = Math.round((startOfDay(now) - weekStart) / 86400000);
      if (dayIdx < 0 || dayIdx > 6) return;
      cell = panel.querySelectorAll(".week-cell")[(h - GODZINY[0]) * 7 + dayIdx] || null;
    }

    if (cell) {
      requestAnimationFrame(() => {
        cell.scrollIntoView({ behavior: "auto", block: "center" });
      });
    }
  }

  /* ---- interakcje — klik na slot / event ---- */

  function attachSlotClicks(scope) {
    scope.querySelectorAll("[data-slot-time]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".m-event")) return;
        const iso = el.getAttribute("data-slot-time");
        const calyDzien = el.hasAttribute("data-allday");
        onSlotClick(new Date(iso), { calyDzien });
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

  /* ---- nawigacja ---- */

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

  /* ---- init — podpięcie przycisków szkieletu ---- */

  function init() {
    document.querySelectorAll(".m-toggle").forEach((btn) => {
      btn.addEventListener("click", async () => {
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

  /* ---- publiczne API instancji ---- */

  return {
    odswiez: reloadAndRender,
    get widok() { return state.view; },
  };
}
