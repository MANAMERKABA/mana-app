// shared/event.js
//
// MANA — kafel EVENT — wspólny klient danych.
//
// Jedno miejsce dostępu do tabeli `events` (baza MerKaBa_2026) dla WSZYSTKICH
// pokoi. Pokój nie rozmawia z bazą sam — woła ten klient. Zasada "siła
// w kaflach": logikę kafla EVENT piszemy raz tutaj, pokoje (Horyzont, Puls,
// Trzos…) tylko jej używają.
//
// 23.05.2026 — Z1: zadania jako część kafla EVENT.
//   Zadanie = wpis z typ="zadanie". Helpery zadań (pobierzZadania,
//   utworzZadanie, oznaczZrobione) żyją tutaj, w kaflu — żeby każdy pokój
//   (Horyzont, a w przyszłości biznes / praca grupowa) miał gotowe API zadań.
//
// Decyzje wg [602]:
//   * odczyt  — supabase-js bezpośrednio (RLS anon_all dla MVP)
//   * zapis   — Edge Functions event-create / event-update / event-delete
//
// Kontrakt zwrotny — każda funkcja zwraca obiekt z polem `ok`:
//   { ok: true,  ... , error: null }   — sukces
//   { ok: false, ... , error: string } — błąd (komunikat gotowy do pokazania)

import { supabase2026, callEdge2026 } from "./supabase.js";

/* ====================================================================
   WYDARZENIA / EVENTY — operacje ogólne (dowolny typ)
   ==================================================================== */

/**
 * Pobiera eventy podróżnika w zadanym zakresie dat.
 *
 * @param {object}      p
 * @param {number}      p.travelerId   id podróżnika (travels.id)
 * @param {Date|string} [p.from]       początek zakresu (filtr data_czas >=)
 * @param {Date|string} [p.to]         koniec zakresu  (filtr data_czas <=)
 * @param {string}      [p.typ]        opcjonalny filtr typu
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
 * @param {object} dane  pola eventu (traveler_id, typ, tytul, data_czas, …)
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

/* ====================================================================
   ZADANIA — kafel EVENT, typ="zadanie"
   Zadanie to event szczególnego typu. Te helpery dają pokojom gotowe
   API zadań bez powtarzania logiki. Zadanie MOŻE nie mieć terminu
   (data_czas puste = zadanie bez terminu).
   ==================================================================== */

/**
 * Pobiera zadania podróżnika (typ="zadanie"). Bez zakresu dat — zadania
 * bez terminu też się liczą.
 *
 * @param {object}  p
 * @param {number}  p.travelerId        id podróżnika
 * @param {boolean} [p.tylkoOtwarte]    true = pomiń zadania o statusie "zrobione"
 * @returns {Promise<{ok:boolean, zadania:object[], error:string|null}>}
 */
export async function pobierzZadania({ travelerId, tylkoOtwarte = false }) {
  let q = supabase2026
    .from("events")
    .select("*")
    .eq("traveler_id", travelerId)
    .eq("typ", "zadanie")
    .order("data_czas", { ascending: true, nullsFirst: false });

  if (tylkoOtwarte) q = q.neq("status", "zrobione");

  const { data, error } = await q;

  if (error) {
    console.error("pobierzZadania error:", error);
    return { ok: false, zadania: [], error: error.message };
  }
  return { ok: true, zadania: data || [], error: null };
}

/**
 * Tworzy zadanie. To utworzEvent z wymuszonym typ="zadanie".
 *
 * @param {object} dane  pola zadania (traveler_id, tytul, data_czas?, priorytet?, …)
 * @returns {Promise<{ok:boolean, event:object|null, error:string|null}>}
 */
export async function utworzZadanie(dane) {
  return utworzEvent({ ...dane, typ: "zadanie" });
}

/**
 * Oznacza zadanie jako zrobione / niezrobione (zmienia `status`).
 *
 * @param {string}  id           uuid zadania
 * @param {number}  travelerId   id podróżnika
 * @param {boolean} [zrobione]   true = "zrobione", false = "planowane"
 * @returns {Promise<{ok:boolean, event:object|null, error:string|null}>}
 */
export async function oznaczZrobione(id, travelerId, zrobione = true) {
  return zaktualizujEvent({
    id,
    traveler_id: travelerId,
    status: zrobione ? "zrobione" : "planowane",
  });
}
