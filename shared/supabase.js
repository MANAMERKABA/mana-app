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
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreGhxdGZ4dmd4ZHFwbnphdWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjE0NTYsImV4cCI6MjA4ODM5NzQ1Nn0.s8Ju-ww3G4_yyH6RedK2gwLveVJKD3hY2IHh62-qjfo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Wywołuje Edge Function projektu MANA przez fetch.
 * Wszystkie Edge Functions Fazy A (event-create/update/delete) używają POST + JSON.
 *
 * @param {string} fnName  np. "event-create"
 * @param {object} body    payload do wysłania jako JSON
 * @returns {Promise<{ok:boolean, status:number, data:any}>}
 */
export async function callEdge(fnName, body) {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: `Niepoprawna odpowiedź serwera (status ${res.status})` };
  }

  return {
    ok: res.ok && data?.ok === true,
    status: res.status,
    data,
  };
}
