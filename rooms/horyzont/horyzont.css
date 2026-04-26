// rooms/horyzont/horyzont.js
//
// MANA — Faza A (z5.A) — pokój Horyzont, kalendarz prywatny.
// Logika frontend: state, fetch, render 3 widoków, modal CRUD.
//
// Decyzje wg [602]:
// - SELECT przez supabase-js bezpośrednio (RLS anon_all dla MVP)
// - INSERT/UPDATE/DELETE przez Edge Functions (event-create/update/delete)
// - traveler_id z shared/auth.js (MVP_TRAVELER_ID = 17 hardcoded)
// - 3 widoki: dzień (godziny 6-24), tydzień (pon-nd × godziny 6-24), miesiąc (siatka)
//
// Powiązane: [602] brief Faza A, [604] folder layout, [600] RLS twardy w z-security.

import { supabase, callEdge } from "../../shared/supabase.js";
import { getCurrentTraveler } from "../../shared/auth.js";

/* ============================================================
   STATE
   ============================================================ */

const state = {
  view: "week",                // "day" | "week" | "month"
  refDate: new Date(),         // data odniesienia widoku
  events: [],                  // cache aktualnie załadowanych eventów
  loading: false,
};

const TRAVELER_ID = getCurrentTraveler();

const MIESIACE = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

const DNI_KROTKO = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];

const GODZINY = Array.from({ length: 19 }, (_, i) => i + 6); // 6..24

/* ============================================================
   POMOCNICZE — daty
   ============================================================ */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d) {
  // Tydzień Pon-Nd. JS: getDay() Niedziela=0, Poniedziałek=1
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Nd, 1=Pn... 6=So
  const diff = (day === 0 ? -6 : 1 - day); // do poniedziałku
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeek(d) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}

function startOfMonth(d) {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

function isToday(d) {
  return isSameDay(d, new Date());
}

function fmtTime(d) {
  return d.toTimeString().slice(0, 5); // "HH:MM"
}

function fmtDateLabel(d) {
  return `${d.getDate()} ${MIESIACE[d.getMonth()]} ${d.getFullYear()}`;
}

// datetime-local input format: "YYYY-MM-DDTHH:MM" (lokalny czas, bez offsetu)
function toDatetimeLocalValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local "2026-04-26T10:00" → ISO 8601 z lokalnym offsetem
function datetimeLocalToISO(localStr) {
  if (!localStr) return null;
  // new Date("2026-04-26T10:00") interpretuje jako lokalny czas
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString(); // zwróci np. "2026-04-26T08:00:00.000Z" — Postgres timestamptz OK
}

/* ============================================================
   ZAKRES WIDOKU
   ============================================================ */

function getViewRange() {
  const ref = state.refDate;
  switch (state.view) {
    case "day":   return { from: startOfDay(ref),   to: endOfDay(ref) };
    case "week":  return { from: startOfWeek(ref),  to: endOfWeek(ref) };
    case "month": {
      // dla siatki miesiąca dociągamy do pełnych tygodni
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

/* ============================================================
   FETCH EVENTÓW (bezpośrednio supabase-js)
   ============================================================ */

async function loadEvents() {
  state.loading = true;
  setStatus("Ładuję eventy…");

  const { from, to } = getViewRange();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("traveler_id", TRAVELER_ID)
    .gte("data_czas", from.toISOString())
    .lte("data_czas", to.toISOString())
    .order("data_czas", { ascending: true });

  state.loading = false;

  if (error) {
    console.error("loadEvents error:", error);
    setStatus(`Błąd: ${error.message}`);
    state.events = [];
    return;
  }

  state.events = data || [];
  setStatus(state.events.length === 0
    ? "Brak eventów w tym zakresie. Kliknij + Nowy event lub puste miejsce w kalendarzu."
    : `${state.events.length} event(y) załadowane.`);
}

function setStatus(msg) {
  const el = document.getElementById("m-status");
  if (el) el.textContent = msg || "";
}

/* ============================================================
   RENDER — wybór widoku
   ============================================================ */

function render() {
  // schowaj wszystkie panele
  ["day", "week", "month"].forEach((v) => {
    const panel = document.getElementById(`m-view-${v}`);
    if (panel) panel.hidden = (v !== state.view);
  });

  // toggle aria-pressed
  document.querySelectorAll(".m-toggle").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.view === state.view ? "true" : "false");
  });

  // label okresu
  const lbl = document.getElementById("m-period-label");
  if (lbl) lbl.textContent = getPeriodLabel();

  // render aktywnego
  switch (state.view) {
    case "day":   renderDay(); break;
    case "week":  renderWeek(); break;
    case "month": renderMonth(); break;
  }
}

/* ---- RENDER DAY ---- */

function renderDay() {
  const panel = document.getElementById("m-view-day");
  const day = state.refDate;
  const dayStart = startOfDay(day);

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
}

/* ---- RENDER WEEK ---- */

function renderWeek() {
  const panel = document.getElementById("m-view-week");
  const weekStart = startOfWeek(state.refDate);

  // header dni
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

  // siatka godzin × 7 dni
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
}

/* ---- RENDER MONTH ---- */

function renderMonth() {
  const panel = document.getElementById("m-view-month");
  const ref = state.refDate;
  const gridStart = startOfWeek(startOfMonth(ref));
  const gridEnd = endOfWeek(endOfMonth(ref));

  // ile tygodni
  const totalDays = Math.round((gridEnd - gridStart) / (1000 * 60 * 60 * 24)) + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  let html = `<div class="month-grid">`;

  // header dni tygodnia
  for (const dn of DNI_KROTKO) {
    html += `<div class="month-header__day">${dn}</div>`;
  }

  // komórki
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
}

/* ---- RENDER karta eventu ---- */

function renderEventCard(ev) {
  const t = new Date(ev.data_czas);
  const time = fmtTime(t);
  const tytul = escapeHtml(ev.tytul || "");
  return `<a class="m-event" data-event-id="${ev.id}" title="${tytul}">
    <span class="m-event__time">${time}</span>${tytul}
  </a>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ============================================================
   INTERAKCJE — klik na slot/event
   ============================================================ */

function attachSlotClicks(scope) {
  scope.querySelectorAll("[data-slot-time]").forEach((el) => {
    el.addEventListener("click", (e) => {
      // jeśli klik na karcie eventu — niech bubbluje do attachEventClicks
      if (e.target.closest(".m-event")) return;
      const iso = el.getAttribute("data-slot-time");
      openModalCreate(new Date(iso));
    });
  });
}

function attachEventClicks(scope) {
  scope.querySelectorAll(".m-event").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.getAttribute("data-event-id");
      const ev = state.events.find((x) => x.id === id);
      if (ev) openModalEdit(ev);
    });
  });
}

/* ============================================================
   MODAL CRUD
   ============================================================ */

function openModalCreate(slotDate) {
  const modal = document.getElementById("m-modal");
  const title = document.getElementById("m-modal-title");
  const deleteBtn = document.getElementById("m-delete");

  title.textContent = "Nowy event";
  deleteBtn.hidden = true;

  document.getElementById("f-id").value = "";
  document.getElementById("f-tytul").value = "";
  document.getElementById("f-data-czas").value = toDatetimeLocalValue(slotDate || new Date());
  document.getElementById("f-czas-trwania").value = 60;
  document.getElementById("f-opis").value = "";
  document.getElementById("f-lokalizacja").value = "";
  document.getElementById("f-przypomnienie").value = "";
  hideFormError();

  modal.hidden = false;
  setTimeout(() => document.getElementById("f-tytul").focus(), 50);
}

function openModalEdit(ev) {
  const modal = document.getElementById("m-modal");
  const title = document.getElementById("m-modal-title");
  const deleteBtn = document.getElementById("m-delete");

  title.textContent = "Edytuj event";
  deleteBtn.hidden = false;

  document.getElementById("f-id").value = ev.id;
  document.getElementById("f-tytul").value = ev.tytul || "";
  document.getElementById("f-data-czas").value = toDatetimeLocalValue(new Date(ev.data_czas));
  document.getElementById("f-czas-trwania").value = ev.czas_trwania_min || 60;
  document.getElementById("f-opis").value = ev.opis || "";
  document.getElementById("f-lokalizacja").value = ev.lokalizacja || "";
  document.getElementById("f-przypomnienie").value = ev.przypomnienie_min_przed ?? "";
  hideFormError();

  modal.hidden = false;
}

function closeModal() {
  document.getElementById("m-modal").hidden = true;
}

function showFormError(msg) {
  const el = document.getElementById("m-form-error");
  el.textContent = msg;
  el.hidden = false;
}

function hideFormError() {
  const el = document.getElementById("m-form-error");
  el.textContent = "";
  el.hidden = true;
}

/* ---- SUBMIT formularza ---- */

async function handleSubmit(e) {
  e.preventDefault();
  hideFormError();

  const id = document.getElementById("f-id").value.trim();
  const tytul = document.getElementById("f-tytul").value.trim();
  const dataCzasLocal = document.getElementById("f-data-czas").value;
  const czasTrwania = parseInt(document.getElementById("f-czas-trwania").value, 10);
  const opis = document.getElementById("f-opis").value.trim();
  const lokalizacja = document.getElementById("f-lokalizacja").value.trim();
  const przypRaw = document.getElementById("f-przypomnienie").value.trim();
  const przypomnienie = przypRaw === "" ? null : parseInt(przypRaw, 10);

  if (!tytul) { showFormError("Tytuł jest wymagany."); return; }
  if (!dataCzasLocal) { showFormError("Data i godzina są wymagane."); return; }
  if (!Number.isFinite(czasTrwania) || czasTrwania <= 0) { showFormError("Czas trwania musi być dodatnią liczbą minut."); return; }

  const dataCzasISO = datetimeLocalToISO(dataCzasLocal);
  if (!dataCzasISO) { showFormError("Niepoprawna data."); return; }

  const payload = {
    tytul,
    data_czas: dataCzasISO,
    czas_trwania_min: czasTrwania,
    opis: opis || null,
    lokalizacja: lokalizacja || null,
    przypomnienie_min_przed: przypomnienie,
  };

  const saveBtn = document.getElementById("m-save");
  saveBtn.disabled = true;
  saveBtn.textContent = id ? "Aktualizuję…" : "Zapisuję…";

  let result;
  if (id) {
    result = await callEdge("event-update", { id, ...payload });
  } else {
    result = await callEdge("event-create", { traveler_id: TRAVELER_ID, ...payload });
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Zapisz";

  if (!result.ok) {
    showFormError(result.data?.error || `Błąd zapisu (${result.status})`);
    return;
  }

  closeModal();
  await loadEvents();
  render();
}

/* ---- DELETE ---- */

async function handleDelete() {
  const id = document.getElementById("f-id").value.trim();
  if (!id) return;
  if (!confirm("Usunąć event? Operacja nieodwracalna.")) return;

  const deleteBtn = document.getElementById("m-delete");
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Usuwam…";

  const result = await callEdge("event-delete", { id });

  deleteBtn.disabled = false;
  deleteBtn.textContent = "Usuń";

  if (!result.ok) {
    showFormError(result.data?.error || `Błąd usunięcia (${result.status})`);
    return;
  }

  closeModal();
  await loadEvents();
  render();
}

/* ============================================================
   NAWIGACJA — prev / today / next + toggle widoku
   ============================================================ */

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

/* ============================================================
   INIT
   ============================================================ */

function init() {
  // Toggle widoku
  document.querySelectorAll(".m-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.view = btn.dataset.view;
      await reloadAndRender();
    });
  });

  // Sub-nav
  document.getElementById("m-prev").addEventListener("click", async () => { shiftDate(-1); await reloadAndRender(); });
  document.getElementById("m-next").addEventListener("click", async () => { shiftDate(+1); await reloadAndRender(); });
  document.getElementById("m-today").addEventListener("click", async () => { state.refDate = new Date(); await reloadAndRender(); });
  document.getElementById("m-add").addEventListener("click", () => openModalCreate(new Date()));

  // Modal
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.getElementById("m-form").addEventListener("submit", handleSubmit);
  document.getElementById("m-delete").addEventListener("click", handleDelete);

  // ESC zamyka modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Pierwszy render
  reloadAndRender();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
