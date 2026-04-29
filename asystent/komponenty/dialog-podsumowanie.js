// asystent/komponenty/dialog-podsumowanie.js
// Modal podsumowania: wywołuje summarize-conversation, renderuje checkboxy,
// zapisuje odhaczone do stones (typ ∈ zadanie/sen/odczucie) lub events (typ = event)
//
// Schema docelowa:
//   stones: traveler_id (TEXT!), tresc, typ, status='aktywny', sekcja?, due_date?
//   events: traveler_id, tytul, data_czas (timestamptz), czas_trwania_min?, opis?, lokalizacja?

import { callEdge, supabase } from "../../shared/supabase.js";

export async function pokazDialog({ travelerId, asystentNazwa, rozmowa, rootEl, toast }) {
  rootEl.innerHTML = `
    <div class="dialog-overlay" id="dialog-overlay">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-tytul">
        <h2 id="dialog-tytul">${asystentNazwa} patrzy co warto zachować...</h2>
        <p class="dialog-podpowiedz">Odhacz to, co chcesz zachować. Reszta zniknie.</p>
        <div id="dialog-tresc">
          <div class="dialog-spinner">Analizuję rozmowę (2-5s)...</div>
        </div>
        <div class="dialog-aktcje" id="dialog-akcje" style="display:none">
          <button class="btn btn-zakoncz" id="dialog-anuluj" type="button">Anuluj</button>
          <button class="btn btn-secondary" id="dialog-nic" type="button">Nic nie zachowuj</button>
          <button class="btn btn-primary" id="dialog-zachowaj" type="button">Zachowaj odhaczone</button>
        </div>
      </div>
    </div>
  `;

  const overlayEl = rootEl.querySelector("#dialog-overlay");
  const trescEl = rootEl.querySelector("#dialog-tresc");
  const akcjeEl = rootEl.querySelector("#dialog-akcje");

  function zamknij() {
    rootEl.innerHTML = "";
  }

  rootEl.querySelector("#dialog-anuluj").addEventListener("click", zamknij);
  rootEl.querySelector("#dialog-nic").addEventListener("click", zamknij);

  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) zamknij();
  });

  // Wywołaj summarize-conversation
  let propozycje = [];
  try {
    const transcript = rozmowa
      .map((w) => `${w.role === "user" ? "Podróżnik" : asystentNazwa}: ${w.content}`)
      .join("\n\n");

    const result = await callEdge("summarize-conversation", {
      traveler_id: travelerId,
      transcript: transcript,
    });

    // Defensywnie: callEdge.ok bywa false nawet przy HTTP 200 — sprawdzamy obecność pola propozycje
    const lista = result.data?.propozycje;
    if (Array.isArray(lista)) {
      propozycje = lista;
    } else if (result.data?.error) {
      throw new Error(result.data.error);
    } else {
      throw new Error(`HTTP ${result.status}: ${JSON.stringify(result.data)}`);
    }
  } catch (err) {
    trescEl.innerHTML = `<div class="dialog-pusto" style="color:#a33">
      Nie udało się wygenerować propozycji: ${err.message}
    </div>`;
    akcjeEl.style.display = "flex";
    rootEl.querySelector("#dialog-zachowaj").style.display = "none";
    return;
  }

  if (propozycje.length === 0) {
    trescEl.innerHTML = `<div class="dialog-pusto">
      Nic szczególnego nie wychwyciłam w tej rozmowie.
    </div>`;
    akcjeEl.style.display = "flex";
    rootEl.querySelector("#dialog-zachowaj").style.display = "none";
    return;
  }

  trescEl.innerHTML = `<div class="propozycje" id="propozycje-list"></div>`;
  const listaEl = rootEl.querySelector("#propozycje-list");

  propozycje.forEach((p, idx) => {
    const label = document.createElement("label");
    label.className = "propozycja";
    label.innerHTML = `
      <input type="checkbox" data-idx="${idx}" checked />
      <div>
        <div class="prop-typ">${etykietaTypu(p.typ)}</div>
        <div class="prop-tresc">${escapeHtml(p.tresc || "")}</div>
        ${formatMeta(p)}
      </div>
    `;
    listaEl.appendChild(label);
  });

  akcjeEl.style.display = "flex";

  rootEl.querySelector("#dialog-zachowaj").addEventListener("click", async () => {
    const wybrane = Array.from(listaEl.querySelectorAll('input[type="checkbox"]:checked'))
      .map((cb) => propozycje[Number(cb.dataset.idx)]);

    if (wybrane.length === 0) {
      zamknij();
      return;
    }

    rootEl.querySelector("#dialog-zachowaj").disabled = true;
    rootEl.querySelector("#dialog-zachowaj").textContent = "Zapisywanie...";

    let okStones = 0;
    let okEvents = 0;
    const bledy = [];

    for (const p of wybrane) {
      try {
        if (p.typ === "event") {
          const insertData = {
            traveler_id: travelerId,
            tytul: p.tytul || p.tresc,
            data_czas: p.data_czas,
          };
          if (p.czas_trwania_min) insertData.czas_trwania_min = p.czas_trwania_min;
          if (p.opis) insertData.opis = p.opis;
          if (p.lokalizacja) insertData.lokalizacja = p.lokalizacja;
          const { error } = await supabase.from("events").insert(insertData);
          if (error) throw error;
          okEvents++;
        } else {
          const insertData = {
            traveler_id: String(travelerId),
            tresc: p.tresc,
            typ: p.typ || "odczucie",
            status: "aktywny",
          };
          if (p.sekcja) insertData.sekcja = p.sekcja;
          if (p.due_date) insertData.due_date = p.due_date;
          const { error } = await supabase.from("stones").insert(insertData);
          if (error) throw error;
          okStones++;
        }
      } catch (err) {
        bledy.push(`${p.tresc?.slice(0, 30) || "?"}: ${err.message}`);
      }
    }

    if (bledy.length === 0) {
      const cz = [];
      if (okStones > 0) cz.push(`${okStones} do Słoika`);
      if (okEvents > 0) cz.push(`${okEvents} do Horyzontu`);
      toast(`Zachowane: ${cz.join(", ")}`, "success");
      zamknij();
    } else {
      toast(
        `Zapisano ${okStones + okEvents}/${wybrane.length}. Błędy: ${bledy.length}`,
        "error"
      );
      rootEl.querySelector("#dialog-zachowaj").disabled = false;
      rootEl.querySelector("#dialog-zachowaj").textContent = "Zachowaj odhaczone";
      console.error("Błędy zapisu:", bledy);
    }
  });
}

function etykietaTypu(typ) {
  const m = {
    zadanie: "zadanie → Słoik",
    sen: "sen → Słoik",
    odczucie: "odczucie → Słoik",
    event: "wydarzenie → Horyzont",
  };
  return m[typ] || typ || "kamień";
}

function formatMeta(p) {
  const meta = [];
  if (p.due_date) {
    try {
      const d = new Date(p.due_date);
      meta.push(d.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }));
    } catch {}
  }
  if (p.data_czas) {
    try {
      const d = new Date(p.data_czas);
      meta.push(d.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }));
    } catch {}
  }
  if (p.lokalizacja) meta.push(`@ ${p.lokalizacja}`);
  if (p.sekcja) meta.push(`(${p.sekcja})`);
  if (meta.length === 0) return "";
  return `<div class="prop-meta">${escapeHtml(meta.join(" · "))}</div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
