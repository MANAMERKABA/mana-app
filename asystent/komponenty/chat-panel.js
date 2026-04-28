// asystent/komponenty/chat-panel.js
// Panel rozmowy: historia + textarea + Skończ rozmowę
// Wysyła wiadomości przez wyslijDoAsystenta z shared/asystent.js

import { wyslijDoAsystenta } from "../../shared/asystent.js";

export function mountChatPanel(rootEl, stan, opcje = {}) {
  rootEl.innerHTML = `
    <div class="chat-historia" id="chat-historia"></div>
    <div class="chat-input-row">
      <textarea id="chat-input" class="chat-input" rows="1" placeholder="Napisz do ${stan.asystentNazwa}..."></textarea>
      <button id="chat-wyslij" class="btn btn-primary" type="button">Wyślij</button>
      <button id="chat-zakoncz" class="btn btn-zakoncz" type="button">Skończ rozmowę</button>
    </div>
  `;

  const historiaEl = rootEl.querySelector("#chat-historia");
  const inputEl = rootEl.querySelector("#chat-input");
  const wyslijBtn = rootEl.querySelector("#chat-wyslij");
  const zakonczBtn = rootEl.querySelector("#chat-zakoncz");

  let spinnerEl = null;

  function autoResize() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 128) + "px";
  }

  function dodajWiadomoscUser(tekst) {
    const el = document.createElement("div");
    el.className = "chat-wiadomosc user";
    el.textContent = tekst;
    historiaEl.appendChild(el);
    historiaEl.scrollTop = historiaEl.scrollHeight;
  }

  function dodajWiadomoscAsystenta(tekst) {
    const el = document.createElement("div");
    el.className = "chat-wiadomosc asystent";
    el.textContent = tekst;
    historiaEl.appendChild(el);
    historiaEl.scrollTop = historiaEl.scrollHeight;
  }

  function dodajWiadomoscBlad(tekst) {
    const el = document.createElement("div");
    el.className = "chat-wiadomosc blad";
    el.textContent = `⚠ ${tekst}`;
    historiaEl.appendChild(el);
    historiaEl.scrollTop = historiaEl.scrollHeight;
  }

  function pokazSpinner(tekst = "Asystent pisze...") {
    ukryjSpinner();
    spinnerEl = document.createElement("div");
    spinnerEl.className = "chat-spinner";
    spinnerEl.textContent = tekst;
    historiaEl.appendChild(spinnerEl);
    historiaEl.scrollTop = historiaEl.scrollHeight;
  }

  function ukryjSpinner() {
    if (spinnerEl) {
      spinnerEl.remove();
      spinnerEl = null;
    }
  }

  async function wyslij() {
    const tekst = inputEl.value.trim();
    if (!tekst) return;
    inputEl.value = "";
    autoResize();
    wyslijBtn.disabled = true;

    const ts = Date.now();
    stan.rozmowa.push({ role: "user", content: tekst, ts });
    dodajWiadomoscUser(tekst);

    pokazSpinner(`${stan.asystentNazwa} pisze...`);
    try {
      const wynik = await wyslijDoAsystenta(stan.travelerId, tekst);
      ukryjSpinner();
      if (wynik.error) {
        dodajWiadomoscBlad(wynik.error);
      } else {
        const ts2 = Date.now();
        stan.rozmowa.push({ role: "assistant", content: wynik.response, ts: ts2 });
        dodajWiadomoscAsystenta(wynik.response);
      }
    } catch (err) {
      ukryjSpinner();
      dodajWiadomoscBlad(err.message);
    }
    wyslijBtn.disabled = false;
    inputEl.focus();
  }

  // Zdarzenia
  wyslijBtn.addEventListener("click", wyslij);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      wyslij();
    }
  });
  inputEl.addEventListener("input", autoResize);
  zakonczBtn.addEventListener("click", () => {
    if (typeof opcje.onZakoncz === "function") opcje.onZakoncz();
  });

  return {
    dodajWiadomoscUser,
    dodajWiadomoscAsystenta,
    dodajWiadomoscBlad,
    pokazSpinner,
    ukryjSpinner,
  };
}
