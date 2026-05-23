// shared/event.js
//
// MANA — kafel EVENT — wspólny klient danych.
//
// Jedno miejsce dostępu do tabeli `events` (baza MerKaBa_2026) dla WSZYSTKICH
// pokoi. Pokój nie rozmawia z bazą sam — woła ten klient. Zasada "siła w
// kaflach": logikę kafla EVENT piszemy raz tutaj, pokoje (Horyzont, Puls,
// Trzos…) tylko jej używają.
//
// Decyzje wg [602]:
//   * odczyt  — supabase-js bezpośrednio (RLS anon_all dla MVP)
//   * zapis   — Edge Functions event-create / event-update / event-delete
//
// Kontrakt zwrotny — każda funkcja zwraca obiekt z polem `ok`:
//   { ok: true,  ... , error: null }   — sukces
//   { ok: false, ... , error: string } — błąd (komunikat gotowy do pokazania)

import { supabase2026, callEdge2026 } from "./supabase.js";

/**
 * Pobiera eventy podróżnika w zadanym zakresie dat.
 *
 * @param {object}        p
 * @param {number}        p.travelerId   id podróżnika (travels.id)
 * @param {Date|string}   [p.from]       początek zakresu (filtr data_czas >=)
 * @param {Date|string}   [p.to]         koniec zakresu  (filtr data_czas <=)
 * @param {string}        [p.typ]        opcjonalny filtr typu
 * @returns {Promise<{ok:boolean, events:object[], error:string|null}>}
 */
export async function pobierzEventy({ travelerId, from = null, to = null, typ = null }) {
  let q = supabase2026
    .from("events")
    .select("*")
    .eq("traveler_id", travelerId)
    .order("data_czas", { ascending: true });

  if (from) q = q.gte("data_czas", new Date(from).toISOString());
  if (to)   q = q.lte("data_czas", new Date(to).toISOString());
  if (typ)  q = q.eq("typ", typ);

  const { data, error } = await q;

  if (error) {
    console.error("pobierzEventy error:", error);
    return { ok: false, events: [], error: error.message };
  }
  return { ok: true, events: data || [], error: null };
}

/**
 * Tworzy nowy event. Wymagane pola (wg event-create): traveler_id, typ, tytul.
 *
 * @param {object} dane  pola eventu (traveler_id, typ, tytul, data_czas, koniec, …)
 * @returns {Promise<{ok:boolean, event:object|null, error:string|null}>}
 */
export async function utworzEvent(dane) {
  const r = await callEdge2026("event-create", dane);
  return { ok: r.ok, event: r.data?.event ?? null, error: r.error };
}

/**
 * Aktualizuje istniejący event.
 *
 * @param {object} dane  musi zawierać `id` i `traveler_id` + pola do zmiany
 * @returns {Promise<{ok:boolean, event:object|null, error:string|null}>}
 */
export async function zaktualizujEvent(dane) {
  const r = await callEdge2026("event-update", dane);
  return { ok: r.ok, event: r.data?.event ?? null, error: r.error };
}

/**
 * Usuwa event. event-delete sprawdza własność wpisu — stąd traveler_id.
 *
 * @param {string} id          uuid eventu
 * @param {number} travelerId  id podróżnika (właściciela)
 * @returns {Promise<{ok:boolean, error:string|null}>}
 */
export async function usunEvent(id, travelerId) {
  const r = await callEdge2026("event-delete", { id, traveler_id: travelerId });
  return { ok: r.ok, error: r.error };
}
