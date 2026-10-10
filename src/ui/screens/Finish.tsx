import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ALL_AREAS, AREA_LABEL_SV, type Area } from '../../domain/catalog';
import type { Side, SymptomReaction } from '../../domain/model';
import { canOfferCountAsPlanned, countExtraAsPlanned, finishSession, reportSymptom } from '../../application/training';
import { Banner, PageHeader } from '../components/common';
import { useServices } from '../services';
import { REACTION_SV, SIDE_SV } from '../strings';

/** S11 Avsluta: summering, faktisk tid, valfritt symtom; completed/partial automatiskt, avbrott med val om loggade set. */
export function Finish() {
  const { id } = useParams();
  const { ctx } = useServices();
  const nav = useNavigate();
  const session = useLiveQuery(() => ctx.db.sessions.get(id!), [ctx, id]);
  const sets = useLiveQuery(() => ctx.db.sets.where('sessionId').equals(id!).toArray(), [ctx, id]);
  const exs = useLiveQuery(() => ctx.db.sessionExercises.where('sessionId').equals(id!).toArray(), [ctx, id]);
  const consent = useLiveQuery(async () => {
    const c = await ctx.db.consents.get(ctx.userId);
    return !!c?.grantedAt && !c.withdrawnAt;
  }, [ctx]);
  const [abandon, setAbandon] = useState(false);
  const [keep, setKeep] = useState(true);
  const [report, setReport] = useState(false);
  const [area, setArea] = useState<Area>('knee');
  const [side, setSide] = useState<Side>('not_applicable');
  const [reaction, setReaction] = useState<SymptomReaction>('transient');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | { status: string; offer: boolean }>(null);
  const [busy, setBusy] = useState(false);

  if (!session || !sets || !exs) return <p className="page" aria-busy="true">Laddar…</p>;
  const active = exs.filter((e) => !e.replacedById);
  const planned = active.reduce((n, e) => n + e.snapshot.sets, 0);
  const doneSets = sets.filter((s) => s.status === 'done' && !s.deleted && s.kind === 'work').length;
  const minutes = session.startedAt ? Math.max(1, Math.round((Date.now() - Date.parse(session.startedAt)) / 60000)) : null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const fin = await finishSession(ctx, session!.id, abandon ? { status: 'abandoned', keepLoggedSets: keep } : {});
      if (report && consent) await reportSymptom(ctx, { sessionId: session!.id, area, side, reaction });
      const offer = fin.kind === 'extra' ? await canOfferCountAsPlanned(ctx, fin.id) : false;
      setDone({ status: fin.status, offer });
    } catch {
      setErr('Passet kunde inte sparas på enheten. Försök igen – inget har raderats.');
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="page stack">
        <h1>Bra jobbat</h1>
        <p>{done.status === 'completed' ? 'Passet är sparat som genomfört.' : done.status === 'partial' ? 'Passet är sparat som delvis genomfört. Alla utförda set finns kvar.' : 'Passet är avbrutet.'}</p>
        {done.offer && (
          <div className="card stack">
            <p>Du gjorde huvudövningen i ditt nästa ordinarie pass. Vill du räkna spontanpasset som det passet? Då föreslås passet därefter nästa gång.</p>
            <button
              type="button"
              className="btn block"
              onClick={async () => {
                await countExtraAsPlanned(ctx, session.id);
                nav('/');
              }}
            >
              Räkna som ordinarie
            </button>
          </div>
        )}
        <button type="button" className="btn primary block big" onClick={() => nav('/')}>
          Till Idag
        </button>
      </div>
    );

  return (
    <div className="page full stack">
      <PageHeader title="Avsluta pass" back={() => nav(-1)} />
      <div className="card">
        <p className="big-num num">
          {doneSets}/{planned} set
        </p>
        <p className="muted num">{minutes !== null ? `Faktisk tid: cirka ${minutes} min` : ''}</p>
        <p>{doneSets >= planned ? 'Alla planerade set är gjorda.' : doneSets > 0 ? 'Sparas som delvis genomfört – det räknas inte som misslyckande.' : 'Inga set registrerade.'}</p>
      </div>
      <label className="check card">
        <input type="checkbox" checked={abandon} onChange={(e) => setAbandon(e.target.checked)} />
        <span>Avbryt passet i stället</span>
      </label>
      {abandon && doneSets > 0 && (
        <label className="check card">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>Behåll de {doneSets} set jag faktiskt gjorde i historiken</span>
        </label>
      )}
      {consent ? (
        <div className="card stack">
          <label className="check">
            <input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} />
            <span>Rapportera besvär efter passet (valfritt)</span>
          </label>
          {report && (
            <>
              <div className="field">
                <label htmlFor="sym-area">Område</label>
                <select id="sym-area" value={area} onChange={(e) => setArea(e.target.value as Area)}>
                  {ALL_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {AREA_LABEL_SV[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sym-side">Sida</label>
                <select id="sym-side" value={side} onChange={(e) => setSide(e.target.value as Side)}>
                  {(Object.keys(SIDE_SV) as Side[]).map((s) => (
                    <option key={s} value={s}>
                      {SIDE_SV[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sym-r">Hur känns det?</label>
                <select id="sym-r" value={reaction} onChange={(e) => setReaction(e.target.value as SymptomReaction)}>
                  {(Object.keys(REACTION_SV) as SymptomReaction[]).map((r) => (
                    <option key={r} value={r}>
                      {REACTION_SV[r]}
                    </option>
                  ))}
                </select>
              </div>
              {['persistent', 'limping', 'swelling'].includes(reaction) && <Banner kind="warn">Vi pausar automatisk belastningsökning för övningar som belastar området tills du själv markerar besväret som löst. Vid kvarstående eller återkommande besvär bör du kontakta vården.</Banner>}
            </>
          )}
        </div>
      ) : (
        <p className="small muted">Vill du kunna rapportera besvär efter pass? Ge samtycke under Profil → Begränsningar.</p>
      )}
      {err && <Banner kind="danger">{err}</Banner>}
      <div className="bottom-cta">
        <button type="button" className={`btn block big ${abandon ? 'danger' : 'primary'}`} disabled={busy} onClick={save}>
          {abandon ? 'Avbryt passet' : 'Spara passet'}
        </button>
      </div>
    </div>
  );
}
