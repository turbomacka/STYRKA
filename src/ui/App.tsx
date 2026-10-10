import { useEffect, useState, type ReactNode } from 'react';
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
import { ExerciseSettingsScreen, Profile } from './screens/Profile';
import { DataAccount, Restrictions, SyncScreen } from './screens/Account';
import { Privacy } from './screens/Privacy';
import { UpdatePrompt } from './UpdatePrompt';

function useSession(sb: SupabaseClient): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);
  return { session, loading };
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
        {tab('/utveckling', 'Utveckling', Icon.Chart)}
        {tab('/profil', 'Profil', Icon.Person)}
      </ul>
    </nav>
  );
}

const FULLSCREEN = [/^\/pass\//, /^\/forhandsvisning/, /^\/spontan/];

function Authed({ onSignedOut }: { onSignedOut: () => Promise<void> }) {
  const { ctx, online } = useServices();
  const loc = useLocation();
  const nav = useNavigate();
  const profile = useLiveQuery(async () => (await ctx.db.profile.get(ctx.userId)) ?? null, [ctx]);
  const pulled = useLiveQuery(async () => !!(await ctx.db.meta.get('lastPullAt')), [ctx]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    void purgeOtherUsers(ctx.userId);
    const t = setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, [ctx.userId]);

  if (profile === undefined || pulled === undefined) return <p className="page" aria-busy="true">Laddar…</p>;
  // Ny enhet: vänta på första hämtningen från servern innan introduktionen visas.
  if (!profile && online && !pulled && !waited) return <p className="page" aria-busy="true">Hämtar dina uppgifter…</p>;
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
          <p>Appen saknar serverkonfiguration (VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY). Se README.</p>
        </div>
      </main>
    );
  }
  return <Configured sb={supabase()} />;
}

function Configured({ sb }: { sb: SupabaseClient }) {
  const { session, loading } = useSession(sb);
  if (loading) return <p className="page" aria-busy="true">Laddar…</p>;
  return (
    <BrowserRouter>
      <UpdatePrompt />
      {session ? (
        <SignedIn session={session} sb={sb} />
      ) : (
        <Routes>
          <Route path="/integritet" element={<Privacy />} />
          <Route path="*" element={<Welcome supabase={sb} />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
