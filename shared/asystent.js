// shared/asystent.js
// Silnik Asystenta + zarządzanie nazwą
// Komunikacja z call-serce v2 (parametr aktywny_duch) + brief dnia (F1)
// Architektura wg [604][607][620], audyt M 28.04.2026
// META: importy z płaskiego shared/, callEdge zamiast surowego fetch, pole odpowiedzi 'response'

import { callEdge, supabase } from "./supabase.js";

const FALLBACK_NAZWA = "Krystyna";
const KLUCZ_NAZWY = "asystent_imie";

// ============================================================
// NAZWA ASYSTENTA (mana_settings: globalny KV, klucz/value jsonb)
// ============================================================

export async function getAsystentNazwa() {
  try {
    const { data, error } = await supabase
      .from("mana_settings")
      .select("value")
      .eq("key", KLUCZ_NAZWY)
      .maybeSingle();
    if (error) throw error;
    if (!data) return FALLBACK_NAZWA;
    // value to jsonb — może być stringiem ("Krystyna") lub obiektem
    const v = data.value;
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && v.nazwa) return v.nazwa;
    return FALLBACK_NAZWA;
  } catch (err) {
    console.warn("getAsystentNazwa fallback:", err.message);
    return FALLBACK_NAZWA;
  }
}

export async function setAsystentNazwa(nazwa) {
  const { error } = await supabase
    .from("mana_settings")
    .upsert({ key: KLUCZ_NAZWY, value: nazwa }, { onConflict: "key" });
  if (error) throw error;
  return true;
}

// ============================================================
// SILNIK ROZMOWY — call-serce v2 z parametrem aktywny_duch
// ============================================================

/**
 * Wysyła wiadomość do Asystenta przez call-serce v2.
 * call-serce v2 (potwierdzone na live 28.04): parametr aktywny_duch domyślnie
 * 'duch_asystent_prywatny'. Czyta serce_konstytucja_fundament + ducha z prompts.
 * Pole odpowiedzi: 'response' (META#7).
 *
 * @param {string|number} travelerId
 * @param {string} message
 * @returns {Promise<{response: string, error?: string}>}
 */
export async function wyslijDoAsystenta(travelerId, message) {
  const result = await callEdge("call-serce", {
    traveler_id: travelerId,
    message: message,
    aktywny_duch: "duch_asystent_prywatny",
  });

  if (!result.ok) {
    return {
      response: "",
      error: `call-serce HTTP ${result.status}: ${JSON.stringify(result.data)}`,
    };
  }
  return { response: result.data?.response || "" };
}

// ============================================================
// BRIEF DNIA (F1) — automatyczne otwarcie rozmowy z faktami z Horyzontu
// ============================================================

/**
 * Generuje brief dnia. Czyta events na dziś + stones aktywne, składa krótki
 * kontekst i wysyła do call-serce z marker-promptem żeby Asystent rozpoczął.
 *
 * @param {string|number} travelerId
 * @returns {Promise<{response: string, kontekst: object, error?: string}>}
 */
export async function briefDnia(travelerId) {
  const dziś = new Date();
  const startDnia = new Date(dziś);
  startDnia.setHours(0, 0, 0, 0);
  const koniecDnia = new Date(dziś);
  koniecDnia.setHours(23, 59, 59, 999);

  // events: filtr po data_czas (single timestamptz, nie data_start/data_koniec)
  // kolumny realne: tytul, data_czas, czas_trwania_min, opis, lokalizacja, traveler_id
  const eventsResp = await supabase
    .from("events")
    .select("tytul, data_czas, czas_trwania_min, opis, lokalizacja")
    .eq("traveler_id", travelerId)
    .gte("data_czas", startDnia.toISOString())
    .lte("data_czas", koniecDnia.toISOString())
    .order("data_czas", { ascending: true });

  // stones aktywne — traveler_id w stones to TEXT (META#4), trzeba castować
  const stonesResp = await supabase
    .from("stones")
    .select("tresc, typ, due_date, sekcja")
    .eq("traveler_id", String(travelerId))
    .eq("status", "aktywny")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(20);

  const events = eventsResp.data || [];
  const stones = stonesResp.data || [];

  // Marker dla Asystenta — krótki sygnał że to brief otwierający, nie pytanie podróżnika
  const marker = "[BRIEF_DNIA_START]";
  const kontekstStr =
    events.length === 0 && stones.length === 0
      ? "Dziś w kalendarzu pusto, w Słoiku też nic aktywnego."
      : `Wydarzenia dziś (${events.length}): ` +
        events
          .map((e) => {
            const t = new Date(e.data_czas).toLocaleTimeString("pl-PL", {
              hour: "2-digit",
              minute: "2-digit",
            });
            return `${t} ${e.tytul}${e.lokalizacja ? " @ " + e.lokalizacja : ""}`;
          })
          .join("; ") +
        `. Aktywne kamienie (${stones.length}): ` +
        stones.map((s) => `[${s.typ}] ${s.tresc}`).join("; ") +
        ".";

  const message = `${marker} ${kontekstStr}`;

  const wynik = await wyslijDoAsystenta(travelerId, message);
  return {
    response: wynik.response,
    error: wynik.error,
    kontekst: { events, stones },
  };
}
