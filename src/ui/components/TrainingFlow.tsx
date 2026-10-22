import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { abortTrainingSet, addWarmup, adjustRest, configureExercise, detailFor, ensureWarmups, rateSet, recordPerformance, skipPerformance, startPerformance, undoPerformance } from '../../application/training';
import { editPlannedSet } from '../../application/workout';
import { patchProfile } from '../../application/profile';
import { EXECUTION_LABELS, SIDE_LABELS, comparisonKey, defaultConfiguration, executionDefinition, nextSide, requiredSides, trainingPreferences, type ExerciseConfiguration, type PerformanceSide, type RestRecord } from '../../domain/trainingFlow';
import { remainingRest, suggestRestPreference } from '../../domain/restPolicy';
import type { LocalSessionExercise, LocalSet } from '../../storage/db';
import { useServices } from '../services';
import { SetRow } from './SetRow';
import { confirmSetHaptic } from '../design';
import { EffortFeedback } from './EffortFeedback';

export function PerformanceRow({ set, instance, sessionSets, online, onSaved, planning = false, showEffort = true, onDelete }: { set: LocalSet; instance: LocalSessionExercise; sessionSets: LocalSet[]; online: boolean; planning?: boolean; showEffort?: boolean; onSaved: (s: LocalSet, side?: PerformanceSide) => void; onDelete?: () => Promise<void> }) {
  const { ctx } = useServices();
  const d = detailFor(set, instance);
  const [selected, select] = useState<PerformanceSide | null>(null);
  const [separate, setSeparate] = useState(false);
  const [error, setError] = useState('');
  const side = selected ?? (planning ? requiredSides(d.configuration).find((s) => !d.performances.some((p) => p.side === s && p.status === 'done')) : null) ?? nextSide(d) ?? (d.configuration.executionMode === 'bilateral' && set.status === 'done' ? 'both' : null);
  const p = d.performances.find((x) => x.side === side);
  const sameSet = d.performances.find((x) => x.status === 'done');
  const equipment = p?.equipment ?? instance.configuration?.equipment ?? d.configuration.equipment;
  const key = comparisonKey(instance.exerciseId, { ...d.configuration, equipment });
  const earlierSide = set.kind === 'work' ? sessionSets.filter((s) => !s.deleted && s.kind === 'work' && s.sessionExerciseId === instance.id && s.ordinal < set.ordinal).flatMap((s) => s.detail?.performances ?? []).filter((x) => x.status === 'done' && x.side === side && x.comparisonKey === key).sort((a,b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0] : undefined;
  // Explicit prescriptions (including a calibration correction) take precedence
  // over an earlier set. Reuse earlier values when the next load is still unknown.
  const previous = sameSet ?? (d.targetLoadValue == null && set.targetGrams === null ? earlierSide : undefined);
  const loaded = p?.status === 'done';
  const planned = side ? d.plannedSides?.[side] : undefined;
  const load = loaded ? p.loadValue : planned ? (planned.grams === null ? null : planned.grams / 1000) : previous?.loadValue ?? d.targetLoadValue ?? (equipment.unit === 'kg' && set.targetGrams !== null ? set.targetGrams / 1000 : null);
  const virtual: LocalSet = { ...set, status: loaded ? 'done' : 'planned', actualGrams: loaded && load !== null ? Math.round(load * 1000) : null,
    targetGrams: load === null ? null : Math.round(load * 1000), targetReps: planned?.reps ?? previous?.repetitions ?? set.targetReps, targetSeconds: planned?.seconds ?? set.targetSeconds, actualReps: loaded ? p.repetitions : null,
    actualSeconds: loaded ? p.seconds : null, rir: p?.rir ?? null, technique: p?.technique ?? null };
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); } catch { setError('Kunde inte spara. Försök igen.'); } };
  return <li className="performance-group stack" aria-label={`${set.kind === 'warmup' ? 'Uppvärmning' : 'Arbetsset'} ${set.ordinal}`}>
    {(d.configuration.executionMode !== 'bilateral' || set.kind === 'warmup') && <div className="row wrap"><strong>{set.kind === 'warmup' ? 'Uppvärmning' : 'Set'} {set.ordinal}</strong><span className="muted">{d.configuration.executionMode !== 'bilateral' ? (side ? SIDE_LABELS[side] : set.status === 'done' ? 'Båda sidor klara' : 'Delvis genomfört') : ''}</span></div>}
    {side && !d.aborted && <>
      <ul className="list set-list"><SetRow key={`${set.id}:${side}`} set={virtual} displayNo={set.ordinal} loadKind={instance.snapshot.loadKind} loadBasis={equipment.measurement === 'per_dumbbell' ? 'per_hand_kg' : undefined} loadUnit={equipment.unit === 'level' ? 'level' : 'kg'} stepGrams={equipment.step * 1000} secondLoad={equipment.basis === 'independent' ? p?.secondLoadValue ?? planned?.secondLoad ?? previous?.secondLoadValue ?? d.targetSecondLoadValue ?? null : undefined} showRir planning={planning} online={online} failed={!!error}
        onPlan={async (values) => { await editPlannedSet(ctx, set.id, { grams: values.actualGrams, reps: values.actualReps, seconds: values.actualSeconds, secondLoad: values.secondLoadValue }, side); }}
        onLog={async (values) => { const saved = await recordPerformance(ctx, set.id, side, values, { alternating: !separate }); select(null); onSaved(saved, d.configuration.executionMode === 'alternating' && !separate ? undefined : side); }}
        onEdit={async (values) => { await recordPerformance(ctx, set.id, side, values, { edit: true }); }}
        onUndo={async () => { await undoPerformance(ctx, set.id, side); select(null); }} />
      </ul>
      {!loaded && !planning && <div className="row wrap small">
        {p?.status === 'started' && <span>Pågår</span>}
        <button className="btn" type="button" onClick={() => void act(() => skipPerformance(ctx, set.id, side))}>Hoppa över {side === 'both' ? 'setet' : SIDE_LABELS[side].toLowerCase()}</button>
        {d.configuration.executionMode === 'alternating' && <label className="check-row"><input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} /> Olika resultat per sida</label>}
        {d.configuration.executionMode === 'alternating' && !separate && <span className="muted">Repetitioner per sida. Båda sparas med ett tryck.</span>}
      </div>}
    </>}
    {d.configuration.executionMode !== 'bilateral' && d.performances.some((x) => x.status === 'done') && <div className="row wrap performance-summary">{d.performances.filter((x) => x.status === 'done').map((x) => <button type="button" className="btn" key={x.id} onClick={() => { select(selected === x.side ? null : x.side); }} aria-label={`Ändra ${SIDE_LABELS[x.side].toLowerCase()}, set ${set.ordinal}`}>
      ✓ {SIDE_LABELS[x.side]} · {x.loadValue !== null ? `${x.loadValue.toLocaleString('sv-SE')} ${x.equipment.unit === 'level' ? 'nivå' : 'kg'} × ` : ''}{x.repetitions ?? x.seconds}{x.seconds !== null ? ' s' : ' reps'}
    </button>)}</div>}
    {showEffort && !planning && set.kind === 'work' && d.performances.filter((x) => x.status === 'done').map((x) => <EffortFeedback key={`${x.id}:${x.loadValue}:${x.repetitions}:${x.seconds}:${x.secondLoadValue}`} value={x.effort ?? null} label={`Set ${set.ordinal}${x.side === 'both' ? '' : ` · ${SIDE_LABELS[x.side]}`}`} onRate={(answer) => rateSet(ctx,set.id,answer,x.side)} />)}
    {planning && requiredSides(d.configuration).length > 1 && <div className="row">{requiredSides(d.configuration).map((s) => <button key={s} type="button" className="btn" aria-pressed={side === s} onClick={() => select(s)}>{SIDE_LABELS[s]}</button>)}</div>}
    {set.status === 'partial' && <button type="button" className="btn" onClick={() => void act(() => abortTrainingSet(ctx, set.id, d.aborted || nextSide(d) === null))}>{d.aborted || nextSide(d) === null ? 'Återuppta setet' : 'Avbryt återstående sida'}</button>}
    {set.status === 'skipped' && <button type="button" className="btn" onClick={() => void act(() => abortTrainingSet(ctx, set.id, true))}>Återuppta överhoppat set</button>}
    {onDelete && <button type="button" className="btn ghost" onClick={() => void act(onDelete)}>Ta bort setet</button>}
    {error && <p role="alert" className="error-text">{error}</p>}
  </li>;
}

export function SavedRestTimer({ owner, rest, sets, instance, onStart }: { owner: LocalSet; rest: RestRecord; sets: LocalSet[]; instance: LocalSessionExercise; onStart?: (set: LocalSet) => void }) {
  const { ctx } = useServices();
  const [now, setNow] = useState(() => ctx.clock.now());
  const [error, setError] = useState('');
  const [standard, setStandard] = useState(String(instance.configuration?.restSeconds ?? rest.recommendedSeconds));
  const announced = useRef(false);
  const remaining = remainingRest(rest, now);
  useEffect(() => { const tick = () => setNow(ctx.clock.now()); const timer = window.setInterval(tick, 500); document.addEventListener('visibilitychange', tick); window.addEventListener('pageshow', tick); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); }; }, [ctx]);
  useEffect(() => {
    if (remaining || announced.current || document.visibilityState !== 'visible') return;
    announced.current = true;
    void (async () => { const key = `rest-notified:${rest.id}`; if (await ctx.db.meta.get(key)) return; await ctx.db.meta.put({ key, value: true }); confirmSetHaptic(); })().catch(() => { /* Feedback must not affect training. */ });
  }, [remaining, rest.id, ctx]);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setError(''); } catch { setError('Kunde inte spara ändringen.'); } };
  const next = sets.find((s) => s.id === rest.followingSetId);
  const history = useLiveQuery(() => ctx.db.sets.where('exerciseId').equals(instance.exerciseId).toArray(), [ctx, instance.exerciseId]);
  const key = comparisonKey(instance.exerciseId, instance.configuration ?? defaultConfiguration(instance.exerciseId));
  const suggestion = suggestRestPreference((history ?? sets).filter((s) => !s.deleted && s.kind === 'work').flatMap((s) => s.detail?.rests.filter((r) => s.detail?.performances.some((p) => p.id === r.precedingPerformanceId && p.comparisonKey === key)) ?? []).sort((a,b) => a.startedAt.localeCompare(b.startedAt)));
  return <section className="card stack rest-panel" aria-label="Vilotimer">
    <div className="row wrap"><strong>{rest.type === 'between_sides' ? 'Vila mellan sidorna' : rest.type === 'before_work' ? 'Vila inför arbetsset' : 'Vila inför nästa set'}</strong><span className="rest-value num" role="timer" aria-label={`${remaining} sekunder kvar`}>{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</span></div>
    <p role="status" className="small">{remaining === 0 ? 'Rekommenderad vila har gått. Börja när du vill.' : 'Börja när du känner dig redo.'}</p>
    <div className="row wrap"><button className="btn" type="button" onClick={() => void act(() => adjustRest(ctx, owner.id, rest.id, -30))}>−30 s</button><button className="btn" type="button" onClick={() => void act(() => adjustRest(ctx, owner.id, rest.id, 30))}>+30 s</button>
      {next && <button className="btn primary grow" type="button" onClick={() => void act(async () => { await startPerformance(ctx, next.id, nextSide(detailFor(next, instance)) ?? requiredSides(detailFor(next, instance).configuration)[0]); onStart?.(next); })}>Börja nästa {rest.type === 'between_sides' ? 'sida' : 'set'}</button>}
      <button type="button" className="btn" onClick={() => void act(() => adjustRest(ctx, owner.id, rest.id, 'dismiss'))}>Dölj timer</button></div>
    {rest.reasons.includes('REPORTED_EFFORT') && <p className="small muted">Anpassad efter hur setet kändes.</p>}
    <details><summary>Ändra standardvila</summary>
      <label className="field">Standardvila för övningen (sekunder)<input type="number" min="30" max="300" step="15" value={standard} onChange={(e) => setStandard(e.target.value)} /></label><button className="btn" type="button" onClick={() => void act(() => configureExercise(ctx, instance.id, { ...(instance.configuration ?? defaultConfiguration(instance.exerciseId)), restSeconds: Number(standard) }))}>Spara standardvila</button>
    </details>
    {suggestion !== null && suggestion !== instance.configuration?.restSeconds && <div className="stack"><p className="small">Du har justerat vilan flera gånger. Vill du använda {suggestion} sekunder som standard här?</p><button type="button" className="btn" onClick={() => void act(() => configureExercise(ctx, instance.id, { ...(instance.configuration ?? defaultConfiguration(instance.exerciseId)), restSeconds: suggestion }))}>Använd {suggestion} sekunder</button></div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}

export function TrainingPreferencesControl() {
  const { ctx } = useServices();
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const [draft, setDraft] = useState<ReturnType<typeof trainingPreferences> | null>(null);
  const prefs = draft ?? trainingPreferences(profile?.trainingPreferences);
  useEffect(() => { if (draft && JSON.stringify(trainingPreferences(profile?.trainingPreferences)) === JSON.stringify(draft)) setDraft(null); }, [profile?.trainingPreferences, draft]);
  const [error, setError] = useState('');
  const [saveState,setSaveState]=useState<'idle'|'saving'|'saved'>('idle');
  const update = async (changes: Partial<typeof prefs>) => { const next = { ...prefs, ...changes }; setDraft(next); setSaveState('saving'); try { await patchProfile(ctx, { trainingPreferences: next }); setError(''); setSaveState('saved'); } catch { setSaveState('idle'); setDraft(null); setError('Kunde inte spara inställningen.'); } };
  return <div className="stack"><label className="check-row"><input type="checkbox" checked={prefs.showWarmupSets} onChange={(e) => void update({ showWarmupSets: e.target.checked })} /> Visa uppvärmningsset</label>
    {<><label className="check-row"><input type="checkbox" checked={prefs.adaptiveRestEnabled} onChange={(e) => void update({ adaptiveRestEnabled: e.target.checked })} /> Anpassa viloförslag efter registrerad prestation</label><label className="field">Förvald startsida<select value={prefs.defaultStartingSide} onChange={(e) => void update({ defaultStartingSide: e.target.value as 'right' | 'left' })}><option value="right">Höger</option><option value="left">Vänster</option></select></label></>}
    {saveState!=='idle' && <p role="status" className="small muted">{saveState==='saving'?'Sparar inställningen…':'Inställningen är sparad.'}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}

export function WarmupControl({ instance, visible, count }: { instance: LocalSessionExercise; visible: boolean; count: number }) {
  const { ctx } = useServices(); const [error, setError] = useState('');
  useEffect(() => { if (visible) void ensureWarmups(ctx, instance.id).catch(() => setError('Kunde inte ta fram uppvärmningen.')); }, [ctx, instance.id, instance.configuration, visible]);
  if (!visible) return null;
  return <section className="stack"><h2>Uppvärmning <span className="small muted">Valfritt</span></h2>{count === 0 && <p className="small muted">Lägg till egen uppvärmning eller gå direkt till arbetsseten.</p>}<button type="button" className="btn" onClick={() => void addWarmup(ctx, instance.id).catch(() => setError('Kunde inte lägga till set.'))}>Lägg till uppvärmningsset</button>{error && <p role="alert">{error}</p>}</section>;
}

/** Simple execution choices; existing equipment snapshots are preserved verbatim. */
export function ExecutionControl({ instance, onPendingChange }: { instance: LocalSessionExercise; onPendingChange?: (exerciseId: string, pending: boolean) => void }) {
  const { ctx } = useServices();
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ExerciseConfiguration | null>(null);
  const saving = useRef(false);
  const c = instance.configuration ?? defaultConfiguration(instance.exerciseId);
  const modes = executionDefinition(instance.exerciseId).supported;
  // Keep set controls disabled until the committed configuration is rendered, not just until the write resolves.
  useEffect(() => {
    if (pending && JSON.stringify(c) === JSON.stringify(pending)) {
      saving.current = false; setPending(null); onPendingChange?.(instance.id, false);
    }
  }, [c, pending, instance.id, onPendingChange]);
  useEffect(() => () => { if (saving.current) onPendingChange?.(instance.id, false); }, [instance.id, onPendingChange]);
  if (modes.length === 1 && c.executionMode === 'bilateral') return null;
  const update = async (patch: Partial<ExerciseConfiguration>) => {
    if (saving.current) return;
    const next = { ...c, ...patch };
    saving.current = true; setPending(next); onPendingChange?.(instance.id, true);
    try { await configureExercise(ctx, instance.id, next, false); setError(''); }
    catch { saving.current = false; setPending(null); onPendingChange?.(instance.id, false); setError('Kunde inte ändra utförandet. Registrerade sidor behålls.'); }
  };
  return <details className="execution-options"><summary>Utförande och sida</summary><fieldset className="training-set-controls stack" disabled={!!pending}>
    <label className="field">Utförande<select value={c.executionMode} onChange={(e) => void update({ executionMode: e.target.value as ExerciseConfiguration['executionMode'] })}>{modes.map((mode) => <option key={mode} value={mode}>{EXECUTION_LABELS[mode]}</option>)}</select></label>
    {c.executionMode !== 'bilateral' && <><label className="field">Börja med<select value={c.startingSide} onChange={(e) => void update({ startingSide: e.target.value as 'right' | 'left' })}><option value="right">Höger</option><option value="left">Vänster</option></select></label><label className="check-row"><input type="checkbox" checked={c.betweenSidesSeconds > 0} onChange={(e) => void update({ betweenSidesSeconds:e.target.checked ? 30 : 0 })} /> Vila mellan sidorna</label></>}
    {pending && <p role="status" className="small muted">Ändrar utförande…</p>}
    {error && <p role="alert">{error}</p>}
  </fieldset></details>;
}
