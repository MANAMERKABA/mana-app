// rooms/horyzont/horyzont.js
//
// MANA — Faza A (z5.A) — pokój Horyzont, kalendarz prywatny.
//
// Po ETAPIE 2 pokój jest CIENKI — to kompozycja, nie biblioteka:
//   * widok kalendarza  → wspólny komponent  shared/kalendarz.js
//   * dane eventów      → wspólny klient kafla EVENT  shared/event.js
//   * Horyzont          → spina jedno z drugim + obsługuje własne okienko (modal)
//
// Zasada "siła w kaflach": logika żyje w kaflu/komponencie, pokój tylko jej
// używa. Mocny kafel = mocne wszystkie pokoje. Kalendarza nie piszemy drugi
// raz dla Pulsa — Puls weźmie ten sam komponent.
//
// Historia:
//   21.05.2026 — pełna doba, linia "teraz", auto-scroll, sticky nagłówki
//   22.05.2026 — ETAP 1: migracja na bazę MerKaBa_2026 (traveler 1, typ, koniec)
//   23.05.2026 — ETAP 2a: dane przez shared/event.js
//   23.05.2026 — ETAP 2b: widok kalendarza wyjęty do shared/kalendarz.js;
//                Horyzont odchudzony do kompozycji + modalu

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

function datetimeLocalToISO(localStr) {
  if (!localStr) return null;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Nowa tabela `events` ma kolumnę `koniec` (data+godzina), nie `czas_trwania_min`.
// Przy edycji odtwarzamy "czas trwania w minutach" z różnicy koniec − data_czas.
function czasTrwaniaZEventu(ev) {
  if (ev.koniec && ev.data_czas) {
    const min = Math.round((new Date(ev.koniec) - new Date(ev.data_czas)) / 60000);
    if (Number.isFinite(min) && min > 0) return min;
  }
  return 60;
}

/* ============================================================
   OKIENKO (MODAL) — tworzenie / edycja / usuwanie eventu
   To jest UI pokoju Horyzont. Kalendarz tylko zgłasza klik —
   Horyzont decyduje, że pokazuje to okienko.
   ============================================================ */

function openModalCreate(slotDate) {
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

  document.getElementById("m-modal").hidden = false;
  setTimeout(() => document.getElementById("f-tytul").focus(), 50);
}

function openModalEdit(ev) {
  const title = document.getElementById("m-modal-title");
  const deleteBtn = document.getElementById("m-delete");

  title.textContent = "Edytuj event";
  deleteBtn.hidden = false;

  document.getElementById("f-id").value = ev.id;
  document.getElementById("f-tytul").value = ev.tytul || "";
  document.getElementById("f-data-czas").value = toDatetimeLocalValue(new Date(ev.data_czas));
  document.getElementById("f-czas-trwania").value = czasTrwaniaZEventu(ev);
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

  // Nowa tabela `events` nie ma kolumny czas_trwania_min — przeliczamy na `koniec`.
  const koniecISO = new Date(new Date(dataCzasISO).getTime() + czasTrwania * 60000).toISOString();

  const payload = {
    tytul,
    data_czas: dataCzasISO,
    koniec: koniecISO,
    opis: opis || null,
    lokalizacja: lokalizacja || null,
    przypomnienie_min_przed: przypomnienie,
  };

  const saveBtn = document.getElementById("m-save");
  saveBtn.disabled = true;
  saveBtn.textContent = id ? "Aktualizuję…" : "Zapisuję…";

  let result;
  if (id) {
    // event-update wymaga traveler_id (sprawdza własność wpisu).
    result = await zaktualizujEvent({ id, traveler_id: TRAVELER_ID, ...payload });
  } else {
    // event-create wymaga `typ` — ETAP 1/2: na sztywno "wydarzenie".
    // Wybór typu (zadanie/wizyta/wydatek) dochodzi w ETAP 2 krok 2c.
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
  // Komponent kalendarza: dane bierze z kafla EVENT (podróżnik 1),
  // a klik w slot/event przekazuje do okienka Horyzonta.
  kal = montujKalendarz({
    zaladujEventy: (from, to) => pobierzEventy({ travelerId: TRAVELER_ID, from, to }),
    onSlotClick:   (date) => openModalCreate(date),
    onEventClick:  (ev)   => openModalEdit(ev),
    startowyWidok: "week",
  });

  // Przyciski okienka — to UI pokoju, nie kalendarza.
  document.getElementById("m-add").addEventListener("click", () => openModalCreate(new Date()));
  document.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.getElementById("m-form").addEventListener("submit", handleSubmit);
  document.getElementById("m-delete").addEventListener("click", handleDelete);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
