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

export async function wyslijDoAsystenta(travelerId, message) {
  const result = await callEdge("call-serce", {
    traveler_id: travelerId,
    message: message,
    aktywny_duch: "duch_asystent_prywatny",
  });

  // Defensywnie: callEdge.ok bywa false nawet przy HTTP 200 — sprawdzamy obecność pola response
  const response = result.data?.response;
  if (response) {
    return { response };
  }
  return {
    response: "",
    error: `call-serce HTTP ${result.status}: ${JSON.stringify(result.data)}`,
  };
}

// ============================================================
// BRIEF DNIA (F1) — automatyczne otwarcie rozmowy z faktami z Horyzontu
// ============================================================

export async function briefDnia(travelerId) {
  const dziś = new Date();
  const startDnia = new Date(dziś);
  startDnia.setHours(0, 0, 0, 0);
  const koniecDnia = new Date(dziś);
  koniecDnia.setHours(23, 59, 59, 999);

  const eventsResp = await supabase
    .from("events")
    .select("tytul, data_czas, czas_trwania_min, opis, lokalizacja")
    .eq("traveler_id", travelerId)
    .gte("data_czas", startDnia.toISOString())
    .lte("data_czas", koniecDnia.toISOString())
    .order("data_czas", { ascending: true });

  const stonesResp = await supabase
    .from("stones")
    .select("tresc, typ, due_date, sekcja")
    .eq("traveler_id", String(travelerId))
    .eq("status", "aktywny")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(20);

  const events = eventsResp.data || [];
  const stones = stonesResp.data || [];

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
