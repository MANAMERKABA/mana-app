// rooms/horyzont/horyzont.js
//
// MANA — Faza A (z5.A) — pokój Horyzont, kalendarz prywatny.
//
// Po ETAPIE 2 pokój jest CIENKI — kompozycja, nie biblioteka:
//   * widok kalendarza  → wspólny komponent  shared/kalendarz.js
//   * dane eventów      → wspólny klient kafla EVENT  shared/event.js
//   * Horyzont          → spina jedno z drugim + obsługuje własne okienko (modal)
//
// Historia:
//   21.05.2026 — pełna doba, linia "teraz", auto-scroll, sticky nagłówki
//   22.05.2026 — ETAP 1: migracja na bazę MerKaBa_2026 (traveler 1, koniec)
//   23.05.2026 — ETAP 2a: dane przez shared/event.js
//   23.05.2026 — ETAP 2b: widok kalendarza wyjęty do shared/kalendarz.js
//   23.05.2026 — domknięcie kafla EVENT:
//       * Horyzont tworzy WYŁĄCZNIE wydarzenia (typ na sztywno "wydarzenie").
//         Wizyta → Puls, wydatek → Trzos, zadania → osobno (lista). Cofnięto
//         pole wyboru typu z 2c.
//       * wydarzenie CAŁODZIENNE — przełącznik w okienku; bez godziny
//         i czasu trwania, ląduje w pasku na górze kalendarza.

import {
  pobierzEventy, utworzEvent, zaktualizujEvent, usunEvent,
} from "../../shared/event.js";
import { montujKalendarz } from "../../shared/kalendarz.js";

/* ============================================================
   KONFIGURACJA POKOJU
   ============================================================ */

// MerKaBa_2026: Adam = travels.id 1 (stara baza mana-serce miała 17).
const TRAVELER_ID = 1;

// Instancja komponentu kalendarza — ustawiana w init().
let kal = null;

/* ============================================================
   POMOCNICZE — daty (na potrzeby okienka modal)
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

// Wydarzenie godzinowe ma `koniec`; przy edycji odtwarzamy czas trwania w min.
function czasTrwaniaZEventu(ev) {
  if (ev.koniec && ev.data_czas) {
    const min = Math.round((new Date(ev.koniec) - new Date(ev.data_czas)) / 60000);
    if (Number.isFinite(min) && min > 0) return min;
  }
  return 60;
}

/* ============================================================
   OKIENKO (MODAL) — tworzenie / edycja / usuwanie wydarzenia
   ============================================================ */

// Przełącza okienko między trybem godzinowym a całodziennym:
// całodzienne → pole daty bez godziny, ukryty czas trwania.
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

/* ---- zapis formularza (tworzenie / edycja) ---- */

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
    // dataRaw = "RRRR-MM-DD" — wydarzenie całodzienne, bez godziny ani końca.
    const d = new Date(dataRaw + "T00:00");
    if (isNaN(d.getTime())) { showFormError("Niepoprawna data."); return; }
    dataCzasISO = d.toISOString();
    koniecISO = null;
  } else {
    // dataRaw = "RRRR-MM-DDTHH:MM" — wydarzenie godzinowe.
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
    // Horyzont tworzy tylko wydarzenia — typ na sztywno.
    result = await utworzEvent({ traveler_id: TRAVELER_ID, typ: "wydarzenie", ...payload });
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Zapisz";

  if (!result.ok) {
    showFormError(result.error || "Błąd zapisu");
    return;
  }

  closeModal();
  await kal.odswiez();
}

/* ---- usuwanie ---- */

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

  if (!result.ok) {
    showFormError(result.error || "Błąd usunięcia");
    return;
  }

  closeModal();
  await kal.odswiez();
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

  document.getElementById("m-add").addEventListener("click", () => openModalCreate(new Date()));
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.getElementById("m-form").addEventListener("submit", handleSubmit);
  document.getElementById("m-delete").addEventListener("click", handleDelete);
  document.getElementById("f-caly-dzien").addEventListener("change", (e) => {
    ustawTrybCalodzienny(e.target.checked);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
