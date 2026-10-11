import { useId, useState } from 'react';
import { authErrorMessage } from '../authErrors';
import { useServices } from '../services';
import { PasswordField } from './PasswordField';

/** Återautentisering behåller databasen och kön; vanlig utloggning används aldrig här. */
export function Reauthenticate() {
  const { ctx, email, supabase, sync, online } = useServices();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const reset = async () => {
    if (!supabase || !email) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?recovery=1` });
      if (err) throw err;
      setInfo('Öppna länken i mejlet för att välja ett nytt lösenord. Dina lokala träningsdata finns kvar.');
    } catch (e) { setError(authErrorMessage(e as Error, 'forgot')); }
    finally { setBusy(false); }
  };
  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Logga in igen för att synka</h2>
      <p>Din inloggning behöver förnyas. Dina sparade träningsdata finns kvar på enheten.</p>
      {!open ? <button type="button" className="btn primary block" disabled={!online} onClick={() => setOpen(true)}>Logga in igen</button> : (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          if (!supabase || !email || !password || busy) return;
          setBusy(true); setError(null); setInfo(null);
          try {
            const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
            if (err) throw err;
            if (data.user?.id !== ctx.userId) throw new Error('Fel konto');
            setPassword('');
            await sync.refresh();
            setOpen(false);
          } catch (err) { setError(authErrorMessage(err as Error, 'login')); }
          finally { setBusy(false); }
        }}>
          <p className="small">Konto: <strong>{email}</strong></p>
          <PasswordField id={`${id}-password`} label="Lösenord" value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} />
          <button type="submit" className="btn primary block" disabled={busy || !online || !email}>{busy ? 'Loggar in…' : 'Logga in och synka'}</button>
          <button type="button" className="btn ghost" disabled={busy || !online} onClick={() => { void reset(); }}>Glömt lösenordet?</button>
        </form>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
      {info && <p role="status">{info}</p>}
    </section>
  );
}
