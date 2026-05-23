// shared/zadania.js
//
// MANA — wspólny komponent LISTA ZADAŃ
//
// Zadanie = wpis kafla EVENT z typ="zadanie". Ten komponent rysuje listę
// zadań i obsługuje odhaczanie. Tworzenie/edycja idą przez pokój (callbacki
// onNowe / onEdytuj) — tak jak kalendarz oddaje klik do Horyzonta.
//
// 23.05.2026 — Z1 widok. Reużywalny: Horyzont, ekran startowy mana.app, biznes.
//
// Wygląd: shared/zadania.css. Dane: shared/event.js (kafel EVENT).
//
// Użycie:
//   const z = montujZadania({
//     travelerId: 1,
//     kontener: document.getElementById("m-view-zadania"),
//     onNowe:   () => {...},        // klik "+ Nowe zadanie"
//     onEdytuj: (zadanie) => {...}, // klik w zadanie
//   });
//   z.odswiez();

import { pobierzZadania, oznaczZrobione } from "./event.js";

const PRIORYTET_KOLOR = {
  niski:    "#888780",
  normalny: "#1D9E75",
  wysoki:   "#EF9F27",
  pilny:    "#E24B4A",
};
const PRIORYTET_KOLEJNOSC = { pilny: 0, wysoki: 1, normalny: 2, niski: 3 };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtTermin(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pl-PL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function montujZadania(opcje) {
  const {
    travelerId,
    kontener,
    onNowe = () => {},
    onEdytuj = () => {},
  } = opcje || {};

  if (!kontener) throw new Error("montujZadania: wymagany kontener");

  let zadania = [];

  async function zaladuj() {
    kontener.innerHTML = `<div class="z-status">Ładuję zadania…</div>`;
    const wynik = await pobierzZadania({ travelerId });
    if (!wynik.ok) {
      console.error("zadania: pobierzZadania:", wynik.error);
      zadania = [];
      kontener.innerHTML = `<div class="z-status">Błąd: ${escapeHtml(wynik.error || "")}</div>`;
      return;
    }
    zadania = wynik.zadania;
    render();
  }

  function render() {
    const sorted = [...zadania].sort((a, b) => {
      const za = a.status === "zrobione" ? 1 : 0;
      const zb = b.status === "zrobione" ? 1 : 0;
      if (za !== zb) return za - zb;
      const pa = PRIORYTET_KOLEJNOSC[a.priorytet] ?? 2;
      const pb = PRIORYTET_KOLEJNOSC[b.priorytet] ?? 2;
      if (pa !== pb) return pa - pb;
      const ta = a.data_czas ? new Date(a.data_czas).getTime() : Infinity;
      const tb = b.data_czas ? new Date(b.data_czas).getTime() : Infinity;
      return ta - tb;
    });

    let html = `<div class="z-naglowek">
      <span class="z-tytul-sekcji">Zadania</span>
      <button type="button" class="z-nowe">+ Nowe zadanie</button>
    </div>`;

    if (sorted.length === 0) {
      html += `<div class="z-pusto">Brak zadań. Dodaj pierwsze.</div>`;
    } else {
      html += `<div class="z-lista">${sorted.map(renderRzad).join("")}</div>`;
    }

    kontener.innerHTML = html;

    kontener.querySelector(".z-nowe").addEventListener("click", () => onNowe());

    kontener.querySelectorAll(".z-rzad").forEach((el) => {
      const id = el.getAttribute("data-id");

      el.querySelector(".z-check").addEventListener("click", async (e) => {
        e.stopPropagation();
        const z = zadania.find((x) => x.id === id);
        if (!z) return;
        const wynik = await oznaczZrobione(id, travelerId, z.status !== "zrobione");
        if (!wynik.ok) { console.error("zadania: oznaczZrobione:", wynik.error); return; }
        await zaladuj();
      });

      el.addEventListener("click", () => {
        const z = zadania.find((x) => x.id === id);
        if (z) onEdytuj(z);
      });
    });
  }

  function renderRzad(z) {
    const zrobione = z.status === "zrobione";
    const kolor = PRIORYTET_KOLOR[z.priorytet] || PRIORYTET_KOLOR.normalny;
    const termin = z.data_czas ? fmtTermin(z.data_czas) : "";
    return `<div class="z-rzad${zrobione ? " z-rzad--zrobione" : ""}" data-id="${z.id}">
      <span class="z-check" role="button" aria-label="Zrobione"></span>
      <span class="z-dot" style="background:${kolor}" aria-hidden="true"></span>
      <span class="z-tytul">${escapeHtml(z.tytul || "")}</span>
      <span class="z-termin">${termin}</span>
    </div>`;
  }

  zaladuj();

  return { odswiez: zaladuj };
}
