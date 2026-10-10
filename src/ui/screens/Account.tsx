import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AREA_LABEL_SV, exercise } from '../../domain/catalog';
import type { LocalRestriction } from '../../storage/db';
import { deleteRestriction, saveRestriction, setHealthConsent } from '../../application/profile';
import { resolveSymptom } from '../../application/training';
import { eraseAccount, eraseHealthData, exportCsv, exportJson, signOutLocal } from '../../application/privacy';
import { Banner, ConfirmTwice, EmptyState, PageHeader } from '../components/common';
import { ConflictResolver, ConsentPanel, RestrictionPicker } from '../components/widgets';
import { useServices } from '../services';
import { MODE_SV, REACTION_SV, SIDE_SV, T } from '../strings';

function ruleText(r: LocalRestriction): string {
  const ex = (id: string | null) => (id ? exercise(id as never).nameSv : '');
  const area = r.area ? ` (${AREA_LABEL_SV[r.area]}${r.side && r.side !== 'not_applicable' ? `, ${SIDE_SV[r.side].toLowerCase()}` : ''})` : '';
  switch (r.kind) {
    case 'block_exercise':
      return r.exerciseA ? `Föreslå aldrig ${ex(r.exerciseA)}` : `Föreslå inga övningar som belastar området${area}`;
    case 'block_pair_heavy':
      return `Aldrig tung ${ex(r.exerciseA)} och tung ${ex(r.exerciseB)} i samma pass`;
    case 'limit_sets':
      return `Högst ${r.maxSets} set ${r.exerciseA ? ex(r.exerciseA) : `i området${area}`}`;
    case 'limit_mode':
      return `Högst ${MODE_SV[r.maxMode ?? 'light'].toLowerCase()} belastning ${r.exerciseA ? ex(r.exerciseA) : `i området${area}`}`;
    case 'region_note':
      return `Notering: problemområde${area}`;
  }
}

/** S14 Begränsningar: regler (aktiv/inaktiv), samtycke, rapporterade besvär. */
export function Restrictions() {
  const { ctx } = useServices();
  const nav = useNavigate();
  const rules = useLiveQuery(() => ctx.db.restrictions.toArray(), [ctx]);
  const symptoms = useLiveQuery(() => ctx.db.symptoms.toArray(), [ctx]);
  const consent = useLiveQuery(async () => {
    const c = await ctx.db.consents.get(ctx.userId);
    return !!c?.grantedAt && !c.withdrawnAt;
  }, [ctx]);
  const [adding, setAdding] = useState(false);
  const open = (symptoms ?? []).filter((s) => !s.resolvedAt);
  return (
    <div className="page stack">
      <PageHeader title="Begränsningar" back={() => nav(-1)} />
      <p className="muted">Reglerna är dina egna och gäller alla framtida förslag. Appen ignorerar dem aldrig för att hinna med ett pass.</p>
      <ConsentPanel granted={!!consent} onChange={(v) => void setHealthConsent(ctx, v)} />
      <section className="card">
        <h2>Mina regler</h2>
        {!rules?.length ? (
          <p className="muted">Inga regler.</p>
        ) : (
          <ul className="list">
            {rules.map((r) => (
              <li key={r.id} className="stack">
                <span>{ruleText(r)}</span>
                <div className="row">
                  <label className="check grow">
                    <input type="checkbox" checked={r.active} onChange={(e) => void saveRestriction(ctx, { ...r, active: e.target.checked }, r.id).catch(() => undefined)} />
                    <span>Aktiv</span>
                  </label>
                  <button type="button" className="btn" onClick={() => void deleteRestriction(ctx, r.id)}>
                    Ta bort
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {adding ? (
        <RestrictionPicker
          consent={!!consent}
          onCancel={() => setAdding(false)}
          onSave={async (r) => {
            await saveRestriction(ctx, r);
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" className="btn block" onClick={() => setAdding(true)}>
          Lägg till regel
        </button>
      )}
      {consent && (
        <section className="card">
          <h2>Rapporterade besvär</h2>
          {!open.length ? (
            <p className="muted">Inga olösta besvär.</p>
          ) : (
            <ul className="list">
              {open.map((s) => (
                <li key={s.id} className="stack">
                  <span>
                    {AREA_LABEL_SV[s.area]}
                    {s.side && s.side !== 'not_applicable' ? ` (${SIDE_SV[s.side].toLowerCase()})` : ''}: {REACTION_SV[s.reaction]} · {new Date(s.reportedAt).toLocaleDateString('sv-SE')}
                  </span>
                  <button type="button" className="btn" onClick={() => void resolveSymptom(ctx, s.id)}>
                    Markera som löst
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="small muted">Spärren tas aldrig bort automatiskt efter en viss tid – bara när du själv markerar besväret som löst.</p>
        </section>
      )}
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** S15 Data & konto: export, radera hälsoprofil, radera konto, logga ut (tvåstegsbekräftelse). */
export function DataAccount({ onSignedOut }: { onSignedOut: () => Promise<void> }) {
  const { ctx, online, syncStatus } = useServices();
  const nav = useNavigate();
  const [msg, setMsg] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);
  const pending = syncStatus?.pending ?? 0;
  const date = new Date().toISOString().slice(0, 10);
  return (
    <div className="page stack">
      <PageHeader title="Data och konto" back={() => nav(-1)} />
      <div aria-live="polite">{msg && <Banner kind={msg.kind}>{msg.text}</Banner>}</div>
      <section className="card stack">
        <h2>{T.CTA_EXPORT}</h2>
        <p className="small muted">Profil, uppskattningar, alla pass och set, planversioner, rekommendationsgrunder, begränsningar och samtycke.</p>
        <div className="row">
          <button type="button" className="btn grow" onClick={async () => download(`styrka-export-${date}.json`, JSON.stringify(await exportJson(ctx), null, 2), 'application/json')}>
            JSON
          </button>
          <button type="button" className="btn grow" onClick={async () => download(`styrka-set-${date}.csv`, await exportCsv(ctx), 'text/csv;charset=utf-8')}>
            CSV
          </button>
        </div>
      </section>
      <section className="card stack">
        <h2>Hälsorelaterade uppgifter</h2>
        <p className="small muted">Raderar rapporterade besvär, begränsningar och återkallar samtycket. Träningshistoriken behålls.</p>
        <ConfirmTwice label={T.CTA_DELETE_HEALTH} confirmLabel="Radera" onConfirm={async () => { await eraseHealthData(ctx); setMsg({ kind: 'info', text: 'Hälsorelaterade uppgifter raderade.' }); }} />
      </section>
      <section className="card stack">
        <h2>Logga ut</h2>
        {pending > 0 && <Banner kind="warn">{pending} ändring(ar) finns bara på den här enheten. Loggar du ut nu raderas de. Anslut till internet och vänta på synk först om du vill behålla dem.</Banner>}
        {pending > 0 ? (
          <ConfirmTwice label="Logga ut ändå" confirmLabel="Logga ut och radera osynkat" onConfirm={async () => { await signOutLocal(ctx, { discardUnsynced: true }); await onSignedOut(); }} />
        ) : (
          <button type="button" className="btn block" onClick={async () => { await signOutLocal(ctx); await onSignedOut(); }}>
            Logga ut
          </button>
        )}
        <p className="small muted">Vid utloggning raderas all lokal data från enheten.</p>
      </section>
      <section className="card stack">
        <h2>{T.CTA_DELETE_ACCOUNT}</h2>
        <p className="small muted">Tar bort kontot och all träningshistorik permanent. Kräver internetanslutning.</p>
        {!online && <Banner kind="warn">Du är offline. Kontoradering kräver anslutning.</Banner>}
        <ConfirmTwice label={T.CTA_DELETE_ACCOUNT} confirmLabel="Radera kontot" requireText="RADERA" onConfirm={async () => {
          try {
            await eraseAccount(ctx);
            await onSignedOut();
          } catch {
            setMsg({ kind: 'danger', text: 'Kontot kunde inte raderas just nu. Inget har tagits bort.' });
          }
        }} />
      </section>
    </div>
  );
}

/** S16 Konflikt/offline: synkstatus, lokal kö, konflikter med val av version. */
export function SyncScreen() {
  const { ctx, sync, online, syncStatus } = useServices();
  const nav = useNavigate();
  const conflicts = useLiveQuery(() => ctx.db.conflicts.toArray(), [ctx]);
  const failed = useLiveQuery(() => ctx.db.outbox.where('status').equals('rejected').toArray(), [ctx]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="page stack">
      <PageHeader title="Synk" back={() => nav(-1)} />
      <div className="card stack">
        <p>
          <strong>{online ? 'Uppkopplad' : 'Offline'}</strong>
          {syncStatus?.lastSyncedAt && <span className="muted small"> · senast synkat {new Date(syncStatus.lastSyncedAt).toLocaleTimeString('sv-SE')}</span>}
        </p>
        <p className="num">{syncStatus?.pending ?? 0} ändring(ar) väntar på att synkas.</p>
        <p className="small muted">Data som bara finns på enheten kan raderas av webbläsaren om lagringsutrymmet tar slut. Synk till servern är din säkerhetskopia.</p>
        <button type="button" className="btn primary block" disabled={!online || busy} onClick={async () => { setBusy(true); try { await sync.syncNow(); } finally { setBusy(false); } }}>
          Synka nu
        </button>
      </div>
      {conflicts && conflicts.length > 0 ? (
        conflicts.map((c) => <ConflictResolver key={c.id} conflict={c} onResolve={(choice) => sync.resolveConflict(c.id, choice)} />)
      ) : (
        <EmptyState title="Inga konflikter" />
      )}
      {failed && failed.length > 0 && (
        <Banner kind="danger">
          {failed.length} ändring(ar) kunde inte sparas på servern ({[...new Set(failed.map((f) => f.lastError))].join(', ')}). De finns kvar på enheten och i exporten. <Link to="/profil/data">Exportera</Link>
        </Banner>
      )}
    </div>
  );
}
