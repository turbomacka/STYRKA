import { SOURCE_LABELS } from '../../domain/startingLoad';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExerciseId } from '../../domain/catalog';
import { exercise } from '../../domain/catalog';
import { formatKg } from '../../domain/units';
import { deleteTrainingSet, restorePlannedSet, workoutOrder } from '../../application/workout';
import { EFFORT_LABELS } from '../../domain/effort';
import { addSet, editSet, logSet, pauseSession, previewSwap, rateSet, resumeSession, swapCandidates, swapExercise, swapExerciseLegacy, undoSet, undoPerformance, type SetValues, type SwapOptions } from '../../application/training';
import type { Familiarity } from '../../domain/model';
import { estimatedMinutesFor } from '../../planner/planner';
import { Banner, Icon, OfflineBanner, ToastWithUndo } from '../components/common';
import { AddExercise } from '../components/WorkoutOverview';
import { SetRow } from '../components/SetRow';
import { ExecutionControl, PerformanceRow, SavedRestTimer, WarmupControl } from '../components/TrainingFlow';
import { comparisonKey, defaultConfiguration, SIDE_LABELS, trainingPreferences } from '../../domain/trainingFlow';
import { SkipExercise } from '../components/SkipExercise';
import { SubstitutionSheet } from '../components/SubstitutionSheet';
import { ExerciseSwapSheet } from '../components/widgets';
import { FLAGS, useServices } from '../services';
import { T } from '../strings';

/** S08 Träna: helskärm, en övning i fokus, Pausa/Avsluta alltid synligt. */
export function Train() {
  const { id } = useParams();
  const { ctx, online } = useServices();
  const nav = useNavigate();
  const location = useLocation();
  const [params,setParams]=useSearchParams();
  const session = useLiveQuery(() => ctx.db.sessions.get(id!), [ctx, id]);
  // Read prescriptions and execution mode from one snapshot; never mix old sides with a new configuration.
  const workout = useLiveQuery(() => ctx.db.transaction('r', [ctx.db.sets, ctx.db.sessionExercises, ctx.db.workoutOrderEvents], async () => {
    const sets = await ctx.db.sets.where('sessionId').equals(id!).toArray();
    const allExercises = await ctx.db.sessionExercises.where('sessionId').equals(id!).toArray();
    const events = await ctx.db.workoutOrderEvents.where('sessionId').equals(id!).toArray();
    return { sets, allExercises, exercises: workoutOrder(allExercises, events).filter((e) => sets.some((s) => s.sessionExerciseId === e.id && !s.deleted)) };
  }), [ctx, id]);
  const sets = workout?.sets, allExercises = workout?.allExercises, exs = workout?.exercises;
  const [pendingExecution, setPendingExecution] = useState<string | null>(null);
  const executionPending = useCallback((exerciseId: string, pending: boolean) => setPendingExecution((current) => pending ? exerciseId : current === exerciseId ? null : current), []);
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const settings = useLiveQuery(() => ctx.db.exerciseSettings.toArray(), [ctx]);
  const restrictions = useLiveQuery(() => ctx.db.restrictions.toArray(), [ctx]);
  const selectedId=params.get('ovning');
  let chosenId=selectedId;
  for(let i=0;i<(allExercises?.length??0);i++) {
    const replacement=allExercises?.find((e)=>e.id===chosenId)?.replacedById;
    if(!replacement)break;
    chosenId=replacement;
  }
  const focus=Math.max(0,exs?.findIndex((e)=>e.id===chosenId)??0);
  const setFocus=(n:number)=>{if(exs?.[n])setParams({ovning:exs[n].id},{replace:true});};
  const [announce, setAnnounce] = useState('');
  const [toast, setToast] = useState<{ msg: string; setId: string; side?: import('../../domain/trainingFlow').PerformanceSide } | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [removed, setRemoved] = useState<string | null>(null);
  const [swap, setSwap] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const current = exs?.[Math.min(focus, (exs?.length ?? 1) - 1)];
  const currentId = current?.id;
  const loadCandidates = useCallback(() => swapCandidates(ctx, currentId!), [ctx, currentId]);
  const previewFor = useCallback((to: ExerciseId, o: { familiarity?: Familiarity; variantKey?: string }) => previewSwap(ctx, currentId!, to, o), [ctx, currentId]);

  // "Senast": föregående resultat för övningen (utanför detta pass).
  useEffect(() => {
    if (!current) return;
    let alive = true;
    (async () => {
      const all = (await ctx.db.sets.where('exerciseId').equals(current.exerciseId).toArray()).filter((s) => s.sessionId !== id && s.status === 'done' && !s.deleted && s.kind === 'work' && s.occurredAt);
      all.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
      const config = current.configuration ?? defaultConfiguration(current.exerciseId);
      const key = comparisonKey(current.exerciseId, config);
      const detailed = all.flatMap((s) => (s.detail?.performances ?? []).filter((p) => p.status === 'done' && p.comparisonKey === key).map((p) => ({ s, p })));
      if (current.configuration && (detailed.length || all.some((s) => s.detail) || current.configuration.equipment.id)) {
        if (!alive) return;
        const last = detailed[0];
        if (!last) return setPrevious(null);
        return setPrevious(`${new Date(last.p.completedAt!).toLocaleDateString('sv-SE', { day:'numeric', month:'short' })}: ${detailed.filter((x) => x.s.id === last.s.id).map(({p}) => `${SIDE_LABELS[p.side]} ${p.loadValue !== null ? `${p.loadValue.toLocaleString('sv-SE')} ${p.equipment.unit === 'level' ? 'nivå' : 'kg'} × ` : ''}${p.repetitions ?? p.seconds}`).join(' · ')}`);
      }
      const last = all.find((s) => !s.detail);
      if (!alive) return;
      if (!last) return setPrevious(null);
      const same = all.filter((s) => s.sessionId === last.sessionId).sort((a, b) => a.ordinal - b.ordinal);
      const lk = exercise(current.exerciseId).loadKind;
      setPrevious(`${new Date(last.occurredAt!).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}: ${same.map((s) => (lk === 'duration_sec' ? `${s.actualSeconds} s` : `${s.actualGrams !== null && lk !== 'reps_only' ? `${formatKg(s.actualGrams)}×` : ''}${s.actualReps}`)).join(', ')}`);
    })();
    return () => {
      alive = false;
    };
  }, [ctx, current, id]);

  useEffect(() => {
    if (headingRef.current) {
      headingRef.current.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [focus, currentId]);

  const say = useCallback((m: string) => {
    setAnnounce('');
    setTimeout(() => setAnnounce(m), 30);
  }, []);

  if (!session || !exs || !sets) return <p className="page" aria-busy="true">Laddar pass…</p>;
  if (!['in_progress', 'paused'].includes(session.status)) {
    return (
      <div className="page stack">
        <Banner kind="info">Passet är avslutat.</Banner>
        <button type="button" className="btn block" onClick={() => nav('/')}>
          Till planen
        </button>
      </div>
    );
  }
  if (!current) return <div className="page stack"><h1>Inga övningar kvar</h1><button className="btn" onClick={()=>setAdding(true)}>Lägg till övning</button>{adding && <AddExercise sessionId={session.id} onClose={()=>setAdding(false)} onAdded={(e)=>{setAdding(false);setParams({ovning:e.id},{replace:true});}}/>}{removed && <ToastWithUndo message="Setet borttaget ur passet" onDone={()=>setRemoved(null)} onUndo={async()=>{await restorePlannedSet(ctx,removed);setRemoved(null);}}/>}<button className="btn" onClick={()=>nav(`/pass/${id}/oversikt`)}>Ändra passet</button><button className="btn primary" onClick={()=>nav(`/pass/${id}/avsluta`)}>Avsluta passet</button></div>;
  const lk = current.snapshot.loadKind;
  const showWarmup = trainingPreferences(profile?.trainingPreferences).showWarmupSets;
  const mySets = sets.filter((s) => s.sessionExerciseId === current.id && !s.deleted && (s.kind === 'work' || showWarmup)).sort((a, b) => (a.kind === 'warmup' ? 0 : 1) - (b.kind === 'warmup' ? 0 : 1) || a.ordinal - b.ordinal);

  const activeRest = sets.filter((s) => !s.deleted && s.sessionExerciseId === current.id).flatMap((owner) => (owner.detail?.rests ?? []).filter((rest) => rest.outcome === 'active' && sets.some((s) => s.id === rest.followingSetId && !s.deleted && !['done','skipped'].includes(s.status))).map((rest) => ({ owner, rest }))).sort((a,b) => b.rest.startedAt.localeCompare(a.rest.startedAt))[0];
  const allWork = sets.filter((s) => !s.deleted && s.kind === 'work');
  const doneCount = allWork.filter((s) => s.status === 'done').length;
  const stepGrams = Math.round(((settings?.find((s) => s.exerciseId === current.exerciseId)?.incrementGrams ?? null) ?? exercise(current.exerciseId).defaultIncrementKg * 1000));
  const showRir = profile?.experience !== 'novice';
  const paused = session.status === 'paused';
  const v2 = FLAGS.substitutionV2;
  const remainingMin = estimatedMinutesFor(exs.map((e) => ({ ...e.snapshot, sets: sets.filter((s) => s.sessionExerciseId === e.id && s.kind === 'work' && s.status === 'planned' && !s.deleted).length })));
  const restInstance = activeRest ? exs.find((e)=>e.id===activeRest.owner.sessionExerciseId) : null;
  const latestDone = mySets.filter((s)=>s.kind==='work'&&s.detail?.performances.some((p)=>p.status==='done')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]?.id;

  const wrap = async (setId: string, label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setFailed((f) => {
        const n = new Set(f);
        n.delete(setId);
        return n;
      });
      if (label) say(label);
    } catch (e) {
      setFailed((f) => new Set(f).add(setId));
      say(T.WARN_UNSAVED);
      throw e;
    }
  };

  const blockedReason = (to: ExerciseId): string | null => {
    const r = restrictions?.find((x) => x.active && x.kind === 'block_exercise' && (x.exerciseA === to || (!x.exerciseA && x.area && exercise(to).areas.includes(x.area))));
    if (r) return 'Blockerad av din regel';
    if (exs.some((e) => e.exerciseId === to)) return 'Finns redan i passet';
    return null;
  };

  return (
    <div className="shell">
      <header className="train-head">
        <div className="grow">
          <div className="small muted num">
            Övning {focus + 1} av {exs.length} · {doneCount}/{allWork.length} set{v2 && remainingMin > 0 ? ` · cirka ${Math.round(remainingMin)} min kvar` : ''}
          </div>
          <h1 ref={headingRef} tabIndex={-1}>
            {exercise(current.exerciseId).nameSv}
          </h1>
        </div>
        <button type="button" className="btn" onClick={() => (paused ? resumeSession(ctx, session.id) : pauseSession(ctx, session.id))} aria-label={paused ? 'Återuppta pass' : 'Pausa pass'}>
          {paused ? 'Fortsätt' : <><Icon.Pause /> Pausa</>}
        </button>
        <button type="button" className="btn" onClick={() => nav(`/pass/${session.id}/avsluta`)}>
          Avsluta
        </button>
      </header>
      <main className="page full stack">
        <div aria-live="polite" className="visually-hidden">
          {announce}
        </div>
        <OfflineBanner online={online} />
        {paused && <Banner kind="info">Passet är pausat. Dina set är sparade.</Banner>}
        <div className="row"><button type="button" className="btn grow" onClick={()=>nav(`/pass/${session.id}/oversikt`, { state: { returnTo: location.pathname + location.search } })}>Hela passet</button><button type="button" className="btn grow" onClick={()=>setSwap(true)}><Icon.Swap/> Byt övning</button></div>
        {current.snapshot.recommendation && <details><summary>Om förslaget</summary><p>{SOURCE_LABELS[current.snapshot.recommendation.source]}. {current.snapshot.recommendation.source === 'calibration' ? 'Välj en lätt belastning på det redskap du använder. Gör några kontrollerade repetitioner och registrera vad du använde.' : 'Du kan ändra förslaget direkt. Egna jämförbara arbetsset ger bättre underlag framöver.'}</p></details>}
        {lk === 'assistance_kg' && <p className="small muted">Assistans: lägre siffra betyder tyngre för dig.</p>}
        {activeRest && restInstance && <SavedRestTimer key={activeRest.rest.id} owner={activeRest.owner} rest={activeRest.rest} sets={sets} instance={restInstance} onStart={(s)=>{const i=exs.findIndex((e)=>e.id===s.sessionExerciseId);if(i>=0)setFocus(i);}}/>}
        <button type="button" className="btn" onClick={() => setAdding(true)}><Icon.Plus /> Lägg till övning</button>
        <ExecutionControl key={`execution-${current.id}`} instance={current} onPendingChange={executionPending}/>
        {previous && <p className="small muted">Senast: {previous}</p>}
        <fieldset className="training-set-controls" disabled={pendingExecution === current.id} aria-busy={pendingExecution === current.id}>
        <WarmupControl instance={current} visible={showWarmup} count={mySets.filter((s) => s.kind === 'warmup').length} />
        <ul className="card list set-list" aria-label={`Set för ${exercise(current.exerciseId).nameSv}`}>
          {mySets.map((s, i) => ((s.status !== 'done' || s.detail) ? <PerformanceRow key={s.id} set={s} instance={current} sessionSets={sets} online={online} onDelete={async () => { await deleteTrainingSet(ctx, s.id); setRemoved(s.id); }} showEffort={s.id===latestDone} onSaved={(saved, side) => { const msg = saved.status === 'done' ? `✓ ${saved.kind === 'warmup' ? 'Uppvärmning' : 'Set'} ${saved.ordinal} registrerat på enheten` : '✓ Sidan registrerad. Fortsätt med nästa sida.'; setToast({ msg, setId: saved.id, side }); }} /> :
            <SetRow
              key={s.id}
              set={s}
              displayNo={i + 1}
              loadKind={lk}
              loadBasis={current.snapshot.loadBasis}
              stepGrams={stepGrams}
              effortPrompt={s.kind === 'work'}
              onRate={(e) => wrap(s.id, e ? `${EFFORT_LABELS[e]} sparat` : 'Svar borttaget', () => rateSet(ctx, s.id, e))}
              online={online}
              showRir={showRir}
              failed={failed.has(s.id)}
              onLog={(v: SetValues) =>
                wrap(s.id, '', async () => {
                  await logSet(ctx, s.id, v);
                  setToast({ msg: `✓ Set ${i + 1} registrerat på enheten`, setId: s.id });
                })
              }
              onEdit={(v: SetValues) => wrap(s.id, `Set ${i + 1} ändrat`, () => editSet(ctx, s.id, v))}
              onDelete={async()=>{await deleteTrainingSet(ctx,s.id);setRemoved(s.id);}}
              onUndo={() => wrap(s.id, `Set ${i + 1} ångrat`, () => undoSet(ctx, s.id))}
            />
          ))}
        </ul>
        </fieldset>

        <div className="row wrap">
          <button type="button" className="btn grow" onClick={() => addSet(ctx, current.id).catch(() => say('Kunde inte lägga till set'))}>
            <Icon.Plus /> Lägg till set
          </button>

        </div>

        {mySets.some((s) => s.kind === 'work' && s.status !== 'done') && <SkipExercise key={current.id} exerciseId={current.id} name={exercise(current.exerciseId).nameSv} onSkipped={(reason) => { say('Övningen är överhoppad.'); if (reason !== 'discomfort' && focus < exs.length - 1) setFocus(focus + 1); }} />}
        <nav className="row" aria-label="Övningar">
          <button type="button" className="btn grow" disabled={focus === 0} onClick={() => setFocus(focus - 1)}>
            Föregående
          </button>
          {focus < exs.length - 1 ? (
            <button type="button" className="btn primary grow" onClick={() => setFocus(focus + 1)}>
              Nästa övning
            </button>
          ) : (
            <button type="button" className="btn primary grow" onClick={() => nav(`/pass/${session.id}/avsluta`)}>
              Avsluta passet
            </button>
          )}
        </nav>
      </main>
      {toast && <ToastWithUndo message={toast.msg} onUndo={() => { const { setId: sid, side } = toast; setToast(null); void wrap(sid, side && side !== 'both' ? 'Sidan ångrad' : 'Set ångrat', () => side ? undoPerformance(ctx, sid, side) : undoSet(ctx, sid)).catch(() => undefined); }} onDone={() => setToast(null)} />}
      {adding && <AddExercise sessionId={session.id} onClose={() => setAdding(false)} onAdded={(e) => { setAdding(false); setParams({ ovning: e.id }, { replace: true }); }} />}
      {removed && <ToastWithUndo message="Setet borttaget ur passet" onDone={() => setRemoved(null)} onUndo={async () => { await restorePlannedSet(ctx, removed); setRemoved(null); }} />}
      {swap && profile && v2 && (
        <SubstitutionSheet
          from={current.snapshot}
          loadCandidates={loadCandidates}
          preview={previewFor}
          goals={profile.goals}
          onClose={() => setSwap(false)}
          onConfirm={async (to: ExerciseId, o: SwapOptions) => {
            const replacement=await swapExercise(ctx, current.id, to, o);
            setParams({ovning:replacement.sessionExercise.id},{replace:true});
            setSwap(false);
            say(to === current.exerciseId ? `Bytt maskin för ${exercise(to).nameSv}` : `Bytt till ${exercise(to).nameSv}`);
          }}
        />
      )}
      {swap && profile && !v2 && (
        <ExerciseSwapSheet
          current={current.exerciseId}
          equipment={profile.equipment}
          blocked={blockedReason}
          onClose={() => setSwap(false)}
          onPick={async (to) => {
            try {
              const replacement=await swapExerciseLegacy(ctx, current.id, to);
              setParams({ovning:replacement.id},{replace:true});
              setSwap(false);
              say(`Bytt till ${exercise(to).nameSv}`);
            } catch (e) {
              const f = (e as { field?: string }).field;
              say(f === 'SYMPTOM_REVIEW_REQUIRED' ? 'Övningen belastar ett område med rapporterade besvär.' : f === 'PAIR_RULE' ? 'Bytet bryter din kombinationsregel.' : 'Bytet kunde inte göras.');
              setSwap(false);
            }
          }}
        />
      )}
    </div>
  );
}
