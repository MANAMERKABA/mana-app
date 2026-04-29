// asystent/komponenty/kontekst-pamieci.js
// Sidebar: pokazuje memory.tresc dla podróżnika jako jeden blok tekstu.
// Pamięć MANA = single blob per podróżnik (META#8 z audytu M, potwierdzone w call-serce).
// Defensywnie: jeśli tabela memory nie istnieje (np. inny projekt) — empty state, nie error.

import { supabase } from "../../shared/supabase.js";

export async function mountKontekstPamieci(rootEl, stan) {
  rootEl.innerHTML = `
    <h2>Pamiętam</h2>
    <div id="pamiec-content" class="pamiec-pusta">Wczytuję...</div>
  `;
  const contentEl = rootEl.querySelector("#pamiec-content");

  try {
    const { data, error } = await supabase
      .from("memory")
      .select("tresc, updated_at")
      .eq("traveler_id", stan.travelerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Tabela nie istnieje albo brak uprawnień — pokaż empty state, nie wstydliwy błąd
    if (error) {
      console.warn("KontekstPamięci:", error.message);
      contentEl.className = "pamiec-pusta";
      contentEl.textContent = "Pusto. Pamięć zbuduje się po pierwszych rozmowach.";
      return;
    }

    if (!data || !data.tresc) {
      contentEl.className = "pamiec-pusta";
      contentEl.textContent = "Pusto. Pamięć zbuduje się po pierwszych rozmowach.";
      return;
    }

    contentEl.className = "pamiec-tresc";
    contentEl.textContent = data.tresc;
  } catch (err) {
    console.warn("KontekstPamięci catch:", err);
    contentEl.className = "pamiec-pusta";
    contentEl.textContent = "Pusto. Pamięć zbuduje się po pierwszych rozmowach.";
  }
}
