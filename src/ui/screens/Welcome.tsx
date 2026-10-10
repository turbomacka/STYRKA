import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Banner } from '../components/common';
import { callbackMessage, initialAuthCallback } from '../authCallback';

/**
 * S01 Välkommen: logga in med e-post (engångskod eller länk), lösenord som alternativ, skapa konto, integritetslänk.
 * Koden fungerar oavsett i vilken webbläsare/enhet mejlet öppnas (viktigt för installerad PWA på iOS).
 */
export function Welcome({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'link' | 'password' | 'signup'>('link');
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'verifying' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const [callbackMsg, setCallbackMsg] = useState<string | null>(() => callbackMessage(initialAuthCallback));
  const eid = useId();
  const pid = useId();
  const cid = useId();

  const isOffline = (err: unknown) => (err as { offline?: boolean }).offline || /fetch|network/i.test(String((err as Error)?.message));

  async function sendCode() {
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
    if (error) throw error;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setMsg(null);
    setCallbackMsg(null);
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { offline: true });
      if (mode === 'link') {
        await sendCode();
        setState('sent');
        return;
      }
      const { error } = mode === 'signup' ? await supabase.auth.signUp({ email: email.trim(), password }) : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setState('idle');
    } catch (err) {
      setState('error');
      const status = (err as { status?: number }).status;
      setMsg(
        isOffline(err)
          ? 'Ingen anslutning. Inloggning kräver internet första gången.'
          : status === 429
            ? 'För många försök just nu. Vänta en stund och försök igen.'
            : mode === 'link'
              ? 'Kunde inte skicka mejlet. Kontrollera e-postadressen.'
              : mode === 'signup'
                ? 'Kontot kunde inte skapas. Finns det redan? Logga i så fall in med kod via e-post.'
                : 'Inloggningen misslyckades. Kontrollera e-post och lösenord – eller logga in med kod via e-post.',
      );
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setState('verifying');
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) {
      setState('sent');
      setMsg(/expired|invalid/i.test(error.message) ? 'Koden stämmer inte eller har gått ut. Kontrollera siffrorna eller skicka en ny kod.' : 'Kunde inte logga in med koden. Försök igen.');
    }
  }

  async function resend() {
    setMsg(null);
    try {
      await sendCode();
      setMsg('Ett nytt mejl är skickat.');
    } catch (err) {
      setMsg((err as { status?: number }).status === 429 ? 'Vänta en stund innan du begär en ny kod.' : 'Kunde inte skicka ett nytt mejl.');
    }
  }

  return (
    <main className="shell">
      <div className="page stack" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 34 }}>STYRKA</h1>
        <p style={{ fontSize: 19 }}>Träningsförslag för knäböj, bänkpress och marklyft – anpassade efter din tid, din utrustning och dina egna begränsningar.</p>
        <p className="muted small">Förslag baserat på din registrerade träning och valda inställningar. Ingen medicinsk app och inga diagnoser.</p>
        {callbackMsg && <Banner kind="warn">{callbackMsg}</Banner>}
        {state === 'sent' || state === 'verifying' ? (
          <form className="card stack" onSubmit={verify} noValidate>
            <h2>Kolla din e-post</h2>
            <p>
              Vi har skickat ett mejl till <strong>{email}</strong>. Skriv in koden från mejlet här. Länken i mejlet fungerar bara om du öppnar den i den här webbläsaren.
            </p>
            <div className="field">
              <label htmlFor={cid}>Kod från mejlet</label>
              <input id={cid} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num" style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center' }} />
            </div>
            {msg && (
              <p className="error-text" role="alert">
                {msg}
              </p>
            )}
            <button type="submit" className="btn primary block big" disabled={state === 'verifying' || code.length < 6}>
              {state === 'verifying' ? 'Loggar in…' : 'Logga in med koden'}
            </button>
            <div className="row wrap">
              <button type="button" className="btn ghost" onClick={resend}>
                Skicka ny kod
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setState('idle');
                  setCode('');
                  setMsg(null);
                }}
              >
                Ändra e-post
              </button>
            </div>
          </form>
        ) : (
          <form className="card stack" onSubmit={submit} noValidate>
            <h2>{mode === 'signup' ? 'Skapa konto' : 'Logga in'}</h2>
            <div className="field">
              <label htmlFor={eid}>E-post</label>
              <input id={eid} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode !== 'link' && (
              <div className="field">
                <label htmlFor={pid}>Lösenord</label>
                <input id={pid} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {mode === 'link' && <p className="small muted">Vi mejlar en inloggningskod. Nytt konto skapas automatiskt första gången.</p>}
            {msg && (
              <p className="error-text" role="alert">
                {msg}
              </p>
            )}
            <button type="submit" className="btn primary block big" disabled={state === 'loading' || !email.includes('@') || (mode !== 'link' && password.length < 8)}>
              {state === 'loading' ? 'Vänta…' : mode === 'link' ? 'Skicka inloggningskod' : mode === 'signup' ? 'Skapa konto' : 'Logga in'}
            </button>
            <div className="row wrap">
              {mode !== 'link' && (
                <button type="button" className="btn ghost" onClick={() => setMode('link')}>
                  Logga in med kod via e-post
                </button>
              )}
              {mode !== 'password' && (
                <button type="button" className="btn ghost" onClick={() => setMode('password')}>
                  Logga in med lösenord
                </button>
              )}
              {mode !== 'signup' && (
                <button type="button" className="btn ghost" onClick={() => setMode('signup')}>
                  Skapa konto
                </button>
              )}
            </div>
          </form>
        )}
        <p>
          <Link to="/integritet">Integritet och hälsouppgifter</Link>
        </p>
      </div>
    </main>
  );
}
