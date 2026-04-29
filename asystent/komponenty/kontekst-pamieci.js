// asystent/komponenty/kontekst-pamieci.js
// Sidebar: pokazuje memory.tresc dla podróżnika jako jeden blok tekstu.
// Pamięć MANA = single blob per podróżnik (META#8 z audytu M, potwierdzone w call-serce).

import { supabase } from "../../shared/supabase.js";

export async function mountKontekstPamieci(rootEl, stan) {
  rootEl.innerHTML = `
    <h2>Pamiętam</h2>
    <div id="pamiec-content" class="pamiec-pusta">Wczytuję...</div>
  `;
  const contentEl = rootEl.querySelector("#pamiec-content");

  try {
    // memory: kolumny (traveler_id, tresc, updated_at) — jeden wiersz per podróżnik
    // call-serce upsertuje onConflict 'traveler_id', więc max 1 wiersz
    // Typ traveler_id w memory: niejasny — call-serce v2 wysyła jako int, więc nie castujemy
    const { data, error } = await supabase
      .from("memory")
      .select("tresc, updated_at")
      .eq("traveler_id", stan.travelerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data || !data.tresc) {
      contentEl.className = "pamiec-pusta";
      contentEl.textContent = "Pusto. Pamięć zbuduje się po pierwszych rozmowach.";
      return;
    }

    contentEl.className = "pamiec-tresc";
    contentEl.textContent = data.tresc;
  } catch (err) {
    contentEl.className = "pamiec-pusta";
    contentEl.textContent = `(błąd ładowania pamięci: ${err.message})`;
    console.warn("KontekstPamięci:", err);
  }
}
