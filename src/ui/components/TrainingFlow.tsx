import { useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { abortTrainingSet, addWarmup, adjustRest, configureExercise, detailFor, ensureWarmups, rateSet, recordPerformance, removeWarmup, skipPerformance, startPerformance, undoPerformance } from '../../application/training';
import { patchProfile } from '../../application/profile';
import { EXECUTION_LABELS, LOAD_LABELS, SIDE_LABELS, comparisonKey, defaultConfiguration, executionDefinition, nextSide, nominalHandleLoad, requiredSides, supportedMeasurements, trainingPreferences, type EquipmentProfile, type ExerciseConfiguration, type PerformanceSide, type RestRecord } from '../../domain/trainingFlow';
import { remainingRest, REST_REASONS, suggestRestPreference } from '../../domain/restPolicy';
import { parseKg } from '../../domain/units';
import type { LocalSessionExercise, LocalSet } from '../../storage/db';
import { useServices } from '../services';
import { SetRow, EditableKg } from './SetRow';
import { confirmSetHaptic } from '../design';
import { EffortFeedback } from './EffortFeedback';

export function PerformanceRow({ set, instance, sessionSets, online, onSaved }: { set: LocalSet; instance: LocalSessionExercise; sessionSets: LocalSet[]; online: boolean; onSaved: (s: LocalSet, side?: PerformanceSide) => void }) {
  const { ctx } = useServices();
  const d = detailFor(set, instance);
  const [selected, select] = useState<PerformanceSide | null>(null);
  const [separate, setSeparate] = useState(false);
  const [second, setSecond] = useState('');
  const [error, setError] = useState('');
  const side = selected ?? nextSide(d) ?? (d.configuration.executionMode === 'bilateral' && set.status === 'done' ? 'both' : null);
  const p = d.performances.find((x) => x.side === side);
  const sameSet = d.performances.find((x) => x.status === 'done');
  const equipment = p?.equipment ?? instance.configuration?.equipment ?? d.configuration.equipment;
  const key = comparisonKey(instance.exerciseId, { ...d.configuration, equipment });
  const earlierSide = set.kind === 'work' ? sessionSets.filter((s) => !s.deleted && s.kind === 'work' && s.sessionExerciseId === instance.id && s.ordinal < set.ordinal).flatMap((s) => s.detail?.performances ?? []).filter((x) => x.status === 'done' && x.side === side && x.comparisonKey === key).sort((a,b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0] : undefined;
  // Explicit prescriptions (including a calibration correction) take precedence
  // over an earlier set. Reuse earlier values when the next load is still unknown.
  const previous = sameSet ?? (d.targetLoadValue == null && set.targetGrams === null ? earlierSide : undefined);
  const loaded = p?.status === 'done';
  const load = loaded ? p.loadValue : previous?.loadValue ?? d.targetLoadValue ?? (equipment.unit === 'kg' && set.targetGrams !== null ? set.targetGrams / 1000 : null);
  const virtual: LocalSet = { ...set, status: loaded ? 'done' : 'planned', actualGrams: loaded && load !== null ? Math.round(load * 1000) : null,
    targetGrams: load === null ? null : Math.round(load * 1000), targetReps: previous?.repetitions ?? set.targetReps, actualReps: loaded ? p.repetitions : null,
    actualSeconds: loaded ? p.seconds : null, rir: p?.rir ?? null, technique: p?.technique ?? null };
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); } catch { setError('Kunde inte spara. Försök igen.'); } };
  const uid = useId();
  const extraLoad = (): number | null => {
    if (second === '') return p?.secondLoadValue ?? previous?.secondLoadValue ?? d.targetSecondLoadValue ?? null;
    const result = parseKg(second); return result.ok ? result.grams / 1000 : null;
  };
  return <li className="performance-group stack" aria-label={`${set.kind === 'warmup' ? 'Uppvärmning' : 'Arbetsset'} ${set.ordinal}`}>
    {(d.configuration.executionMode !== 'bilateral' || set.kind === 'warmup') && <div className="row wrap"><strong>{set.kind === 'warmup' ? 'Uppvärmning' : 'Set'} {set.ordinal}</strong><span className="muted">{d.configuration.executionMode !== 'bilateral' ? (side ? SIDE_LABELS[side] : set.status === 'done' ? 'Båda sidor klara' : 'Delvis genomfört') : ''}</span></div>}
    {side && !d.aborted && <>
      {equipment.basis === 'independent' && <EditableKg id={`${uid}-second`} label={`Andra viktstapeln (${equipment.unit === 'level' ? 'nivå' : 'kg'})`} value={second || ((p?.secondLoadValue ?? previous?.secondLoadValue ?? d.targetSecondLoadValue)?.toLocaleString('sv-SE', { useGrouping: false }) ?? '')} onChange={setSecond} stepGrams={equipment.step * 1000} unit={equipment.unit === 'level' ? 'level' : 'kg'} />}
      <ul className="list set-list"><SetRow key={`${set.id}:${side}`} set={virtual} displayNo={set.ordinal} loadKind={instance.snapshot.loadKind} loadBasis={equipment.measurement === 'per_dumbbell' ? 'per_hand_kg' : undefined} loadUnit={equipment.unit === 'level' ? 'level' : 'kg'} stepGrams={equipment.step * 1000} showRir online={online} failed={!!error}
        onLog={async (values) => { const saved = await recordPerformance(ctx, set.id, side, { ...values, secondLoadValue: extraLoad() }, { alternating: !separate }); select(null); setSecond(''); onSaved(saved, d.configuration.executionMode === 'alternating' && !separate ? undefined : side); }}
        onEdit={async (values) => { const saved = await recordPerformance(ctx, set.id, side, { ...values, secondLoadValue: extraLoad() }, { edit: true }); select(null); onSaved(saved, side); }}
        onUndo={async () => { await undoPerformance(ctx, set.id, side); select(null); }} />
      </ul>
      {!loaded && <div className="row wrap small">
        {p?.status !== 'started' && <button className="btn" type="button" onClick={() => void act(() => startPerformance(ctx, set.id, side))}>Börja {side === 'both' ? 'setet' : SIDE_LABELS[side].toLowerCase()}</button>}
        {p?.status === 'started' && <span>Pågår</span>}
        <button className="btn" type="button" onClick={() => void act(() => skipPerformance(ctx, set.id, side))}>Hoppa över {side === 'both' ? 'setet' : SIDE_LABELS[side].toLowerCase()}</button>
        {d.configuration.executionMode === 'alternating' && <label className="check-row"><input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} /> Olika resultat per sida</label>}
        {d.configuration.executionMode === 'alternating' && !separate && <span className="muted">Repetitioner per sida. Båda sparas med ett tryck.</span>}
      </div>}
    </>}
    {d.configuration.executionMode !== 'bilateral' && d.performances.some((x) => x.status === 'done') && <div className="row wrap performance-summary">{d.performances.filter((x) => x.status === 'done').map((x) => <button type="button" className="btn" key={x.id} onClick={() => { select(selected === x.side ? null : x.side); setSecond(''); }} aria-label={`Ändra ${SIDE_LABELS[x.side].toLowerCase()}, set ${set.ordinal}`}>
      ✓ {SIDE_LABELS[x.side]} · {x.loadValue !== null ? `${x.loadValue.toLocaleString('sv-SE')} ${x.equipment.unit === 'level' ? 'nivå' : 'kg'} × ` : ''}{x.repetitions ?? x.seconds}{x.seconds !== null ? ' s' : ' reps'}
    </button>)}</div>}
    {set.kind === 'work' && d.performances.filter((x) => x.status === 'done').map((x) => <EffortFeedback key={`${x.id}:${x.loadValue}:${x.repetitions}:${x.seconds}:${x.secondLoadValue}`} value={x.effort ?? null} label={`Set ${set.ordinal}${x.side === 'both' ? '' : ` · ${SIDE_LABELS[x.side]}`}`} onRate={(answer) => rateSet(ctx,set.id,answer,x.side)} />)}
    {set.status === 'partial' && <button type="button" className="btn" onClick={() => void act(() => abortTrainingSet(ctx, set.id, d.aborted || nextSide(d) === null))}>{d.aborted || nextSide(d) === null ? 'Återuppta setet' : 'Avbryt återstående sida'}</button>}
    {set.status === 'skipped' && <button type="button" className="btn" onClick={() => void act(() => abortTrainingSet(ctx, set.id, true))}>Återuppta överhoppat set</button>}
    {set.kind === 'warmup' && !d.performances.some((x) => x.status === 'done') && <button type="button" className="btn" onClick={() => void act(() => removeWarmup(ctx, set.id))}>Ta bort uppvärmningsset</button>}
    {error && <p role="alert" className="error-text">{error}</p>}
  </li>;
}

export function SavedRestTimer({ owner, rest, sets, instance }: { owner: LocalSet; rest: RestRecord; sets: LocalSet[]; instance: LocalSessionExercise }) {
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
      {next && <button className="btn primary grow" type="button" onClick={() => void act(() => startPerformance(ctx, next.id, nextSide(detailFor(next, instance)) ?? requiredSides(detailFor(next, instance).configuration)[0]))}>Börja nästa {rest.type === 'between_sides' ? 'sida' : 'set'}</button>}
      <button type="button" className="btn" onClick={() => void act(() => adjustRest(ctx, owner.id, rest.id, 'dismiss'))}>Dölj timer</button></div>
    <details><summary>Varför denna vila?</summary><p className="small">{rest.reasons.map((code) => REST_REASONS[code] ?? '').join(' ')} Förslaget är justerbart och mäter inte din återhämtning.</p><p className="small">Faktisk vila registreras när du väljer att börja nästa set. Appen kan inte garantera en signal när telefonen är låst.</p>
      <label className="field">Standardvila för övningen (sekunder)<input type="number" min="30" max="300" step="15" value={standard} onChange={(e) => setStandard(e.target.value)} /></label><button className="btn" type="button" onClick={() => void act(() => configureExercise(ctx, instance.id, { ...(instance.configuration ?? defaultConfiguration(instance.exerciseId)), restSeconds: Number(standard) }))}>Spara standardvila</button>
    </details>
    {suggestion !== null && suggestion !== instance.configuration?.restSeconds && <div className="stack"><p className="small">Du har justerat vilan flera gånger. Vill du använda {suggestion} sekunder som standard här?</p><button type="button" className="btn" onClick={() => void act(() => configureExercise(ctx, instance.id, { ...(instance.configuration ?? defaultConfiguration(instance.exerciseId)), restSeconds: suggestion }))}>Använd {suggestion} sekunder</button></div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}

export function TrainingPreferencesControl({ instance }: { instance?: LocalSessionExercise }) {
  const { ctx } = useServices();
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const [draft, setDraft] = useState<ReturnType<typeof trainingPreferences> | null>(null);
  const prefs = draft ?? trainingPreferences(profile?.trainingPreferences);
  useEffect(() => { if (draft && JSON.stringify(trainingPreferences(profile?.trainingPreferences)) === JSON.stringify(draft)) setDraft(null); }, [profile?.trainingPreferences, draft]);
  const [error, setError] = useState('');
  const update = async (changes: Partial<typeof prefs>) => { const next = { ...prefs, ...changes }; setDraft(next); try { await patchProfile(ctx, { trainingPreferences: next }); setError(''); } catch { setDraft(null); setError('Kunde inte spara inställningen.'); } };
  return <div className="stack"><label className="check-row"><input type="checkbox" checked={prefs.showWarmupSets} onChange={(e) => void update({ showWarmupSets: e.target.checked })} /> Visa uppvärmningsset</label>
    {!instance && <><label className="check-row"><input type="checkbox" checked={prefs.adaptiveRestEnabled} onChange={(e) => void update({ adaptiveRestEnabled: e.target.checked })} /> Anpassa viloförslag efter registrerad prestation</label><label className="field">Förvald startsida<select value={prefs.defaultStartingSide} onChange={(e) => void update({ defaultStartingSide: e.target.value as 'right' | 'left' })}><option value="right">Höger</option><option value="left">Vänster</option></select></label></>}
    {instance && <label className="field">Uppvärmning för denna övning<select value={instance.configuration?.warmupVisible == null ? 'default' : String(instance.configuration.warmupVisible)} onChange={(e) => void configureExercise(ctx, instance.id, { ...(instance.configuration ?? defaultConfiguration(instance.exerciseId)), warmupVisible: e.target.value === 'default' ? null : e.target.value === 'true' }, false).catch(() => setError('Kunde inte spara.'))}><option value="default">Följ inställningen ovan</option><option value="true">Visa</option><option value="false">Dölj</option></select></label>}
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}

export function WarmupControl({ instance, visible, count }: { instance: LocalSessionExercise; visible: boolean; count: number }) {
  const { ctx } = useServices(); const [error, setError] = useState('');
  useEffect(() => { if (visible) void ensureWarmups(ctx, instance.id).catch(() => setError('Kunde inte ta fram uppvärmningen.')); }, [ctx, instance.id, instance.configuration, visible]);
  if (!visible) return null;
  return <section className="stack"><h2>Uppvärmning <span className="small muted">Valfritt</span></h2>{count === 0 && <p className="small muted">Inga automatiska förslag just nu. Du kan lägga till egna set eller gå direkt till arbetsseten. För skivstång behövs stångens vikt i utrustningsinställningen.</p>}<button type="button" className="btn" onClick={() => void addWarmup(ctx, instance.id).catch(() => setError('Kunde inte lägga till set.'))}>Lägg till uppvärmningsset</button>{error && <p role="alert">{error}</p>}</section>;
}

export function EquipmentControl({ instance }: { instance: LocalSessionExercise }) {
  const { ctx } = useServices();
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const profiles = trainingPreferences(profile?.trainingPreferences).equipmentProfiles;
  const [c, change] = useState<ExerciseConfiguration>(() => structuredClone(instance.configuration ?? defaultConfiguration(instance.exerciseId)));
  const [increments, setIncrements] = useState(c.equipment.increments.join('; '));
  const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  const storedConfiguration = JSON.stringify(instance.configuration ?? defaultConfiguration(instance.exerciseId));
  useEffect(() => { const next = JSON.parse(storedConfiguration) as ExerciseConfiguration; change(next); setIncrements(next.equipment.increments.join('; ')); }, [instance.id, storedConfiguration]);
  const equip = (patch: Partial<EquipmentProfile>) => { change({ ...c, equipment: { ...c.equipment, ...patch } }); setSaved(false); };
  const save = async () => {
    const next = structuredClone(c);
    next.equipment.increments = increments.trim() ? increments.split(';').map((x) => Number(x.trim().replace(',', '.'))) : [];
    if (next.equipment.name.trim() && (!next.equipment.id || next.equipment.id.startsWith('unidentified:'))) next.equipment.id = ctx.ids.uuid();
    try { await configureExercise(ctx, instance.id, next); setError(''); setSaved(true); } catch { setError('Kontrollera värdena och försök igen.'); }
  };
  const nominal = nominalHandleLoad(30, c.equipment);
  return <details className="card equipment-panel"><summary>Utförande och utrustning{instance.configuration?.equipment.name ? ` · ${instance.configuration.equipment.name}` : ''}</summary><div className="stack">
    <label className="field">Utförande<select value={c.executionMode} onChange={(e) => change({ ...c, executionMode: e.target.value as ExerciseConfiguration['executionMode'] })}>{executionDefinition(instance.exerciseId).supported.map((mode) => <option key={mode} value={mode}>{EXECUTION_LABELS[mode]}</option>)}</select></label>
    {c.executionMode !== 'bilateral' && <><label className="field">Börja med<select value={c.startingSide} onChange={(e) => change({ ...c, startingSide: e.target.value as 'left' | 'right' })}><option value="right">Höger</option><option value="left">Vänster</option></select></label><label className="field">Vila mellan sidorna (sekunder)<input type="number" min="0" max="300" step="15" value={c.betweenSidesSeconds} onChange={(e) => change({ ...c, betweenSidesSeconds: Number(e.target.value) })} /></label></>}
    {!!profiles.length && <label className="field">Sparad utrustning<select value={profiles.some((e) => e.id === c.equipment.id) ? c.equipment.id : ''} onChange={(e) => { const selected = profiles.find((x) => x.id === e.target.value); if (selected) { equip(structuredClone(selected)); setIncrements(selected.increments.join('; ')); } }}><option value="">Välj vid behov</option>{profiles.map((e) => <option key={e.id} value={e.id}>{e.name || 'Ej namngiven utrustning'}</option>)}</select></label>}
    <label className="field">Namn på utrustning (valfritt)<input value={c.equipment.name} maxLength={100} placeholder="Till exempel kabelstation 1" onChange={(e) => equip({ name: e.target.value })} /></label>
    <button type="button" className="btn" onClick={() => equip({ id: ctx.ids.uuid(), name: '', comparisonGroup: null })}>Annan maskin / ny profil</button>
    <label className="field">Vad visar belastningen?<select value={c.equipment.measurement} onChange={(e) => { const measurement = e.target.value as EquipmentProfile['measurement']; equip({ measurement, unit: measurement === 'machine_level' ? 'level' : measurement === 'duration' ? 's' : 'kg' }); }}>{Object.entries(LOAD_LABELS).filter(([key]) => supportedMeasurements(instance.exerciseId).includes(key as EquipmentProfile['measurement'])).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <details><summary>Detaljer om utrustningen</summary><div className="stack">
      <label className="field">Maskintyp<input value={c.equipment.type} maxLength={100} onChange={(e) => equip({ type: e.target.value })} /></label>
      <label className="field">Tillverkare<input value={c.equipment.manufacturer} maxLength={100} onChange={(e) => equip({ manufacturer: e.target.value })} /></label><label className="field">Modell<input value={c.equipment.model} maxLength={100} onChange={(e) => equip({ model: e.target.value })} /></label>
      <label className="field">Viktstaplar<select value={c.equipment.stackCount} onChange={(e) => equip({ stackCount: Number(e.target.value) as 1 | 2 })}><option value="1">En</option><option value="2">Två</option></select></label><label className="field">Handtag<select value={c.equipment.handleCount} onChange={(e) => equip({ handleCount: Number(e.target.value) as 1 | 2 })}><option value="1">Ett</option><option value="2">Två</option></select></label>
      <label className="field">Registrera belastningen som<select value={c.equipment.basis} onChange={(e) => equip({ basis: e.target.value as EquipmentProfile['basis'] })}><option value="shared">Gemensam belastning</option><option value="per_handle">Per handtag</option><option value="per_stack">Per viktstapel</option><option value="independent">Två oberoende inställningar</option></select></label>
      {c.equipment.measurement === 'cable_known' && <><label className="field">Utväxling, X:1<input type="number" min="0.1" max="20" step="0.1" value={c.equipment.pulleyRatio ?? ''} onChange={(e) => equip({ pulleyRatio: e.target.value ? Number(e.target.value) : null })} /></label><label className="check-row"><input type="checkbox" checked={c.equipment.ratioVerified} onChange={(e) => equip({ ratioVerified: e.target.checked })} /> Jag känner till maskinens utväxling</label>{nominal !== null && <p className="small muted">Exempel: 30 kg på stapeln motsvarar nominellt {nominal.toLocaleString('sv-SE')} kg vid handtaget. Verkligt motstånd påverkas av mekanik och friktion.</p>}</>}
      <label className="field">Belastningssteg<input type="number" min="0.1" max="500" step="0.1" value={c.equipment.step} onChange={(e) => equip({ step: Number(e.target.value) })} /></label><label className="field">{c.equipment.measurement === 'barbell_total' ? 'Stångens egenvikt (kg), om känd' : 'Lägsta möjliga belastning, om känd'}<input type="number" min="0" max="500" step="0.1" value={c.equipment.minimum ?? ''} onChange={(e) => equip({ minimum: e.target.value ? Number(e.target.value) : null })} /></label>
      <label className="field">Tillgängliga belastningar, avskilda med semikolon<input value={increments} placeholder="5; 7,5; 10; 12,5" onChange={(e) => setIncrements(e.target.value)} /></label>
      <label className="field">Särskilda inställningar<input value={c.equipment.settings} maxLength={200} onChange={(e) => equip({ settings: e.target.value })} /></label>
      <label className="field">Bekräftad jämförelsegrupp (valfritt)<input value={c.equipment.comparisonGroup ?? ''} maxLength={100} onChange={(e) => equip({ comparisonGroup: e.target.value.trim() || null })} /></label><p className="small muted">Använd samma gruppnamn endast för utrustningar som du själv bedömer som jämförbara. Äldre resultat behåller sina ursprungliga uppgifter.</p>
    </div></details>
    <button type="button" className="btn primary" onClick={() => void save()}>Spara utförande och utrustning</button>{saved && <p role="status">Sparat. Används även i kommande pass.</p>}{error && <p role="alert" className="error-text">{error}</p>}
  </div></details>;
}
