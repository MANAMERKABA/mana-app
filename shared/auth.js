// shared/auth.js
//
// MANA — Faza A (z5.A) — moduł auth (placeholder MVP)
//
// MVP only — replace with proper auth + RLS twardy per [600] in z-security.
// Adam17 jest jedynym podróżnikiem testującym Fazę A. Wszystkie eventy
// frontend tworzy / modyfikuje / usuwa w jego imieniu. Brak logowania,
// brak sesji, brak weryfikacji — bo RLS w bazie i tak jest anon_all
// dla MVP wg [602], a ostrzejsze polityki RLS twarde per podróżnik
// to z-security wg [600] (rodzic NIE widzi konta dziecka bez zgody).
//
// W kolejnych pokojach (Asystent, Słoik, Gawęda...) ten sam plik
// wyeksportuje getCurrentTraveler() po prawdziwym auth flow.
//
// Powiązane: [600] MANA indywidualna, [602] brief Faza A, z-security w Planie.

export const MVP_TRAVELER_ID = 17;

/**
 * Zwraca id zalogowanego podróżnika.
 * MVP: zawsze Adam17. Po z-security: czyta z sesji.
 * @returns {number} traveler_id (bigint w bazie)
 */
export function getCurrentTraveler() {
  return MVP_TRAVELER_ID;
}
