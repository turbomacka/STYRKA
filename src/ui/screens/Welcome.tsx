import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Banner } from '../components/common';

/** S01 Välkommen: kort syfte, logga in (magisk länk eller lösenord), skapa konto, integritetslänk. */
export function Welcome({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'link' | 'password' | 'signup'>('link');
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  const eid = useId();
  const pid = useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setMsg(null);
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { offline: true });
      if (mode === 'link') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: true } });
        if (error) throw error;
        setState('sent');
        return;
      }
      const { error } = mode === 'signup' ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setState('idle');
    } catch (err) {
      setState('error');
      const offline = (err as { offline?: boolean }).offline || /fetch|network/i.test(String((err as Error).message));
      setMsg(offline ? 'Ingen anslutning. Inloggning kräver internet första gången.' : mode === 'link' ? 'Kunde inte skicka länken. Kontrollera e-postadressen.' : 'Inloggningen misslyckades. Kontrollera e-post och lösenord.');
    }
  }

  return (
    <main className="shell">
      <div className="page stack" style={{ paddingTop: 48 }}>
        <h1 style={{ fontSize: 34 }}>STYRKA</h1>
        <p style={{ fontSize: 19 }}>Träningsförslag för knäböj, bänkpress och marklyft – anpassade efter din tid, din utrustning och dina egna begränsningar.</p>
        <p className="muted small">Förslag baserat på din registrerade träning och valda inställningar. Ingen medicinsk app och inga diagnoser.</p>
        {state === 'sent' ? (
          <Banner kind="info" title="Kolla din e-post.">
            Vi har skickat en inloggningslänk till {email}. Öppna den på den här enheten.
          </Banner>
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
            {msg && (
              <p className="error-text" role="alert">
                {msg}
              </p>
            )}
            <button type="submit" className="btn primary block big" disabled={state === 'loading' || !email.includes('@') || (mode !== 'link' && password.length < 8)}>
              {state === 'loading' ? 'Vänta…' : mode === 'link' ? 'Skicka inloggningslänk' : mode === 'signup' ? 'Skapa konto' : 'Logga in'}
            </button>
            <div className="row wrap">
              {mode !== 'link' && (
                <button type="button" className="btn ghost" onClick={() => setMode('link')}>
                  Logga in med länk
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
