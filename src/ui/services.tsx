import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { openUserDb } from '../storage/db';
import { SupabaseTransport } from '../server/supabaseTransport';
import { cryptoIds, systemClock, type AppContext } from '../application/context';
import { SyncEngine, type SyncStatus } from '../application/sync';
import type { SyncTransport } from '../server/transport';

/** Feature flag (04 §4): stoppar viktförslag omedelbart utan att låsa historik eller export. */
export const FLAGS = {
  loadRecommendationsEnabled: (import.meta.env.VITE_FLAG_LOAD_RECOMMENDATIONS ?? 'true') !== 'false',
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
    ctx.onQueued = () => sync.request();
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
    let cancelled = false;
    (async () => {
      try {
        await core.sync.syncNow();
        if (!cancelled) await core.sync.pull();
      } catch {
        /* nätfel hanteras av synkstatus */
      }
    })();
    const vis = () => document.visibilityState === 'visible' && core.sync.request();
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
    };
  }, [online, core]);

  useEffect(() => () => core.sync.dispose(), [core]);

  const value = useMemo<Services>(() => ({ ...core, online, email, syncStatus, supabase }), [core, online, email, syncStatus, supabase]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
