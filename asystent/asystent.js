// asystent/asystent.js
// Orkiestracja pokoju /asystent — montuje komponenty, uruchamia F1 brief
// Importy: jeden poziom wyżej do shared/ (płaska struktura wg META#2)

import { getCurrentTraveler } from "../shared/auth.js";
import { briefDnia, getAsystentNazwa } from "../shared/asystent.js";
import { mountChatPanel } from "./komponenty/chat-panel.js";
import { mountKontekstPamieci } from "./komponenty/kontekst-pamieci.js";

const stan = {
  travelerId: null,
  asystentNazwa: "Krystyna",
  rozmowa: [], // [{role: 'user'|'assistant', content: string, ts: number}]
};

async function init() {
  // Auth: getCurrentTraveler() zwraca number 17 (MVP_TRAVELER_ID), nie obiekt (META audyt M #1)
  stan.travelerId = getCurrentTraveler();
  stan.asystentNazwa = await getAsystentNazwa();

  // Update tytułu strony i nagłówka
  document.getElementById("asystent-tytul").textContent = stan.asystentNazwa;
  document.title = `${stan.asystentNazwa} — MANA`;

  // Montuj komponenty
  mountKontekstPamieci(document.getElementById("kontekst-pamieci"), stan);
  const chat = mountChatPanel(document.getElementById("chat-panel"), stan, {
    onZakoncz: () => uruchomDialogPodsumowanie(),
  });

  // F1 — brief dnia automatycznie po załadowaniu
  await uruchomBriefDnia(chat);
}

async function uruchomBriefDnia(chatApi) {
  chatApi.pokazSpinner(`${stan.asystentNazwa} przygotowuje brief...`);
  try {
    const wynik = await briefDnia(stan.travelerId);
    chatApi.ukryjSpinner();
    if (wynik.error) {
      chatApi.dodajWiadomoscBlad(wynik.error);
      return;
    }
    const ts = Date.now();
    stan.rozmowa.push({ role: "assistant", content: wynik.response, ts });
    chatApi.dodajWiadomoscAsystenta(wynik.response);
  } catch (err) {
    chatApi.ukryjSpinner();
    chatApi.dodajWiadomoscBlad(`Brief dnia nie wystartował: ${err.message}`);
  }
}

async function uruchomDialogPodsumowanie() {
  // Lazy load — komponent ciężki, ładujemy tylko gdy potrzebny
  const mod = await import("./komponenty/dialog-podsumowanie.js");
  mod.pokazDialog({
    travelerId: stan.travelerId,
    asystentNazwa: stan.asystentNazwa,
    rozmowa: stan.rozmowa,
    rootEl: document.getElementById("dialog-podsumowanie-root"),
    toast,
  });
}

// ============================================================
// TOAST utility — proste komunikaty potwierdzające
// ============================================================

function toast(tekst, typ = "info") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast toast-${typ}`;
  el.textContent = tekst;
  root.appendChild(el);
  setTimeout(() => el.classList.add("toast-show"), 10);
  setTimeout(() => {
    el.classList.remove("toast-show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Eksport dla komponentów
window.__asystentToast = toast;

// Start
init().catch((err) => {
  console.error("Asystent init failed:", err);
  document.body.innerHTML = `<div style="padding:2rem;color:#c33">
    <strong>Błąd inicjalizacji:</strong> ${err.message}
  </div>`;
});
