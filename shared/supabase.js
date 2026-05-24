// shared/supabase.js
//
// MANA — Faza A (z5.A) — supabase client + Edge Function helper
//
// Single source of truth for project URL + anon key. Anon key jest
// publiczny z założenia (frontend), bezpieczeństwo zapewnia RLS
// (per podróżnik — events_wlasne, auth-aware).
//
// supabase-js z esm.sh (vanilla, bez build steps).
//
// 22.05.2026 — CEZURA / migracja pokój-po-pokoju:
//   Aplikacja przechodzi ze starej bazy (mana-serce) na nową (MerKaBa_2026).
//   Migracja idzie pokojami — każdy sprawdzony osobno, NIE jednym przepięciem.
//     * Stara baza (mana-serce)   — klient `supabase`,     helper `callEdge`
//         Używa: pokój Asystent osobisty (jeszcze nie zmigrowany).
//     * Nowa baza  (MerKaBa_2026) — klient `supabase2026`, helper `callEdge2026`
//         Używa: pokój Horyzont (kafel EVENT).
//   Gdy wszystkie pokoje przejdą na nową bazę — stary klient i helper znikają.
//
// 24.05.2026 — Krok 2: izolacja zapisu.
//   callEdge wysyła teraz TOKEN SESJI zalogowanego podróżnika
//   (access_token) w nagłówku Authorization — zamiast klucza publicznego.
//   Edge Functions event-* wyprowadzają z tego tokenu tożsamość podróżnika
//   i nie ufają już `traveler_id` z ciała żądania. Klucz publiczny idzie
//   nadal jako nagłówek `apikey` (wymagany przez bramę Supabase).
//   Bez ważnej sesji wywołanie zapisu dostanie 401 — i słusznie.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/* ====================================================================
   STARA BAZA — mana-serce (ref: kkxhqtfxvgxdqpnzaufu)
   Backend pokoju Asystent osobisty. Do wygaszenia po pełnej migracji.
   ==================================================================== */

export const SUPABASE_URL = "https://kkxhqtfxvgxdqpnzaufu.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_93n6Xfe3o60dnFFDW-XJAg_94iSY3Bz";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====================================================================
   NOWA BAZA — MerKaBa_2026 (ref: olyqkajsgcgrjfmhfycb)
   Backend kafla EVENT i pokoju Horyzont. Docelowa baza całej aplikacji.
   ==================================================================== */

export const SUPABASE_URL_2026 = "https://olyqkajsgcgrjfmhfycb.supabase.co";
export const SUPABASE_KEY_2026 = "sb_publishable_lEM7JYJreuymivywT9xELw_gHaUnrC9";

export const supabase2026 = createClient(SUPABASE_URL_2026, SUPABASE_KEY_2026);

/* ====================================================================
   callEdge — helper do wywoływania Edge Functions
   ==================================================================== */

/**
 * Fabryka helpera callEdge — wiąże wywołania Edge Functions z jedną bazą.
 *
 * Wszystkie Edge Functions Fazy A (event-*) używają POST + JSON.
 *
 * Tożsamość (Krok 2, 24.05.2026):
 *   Helper pobiera access_token z bieżącej sesji `client` i wysyła go
 *   w nagłówku Authorization. Edge Function weryfikuje token i z niego
 *   wyprowadza podróżnika. Gdy sesji brak — w Authorization leci klucz
 *   publiczny (fallback): wywołanie dotrze, ale zahartowana funkcja
 *   odrzuci je 401 ("zaloguj sie"). Klucz publiczny zawsze leci jako
 *   nagłówek `apikey` — brama Supabase tego wymaga.
 *
 * Semantyka pola `ok` (fix [622] dług #3, 29.04.2026):
 *   ok = true   ↔  HTTP 2xx + parseable JSON + brak pola data.error
 *   ok = false  ↔  HTTP non-2xx, niepoprawny JSON, lub data.error obecne
 *
 * @param {string} baseUrl  URL projektu Supabase
 * @param {string} apiKey   klucz publiczny tego projektu
 * @param {object} client   klient supabase-js tej bazy (źródło sesji)
 * @returns {(fnName:string, body:object) => Promise<{ok:boolean,status:number,data:any,error:string|null}>}
 */
function makeCallEdge(baseUrl, apiKey, client) {
  return async function callEdge(fnName, body) {
    const url = `${baseUrl}/functions/v1/${fnName}`;

    // Token tożsamości — access_token zalogowanego podróżnika.
    // Bez sesji: fallback na klucz publiczny (funkcja odrzuci 401).
    let token = apiKey;
    try {
      const { data } = await client.auth.getSession();
      if (data && data.session && data.session.access_token) {
        token = data.session.access_token;
      }
    } catch (sesjaErr) {
      console.warn("callEdge: brak dostępu do sesji:", sesjaErr);
    }

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": apiKey,
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

    // Sukces semantyczny: 1) HTTP 2xx  2) JSON sparsowany  3) brak data.error
    const httpOk = res.ok;
    const hasError = !!(data && typeof data === "object" && data.error);
    const ok = httpOk && !parseError && !hasError;

    const error = parseError
      ? parseError
      : (hasError ? String(data.error) : (httpOk ? null : `HTTP ${res.status}`));

    return { ok, status: res.status, data, error };
  };
}

/**
 * callEdge — Edge Functions STAREJ bazy (mana-serce).
 * Backend pokoju Asystent osobisty.
 */
export const callEdge = makeCallEdge(SUPABASE_URL, SUPABASE_ANON_KEY, supabase);

/**
 * callEdge2026 — Edge Functions NOWEJ bazy (MerKaBa_2026).
 * Backend kafla EVENT / pokoju Horyzont (event-create/list/update/delete).
 */
export const callEdge2026 = makeCallEdge(SUPABASE_URL_2026, SUPABASE_KEY_2026, supabase2026);
