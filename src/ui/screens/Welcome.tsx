import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Banner } from '../components/common';
import { callbackMessage, initialAuthCallback } from '../authCallback';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateEmail, validateNewPassword, type AuthContext } from '../authErrors';

type View = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset-sent' | 'link-request' | 'link-sent';

const TITLE: Record<View, string> = {
  login: 'Logga in',
  signup: 'Skapa konto',
  confirm: 'Bekräfta din e-post',
  forgot: 'Glömt lösenordet',
  'reset-sent': 'Återställ lösenordet',
  'link-request': 'Logga in via e-post',
  'link-sent': 'Kolla din e-post',
};

/**
 * S01 Välkommen: klassisk inloggning med e-post och lösenord, skapa konto (bekräftelse via länk eller kod),
 * glömt lösenord (länk eller kod), samt inloggning via e-post utan lösenord som alternativ.
 * E-postlänkar fungerar i vilken webbläsare de än öppnas i; koder används när mejlet innehåller en.
 * Varje steg ger synlig återkoppling; fel visas i klartext på svenska.
 */
export function Welcome({ supabase }: { supabase: SupabaseClient }) {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(() => callbackMessage(initialAuthCallback));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const uid = useId();
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [view]);

  /** Byt vy. Lösenordet behålls från "Skapa konto" till "Bekräfta" så att inloggning efter bekräftelse blir ett tryck. */
  const go = (v: View, nextInfo: string | null = null) => {
    setView(v);
    setError(null);
    setInfo(nextInfo);
    setCode('');
    setPassword2('');
    if (v !== 'login' && v !== 'signup' && v !== 'confirm') setPassword('');
  };

  async function run(ctx: AuthContext, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e as { code?: string; status?: number; message?: string }, ctx));
    } finally {
      setBusy(false);
    }
  }

  const trimmed = email.trim();
  const existsMsg = `Det finns redan ett konto för ${trimmed}. Logga in med ditt lösenord, eller välj ”Glömt lösenordet?” om du inte har något.`;

  async function passwordLogin(onUnconfirmed: 'resend' | 'explain') {
    const { error: err } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (err?.code === 'email_not_confirmed') {
      if (onUnconfirmed === 'explain') {
        setError('E-postadressen är inte bekräftad ännu. Klicka på länken i mejlet först – eller skicka ett nytt mejl.');
        return;
      }
      await supabase.auth.resend({ type: 'signup', email: trimmed, options: { emailRedirectTo: origin } });
      go('confirm', `E-postadressen är inte bekräftad ännu. Vi har skickat ett nytt bekräftelsemejl till ${trimmed}.`);
      return;
    }
    if (err) throw err;
  }

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validateEmail(trimmed) ?? (password ? null : 'Ange ditt lösenord.');
    if (bad) return setError(bad);
    void run('login', () => passwordLogin('resend'));
  };

  const signup = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validateEmail(trimmed) ?? validateNewPassword(password, password2);
    if (bad) return setError(bad);
    void run('signup', async () => {
      const { data, error: err } = await supabase.auth.signUp({ email: trimmed, password, options: { emailRedirectTo: origin } });
      if (err?.code === 'user_already_exists' || err?.code === 'email_exists') return go('login', existsMsg);
      if (err) throw err;
      if (data.session) return; // bekräftelse avstängd: inloggad direkt
      // Supabase döljer befintliga konton bakom ett "lyckat" svar utan identiteter.
      if (data.user && (data.user.identities?.length ?? 0) === 0) return go('login', existsMsg);
      go('confirm', `Kontot är skapat. Vi har skickat ett bekräftelsemejl till ${trimmed}.`);
    });
  };

  /** Efter klick på bekräftelselänken (i valfri webbläsare): logga in här med lösenordet från "Skapa konto". */
  const confirmedLogin = () => {
    if (!password) return go('login', 'Logga in med din e-post och ditt lösenord.');
    void run('login', () => passwordLogin('explain'));
  };

  const verify = (type: 'email' | 'recovery', ctx: AuthContext) => (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return setError('Ange koden från mejlet.');
    void run(ctx, async () => {
      let { error: err } = await supabase.auth.verifyOtp({ email: trimmed, token: code, type });
      // Bekräftelsekoder kan i äldre Auth-versioner kräva typen 'signup'.
      if (err && ctx === 'confirm') ({ error: err } = await supabase.auth.verifyOtp({ email: trimmed, token: code, type: 'signup' }));
      if (err) throw err;
    });
  };

  const sendReset = () => supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: origin && `${origin}/?recovery=1` });
  const sendLink = () => supabase.auth.signInWithOtp({ email: trimmed, options: { shouldCreateUser: false, emailRedirectTo: origin } });

  const forgot = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validateEmail(trimmed);
    if (bad) return setError(bad);
    void run('forgot', async () => {
      const { error: err } = await sendReset();
      if (err) throw err;
      go('reset-sent', `Om det finns ett konto för ${trimmed} har vi skickat ett mejl för att välja nytt lösenord.`);
    });
  };

  const requestLink = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validateEmail(trimmed);
    if (bad) return setError(bad);
    void run('code', async () => {
      const { error: err } = await sendLink();
      if (err) throw err;
      go('link-sent', `Vi har skickat ett inloggningsmejl till ${trimmed}.`);
    });
  };

  const resend = (kind: 'signup' | 'recovery' | 'link') => () =>
    void run(kind === 'signup' ? 'confirm' : kind === 'recovery' ? 'reset' : 'code', async () => {
      const r = kind === 'signup' ? await supabase.auth.resend({ type: 'signup', email: trimmed, options: { emailRedirectTo: origin } }) : kind === 'recovery' ? await sendReset() : await sendLink();
      if (r.error) throw r.error;
      setInfo(`Ett nytt mejl är skickat till ${trimmed}.`);
    });

  const emailField = (autoComplete: 'username' | 'email' = 'username') => (
    <div className="field">
      <label htmlFor={`${uid}-email`}>E-post</label>
      <input id={`${uid}-email`} type="email" inputMode="email" autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
    </div>
  );
  const pwField = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: 'current-password' | 'new-password', hint?: string) => (
    <div className="field">
      <label htmlFor={`${uid}-${id}`}>{label}</label>
      <input id={`${uid}-${id}`} type={show ? 'text' : 'password'} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required value={value} onChange={(e) => set(e.target.value)} aria-describedby={hint ? `${uid}-${id}-hint` : undefined} />
      {hint && (
        <span id={`${uid}-${id}-hint`} className="small muted">
          {hint}
        </span>
      )}
    </div>
  );
  const showToggle = (
    <label className="check">
      <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
      <span>Visa lösenord</span>
    </label>
  );
  const codeForm = (type: 'email' | 'recovery', ctx: AuthContext, buttonLabel: string) => (
    <form className="stack" onSubmit={verify(type, ctx)} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-code`}>Kod från mejlet</label>
        <input id={`${uid}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="num" style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center' }} aria-describedby={`${uid}-code-hint`} />
        <span id={`${uid}-code-hint`} className="small muted">
          Bara om mejlet innehåller en sifferkod.
        </span>
      </div>
      <button type="submit" className="btn block" disabled={busy}>
        {buttonLabel}
      </button>
    </form>
  );
  const submit = (label: string, busyLabel = 'Vänta…') => (
    <button type="submit" className="btn primary block big" disabled={busy}>
      {busy ? busyLabel : label}
    </button>
  );
  const linkBtn = (label: string, onClick: () => void) => (
    <button type="button" className="btn ghost" onClick={onClick}>
      {label}
    </button>
  );

  let body: ReactNode;
  switch (view) {
    case 'login':
      body = (
        <form className="stack" onSubmit={login} noValidate>
          {emailField()}
          {pwField('pw', 'Lösenord', password, setPassword, 'current-password')}
          {showToggle}
          {submit('Logga in', 'Loggar in…')}
          <div className="row wrap spread">
            {linkBtn('Glömt lösenordet?', () => go('forgot'))}
            {linkBtn('Logga in via e-post utan lösenord', () => go('link-request'))}
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <p className="small muted" style={{ margin: 0 }}>
            Inget konto än?
          </p>
          <button type="button" className="btn block" onClick={() => go('signup')}>
            Skapa konto
          </button>
        </form>
      );
      break;
    case 'signup':
      body = (
        <form className="stack" onSubmit={signup} noValidate>
          {emailField('email')}
          {pwField('pw', 'Lösenord', password, setPassword, 'new-password', `Minst ${MIN_PASSWORD_LENGTH} tecken.`)}
          {pwField('pw2', 'Upprepa lösenord', password2, setPassword2, 'new-password')}
          {showToggle}
          {submit('Skapa konto', 'Skapar konto…')}
          {linkBtn('Har du redan ett konto? Logga in', () => go('login'))}
        </form>
      );
      break;
    case 'confirm':
      body = (
        <div className="stack">
          <ol className="stack" style={{ paddingLeft: 20, margin: 0 }}>
            <li>
              Öppna mejlet till <strong>{trimmed}</strong> och klicka på länken. Det fungerar i vilken webbläsare som helst.
            </li>
            <li>Kom tillbaka hit och tryck på knappen nedan.</li>
          </ol>
          <button type="button" className="btn primary block big" disabled={busy} onClick={confirmedLogin}>
            {busy ? 'Loggar in…' : 'Jag har bekräftat – logga in'}
          </button>
          {codeForm('email', 'confirm', 'Bekräfta med kod')}
          <div className="row wrap">
            {linkBtn('Skicka nytt mejl', resend('signup'))}
            {linkBtn('Tillbaka till inloggning', () => go('login'))}
          </div>
        </div>
      );
      break;
    case 'forgot':
      body = (
        <form className="stack" onSubmit={forgot} noValidate>
          <p>Ange din e-post så skickar vi ett mejl där du kan välja ett nytt lösenord. Det fungerar också om du hittills loggat in utan lösenord.</p>
          {emailField()}
          {submit('Skicka återställningsmejl', 'Skickar…')}
          {linkBtn('Tillbaka till inloggning', () => go('login'))}
        </form>
      );
      break;
    case 'reset-sent':
      body = (
        <div className="stack">
          <p>Klicka på länken i mejlet. Då öppnas STYRKA och du kan välja ett nytt lösenord direkt, i den webbläsare där länken öppnas. Sedan loggar du in med det nya lösenordet var du vill.</p>
          {codeForm('recovery', 'reset', 'Fortsätt med kod')}
          <div className="row wrap">
            {linkBtn('Skicka nytt mejl', resend('recovery'))}
            {linkBtn('Tillbaka till inloggning', () => go('login'))}
          </div>
        </div>
      );
      break;
    case 'link-request':
      body = (
        <form className="stack" onSubmit={requestLink} noValidate>
          <p>Vi mejlar en inloggningslänk. Det kräver att du redan har ett konto.</p>
          {emailField()}
          {submit('Skicka inloggningsmejl', 'Skickar…')}
          {linkBtn('Tillbaka till inloggning', () => go('login'))}
        </form>
      );
      break;
    case 'link-sent':
      body = (
        <div className="stack">
          <p>Klicka på länken i mejlet – du loggas in i den webbläsare där länken öppnas.</p>
          {codeForm('email', 'code', 'Logga in med koden')}
          <div className="row wrap">
            {linkBtn('Skicka nytt mejl', resend('link'))}
            {linkBtn('Tillbaka till inloggning', () => go('login'))}
          </div>
        </div>
      );
      break;
  }

  return (
    <main className="shell">
      <div className="page stack" style={{ paddingTop: 40 }}>
        <h1 style={{ fontSize: 34 }}>STYRKA</h1>
        {view === 'login' && (
          <>
            <p style={{ fontSize: 19 }}>Träningsförslag för knäböj, bänkpress och marklyft – anpassade efter din tid, din utrustning och dina egna begränsningar.</p>
            <p className="muted small">Förslag baserat på din registrerade träning och valda inställningar. Ingen medicinsk app och inga diagnoser.</p>
          </>
        )}
        <section className="card stack" aria-labelledby={`${uid}-title`}>
          <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}>
            {TITLE[view]}
          </h2>
          <div role="status" aria-live="polite">
            {info && <Banner kind="info">{info}</Banner>}
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {body}
        </section>
        <p>
          <Link to="/integritet">Integritet och hälsouppgifter</Link>
        </p>
      </div>
    </main>
  );
}
