// rooms/horyzont/horyzont.js
//
// MANA — Faza A (z5.A) — pokój Horyzont.
//
// Pokój CIENKI — kompozycja, nie biblioteka:
//   * widok kalendarza → wspólny komponent  shared/kalendarz.js
//   * widok listy zadań → wspólny komponent shared/zadania.js
//   * dane → wspólny klient kafla EVENT      shared/event.js
//   * Horyzont → spina to + obsługuje okienka (modale)
//
// Historia:
//   21–23.05.2026 — ETAP 1/2: migracja, komponent kalendarza, całodzienne
//   23.05.2026 — Z1 widok: lista zadań jako czwarty widok obok
//     Dzień / Tydzień / Miesiąc. Zadanie = typ="zadanie" w kaflu EVENT.

import {
  pobierzEventy, utworzEvent, zaktualizujEvent, usunEvent, utworzZadanie,
} from "../../shared/event.js";
import { montujKalendarz } from "../../shared/kalendarz.js";
import { montujZadania } from "../../shared/zadania.js";

/* ============================================================
   KONFIGURACJA
   ============================================================ */

// MerKaBa_2026: Adam = travels.id 1.
const TRAVELER_ID = 1;

let kal = null;          // instancja komponentu kalendarza
let zadaniaKomp = null;  // instancja komponentu listy zadań

/* ============================================================
   POMOCNICZE — daty (okienka)
   ============================================================ */

function toDatetimeLocalValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function datetimeLocalToISO(localStr) {
  if (!localStr) return null;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function czasTrwaniaZEventu(ev) {
  if (ev.koniec && ev.data_czas) {
    const min = Math.round((new Date(ev.koniec) - new Date(ev.data_czas)) / 60000);
    if (Number.isFinite(min) && min > 0) return min;
  }
  return 60;
}

/* ============================================================
   PRZEŁĄCZANIE WIDOKÓW — kalendarz / zadania
   ============================================================ */

// Chowamy przez style.display (a nie atrybut hidden), bo .m-subnav ma
// w CSS display:flex — to przebija [hidden]. Inline style wygrywa.
function pokazZadania() {
  document.querySelector(".m-view").style.display = "none";
  document.querySelector(".m-subnav").style.display = "none";
  document.getElementById("m-view-zadania").style.display = "block";
  if (zadaniaKomp) zadaniaKomp.odswiez();
}

function pokazKalendarz() {
  document.querySelector(".m-view").style.display = "";
  document.querySelector(".m-subnav").style.display = "";
  document.getElementById("m-view-zadania").style.display = "none";
}

/* ============================================================
   OKIENKO — WYDARZENIE
   ============================================================ */

function ustawTrybCalodzienny(wlaczony) {
  const dc = document.getElementById("f-data-czas");
  const trwanie = document.getElementById("m-field-trwanie");
  const stara = dc.value;

  if (wlaczony) {
    if (dc.type !== "date") {
      dc.type = "date";
      if (stara && stara.length >= 10) dc.value = stara.slice(0, 10);
    }
    trwanie.hidden = true;
  } else {
    if (dc.type !== "datetime-local") {
      dc.type = "datetime-local";
      if (stara && stara.length === 10) dc.value = stara + "T09:00";
    }
    trwanie.hidden = false;
  }
}

function openModalCreate(slotDate, opcje) {
  opcje = opcje || {};
  const calyDzien = !!opcje.calyDzien;
  const base = slotDate || new Date();

  document.getElementById("m-modal-title").textContent = "Nowy event";
  document.getElementById("m-delete").hidden = true;

  document.getElementById("f-id").value = "";
  document.getElementById("f-tytul").value = "";
  document.getElementById("f-caly-dzien").checked = calyDzien;
  document.getElementById("f-czas-trwania").value = 60;

  const dc = document.getElementById("f-data-czas");
  dc.type = calyDzien ? "date" : "datetime-local";
  dc.value = calyDzien ? toDateValue(base) : toDatetimeLocalValue(base);
  document.getElementById("m-field-trwanie").hidden = calyDzien;

  document.getElementById("f-opis").value = "";
  document.getElementById("f-lokalizacja").value = "";
  document.getElementById("f-przypomnienie").value = "";
  hideFormError();

  document.getElementById("m-modal").hidden = false;
  setTimeout(() => document.getElementById("f-tytul").focus(), 50);
}

function openModalEdit(ev) {
  document.getElementById("m-modal-title").textContent = "Edytuj event";
  document.getElementById("m-delete").hidden = false;

  document.getElementById("f-id").value = ev.id;
  document.getElementById("f-tytul").value = ev.tytul || "";

  const calyDzien = !!ev.caly_dzien;
  document.getElementById("f-caly-dzien").checked = calyDzien;

  const dc = document.getElementById("f-data-czas");
  dc.type = calyDzien ? "date" : "datetime-local";
  dc.value = calyDzien
    ? toDateValue(new Date(ev.data_czas))
    : toDatetimeLocalValue(new Date(ev.data_czas));
  document.getElementById("f-czas-trwania").value = czasTrwaniaZEventu(ev);
  document.getElementById("m-field-trwanie").hidden = calyDzien;

  document.getElementById("f-opis").value = ev.opis || "";
  document.getElementById("f-lokalizacja").value = ev.lokalizacja || "";
  document.getElementById("f-przypomnienie").value = ev.przypomnienie_min_przed ?? "";
  hideFormError();

  document.getElementById("m-modal").hidden = false;
}

function closeModal() { document.getElementById("m-modal").hidden = true; }

function showFormError(msg) {
  const el = document.getElementById("m-form-error");
  el.textContent = msg; el.hidden = false;
}
function hideFormError() {
  const el = document.getElementById("m-form-error");
  el.textContent = ""; el.hidden = true;
}

async function handleSubmit(e) {
  e.preventDefault();
  hideFormError();

  const id = document.getElementById("f-id").value.trim();
  const tytul = document.getElementById("f-tytul").value.trim();
  const calyDzien = document.getElementById("f-caly-dzien").checked;
  const dataRaw = document.getElementById("f-data-czas").value;
  const opis = document.getElementById("f-opis").value.trim();
  const lokalizacja = document.getElementById("f-lokalizacja").value.trim();
  const przypRaw = document.getElementById("f-przypomnienie").value.trim();
  const przypomnienie = przypRaw === "" ? null : parseInt(przypRaw, 10);

  if (!tytul) { showFormError("Tytuł jest wymagany."); return; }
  if (!dataRaw) { showFormError("Data jest wymagana."); return; }

  let dataCzasISO, koniecISO;

  if (calyDzien) {
    const d = new Date(dataRaw + "T00:00");
    if (isNaN(d.getTime())) { showFormError("Niepoprawna data."); return; }
    dataCzasISO = d.toISOString();
    koniecISO = null;
  } else {
    dataCzasISO = datetimeLocalToISO(dataRaw);
    if (!dataCzasISO) { showFormError("Niepoprawna data."); return; }
    const czasTrwania = parseInt(document.getElementById("f-czas-trwania").value, 10);
    if (!Number.isFinite(czasTrwania) || czasTrwania <= 0) {
      showFormError("Czas trwania musi być dodatnią liczbą minut."); return;
    }
    koniecISO = new Date(new Date(dataCzasISO).getTime() + czasTrwania * 60000).toISOString();
  }

  const payload = {
    tytul,
    data_czas: dataCzasISO,
    koniec: koniecISO,
    caly_dzien: calyDzien,
    opis: opis || null,
    lokalizacja: lokalizacja || null,
    przypomnienie_min_przed: przypomnienie,
  };

  const saveBtn = document.getElementById("m-save");
  saveBtn.disabled = true;
  saveBtn.textContent = id ? "Aktualizuję…" : "Zapisuję…";

  let result;
  if (id) {
    result = await zaktualizujEvent({ id, traveler_id: TRAVELER_ID, ...payload });
  } else {
    result = await utworzEvent({ traveler_id: TRAVELER_ID, typ: "wydarzenie", ...payload });
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Zapisz";

  if (!result.ok) { showFormError(result.error || "Błąd zapisu"); return; }

  closeModal();
  await kal.odswiez();
}

async function handleDelete() {
  const id = document.getElementById("f-id").value.trim();
  if (!id) return;
  if (!confirm("Usunąć event? Operacja nieodwracalna.")) return;

  const deleteBtn = document.getElementById("m-delete");
  deleteBtn.disabled = true;
  deleteBtn.textContent = "Usuwam…";

  const result = await usunEvent(id, TRAVELER_ID);

  deleteBtn.disabled = false;
  deleteBtn.textContent = "Usuń";

  if (!result.ok) { showFormError(result.error || "Błąd usunięcia"); return; }

  closeModal();
  await kal.odswiez();
}

/* ============================================================
   OKIENKO — ZADANIE (Z1)
   ============================================================ */

const PRIORYTETY = ["niski", "normalny", "wysoki", "pilny"];

function openZadanieCreate() {
  document.getElementById("z-modal-title").textContent = "Nowe zadanie";
  document.getElementById("z-delete").hidden = true;

  document.getElementById("fz-id").value = "";
  document.getElementById("fz-tytul").value = "";
  document.getElementById("fz-priorytet").value = "normalny";
  document.getElementById("fz-termin").value = "";
  document.getElementById("fz-opis").value = "";
  hideZError();

  document.getElementById("z-modal").hidden = false;
  setTimeout(() => document.getElementById("fz-tytul").focus(), 50);
}

function openZadanieEdit(z) {
  document.getElementById("z-modal-title").textContent = "Edytuj zadanie";
  document.getElementById("z-delete").hidden = false;

  document.getElementById("fz-id").value = z.id;
  document.getElementById("fz-tytul").value = z.tytul || "";
  document.getElementById("fz-priorytet").value =
    PRIORYTETY.includes(z.priorytet) ? z.priorytet : "normalny";
  document.getElementById("fz-termin").value =
    z.data_czas ? toDatetimeLocalValue(new Date(z.data_czas)) : "";
  document.getElementById("fz-opis").value = z.opis || "";
  hideZError();

  document.getElementById("z-modal").hidden = false;
}

function closeZadanie() { document.getElementById("z-modal").hidden = true; }

function showZError(msg) {
  const el = document.getElementById("z-form-error");
  el.textContent = msg; el.hidden = false;
}
function hideZError() {
  const el = document.getElementById("z-form-error");
  el.textContent = ""; el.hidden = true;
}

async function handleZadanieSubmit(e) {
  e.preventDefault();
  hideZError();

  const id = document.getElementById("fz-id").value.trim();
  const tytul = document.getElementById("fz-tytul").value.trim();
  const priorytet = document.getElementById("fz-priorytet").value;
  const terminRaw = document.getElementById("fz-termin").value;
  const opis = document.getElementById("fz-opis").value.trim();

  if (!tytul) { showZError("Tytuł jest wymagany."); return; }

  // Termin zadania jest OPCJONALNY — puste = zadanie bez terminu.
  let dataCzasISO = null;
  if (terminRaw) {
    dataCzasISO = datetimeLocalToISO(terminRaw);
    if (!dataCzasISO) { showZError("Niepoprawny termin."); return; }
  }

  const payload = {
    tytul,
    priorytet,
    data_czas: dataCzasISO,
    opis: opis || null,
  };

  const saveBtn = document.getElementById("z-save");
  saveBtn.disabled = true;
  saveBtn.textContent = id ? "Aktualizuję…" : "Zapisuję…";

  let result;
  if (id) {
    result = await zaktualizujEvent({ id, traveler_id: TRAVELER_ID, ...payload });
  } else {
    // utworzZadanie wymusza typ="zadanie".
    result = await utworzZadanie({ traveler_id: TRAVELER_ID, ...payload });
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Zapisz";

  if (!result.ok) { showZError(result.error || "Błąd zapisu"); return; }

  closeZadanie();
  await zadaniaKomp.odswiez();
}

async function handleZadanieDelete() {
  const id = document.getElementById("fz-id").value.trim();
  if (!id) return;
  if (!confirm("Usunąć zadanie? Operacja nieodwracalna.")) return;

  const delBtn = document.getElementById("z-delete");
  delBtn.disabled = true;
  delBtn.textContent = "Usuwam…";

  const result = await usunEvent(id, TRAVELER_ID);

  delBtn.disabled = false;
  delBtn.textContent = "Usuń";

  if (!result.ok) { showZError(result.error || "Błąd usunięcia"); return; }

  closeZadanie();
  await zadaniaKomp.odswiez();
}

/* ============================================================
   INIT — Horyzont jako kompozycja
   ============================================================ */

function init() {
  kal = montujKalendarz({
    zaladujEventy: (from, to) => pobierzEventy({ travelerId: TRAVELER_ID, from, to }),
    onSlotClick:   (date, opcje) => openModalCreate(date, opcje),
    onEventClick:  (ev) => openModalEdit(ev),
    startowyWidok: "week",
  });

  zadaniaKomp = montujZadania({
    travelerId: TRAVELER_ID,
    kontener: document.getElementById("m-view-zadania"),
    onNowe: openZadanieCreate,
    onEdytuj: openZadanieEdit,
  });

  // Przełączanie widoków: 3 toggle kalendarza + Zadania.
  document.querySelectorAll(".m-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".m-toggle").forEach((b) => {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      if (btn.dataset.view === "zadania") pokazZadania();
      else pokazKalendarz();
    });
  });

  // Okienko wydarzenia.
  document.getElementById("m-add").addEventListener("click", () => openModalCreate(new Date()));
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.getElementById("m-form").addEventListener("submit", handleSubmit);
  document.getElementById("m-delete").addEventListener("click", handleDelete);
  document.getElementById("f-caly-dzien").addEventListener("change", (e) => {
    ustawTrybCalodzienny(e.target.checked);
  });

  // Okienko zadania.
  document.querySelectorAll("[data-zclose]").forEach((el) => el.addEventListener("click", closeZadanie));
  document.getElementById("z-form").addEventListener("submit", handleZadanieSubmit);
  document.getElementById("z-delete").addEventListener("click", handleZadanieDelete);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeZadanie(); }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
