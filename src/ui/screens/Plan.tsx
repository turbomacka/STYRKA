import { NextWorkout, SyncLink } from './Today';
import type { SavedWorkoutFeedback } from '../../application/workoutFeedback';
import { PerformanceHistory } from '../components/TrainingHistory';
/**
 * ÄA-PLAN-001 "Min träningsplan": Kommande (levande, preliminär plan) och Genomförda (träningsdagbok).
 * En rad per pass i stängt läge; detaljer bara för det användaren expanderar. Ingen vy här ändrar träningsdata;
 * att öppna, expandera, byta flik eller skriva ut skapar ingen planrevision.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { exercise, type ExerciseId, type LoadKind } from '../../domain/catalog';
import type { PlanSnapshot } from '../../domain/model';
import { formatKg } from '../../domain/units';
import { activeSession, previewNext } from '../../application/training';
import { CHANGE_TYPE_SV, getFuturePlan, getNote, getWorkoutDetail, getWorkoutHistory, lastPerformed, NOTE_MAX_LENGTH, PLAN_HORIZONS, planRevisions, saveNote, type NoteTarget, type PlanSlot, type WorkoutDetail, type WorkoutSummary } from '../../application/trainingPlan';
import type { LocalPlanRevision, LocalSession, LocalSet } from '../../storage/db';
import { Banner, Expandable, Icon, Segmented } from '../components/common';
import { prescriptionText } from '../components/widgets';
import { DeleteWorkout } from '../components/DeleteWorkout';
import { CatchUpCard } from '../components/CatchUpCard';
import { useServices } from '../services';
import { MODE_SV, PLAN, TEMPLATE_SV } from '../strings';

type Tab = 'upcoming' | 'done';
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* lagring kan saknas (privat läge) */
    }
  },
};

// "Pass 7 · A – knäböj och bänk": mallnamnets inledande "Pass" upprepas inte efter passnumret.
const templateName = (key: string | null) => (key ? (TEMPLATE_SV[key] ?? 'Pass').replace(/^Pass /, '') : 'Pass');
const dateSv = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const dateTimeSv = (iso: string) => new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function loadText(grams: number | null, reps: number | null, seconds: number | null, lk: LoadKind, perHand: boolean): string {
  if (lk === 'duration_sec') return `${seconds ?? '–'} s`;
  const r = `${reps ?? '–'}`;
  if (lk === 'reps_only' || grams === null) return `${r} reps`;
  if (lk === 'assistance_kg') return `${formatKg(grams)} kg assistans × ${r}`;
  if (lk === 'bodyweight_plus_kg') return grams === 0 ? `kroppsvikt × ${r}` : `+${formatKg(grams)} kg × ${r}`;
  return `${formatKg(grams)} kg${perHand ? '/hantel' : ''} × ${r}`;
}

export function Plan() {
  const {ctx}=useServices();
  const [params, setParams] = useSearchParams();
  const completed=params.get('klart');
  const feedback=useLiveQuery(async()=>completed ? (await ctx.db.meta.get(`workout-feedback:${completed}`))?.value as SavedWorkoutFeedback|undefined : undefined,[ctx,completed]);
  const fromUrl = params.get('flik');
  const initial: Tab = fromUrl === 'genomforda' ? 'done' : fromUrl === 'kommande' ? 'upcoming' : 'upcoming';
  const [tab, setTab] = useState<Tab>(initial);
  const [printing, setPrinting] = useState<null | { includeNotes: boolean }>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const choose = (t: Tab) => {
    setTab(t);
    store.set('plan.tab', t);
    setParams({ flik: t === 'done' ? 'genomforda' : 'kommande' }, { replace: true });
  };
  return (
    <div className="page stack plan">
      <div className="row spread no-print">
        <h1 style={{ margin: 0 }}>{PLAN.TITLE}</h1><SyncLink/>
      </div>
      {feedback&&<section className="card stack no-print" role="status"><strong>Passet är sparat</strong><p>{feedback.text}</p><button type="button" className="btn" onClick={()=>choose('done')}>Visa genomfört pass</button></section>}
      {!printing&&<NextWorkout/>}
      <div className="no-print">
        <Segmented label={PLAN.TAB_LABEL} value={tab} onChange={choose} options={[{ value: 'upcoming', label: PLAN.UPCOMING }, { value: 'done', label: PLAN.DONE }]} />
      </div>
      {tab === 'upcoming' && !printing && <CatchUpCard />}
      {tab === 'upcoming' ? <Upcoming printing={!!printing} onPrinted={() => setPrinting(null)} /> : <Done printing={printing} onPrinted={() => setPrinting(null)} />}
      <div className="card stack no-print">
        {tab === 'done' && (
          <label className="check">
            <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
            <span>{PLAN.PRINT_NOTES}</span>
          </label>
        )}
        <button type="button" className="btn block" onClick={() => setPrinting({ includeNotes })}>
          <Icon.Print /> {PLAN.PRINT}
        </button>
      </div>
    </div>
  );
}

/** Webbläsarens utskrift (Spara som PDF). Utskriftsvyn ligger kvar tills webbläsaren meddelar att utskriften är klar. */
function usePrint(active: boolean, ready: boolean, done: () => void) {
  useEffect(() => {
    if (!active || !ready) return;
    const after = () => done();
    window.addEventListener('afterprint', after, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [active, ready, done]);
}

// ---------------------------------------------------------------------------
// Kommande
// ---------------------------------------------------------------------------

function Upcoming({ printing, onPrinted }: { printing: boolean; onPrinted: () => void }) {
  const { ctx } = useServices();
  const [horizon, setHorizon] = useState<number>(() => {
    const v = Number(store.get('plan.horizon'));
    return (PLAN_HORIZONS as readonly number[]).includes(v) ? v : 12;
  });
  const [extra, setExtra] = useState(0);
  const [viewRevision, setViewRevision] = useState<string | null>(null);
  const revKey = useLiveQuery(async () => `${await ctx.db.skipEvents.count()}|${await ctx.db.planRevisions.count()}|${await ctx.db.sessions.count()}|${(await ctx.db.programs.toArray()).map((p) => `${p.id}:${p.rotationIndex}`).join()}|${await ctx.db.restrictions.count()}|${JSON.stringify((await ctx.db.profile.get(ctx.userId)) ?? {})}`, [ctx]);
  const active = useLiveQuery(() => activeSession(ctx), [ctx]);
  const [data, setData] = useState<{ revision: LocalPlanRevision; slots: PlanSlot[]; current: boolean } | null | undefined>(undefined);
  const [next, setNext] = useState<PlanSnapshot | null>(null);
  const [revs, setRevs] = useState<LocalPlanRevision[]>([]);
  const count = horizon + extra;

  useEffect(() => {
    let alive = true;
    void getFuturePlan(ctx, count, viewRevision ?? undefined)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    void planRevisions(ctx).then((r) => alive && setRevs(r));
    void previewNext(ctx)
      .then((p) => alive && setNext(p))
      .catch(() => alive && setNext(null));
    return () => {
      alive = false;
    };
  }, [ctx, count, viewRevision, revKey]);

  usePrint(printing, !!data, onPrinted);

  if (data === undefined) return <p aria-busy="true">Hämtar planen…</p>;
  if (data === null) return <Banner kind="info">{PLAN.NO_PLAN}</Banner>;
  const activeSeq = active && active.kind === 'planned' && data.current && data.slots[0] && active.rotationIndex === data.slots[0].rotationIndex ? data.slots[0].slotSequence : null;

  return (
    <>
      <details className="no-print stack"><summary>Planens omfattning och tidigare versioner</summary>
        <Segmented
          label={PLAN.HORIZON}
          value={String(horizon) as `${number}`}
          onChange={(v) => {
            setHorizon(Number(v));
            setExtra(0);
            store.set('plan.horizon', v);
          }}
          options={PLAN_HORIZONS.map((n) => ({ value: String(n) as `${number}`, label: `${n}` }))}
        />
        {viewRevision ? (
          <Banner kind="warn" title={PLAN.VIEWING_OLD}>
            {dateTimeSv(data.revision.createdAt)} · {data.revision.summary}{' '}
            <button type="button" className="btn ghost" onClick={() => setViewRevision(null)}>
              {PLAN.SHOW_CURRENT}
            </button>
          </Banner>
        ) : (
          <Banner kind="info">{PLAN.PRELIMINARY}</Banner>
        )}
        <p className="small muted">
          {PLAN.VERSION} {dateTimeSv(data.revision.createdAt)} · {CHANGE_TYPE_SV[data.revision.changeType] ?? data.revision.changeType}
        </p>
        {revs.length > 1 && (
          <details className="plan-versions">
            <summary>{PLAN.EARLIER}</summary>
            <ul className="list small">
              {revs.slice(viewRevision ? 0 : 1).map((r) => (
                <li key={r.id}>
                  <button type="button" className="btn ghost block plan-version" aria-current={r.id === viewRevision ? 'true' : undefined} onClick={() => setViewRevision(r.id === revs[0].id ? null : r.id)}>
                    <span>
                      <strong>{dateTimeSv(r.createdAt)}</strong> · {CHANGE_TYPE_SV[r.changeType] ?? r.changeType}
                    </span>
                    <span className="muted">{r.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </details>
      <ol className="list plan-list" aria-label={`${PLAN.UPCOMING} pass`}>
        {data.slots.map((s) => (
          <SlotRow key={s.plannedSlotId} slot={s} live={s.status === 'ready' && data.current && !viewRevision ? next : null} activeSession={activeSeq === s.slotSequence ? active! : null} readOnly={!!viewRevision} printing={printing} />
        ))}
      </ol>
      {!viewRevision && (
        <button type="button" className="btn block no-print" onClick={() => setExtra(extra + 36)}>
          {PLAN.SHOW_MORE}
        </button>
      )}
      <PrintHeader revision={data.revision} />
    </>
  );
}

function PrintHeader({ revision }: { revision?: LocalPlanRevision }) {
  return (
    <div className="print-only print-head">
      <p>
        <strong>{PLAN.PRINT_TITLE}</strong> · {PLAN.PRINT_SNAPSHOT} · Skapad {dateTimeSv(new Date().toISOString())}
        {revision ? ` · ${PLAN.VERSION} ${revision.id.slice(0, 8)} (${dateTimeSv(revision.createdAt)})` : ''}
      </p>
    </div>
  );
}

function SlotRow({ slot, live, activeSession: act, readOnly, printing }: { slot: PlanSlot; live: PlanSnapshot | null; activeSession: LocalSession | null; readOnly: boolean; printing: boolean }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const id = useId();
  const expanded = open || printing;
  const status = act ? PLAN.STATUS.active : PLAN.STATUS[slot.status];
  const names = slot.exercises.slice(0, 3).map((e) => exercise(e.exerciseId).nameSv).join(', ');
  return (
    <li className={`plan-row ${slot.status === 'ready' ? 'is-next' : ''}`}>
      <button type="button" className="plan-row-head" aria-expanded={expanded} aria-controls={`${id}-d`} onClick={() => setOpen(!open)}>
        <span className="plan-row-title">
          Pass {slot.slotSequence} · {templateName(slot.templateKey)}
        </span>
        <span className={`chip ${slot.status === 'ready' || act ? 'ok' : ''}`}>{status}</span>
        <span className="plan-row-sub small muted">
          ca {slot.estimatedMinutes} min · {PLAN.APPROX_WEEK(slot.approxWeek)}
          {names ? ` · ${names}` : ''}
        </span>
      </button>
      <Expandable open={expanded} id={`${id}-d`}>
        <div className="plan-row-body stack">
          {act ? (
            <>
              <p className="small">{PLAN.ACTIVE_NOTE}</p>
              <button type="button" className="btn primary block no-print" onClick={() => nav(`/pass/${act.id}`)}>
                {PLAN.CONTINUE}
              </button>
            </>
          ) : live ? (
            <>
              <p className="small">
                <strong>{PLAN.RECOMMENDED}</strong> – {PLAN.RECOMMENDED_NOTE}
              </p>
              <ul className="list">
                {live.exercises.map((e) => (
                  <li key={e.exerciseId} className="ex-line">
                    <span>
                      {exercise(e.exerciseId).nameSv} <span className="chip">{MODE_SV[e.mode]}</span>
                    </span>
                    <span className="num">{e.calibration && e.kg === null ? `${e.sets} × ${e.reps} reps · ${PLAN.CALIBRATION}` : prescriptionText(e)}</span>
                  </li>
                ))}
              </ul>
              {!readOnly && (
                <button type="button" className="btn primary block no-print" onClick={() => nav('/forhandsvisning')}>
                  {PLAN.OPEN}
                </button>
              )}
            </>
          ) : (
            <>
              {slot.status === 'provisional' && <p className="small muted">{PLAN.PRELIM_NOTE}</p>}
              <ul className="list">
                {slot.exercises.map((e) => (
                  <li key={`${e.exerciseId}|${e.variantKey}`} className="ex-line">
                    <span>
                      {exercise(e.exerciseId).nameSv} <span className="chip">{MODE_SV[e.mode]}</span>
                      {e.substitutionFrom && <span className="small muted"> · ersätter {exercise(e.substitutionFrom).nameSv.toLowerCase()}</span>}
                    </span>
                    <span className="num">
                      {e.sets} × {e.loadKind === 'duration_sec' ? 'tid' : e.bandMin === e.bandMax ? `${e.bandMin}` : `${e.bandMin}–${e.bandMax}`} {e.loadKind === 'duration_sec' ? '' : 'reps'}
                      <br />
                      <span className="small muted">{e.calibration ? PLAN.CALIBRATION : slot.status === 'provisional' ? <Reference exerciseId={e.exerciseId} variantKey={e.variantKey} loadKind={e.loadKind} perHand={e.loadBasis === 'per_hand_kg'} /> : PLAN.LATER}</span>
                    </span>
                    {printing && <span className="print-only print-write">{PLAN.PRINT_WRITE} ______________________</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {slot.removed.length > 0 && (
            <ul className="list small muted">
              {slot.removed.map((r, i) => (
                <li key={i}>
                  {PLAN.EXCLUDED}: {exercise(r.exerciseId).nameSv}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && <NoteEditor target={{ targetType: 'slot', slotSequence: slot.slotSequence }} printing={printing} />}
        </div>
      </Expandable>
    </li>
  );
}

function Reference({ exerciseId, variantKey, loadKind, perHand }: { exerciseId: ExerciseId; variantKey: string; loadKind: LoadKind; perHand: boolean }) {
  const { ctx } = useServices();
  const ref = useLiveQuery(() => lastPerformed(ctx, exerciseId, variantKey), [ctx, exerciseId, variantKey]);
  if (!ref) return <>{PLAN.LATER}</>;
  return <>{PLAN.REFERENCE(loadText(ref.grams, ref.reps, ref.seconds, loadKind, perHand))}</>;
}

// ---------------------------------------------------------------------------
// Genomförda
// ---------------------------------------------------------------------------

function Done({ printing, onPrinted }: { printing: { includeNotes: boolean } | null; onPrinted: () => void }) {
  const { ctx } = useServices();
  const changeKey = useLiveQuery(async () => `${await ctx.db.sessions.count()}|${await ctx.db.sets.count()}`, [ctx]);
  const [items, setItems] = useState<WorkoutSummary[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    void getWorkoutHistory(ctx, { limit: printing || all ? 100_000 : 30 }).then((r) => {
      if (!alive) return;
      setItems(r.items);
      setNext(r.next);
    });
    return () => {
      alive = false;
    };
  }, [ctx, changeKey, printing, all]);

  usePrint(!!printing, !!items, onPrinted);

  const more = async () => {
    if (!next || !items) return;
    const r = await getWorkoutHistory(ctx, { before: next, limit: 30 });
    setItems([...items, ...r.items]);
    setNext(r.next);
  };

  if (!items) return <p aria-busy="true">Hämtar dina pass…</p>;
  if (!items.length) return <p className="muted">{PLAN.EMPTY_DONE}</p>;
  return (
    <>
      <PrintHeader />
      <ol className="list plan-list" aria-label={`${PLAN.DONE} pass`}>
        {items.map((w) => (
          <DoneRow key={w.session.id} w={w} printing={printing} />
        ))}
      </ol>
      {next && !all && (
        <div className="row no-print">
          <button type="button" className="btn grow" onClick={more}>
            {PLAN.SHOW_MORE_HISTORY}
          </button>
          <button type="button" className="btn ghost" onClick={() => setAll(true)}>
            Visa alla
          </button>
        </div>
      )}
    </>
  );
}

function DoneRow({ w, printing }: { w: WorkoutSummary; printing: { includeNotes: boolean } | null }) {
  const { ctx } = useServices();
  const [open, setOpen] = useState(false);
  const id = useId();
  const expanded = open || !!printing;
  const s = w.session;
  const detail = useLiveQuery(() => (expanded ? getWorkoutDetail(ctx, s.id) : Promise.resolve(null as WorkoutDetail | null)), [ctx, s.id, expanded]);
  const isExtra = s.kind === 'extra';
  const title = isExtra ? `${PLAN.EXTRA}${w.sequence ? ` · ${PLAN.COUNTED(w.sequence)}` : ''}` : `Pass ${w.sequence ?? '–'} · ${templateName(s.templateKey)}`;
  const statusText = PLAN.DONE_STATUS[s.status] ?? s.status;
  return (
    <li className="plan-row">
      <button type="button" className="plan-row-head" aria-expanded={expanded} aria-controls={`${id}-d`} onClick={() => setOpen(!open)}>
        <span className="plan-row-title">{title}</span>
        <span className={`chip ${s.status === 'completed' ? 'ok' : s.status === 'partial' ? 'warn' : ''}`}>{isExtra ? `${PLAN.EXTRA} · ${statusText}` : statusText}</span>
        <span className="plan-row-sub small muted">
          {dateSv(s.startedAt)}
          {w.durationMinutes !== null ? ` · ${w.durationMinutes} min` : ''} · {w.doneWorkSets} set
        </span>
      </button>
      <Expandable open={expanded} id={`${id}-d`}>
        <div className="plan-row-body stack">
          {!detail ? (
            <p aria-busy="true">Hämtar set…</p>
          ) : (
            detail.exercises.map(({ sessionExercise: se, replaced, sets }) => (
              <div key={se.id} className="stack">
                <p style={{ margin: 0 }}>
                  <strong>{exercise(se.exerciseId).nameSv}</strong>
                  {replaced && <span className="small muted"> · {PLAN.SWAPPED}</span>}
                </p>
                <ul className="list small">
                  {sets.map((x, i) => (
                    <SetLine key={x.id} set={x} no={i + 1} lk={se.snapshot.loadKind} perHand={se.snapshot.loadBasis === 'per_hand_kg'} />
                  ))}
                </ul>
              </div>
            ))
          )}
          {(!printing || printing.includeNotes) && <NoteEditor target={{ targetType: 'session', sessionId: s.id }} printing={!!printing} />}
          {!printing && <DeleteWorkout sessionId={s.id} />}
        </div>
      </Expandable>
    </li>
  );
}

function SetLine({ set: x, no, lk, perHand }: { set: LocalSet; no: number; lk: LoadKind; perHand: boolean }) {
  if (x.detail) {
    const d = x.detail, e = d.configuration.equipment;
    const target = d.targetLoadValue != null ? `${d.targetLoadValue.toLocaleString('sv-SE')}${d.targetSecondLoadValue != null ? ` / ${d.targetSecondLoadValue.toLocaleString('sv-SE')}` : ''} ${e.unit === 'level' ? 'nivå' : 'kg'} × ${x.targetReps} reps` : x.targetGrams === null && lk !== 'duration_sec' && lk !== 'reps_only' ? 'egen belastning' : loadText(x.targetGrams,x.targetReps,x.targetSeconds,lk,e.measurement === 'per_dumbbell');
    return <li className="set-line"><PerformanceHistory set={x} /><span className="small muted">{PLAN.RECOMMENDED_THEN}: {target}</span></li>;
  }
  const corrected = x.status === 'done' && x.occurredAt !== null && Date.parse(x.updatedAt) - Date.parse(x.occurredAt) > 1000;
  const status = x.status === 'done' ? PLAN.PERFORMED : x.status === 'skipped' ? 'Överhoppat' : 'Inte utfört';
  return (
    <li className="set-line">
      <span>
        Set {no}
        {x.kind !== 'work' ? ' (uppvärmning)' : ''}: <strong>{status}</strong> {x.status === 'done' ? loadText(x.actualGrams, x.actualReps, x.actualSeconds, lk, perHand) : ''}
        {x.status === 'done' && x.manualOverride ? ` · ${PLAN.CHANGED_FROM_PLAN}` : ''}
        {corrected ? ` · ${PLAN.CORRECTED}` : ''}
      </span>
      <span className="muted">
        {' '}
        ({PLAN.RECOMMENDED_THEN}: {x.targetGrams === null && lk !== 'duration_sec' && lk !== 'reps_only' ? 'egen vikt' : loadText(x.targetGrams, x.targetReps, x.targetSeconds, lk, perHand)})
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Anteckningar
// ---------------------------------------------------------------------------

function NoteEditor({ target, printing }: { target: NoteTarget; printing: boolean }) {
  const { ctx } = useServices();
  const id = useId();
  const key = target.targetType === 'slot' ? `s${target.slotSequence}` : target.sessionId;
  const note = useLiveQuery(() => getNote(ctx, target), [ctx, key]);
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = text ?? note?.body ?? '';

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const save = async (body: string) => {
    try {
      await saveNote(ctx, target, body);
      setError(false);
    } catch {
      setError(true);
    }
  };

  if (printing) return note?.body ? <p className="note-print">Anteckning: {note.body}</p> : null;
  const status = error ? PLAN.NOTE_FAILED : note?.syncState === 'conflict' ? PLAN.NOTE_CONFLICT : note ? (note.syncState === 'synced' ? PLAN.NOTE_SYNCED : PLAN.NOTE_SAVED_LOCAL) : '';
  return (
    <div className="field no-print">
      <label htmlFor={id}>{PLAN.NOTE_LABEL}</label>
      <textarea
        id={id}
        maxLength={NOTE_MAX_LENGTH}
        value={current}
        rows={2}
        aria-describedby={`${id}-h ${id}-s`}
        onFocus={() => original === null && setOriginal(note?.body ?? '')}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(v), 800);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          if (text !== null && text !== (note?.body ?? '')) void save(text);
        }}
      />
      <span id={`${id}-h`} className="small muted">
        {PLAN.NOTE_HELP} {current.length}/{NOTE_MAX_LENGTH}
      </span>
      <span id={`${id}-s`} className="small" role="status">
        {status}
      </span>
      {original !== null && current !== original && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setText(original);
            void save(original);
          }}
        >
          {PLAN.NOTE_UNDO}
        </button>
      )}
    </div>
  );
}
