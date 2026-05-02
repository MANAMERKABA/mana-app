// shared/supabase.js
//
// MANA — Faza A (z5.A) — supabase client + Edge Function helper
//
// Single source of truth for project URL + anon key. Anon key jest
// publiczny z założenia (frontend), bezpieczeństwo zapewnia RLS
// (MVP: anon_all; z-security: per podróżnik wg [600]).
//
// supabase-js z esm.sh (vanilla, bez build steps).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

export const SUPABASE_URL = "https://kkxhqtfxvgxdqpnzaufu.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_93n6Xfe3o60dnFFDW-XJAg_94iSY3Bz";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Wywołuje Edge Function projektu MANA przez fetch.
 * Wszystkie Edge Functions Fazy A (event-create/update/delete) używają POST + JSON.
 *
 * Semantyka pola `ok` (fix [622] dług #3, 29.04.2026):
 *   ok = true  ↔  HTTP 2xx + parseable JSON + brak pola data.error
 *   ok = false  ↔  HTTP non-2xx, niepoprawny JSON, lub data.error obecne
 *
 * Wcześniej `ok` wymagał jawnego `data.ok === true` od Edge Function.
 * Większość naszych EF (call-serce → {response}, summarize-conversation → {propozycje}, etc.)
 * tego pola nie zwracała → callEdge.ok zawsze false → pokoje robiły workaround.
 * Po fixie kontrakt jest semantyczny (sukces = brak błędu), nie syntaktyczny.
 *
 * Workaround w asystent.js (sprawdzanie data.response) zostaje jako defense-in-depth.
 *
 * @param {string} fnName  np. "event-create"
 * @param {object} body    payload do wysłania jako JSON
 * @returns {Promise<{ok:boolean, status:number, data:any, error:string|null}>}
 */
export async function callEdge(fnName, body) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Network error: ${networkErr.message}`,
    };
  }

  let data = null;
  let parseError = null;
  try {
    data = await res.json();
  } catch (e) {
    parseError = `Niepoprawna odpowiedź serwera (status ${res.status})`;
  }

  // Sukces semantyczny:
  //   1) HTTP 2xx
  //   2) JSON sparsowany
  //   3) Brak data.error
  // (Nie wymagamy data.ok === true — większość EF tego nie zwraca.)
  const httpOk = res.ok;
  const hasError = !!(data && typeof data === "object" && data.error);
  const ok = httpOk && !parseError && !hasError;

  const error = parseError
    ? parseError
    : (hasError ? String(data.error) : (httpOk ? null : `HTTP ${res.status}`));

  return {
    ok,
    status: res.status,
    data: data,
    error,
  };
}
