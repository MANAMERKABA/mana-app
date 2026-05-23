// shared/kalendarz.js
//
// MANA — wspólny komponent-widok KALENDARZ
//
// Zasada "DANE != WIDOK" (kafel EVENT, 21.05): kafel EVENT to DANE
// (data, czas, typ, tytuł…). Kalendarz to WIDOK tych danych — ten plik.
// Te same eventy, różne pokoje: Horyzont = kalendarz prywatny,
// Puls = kalendarz wizyt. Komponent budujemy raz, pokoje go używają.
//
// 23.05.2026 — ETAP 2b: logika kalendarza wyjęta z rooms/horyzont/horyzont.js.
//
// Komponent zakłada, że strona dostarcza szkielet DOM (w mana-app: index.html):
//   nawigacja: .m-toggle[data-view="day|week|month"],
//              #m-prev #m-today #m-next #m-period-label
//   widoki:    #m-view-day #m-view-week #m-view-month
//   status:    #m-status
//
// Wygląd: shared/kalendarz.css. Kolory wyłącznie przez tokeny --m-*
// — zmiana motywu = zmiana tokenów, bez dotykania tego pliku.
//
// Użycie:
//   const kal = montujKalendarz({
//     zaladujEventy: async (from, to) => ({ ok, events, error }),
//     onSlotClick:   (date)  => { ... },   // klik w puste miejsce
//     onEventClick:  (event) => { ... },   // klik w istniejący event
//     startowyWidok: "week",               // opcjonalnie: day|week|month
//   });
//   kal.odswiez();   // ponowne pobranie eventów + render (po zapisie/usunięciu)

/* ============================================================
   STAŁE
   ============================================================ */

const MIESIACE = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

const DNI_KROTKO = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

// PEŁNA DOBA: 0..23 (24 godziny)
const GODZINY = Array.from({ length: 24 }, (_, i) => i);

/* ============================================================
   POMOCNICZE — daty (czyste funkcje, bez stanu)
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

/* ---- karta eventu (czysta funkcja) ---- */

function renderEventCard(ev) {
  const t = new Date(ev.data_czas);
  const time = fmtTime(t);
  const tytul = escapeHtml(ev.tytul || "");
  return `<a class="m-event" data-event-id="${ev.id}" title="${tytul}">
    <span class="m-event__time">${time}</span>${tytul}
  </a>`;
}

/* ============================================================
   KOMPONENT — montujKalendarz
   Każde wywołanie = osobna instancja z własnym stanem.
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

  /* ---- pobranie eventów (przez wstrzykniętą funkcję) ---- */

  async function loadEvents() {
    setStatus("Ładuję eventy…");
    const { from, to } = getViewRange();

    let wynik;
    try {
      wynik = await zaladujEventy(from, to);
    } catch (err) {
      console.error("kalendarz: zaladujEventy rzuciło wyjątek:", err);
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
    const dayStart = startOfDay(state.refDate);

    let html = `<div class="day-grid">`;
    for (const h of GODZINY) {
      const slotStart = new Date(dayStart);
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(h + 1);

      const eventsInSlot = state.events.filter((ev) => {
        const t = new Date(ev.data_czas);
        return t >= slotStart && t < slotEnd;
      });

      html += `
        <div class="day-row">
          <div class="day-hour">${String(h).padStart(2, "0")}:00</div>
          <div class="day-slot" data-slot-time="${slotStart.toISOString()}">
            ${eventsInSlot.map(renderEventCard).join("")}
          </div>
        </div>
      `;
    }
    html += `</div>`;

    panel.innerHTML = html;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    renderNowLine(panel, "day");
    maybeInitialScroll(panel, "day");
  }

  /* ---- render TYDZIEŃ ---- */

  function renderWeek() {
    const panel = document.getElementById("m-view-week");
    const weekStart = startOfWeek(state.refDate);

    let header = `<div class="week-header"><div></div>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const todayClass = isToday(d) ? "week-header__day-num--today" : "";
      header += `
        <div>
          ${DNI_KROTKO[i]}
          <span class="week-header__day-num ${todayClass}">${d.getDate()}</span>
        </div>
      `;
    }
    header += `</div>`;

    let body = "";
    for (const h of GODZINY) {
      body += `<div class="week-hour">${String(h).padStart(2, "0")}:00</div>`;
      for (let i = 0; i < 7; i++) {
        const cellStart = new Date(addDays(weekStart, i));
        cellStart.setHours(h, 0, 0, 0);
        const cellEnd = new Date(cellStart);
        cellEnd.setHours(h + 1);

        const eventsInCell = state.events.filter((ev) => {
          const t = new Date(ev.data_czas);
          return t >= cellStart && t < cellEnd;
        });

        body += `
          <div class="week-cell" data-slot-time="${cellStart.toISOString()}">
            ${eventsInCell.map(renderEventCard).join("")}
          </div>
        `;
      }
    }

    panel.innerHTML = `<div class="week-grid">${header}${body}</div>`;
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
          </div>
        `;
      }
    }
    html += `</div>`;

    panel.innerHTML = html;
    attachSlotClicks(panel);
    attachEventClicks(panel);
    // Miesiąc: bez linii "teraz" (komórki to dni). Dzisiejszy dzień wyróżniony kolorem.
  }

  /* ---- czerwona linia "teraz" (Dzień + Tydzień) ----
     Pozycja z realnych elementów DOM (getBoundingClientRect).
     Czeka aż siatka ma wymiar, z fallbackiem na wysokość — nigdy 0:00.
     Kolor: token --m-dzis (fallback #dc2626). */

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
        onSlotClick(new Date(iso));
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
        state.didInitialScroll = false;   // przy zmianie widoku scrolluj ponownie do "teraz"
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
      state.didInitialScroll = false;     // "Dziś" → przewiń do aktualnej godziny
      await reloadAndRender();
    });

    // Czerwona linia "teraz" — odświeżaj co minutę
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
