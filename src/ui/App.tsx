import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { supabase, supabaseConfigured } from '../server/supabaseClient';
import { dbNameFor, openUserDb } from '../storage/db';
import { ServicesProvider, useServices } from './services';
import { Icon } from './components/common';
import { Welcome } from './screens/Welcome';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Preview } from './screens/Preview';
import { Spontaneous } from './screens/Spontaneous';
import { Train } from './screens/Train';
import { Finish } from './screens/Finish';
import { Progress } from './screens/Progress';
import { Plan } from './screens/Plan';
import { ExerciseSettingsScreen, Profile } from './screens/Profile';
import { DataAccount, Restrictions, SyncScreen } from './screens/Account';
import { Privacy } from './screens/Privacy';
import { UpdatePrompt } from './UpdatePrompt';
import { NewPasswordScreen } from './screens/NewPassword';
import { initialAuthCallback } from './authCallback';
import { Reauthenticate } from './components/Reauthenticate';

const RECOVERY_KEY = 'styrka_password_recovery';
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === '1';
  } catch {
    return false;
  }
}
function writeFlag(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* privat läge */
  }
}

/** Session + återställningsläge (efter godkänd kod/länk för glömt lösenord visas "Välj nytt lösenord" först). */
function useSession(sb: SupabaseClient): { session: Session | null; loading: boolean; recovery: boolean; endRecovery: () => void } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(readFlag);
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        writeFlag(true);
        setRecovery(true);
      } else if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        writeFlag(false);
        setRecovery(false);
      }
    });
    sb.auth.getSession().then(({ data: d }) => {
      setSession(d.session);
      // Reserv om PASSWORD_RECOVERY hann skickas före prenumerationen: återställningslänk med kod i URL:en.
      if (d.session && initialAuthCallback.recovery && initialAuthCallback.hadCode) {
        writeFlag(true);
        setRecovery(true);
      }
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);
  const endRecovery = () => {
    writeFlag(false);
    setRecovery(false);
  };
  return { session, loading, recovery, endRecovery };
}

/**
 * Kontobyte på delad enhet (03 §4): andra användares lokala databaser utan osynkade data raderas;
 * databaser med osynkade data lämnas låsta (aldrig åtkomliga för inloggad användare).
 */
async function purgeOtherUsers(currentUserId: string): Promise<void> {
  try {
    const names = await Dexie.getDatabaseNames();
    for (const n of names) {
      if (!n.startsWith('styrka_') || n === dbNameFor(currentUserId)) continue;
      const otherId = n.slice('styrka_'.length);
      const db = openUserDb(otherId);
      const pending = await db.outbox.count().catch(() => 0);
      db.close();
      if (pending === 0) await Dexie.delete(n);
    }
  } catch {
    /* getDatabaseNames stöds inte överallt */
  }
}

function BottomTabs() {
  const tab = (to: string, label: string, I: (p: { className?: string }) => ReactNode) => (
    <li>
      <NavLink to={to} end={to === '/'}>
        <I />
        <span>{label}</span>
      </NavLink>
    </li>
  );
  return (
    <nav className="tabs" aria-label="Huvudmeny">
      <ul>
        {tab('/', 'Idag', Icon.Today)}
        {tab('/plan', 'Plan', Icon.List)}
        {tab('/utveckling', 'Utveckling', Icon.Chart)}
        {tab('/profil', 'Profil', Icon.Person)}
      </ul>
    </nav>
  );
}

// Vetenskapssidan laddas separat så att inloggningen inte behöver ladda den.
const Science = lazy(() => import('./screens/Science'));
function SciencePage({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  return (
    <Suspense fallback={<p className="page" aria-busy="true">Laddar…</p>}>
      <Science backTo={backTo} backLabel={backLabel} />
    </Suspense>
  );
}

const FULLSCREEN = [/^\/pass\//, /^\/forhandsvisning/, /^\/spontan/];

function Authed({ onSignedOut }: { onSignedOut: () => Promise<void> }) {
  const { ctx, online, sync, syncStatus } = useServices();
  const loc = useLocation();
  const nav = useNavigate();
  const profile = useLiveQuery(async () => (await ctx.db.profile.get(ctx.userId)) ?? null, [ctx]);
  const pulled = useLiveQuery(async () => !!(await ctx.db.meta.get('lastPullAt')), [ctx]);
  useEffect(() => {
    void purgeOtherUsers(ctx.userId);
  }, [ctx.userId]);

  if (profile === undefined || pulled === undefined) return <p className="page" aria-busy="true">Laddar…</p>;
  // Publika informationssidor nås även före introduktionen.
  if (loc.pathname === '/vetenskap') return <SciencePage backTo={profile?.onboardingCompletedAt ? '/profil' : '/'} backLabel={profile?.onboardingCompletedAt ? 'Till Profil' : 'Tillbaka'} />;
  // Bara ett lyckat serversvar får fastställa att kontot är nytt. Tid eller nätfel är inget sådant besked.
  if (!profile && !pulled) {
    if (syncStatus?.state === 'auth_required') return <main className="shell"><div className="page"><Reauthenticate /></div></main>;
    if (!online || syncStatus?.pullState === 'error' || syncStatus?.state === 'error' || syncStatus?.state === 'offline') return (
      <main className="shell"><div className="page stack">
        <h1>Vi kunde inte hämta dina uppgifter</h1>
        <p>{online ? 'Försök igen för att fortsätta med ditt konto.' : 'Anslut till internet för att hämta ditt konto till den här enheten.'}</p>
        <button type="button" className="btn primary block" disabled={!online || syncStatus?.pullState === 'loading'} onClick={() => { void sync.refresh().catch(() => undefined); }}>Försök igen</button>
      </div></main>
    );
    return <p className="page" role="status" aria-busy="true">Hämtar dina uppgifter…</p>;
  }
  if (!profile || !profile.onboardingCompletedAt) return <Onboarding onDone={() => nav('/', { replace: true })} />;
  const full = FULLSCREEN.some((r) => r.test(loc.pathname));
  return (
    <div className="shell">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/forhandsvisning" element={<Preview />} />
        <Route path="/spontan" element={<Spontaneous />} />
        <Route path="/pass/:id" element={<Train />} />
        <Route path="/pass/:id/avsluta" element={<Finish />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/utveckling" element={<Progress />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/profil/ovningar" element={<ExerciseSettingsScreen />} />
        <Route path="/profil/begransningar" element={<Restrictions />} />
        <Route path="/profil/data" element={<DataAccount onSignedOut={onSignedOut} />} />
        <Route path="/synk" element={<SyncScreen />} />
        <Route path="/integritet" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!full && <BottomTabs />}
    </div>
  );
}

function SignedIn({ session, sb }: { session: Session; sb: SupabaseClient }) {
  const signOut = async () => {
    await sb.auth.signOut().catch(() => undefined);
    window.location.assign('/');
  };
  return (
    <ServicesProvider key={session.user.id} userId={session.user.id} email={session.user.email ?? null} supabase={sb}>
      <Authed onSignedOut={signOut} />
    </ServicesProvider>
  );
}

export function App() {
  if (!supabaseConfigured) {
    return (
      <main className="shell">
        <div className="page">
          <h1>STYRKA</h1>
          <p>STYRKA kan inte starta just nu. Försök igen senare.</p>
        </div>
      </main>
    );
  }
  return <Configured sb={supabase()} />;
}

function Configured({ sb }: { sb: SupabaseClient }) {
  const { session, loading, recovery, endRecovery } = useSession(sb);
  if (loading) return <p className="page" aria-busy="true">Laddar…</p>;
  return (
    <BrowserRouter>
      <UpdatePrompt />
      {session && recovery ? (
        <NewPasswordScreen supabase={sb} onDone={endRecovery} />
      ) : session ? (
        <SignedIn session={session} sb={sb} />
      ) : (
        <Routes>
          <Route path="/integritet" element={<Privacy />} />
          <Route path="/vetenskap" element={<SciencePage backTo="/" backLabel="Till inloggning" />} />
          <Route path="*" element={<Welcome supabase={sb} />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
