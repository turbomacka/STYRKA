import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { openUserDb } from '../storage/db';
import { SupabaseTransport } from '../server/supabaseTransport';
import { cryptoIds, systemClock, type AppContext } from '../application/context';
import { SyncEngine, type SyncStatus } from '../application/sync';
import { refreshFuturePlan } from '../application/trainingPlan';
import type { SyncTransport } from '../server/transport';

/** Feature flag (04 §4): stoppar viktförslag omedelbart utan att låsa historik eller export. */
export const FLAGS = {
  loadRecommendationsEnabled: (import.meta.env.VITE_FLAG_LOAD_RECOMMENDATIONS ?? 'true') !== 'false',
  /** CR 2026-10-10-01: övningsbyte v2 (kalibrering, revisionsposter). 'false' ⇒ tidigare bytesvy S09 v1. */
  substitutionV2: (import.meta.env.VITE_FLAG_SUBSTITUTION_V2 ?? 'true') !== 'false',
};

export type Services = {
  ctx: AppContext;
  sync: SyncEngine;
  online: boolean;
  email: string | null;
  syncStatus: SyncStatus | null;
  supabase: SupabaseClient | null;
};

const Ctx = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('ServicesProvider saknas');
  return s;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

type ProviderProps = { userId: string; email: string | null; supabase: SupabaseClient | null; transport?: SyncTransport; children: ReactNode };

export function ServicesProvider({ userId, email, supabase, transport, children }: ProviderProps) {
  const online = useOnline();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const core = useMemo(() => {
    const db = openUserDb(userId);
    const ctx: AppContext = {
      db,
      userId,
      transport: transport ?? new SupabaseTransport(supabase!),
      clock: systemClock,
      ids: cryptoIds,
      isOnline: () => onlineRef.current,
    };
    const sync = new SyncEngine(ctx);
    // ÄA-PLAN-001: framtidsplanen revideras i bakgrunden när indata ändrats (efter lokal ändring eller hämtning).
    // Ingen revision skapas om indata är oförändrade; fel här påverkar aldrig träningsloggningen.
    let planTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePlan = () => {
      if (planTimer) clearTimeout(planTimer);
      planTimer = setTimeout(() => void refreshFuturePlan(ctx).catch(() => undefined), 1500);
    };
    ctx.onQueued = () => {
      sync.request();
      schedulePlan();
    };
    sync.subscribe(schedulePlan);
    schedulePlan();
    return { ctx, sync };
  }, [userId, supabase, transport]);

  useEffect(() => {
    const refresh = () => void core.sync.status().then(setSyncStatus);
    const unsub = core.sync.subscribe(refresh);
    refresh();
    const t = setInterval(refresh, 3000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [core]);

  // Vid start och när nätet kommer tillbaka: hämta serverns data och spela upp kön (opportunistiskt, ingen garanti på iOS).
  useEffect(() => {
    if (!online) return;
    const refresh = () => void core.sync.refresh().catch(() => undefined);
    refresh();
    const vis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
    };
  }, [online, core]);

  // Auth-callbacken måste vara synkron. Serveranrop körs efter att Auth släppt sessionslåset.
  useEffect(() => {
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user.id === userId && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        clearTimeout(timer);
        timer = setTimeout(() => { void core.sync.refresh().catch(() => undefined); }, 0);
      }
    });
    return () => { clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [core, supabase, userId]);

  useEffect(() => () => core.sync.dispose(), [core]);

  const value = useMemo<Services>(() => ({ ...core, online, email, syncStatus, supabase }), [core, online, email, syncStatus, supabase]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
