import { useEffect, useId, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Banner } from '../components/common';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from '../authErrors';

/**
 * Lösenordsformulär. Används efter "Glömt lösenordet" (mode=recovery, helskärm) och för "Byt lösenord"
 * under Data och konto (mode=change, inbäddat).
 */
export function PasswordForm({ supabase, mode, onDone, onSkip, skipLabel = 'Gör det senare' }: { supabase: SupabaseClient; mode: 'recovery' | 'change'; onDone: () => void; onSkip?: () => void; skipLabel?: string }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const uid = useId();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const bad = validateNewPassword(pw, pw2);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      setSaved(true);
      setPw('');
      setPw2('');
      if (mode === 'change') onDone();
    } catch (err) {
      setError(authErrorMessage(err as { code?: string; status?: number; message?: string }, 'new-password'));
    } finally {
      setBusy(false);
    }
  }

  if (saved && mode === 'recovery')
    return (
      <div className="stack">
        <Banner kind="info">Ditt nya lösenord är sparat. Nästa gång loggar du in med e-post och det nya lösenordet.</Banner>
        <button type="button" className="btn primary block big" onClick={onDone}>
          Fortsätt till appen
        </button>
      </div>
    );

  return (
    <form className="stack" onSubmit={save} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-pw`}>Nytt lösenord</label>
        <input id={`${uid}-pw`} type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby={`${uid}-hint`} />
        <span id={`${uid}-hint`} className="small muted">
          Minst {MIN_PASSWORD_LENGTH} tecken.
        </span>
      </div>
      <div className="field">
        <label htmlFor={`${uid}-pw2`}>Upprepa nytt lösenord</label>
        <input id={`${uid}-pw2`} type={show ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <span>Visa lösenord</span>
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {saved && mode === 'change' && <Banner kind="info">Lösenordet är bytt.</Banner>}
      <button type="submit" className="btn primary block big" disabled={busy}>
        {busy ? 'Sparar…' : mode === 'recovery' ? 'Spara nytt lösenord' : 'Byt lösenord'}
      </button>
      {onSkip && (
        <button type="button" className="btn ghost" onClick={onSkip}>
          {skipLabel}
        </button>
      )}
    </form>
  );
}

/** Helskärm efter godkänd återställningskod/-länk (Supabase-händelsen PASSWORD_RECOVERY). */
export function NewPasswordScreen({ supabase, onDone }: { supabase: SupabaseClient; onDone: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <main className="shell">
      <div className="page stack" style={{ paddingTop: 40 }}>
        <h1 style={{ fontSize: 34 }}>STYRKA</h1>
        <section className="card stack" aria-labelledby="np-title">
          <h2 id="np-title" ref={ref} tabIndex={-1}>
            Välj nytt lösenord
          </h2>
          <p>Koden är godkänd och du är inloggad. Välj ett nytt lösenord för ditt konto.</p>
          <PasswordForm supabase={supabase} mode="recovery" onDone={onDone} onSkip={onDone} />
        </section>
      </div>
    </main>
  );
}
