// shared/auth.js
//
// MANA — logowanie i tożsamość podróżnika. Warstwa 1 PODRÓŻNIK.
//
// 24.05.2026 — Krok 1: realne logowanie (zamiast zaślepki).
//   Sesja Supabase Auth + odczyt podróżnika z `travels`.
//   Zawiera: logowanie, rejestrację, ODZYSKIWANIE HASŁA, wylogowanie.
//
// Fundament w bazie (gotowy): Supabase Auth, trigger `on_auth_user_created`
// tworzy wiersz `travels` przy zakładaniu konta, RLS travels auth-aware.
//
// Eksportuje:
//   getSesja(), getCurrentTraveler()
//   zaloguj({email,haslo}), zarejestruj({...}), wyloguj()
//   wyslijResetHasla(email), ustawNoweHaslo(haslo)
//   nasluchujOdzyskiwania(callback)
//   montujEkranLogowania(kontener, opcje)

import { supabase2026 } from "./supabase.js";

/* ============================================================
   API — sesja, podróżnik
   ============================================================ */

export async function getSesja() {
  const { data } = await supabase2026.auth.getSession();
  return data.session || null;
}

export async function getCurrentTraveler() {
  const sesja = await getSesja();
  if (!sesja) return null;
  const { data, error } = await supabase2026
    .from("travels").select("*").eq("auth_user_id", sesja.user.id).maybeSingle();
  if (error) { console.error("auth: getCurrentTraveler:", error); return null; }
  return data || null;
}

async function logujHistorie(payload) {
  try {
    await supabase2026.from("login_history").insert({
      ...payload,
      user_agent: navigator.userAgent,
      app_context: "mana.app — logowanie",
    });
  } catch (e) { console.warn("auth: login_history:", e); }
}

/* ============================================================
   API — logowanie / rejestracja / wylogowanie
   ============================================================ */

export async function zaloguj({ email, haslo }) {
  const { data, error } = await supabase2026.auth.signInWithPassword({
    email, password: haslo,
  });

  let travelerId = null, authId = null;
  if (data && data.user) {
    authId = data.user.id;
    const { data: t } = await supabase2026
      .from("travels").select("id").eq("auth_user_id", authId).maybeSingle();
    if (t) travelerId = t.id;
  }

  await logujHistorie({
    traveler_id: travelerId, auth_user_id: authId, email,
    success: !error, failure_reason: error ? error.message : null,
    login_method: error ? "login_failed" : "login_email_password",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function zarejestruj({ email, haslo, nick, rokUrodzenia, zgodaRegulamin, zgodaRodo }) {
  const { data, error } = await supabase2026.auth.signUp({ email, password: haslo });
  if (error) return { ok: false, error: error.message };

  const authId = data.user.id;

  // Trigger on_auth_user_created utworzył już wiersz travels — uzupełniamy go.
  // Zapisujemy WYŁĄCZNIE kolumny istniejące w tabeli `travels`.
  const patch = {
    nick,
    consent: !!zgodaRegulamin,
    consent_timestamp: new Date().toISOString(),
    gdpr_consent: !!zgodaRodo,
    gdpr_consent_at: new Date().toISOString(),
  };
  if (rokUrodzenia) {
    const r = parseInt(rokUrodzenia, 10);
    if (Number.isFinite(r)) patch.birth_year = r;
  }

  const { data: upd, error: updErr } = await supabase2026
    .from("travels").update(patch).eq("auth_user_id", authId).select().maybeSingle();

  if (updErr) {
    return { ok: false, error: "Konto utworzone, ale błąd profilu: " + updErr.message };
  }

  await logujHistorie({
    traveler_id: upd ? upd.id : null, auth_user_id: authId, email,
    success: true, login_method: "signup_email_password",
  });

  return { ok: true, potwierdzEmail: !data.session };
}

export async function wyloguj() {
  const sesja = await getSesja();
  if (sesja) {
    const traveler = await getCurrentTraveler();
    await logujHistorie({
      traveler_id: traveler ? traveler.id : null,
      auth_user_id: sesja.user.id, email: sesja.user.email,
      success: true, login_method: "logout",
    });
  }
  await supabase2026.auth.signOut();
}

/* ============================================================
   API — odzyskiwanie hasła
   ============================================================ */

// Wysyła mail z linkiem resetującym. Link wraca do tego adresu aplikacji.
// UWAGA: adres aplikacji musi być na liście dozwolonych Redirect URLs
// w panelu Supabase (Auth → URL Configuration).
export async function wyslijResetHasla(email) {
  const redirectTo = location.origin + location.pathname;
  const { error } = await supabase2026.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function ustawNoweHaslo(haslo) {
  const { error } = await supabase2026.auth.updateUser({ password: haslo });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Wykrywa powrót z linka resetującego (zdarzenie PASSWORD_RECOVERY).
export function nasluchujOdzyskiwania(callback) {
  supabase2026.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") callback();
  });
}

/* ============================================================
   EKRAN WEJŚCIA — logowanie / rejestracja / reset / nowe hasło
   ============================================================ */

function wstrzyknijStyle() {
  if (document.getElementById("mlog-style")) return;
  const s = document.createElement("style");
  s.id = "mlog-style";
  s.textContent = `
    .mlog-wrap { max-width: 380px; margin: 7vh auto; padding: 0 16px;
      font-family: var(--m-font-body, -apple-system, system-ui, sans-serif); }
    .mlog-tytul { font-family: var(--m-font-display, serif); font-size: 26px;
      text-align: center; color: var(--m-turkus, #1a7158); margin-bottom: 2px; }
    .mlog-pod { text-align: center; color: var(--m-ink-soft, #888);
      font-size: 13px; margin-bottom: 22px; }
    .mlog-taby { display: flex; border-bottom: 1px solid var(--m-line, #d0c8b8);
      margin-bottom: 18px; }
    .mlog-tab { flex: 1; padding: 10px; background: none; border: none; cursor: pointer;
      font-size: 15px; color: var(--m-ink-soft, #888); }
    .mlog-tab--on { color: var(--m-turkus, #1a7158); font-weight: 600;
      border-bottom: 2px solid var(--m-turkus, #1a7158); }
    .mlog-pole { margin-bottom: 12px; }
    .mlog-pole label { display: block; font-size: 13px; color: var(--m-ink-soft, #666);
      margin-bottom: 4px; }
    .mlog-pole input { width: 100%; box-sizing: border-box; padding: 11px;
      border: 1px solid var(--m-line, #d0c8b8); border-radius: 6px; font-size: 15px; }
    .mlog-zgoda { display: flex; gap: 8px; align-items: flex-start;
      font-size: 13px; color: var(--m-ink-soft, #555); margin-bottom: 10px; }
    .mlog-przycisk { width: 100%; padding: 13px; background: var(--m-turkus, #1a7158);
      color: #fff; border: none; border-radius: 6px; font-size: 16px; cursor: pointer;
      margin-top: 8px; }
    .mlog-przycisk:disabled { opacity: 0.6; cursor: default; }
    .mlog-link { display: inline-block; margin-top: 12px; background: none; border: none;
      color: var(--m-turkus, #1a7158); font-size: 13px; cursor: pointer; padding: 0;
      text-decoration: underline; }
    .mlog-naglowek { font-family: var(--m-font-display, serif); font-size: 18px;
      margin-bottom: 4px; }
    .mlog-opis { font-size: 13px; color: var(--m-ink-soft, #888); margin-bottom: 14px; }
    .mlog-msg { margin-top: 14px; padding: 12px; border-radius: 6px; font-size: 14px; }
    .mlog-msg--err { background: #fce4e4; color: #8b1a1a; }
    .mlog-msg--ok { background: #d4f1e3; color: #1a5e3a; }
    .mlog-msg--info { background: #e4eef5; color: #1a4a7a; }
  `;
  document.head.appendChild(s);
}

export function montujEkranLogowania(kontener, opcje) {
  opcje = opcje || {};
  const onZalogowano = opcje.onZalogowano || (() => location.reload());
  const startowy = opcje.startowy || "login";

  wstrzyknijStyle();

  kontener.innerHTML = `
    <div class="mlog-wrap">
      <div class="mlog-tytul">MANA</div>
      <div class="mlog-pod">Wejście</div>

      <div class="mlog-taby" id="mlog-taby">
        <button type="button" class="mlog-tab mlog-tab--on" data-tab="login">Logowanie</button>
        <button type="button" class="mlog-tab" data-tab="rejestracja">Rejestracja</button>
      </div>

      <form id="mlog-v-login" class="mlog-v">
        <div class="mlog-pole"><label>Email</label>
          <input type="email" id="mlog-l-email" autocomplete="email" required></div>
        <div class="mlog-pole"><label>Hasło</label>
          <input type="password" id="mlog-l-haslo" autocomplete="current-password" required></div>
        <button type="submit" class="mlog-przycisk" id="mlog-l-btn">Zaloguj się</button>
        <button type="button" class="mlog-link" id="mlog-do-reset">Nie pamiętasz hasła?</button>
      </form>

      <form id="mlog-v-rejestracja" class="mlog-v" hidden>
        <div class="mlog-pole"><label>Email</label>
          <input type="email" id="mlog-r-email" autocomplete="email" required></div>
        <div class="mlog-pole"><label>Nick</label>
          <input type="text" id="mlog-r-nick" maxlength="80" required></div>
        <div class="mlog-pole"><label>Rok urodzenia (opcjonalny)</label>
          <input type="number" id="mlog-r-rok" min="1900" max="2026"></div>
        <div class="mlog-pole"><label>Hasło (min. 6 znaków)</label>
          <input type="password" id="mlog-r-h1" autocomplete="new-password" required></div>
        <div class="mlog-pole"><label>Powtórz hasło</label>
          <input type="password" id="mlog-r-h2" autocomplete="new-password" required></div>
        <label class="mlog-zgoda"><input type="checkbox" id="mlog-r-reg">
          <span>Akceptuję regulamin MANY</span></label>
        <label class="mlog-zgoda"><input type="checkbox" id="mlog-r-rodo">
          <span>Zgoda na przetwarzanie danych zgodnie z RODO</span></label>
        <button type="submit" class="mlog-przycisk" id="mlog-r-btn">Zarejestruj się</button>
      </form>

      <form id="mlog-v-reset" class="mlog-v" hidden>
        <div class="mlog-naglowek">Odzyskiwanie hasła</div>
        <div class="mlog-opis">Podaj email — wyślemy link do ustawienia nowego hasła.</div>
        <div class="mlog-pole"><label>Email</label>
          <input type="email" id="mlog-reset-email" autocomplete="email" required></div>
        <button type="submit" class="mlog-przycisk" id="mlog-reset-btn">Wyślij link</button>
        <button type="button" class="mlog-link" id="mlog-do-login">Wróć do logowania</button>
      </form>

      <form id="mlog-v-nowehaslo" class="mlog-v" hidden>
        <div class="mlog-naglowek">Ustaw nowe hasło</div>
        <div class="mlog-opis">Wpisz nowe hasło do swojego konta.</div>
        <div class="mlog-pole"><label>Nowe hasło (min. 6 znaków)</label>
          <input type="password" id="mlog-nh-h1" autocomplete="new-password" required></div>
        <div class="mlog-pole"><label>Powtórz nowe hasło</label>
          <input type="password" id="mlog-nh-h2" autocomplete="new-password" required></div>
        <button type="submit" class="mlog-przycisk" id="mlog-nh-btn">Ustaw hasło</button>
      </form>

      <div id="mlog-msg"></div>
    </div>`;

  const widoki = {
    login: kontener.querySelector("#mlog-v-login"),
    rejestracja: kontener.querySelector("#mlog-v-rejestracja"),
    reset: kontener.querySelector("#mlog-v-reset"),
    nowehaslo: kontener.querySelector("#mlog-v-nowehaslo"),
  };
  const taby = kontener.querySelector("#mlog-taby");
  const msg = kontener.querySelector("#mlog-msg");

  function pokazMsg(typ, tekst) { msg.className = "mlog-msg mlog-msg--" + typ; msg.textContent = tekst; }
  function czyscMsg() { msg.className = ""; msg.textContent = ""; }

  function pokazWidok(nazwa) {
    Object.keys(widoki).forEach((k) => { widoki[k].hidden = (k !== nazwa); });
    // Taby widać tylko dla logowania/rejestracji.
    taby.style.display = (nazwa === "login" || nazwa === "rejestracja") ? "flex" : "none";
    if (nazwa === "login" || nazwa === "rejestracja") {
      taby.querySelectorAll(".mlog-tab").forEach((t) =>
        t.classList.toggle("mlog-tab--on", t.dataset.tab === nazwa));
    }
    czyscMsg();
  }

  taby.querySelectorAll(".mlog-tab").forEach((tab) => {
    tab.addEventListener("click", () => pokazWidok(tab.dataset.tab));
  });
  kontener.querySelector("#mlog-do-reset").addEventListener("click", () => pokazWidok("reset"));
  kontener.querySelector("#mlog-do-login").addEventListener("click", () => pokazWidok("login"));

  /* ---- logowanie ---- */
  widoki.login.addEventListener("submit", async (e) => {
    e.preventDefault();
    czyscMsg();
    const btn = kontener.querySelector("#mlog-l-btn");
    btn.disabled = true; btn.textContent = "Logowanie…";
    const wynik = await zaloguj({
      email: kontener.querySelector("#mlog-l-email").value.trim(),
      haslo: kontener.querySelector("#mlog-l-haslo").value,
    });
    btn.disabled = false; btn.textContent = "Zaloguj się";
    if (!wynik.ok) { pokazMsg("err", "Błąd logowania: " + wynik.error); return; }
    pokazMsg("ok", "Zalogowano. Wchodzę…");
    onZalogowano();
  });

  /* ---- rejestracja ---- */
  widoki.rejestracja.addEventListener("submit", async (e) => {
    e.preventDefault();
    czyscMsg();
    const email = kontener.querySelector("#mlog-r-email").value.trim();
    const nick = kontener.querySelector("#mlog-r-nick").value.trim();
    const rok = kontener.querySelector("#mlog-r-rok").value.trim();
    const h1 = kontener.querySelector("#mlog-r-h1").value;
    const h2 = kontener.querySelector("#mlog-r-h2").value;
    const reg = kontener.querySelector("#mlog-r-reg").checked;
    const rodo = kontener.querySelector("#mlog-r-rodo").checked;

    if (!email || !nick || !h1) { pokazMsg("err", "Wypełnij email, nick i hasło."); return; }
    if (h1.length < 6) { pokazMsg("err", "Hasło musi mieć min. 6 znaków."); return; }
    if (h1 !== h2) { pokazMsg("err", "Hasła nie są zgodne."); return; }
    if (!reg || !rodo) { pokazMsg("err", "Wymagane obie zgody."); return; }

    const btn = kontener.querySelector("#mlog-r-btn");
    btn.disabled = true; btn.textContent = "Rejestracja…";
    const wynik = await zarejestruj({
      email, haslo: h1, nick, rokUrodzenia: rok, zgodaRegulamin: reg, zgodaRodo: rodo,
    });
    btn.disabled = false; btn.textContent = "Zarejestruj się";

    if (!wynik.ok) { pokazMsg("err", wynik.error); return; }
    if (wynik.potwierdzEmail) {
      pokazMsg("info", "Konto utworzone. Potwierdź email z linka, potem zaloguj się.");
      pokazWidok("login");
      return;
    }
    pokazMsg("ok", "Konto utworzone. Wchodzę…");
    onZalogowano();
  });

  /* ---- reset: wyślij link ---- */
  widoki.reset.addEventListener("submit", async (e) => {
    e.preventDefault();
    czyscMsg();
    const email = kontener.querySelector("#mlog-reset-email").value.trim();
    if (!email) { pokazMsg("err", "Podaj email."); return; }
    const btn = kontener.querySelector("#mlog-reset-btn");
    btn.disabled = true; btn.textContent = "Wysyłanie…";
    const wynik = await wyslijResetHasla(email);
    btn.disabled = false; btn.textContent = "Wyślij link";
    if (!wynik.ok) { pokazMsg("err", "Błąd: " + wynik.error); return; }
    pokazMsg("info", "Jeśli konto istnieje — link do zmiany hasła został wysłany na podany email.");
  });

  /* ---- nowe hasło (powrót z linka) ---- */
  widoki.nowehaslo.addEventListener("submit", async (e) => {
    e.preventDefault();
    czyscMsg();
    const h1 = kontener.querySelector("#mlog-nh-h1").value;
    const h2 = kontener.querySelector("#mlog-nh-h2").value;
    if (h1.length < 6) { pokazMsg("err", "Hasło musi mieć min. 6 znaków."); return; }
    if (h1 !== h2) { pokazMsg("err", "Hasła nie są zgodne."); return; }
    const btn = kontener.querySelector("#mlog-nh-btn");
    btn.disabled = true; btn.textContent = "Zapisywanie…";
    const wynik = await ustawNoweHaslo(h1);
    btn.disabled = false; btn.textContent = "Ustaw hasło";
    if (!wynik.ok) { pokazMsg("err", "Błąd: " + wynik.error); return; }
    pokazMsg("ok", "Hasło zmienione. Wchodzę…");
    onZalogowano();
  });

  pokazWidok(startowy);

  return { pokazWidok };
}
