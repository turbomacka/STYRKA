import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, onboard, type Harness } from './appHarness';
import { abortTrainingSet, addWarmup, adjustRest, configureExercise, ensureWarmups, finishSession, previewNext, recordPerformance, removeWarmup, skipPerformance, startPerformance, startSession, undoPerformance } from '../../src/application/training';
import { patchProfile } from '../../src/application/profile';
import { comparisonKey, defaultConfiguration, nominalHandleLoad, recordedWork, setCounts, trainingPreferences, type SetPerformance } from '../../src/domain/trainingFlow';
import { recommendRest, remainingRest, suggestRestPreference, type RestInput } from '../../src/domain/restPolicy';
import { warmupSuggestions } from '../../src/domain/warmupPolicy';
import type { ExerciseId } from '../../src/domain/catalog';
import { buildHistory } from '../../src/application/plannerInput';
import { comparableHistory } from '../../src/domain/comparableTraining';
import { configuredPrescription } from '../../src/domain/configuredPrescription';
import { strengthSeries, trainingSeriesOptions } from '../../src/application/history';
import { exportJson, exportCsv } from '../../src/application/privacy';
import { skipExercise } from '../../src/application/skippedExercises';
const hs: Harness[] = [];
afterEach(async () => { for (const h of hs.splice(0)) { h.sync.dispose(); await h.db.delete(); } });
async function setup(id: ExerciseId = 'one_arm_dumbbell_row') {
  const h = harness(); hs.push(h); await onboard(h);
  const plan = await previewNext(h.ctx);
  plan.exercises = [{ ...plan.exercises[0], exerciseId: id, sets: 3, reps: 10, kg: 25, loadKind: 'external_kg', calibration: false }];
  const session = await startSession(h.ctx, plan);
  const se = (await h.db.sessionExercises.where('sessionId').equals(session.id).toArray())[0];
  const sets = await h.db.sets.where('sessionId').equals(session.id).toArray();
  return { ...h, session, se, sets };
}
const v = { actualGrams: 25000, actualReps: 10, rir: 2 };
describe('integrated training model and atomic storage', () => {
  it('keeps known free-weight history comparable across the upgrade and excludes poor technique from new e1RM', async () => {
    const h = await setup('squat');
    await recordPerformance(h.ctx,h.sets[0].id,'both',{ ...v,actualReps:5,rir:1,technique:'poor' });
    const history = await buildHistory(h.db);
    const legacy = structuredClone(history[0]); legacy.sessionId = 'legacy';
    legacy.sets = legacy.sets.map((s) => ({ ...s,detail:undefined }));
    expect(comparableHistory([legacy,...history],'squat',defaultConfiguration('squat'))).toHaveLength(2);
    const series = await strengthSeries(h.ctx,'squat');
    expect(series.points.filter((p) => p.sessionId === h.session.id).every((p) => p.source === 'performance')).toBe(true);
  });
  it.each(['bench_press', 'deadlift'] as const)('includes %s performed with default equipment in a flow-labeled session', async (id) => {
    const h = await setup(id);
    const key = comparisonKey(id, defaultConfiguration(id));
    await h.db.sessionExercises.update(h.se.id, { variantKey: `flow:${key}` });
    await recordPerformance(h.ctx, h.sets[0].id, 'both', { actualGrams: 70000, actualReps: 8, rir: 2, technique: 'controlled' });
    const options = await trainingSeriesOptions(h.ctx, id);
    expect(options.map((o) => o.value)).toEqual(['default']);
    const series = await strengthSeries(h.ctx, id);
    expect(series.points.filter((p) => p.source === 'performance')).toEqual([
      expect.objectContaining({ sessionId: h.session.id, kg: 70 }),
    ]);
  });
  it('warmup suggestions preserve two independent stack settings and remain excluded from work', async () => {
    const h = await setup('lat_pulldown');
    const c = structuredClone(h.se.configuration!);
    c.equipment.basis = 'independent'; c.equipment.stackCount = 2; c.equipment.handleCount = 2;
    await configureExercise(h.ctx,h.se.id,c);
    await patchProfile(h.ctx,{ trainingPreferences: trainingPreferences({ showWarmupSets:true }) });
    const work = (await h.db.sets.get(h.sets.find((s) => s.ordinal === 1)!.id))!;
    await h.db.sets.update(work.id,{ detail:{ ...work.detail!, targetLoadValue:30, targetSecondLoadValue:20 } });
    await ensureWarmups(h.ctx,h.se.id);
    const warm = (await h.db.sets.toArray()).filter((s) => s.kind === 'warmup');
    expect(warm.length).toBeGreaterThan(0);
    for (const s of warm) {
      expect(s.targetGrams).toBeNull(); expect(s.detail!.targetLoadValue).toBeLessThan(30); expect(s.detail!.targetSecondLoadValue).toBeLessThan(20);
      await recordPerformance(h.ctx,s.id,'both',{ actualGrams:s.detail!.targetLoadValue! * 1000, actualReps:s.targetReps, secondLoadValue:s.detail!.targetSecondLoadValue });
    }
    expect(setCounts(await h.db.sets.toArray())).toMatchObject({ planned:3, complete:0 });
  });
  it('undoing one side preserves the other and unilateral dumbbells count only the used hand', async () => {
    const h = await setup(); const id = h.sets[0].id;
    const c = structuredClone(h.se.configuration!); c.equipment.handleCount = 2;
    await configureExercise(h.ctx,h.se.id,c);
    await recordPerformance(h.ctx,id,'right',v); await recordPerformance(h.ctx,id,'left',v);
    const d = (await h.db.sets.get(id))!.detail!;
    expect(d.performances.reduce((sum,p) => sum + (recordedWork(p) ?? 0),0)).toBe(500);
    await undoPerformance(h.ctx,id,'left');
    const s = (await h.db.sets.get(id))!;
    expect(s.status).toBe('partial'); expect(s.detail!.performances.map((p) => p.side)).toEqual(['right']);
    expect(s.detail!.rests.some((r) => r.outcome === 'active')).toBe(false);
    await recordPerformance(h.ctx,id,'left',{ ...v,actualReps:8 });
    expect((await h.db.sets.get(id))!.status).toBe('done');
    c.equipment.measurement = 'bodyweight_assistance';
    await expect(configureExercise(h.ctx,h.se.id,c)).rejects.toThrow();
  });
  it('three sets preserve six sides; fast duplicates do not advance the other side', async () => {
    const h = await setup();
    for (const s of h.sets) {
      await Promise.all([recordPerformance(h.ctx, s.id, 'right', v), recordPerformance(h.ctx, s.id, 'right', v)]);
      const first = (await h.db.sets.get(s.id))!;
      expect(first.status).toBe('partial'); expect(first.detail!.performances).toHaveLength(1); expect(first.detail!.rests).toHaveLength(0);
      await recordPerformance(h.ctx, s.id, 'left', { ...v, actualReps: 8, actualGrams: 22000 });
    }
    const sets = await h.db.sets.toArray();
    expect(setCounts(sets)).toMatchObject({ complete: 3, performances: 6, right: 3, left: 3 });
    expect(sets[0].actualReps).toBe(8); expect(sets[0].actualGrams).toBe(22000);
    expect(sets[0].detail!.performances.map((p) => p.loadValue)).toEqual([25, 22]);
    expect(sets[2].detail!.rests).toHaveLength(0);
    expect(await h.sync.syncNow()).toMatchObject({ rejected: 0, conflicts: 0 });
    expect([...h.server.sets.values()].flatMap((s) => (s.detail as { performances: unknown[] }).performances)).toHaveLength(6);
  });
  it('partial work survives abort, resume, correction and equipment change', async () => {
    const h = await setup(); const id = h.sets[0].id;
    await recordPerformance(h.ctx, id, 'right', v);
    await skipPerformance(h.ctx, id, 'left'); await abortTrainingSet(h.ctx, id);
    expect((await h.db.sets.get(id))!.status).toBe('partial');
    await abortTrainingSet(h.ctx, id, true);
    const c = structuredClone(h.se.configuration!); c.equipment.id = 'new-machine'; c.equipment.name = 'Ny';
    await configureExercise(h.ctx, h.se.id, c);
    await recordPerformance(h.ctx, id, 'left', { ...v, actualGrams: 20000 });
    await recordPerformance(h.ctx, id, 'right', { ...v, actualReps: 9 }, { edit: true });
    const d = (await h.db.sets.get(id))!.detail!;
    expect(d.performances.find((p) => p.side === 'right')!.equipment.id).toBe('');
    expect(d.performances.find((p) => p.side === 'left')!.equipment.id).toBe('new-machine');
    expect(d.performances.find((p) => p.side === 'right')!.repetitions).toBe(9);
  });
  it('alternating saves two sides once; single-side is complete after one', async () => {
    const h = await setup(); const c = structuredClone(h.se.configuration!);
    c.executionMode = 'alternating'; await configureExercise(h.ctx, h.se.id, c);
    await recordPerformance(h.ctx, h.sets[0].id, 'right', v, { alternating: true });
    expect((await h.db.sets.get(h.sets[0].id))!.detail!.performances).toHaveLength(2);
    c.executionMode = 'single_side'; c.startingSide = 'left'; await configureExercise(h.ctx, h.se.id, c);
    await recordPerformance(h.ctx, h.sets[1].id, 'left', v);
    expect((await h.db.sets.get(h.sets[1].id))!.status).toBe('done');
  });
  it('separate between-side rest, timestamp resume, adjustment and actual rest', async () => {
    const h = await setup(); const c = structuredClone(h.se.configuration!); c.betweenSidesSeconds = 45;
    await configureExercise(h.ctx, h.se.id, c);
    await recordPerformance(h.ctx, h.sets[0].id, 'right', v);
    let s = (await h.db.sets.get(h.sets[0].id))!; let r = s.detail!.rests[0];
    expect(r.type).toBe('between_sides'); expect(r.recommendedSeconds).toBe(45);
    h.clock.advanceHours(20 / 3600);
    expect(remainingRest(JSON.parse(JSON.stringify(r)), h.clock.now())).toBe(25);
    await adjustRest(h.ctx, s.id, r.id, 30);
    await startPerformance(h.ctx, s.id, 'left');
    s = (await h.db.sets.get(s.id))!; r = s.detail!.rests[0];
    expect(r.actualSeconds).toBe(20); expect(r.recommendedSeconds).toBe(45); expect(r.adjustmentSeconds).toBe(30);
    await recordPerformance(h.ctx, s.id, 'left', v);
    s = (await h.db.sets.get(s.id))!; expect(s.detail!.rests.at(-1)!.type).toBe('between_sets');
    await finishSession(h.ctx, h.session.id);
    expect((await h.db.sets.toArray()).flatMap((x) => x.detail?.rests ?? []).some((x) => x.outcome === 'active')).toBe(false);
  });
  it('logging without start never fabricates actual rest', async () => {
    const h = await setup('bench_press');
    await recordPerformance(h.ctx, h.sets[0].id, 'both', v); h.clock.advanceHours(.1);
    await recordPerformance(h.ctx, h.sets[1].id, 'both', v);
    expect((await h.db.sets.get(h.sets[0].id))!.detail!.rests[0]).toMatchObject({ actualSeconds: null, outcome: 'unobserved' });
  });
  it('warmups default hidden, optional, editable, removable, side-aware, never working sets', async () => {
    const h = await setup(); await ensureWarmups(h.ctx, h.se.id);
    expect((await h.db.sets.toArray())).toHaveLength(3);
    await patchProfile(h.ctx, { trainingPreferences: trainingPreferences({ showWarmupSets: true }) });
    await ensureWarmups(h.ctx, h.se.id); await ensureWarmups(h.ctx, h.se.id);
    const warm = (await h.db.sets.toArray()).filter((s) => s.kind === 'warmup'); expect(warm.length).toBeGreaterThan(0);
    await recordPerformance(h.ctx, warm[0].id, 'right', { actualGrams: 10000, actualReps: 6 });
    await recordPerformance(h.ctx, warm[0].id, 'left', { actualGrams: 10000, actualReps: 5 });
    const extra = await addWarmup(h.ctx, h.se.id); await removeWarmup(h.ctx, extra.id);
    await patchProfile(h.ctx, { trainingPreferences: trainingPreferences({ showWarmupSets: false }) }); await ensureWarmups(h.ctx, h.se.id);
    expect((await h.db.sets.get(warm[0].id))!.status).toBe('done');
    expect(setCounts(await h.db.sets.toArray())).toMatchObject({ planned: 3, complete: 0, performances: 0 });
  });
  it('machine levels and two independent stacks retain their semantics', async () => {
    const h = await setup('cable_row'); const c = structuredClone(h.se.configuration!);
    c.equipment = { ...c.equipment, id: 'station-a', unit: 'level', measurement: 'machine_level', basis: 'independent', stackCount: 2, handleCount: 2, step: 1 };
    await configureExercise(h.ctx, h.se.id, c);
    await recordPerformance(h.ctx, h.sets[0].id, 'both', { actualGrams: 6000, actualReps: 10, secondLoadValue: 7 });
    const s = (await h.db.sets.get(h.sets[0].id))!;
    expect(s.actualGrams).toBeNull(); expect(s.detail!.performances[0]).toMatchObject({ loadValue: 6, secondLoadValue: 7, equipment: { unit: 'level' } });
  });
  it('progression respects the weaker side, including low RIR; corrections keep both values', async () => {
    const h = await setup();
    for (const s of h.sets) {
      await recordPerformance(h.ctx,s.id,'right', { ...v, rir: 3 });
      await recordPerformance(h.ctx,s.id,'left',{ ...v, actualReps: 8, rir: 0 });
    }
    const projected = comparableHistory(await buildHistory(h.db),h.se.exerciseId,h.se.configuration);
    expect(projected[0].sets.every((s) => s.actualReps === 8 && s.rir === 0)).toBe(true);
    const options = await trainingSeriesOptions(h.ctx,h.se.exerciseId);
    expect(options).toHaveLength(2);
    const left = await strengthSeries(h.ctx,h.se.exerciseId,undefined,options.find((o) => o.label.includes('Vänster'))!.value);
    expect(left.points.find((p) => p.source === 'estimated')!.kg).toBeCloseTo(25 * (1+8/30),2);
    const right = await strengthSeries(h.ctx,h.se.exerciseId,undefined,options.find((o) => o.label.includes('Höger'))!.value);
    expect(right.points.filter((p) => p.source === 'estimated')).toHaveLength(0); // 10 reps outside model validity.
  });
  it('machine series, level progression and 1RM never mix; warmups cannot inflate either', async () => {
    const h = await setup('cable_row'); const c = structuredClone(h.se.configuration!);
    c.equipment = { ...c.equipment, id:'levels-a',name:'Nivåmaskin A',measurement:'machine_level',unit:'level',step:1 };
    await configureExercise(h.ctx,h.se.id,c);
    for (const s of h.sets) await recordPerformance(h.ctx,s.id,'both',{ actualGrams:6000,actualReps:10,rir:3 });
    await finishSession(h.ctx,h.session.id);
    const hist = await buildHistory(h.db);
    const next = configuredPrescription(h.se.snapshot,hist,c);
    expect(next.kg).toBeNull(); expect(next.estimatedOneRM).toBeNull(); expect(next.targetLoadValue).toBe(7);
    const opts = await trainingSeriesOptions(h.ctx,h.se.exerciseId);
    const series = await strengthSeries(h.ctx,h.se.exerciseId,undefined,opts[0].value);
    expect(series.unit).toBe('nivå'); expect(series.points.map((p) => p.source)).toEqual(['performance']);
    const other = structuredClone(c); other.equipment.id='levels-b';
    expect(configuredPrescription(h.se.snapshot,hist,other).targetLoadValue).toBeNull();
  });
  it('partial sides survive skipping the exercise, and JSON/CSV export retains snapshots', async () => {
    const h = await setup();
    await recordPerformance(h.ctx,h.sets[0].id,'right',v);
    await skipExercise(h.ctx,h.se.id,'time');
    const partial = (await h.db.sets.get(h.sets[0].id))!;
    expect(partial.status).toBe('partial'); expect(partial.detail?.aborted).toBe(true);
    expect(partial.detail?.performances[0].loadValue).toBe(25);
    const json = JSON.stringify(await exportJson(h.ctx));
    expect(json).toContain('performances'); expect(json).toContain('comparisonKey');
    expect(await exportCsv(h.ctx)).toContain('side_performances_json');
  });
  it('warmups use cable snapshots and never enter strength series', async () => {
    const h = await setup('cable_row'); const c=structuredClone(h.se.configuration!);
    c.equipment.id='cable-a'; c.equipment.measurement='cable_known';c.equipment.pulleyRatio=2;c.equipment.ratioVerified=true;
    await configureExercise(h.ctx,h.se.id,c);
    const w=await addWarmup(h.ctx,h.se.id);
    await recordPerformance(h.ctx,w.id,'both',{ actualGrams:100000,actualReps:1,rir:0 });
    expect(await trainingSeriesOptions(h.ctx,h.se.exerciseId)).toEqual([]);
    expect((await h.db.sets.get(w.id))!.detail!.performances[0].equipment.pulleyRatio).toBe(2);
    await recordPerformance(h.ctx,h.sets[0].id,'both',{ actualGrams:30000,actualReps:8,rir:2 });
    const opts = await trainingSeriesOptions(h.ctx,h.se.exerciseId);
    const s=await strengthSeries(h.ctx,h.se.exerciseId,undefined,opts[0].value);
    expect(Math.max(...s.points.map((p) => p.kg))).toBeLessThan(50);
  });
  it('a failed local transaction cannot show a completed side or enqueue half a registration', async () => {
    const h = await setup(); const before = await h.db.outbox.count();
    const fail = vi.spyOn(h.db.outbox,'add').mockRejectedValueOnce(new Error('disk full'));
    await expect(recordPerformance(h.ctx,h.sets[0].id,'right',v)).rejects.toThrow(); fail.mockRestore();
    expect((await h.db.sets.get(h.sets[0].id))!.status).toBe('planned');
    expect((await h.db.sets.get(h.sets[0].id))!.detail).toBeUndefined(); expect(await h.db.outbox.count()).toBe(before);
  });
  it('read-only warmup checks do not trigger endless background sync; unfinished warmups create no timer after last work', async () => {
    const h = await setup('bench_press'); const notify = vi.fn(); h.ctx.onQueued = notify;
    await ensureWarmups(h.ctx,h.se.id); expect(notify).not.toHaveBeenCalled();
    await patchProfile(h.ctx,{ trainingPreferences: trainingPreferences({ showWarmupSets:true }) });
    const warm=await addWarmup(h.ctx,h.se.id); notify.mockClear();
    await ensureWarmups(h.ctx,h.se.id); expect(notify).not.toHaveBeenCalled();
    for(const s of h.sets) await recordPerformance(h.ctx,s.id,'both',v);
    expect((await h.db.sets.get(h.sets.at(-1)!.id))!.detail!.rests).toHaveLength(0);
    expect((await h.db.sets.get(warm.id))!.status).toBe('planned');
  });
});
describe('deterministic recommendation policies', () => {
  const base: RestInput = { category: 'barbell_compound', mode: 'heavy', strengthFocus: true, experience: 'experienced', adaptive: true, kind: 'work', nextKind: 'work' };
  it('rest bases, effort, comparable drop and no double addition', () => {
    expect(recommendRest(base).seconds).toBe(180);
    expect(recommendRest({ ...base, mode: 'moderate' }).seconds).toBe(120);
    expect(recommendRest({ ...base, category: 'isolation' }).seconds).toBe(90);
    expect(recommendRest({ ...base, mode: 'light' }).seconds).toBe(60);
    const p = { comparisonKey: 'a', side: 'left', load: 30, reps: 10, targetReps: 10, rir: 1, kind: 'work' as const, technique: 'controlled' };
    const r = recommendRest({ ...base, previous: p, current: { ...p, reps: 8 } });
    expect(r.seconds).toBe(210); expect(r.reasons).toContain('REPETITIONS_DECREASED');
    expect(recommendRest({ ...base, previous: p, current: { ...p, comparisonKey: 'b', reps: 8, rir: 2 } }).reasons).not.toContain('REPETITIONS_DECREASED');
    expect(recommendRest({ ...base, previous: { ...p, secondLoad:20 }, current: { ...p, secondLoad:30, reps:8 } }).reasons).not.toContain('REPETITIONS_DECREASED');
    expect(recommendRest({ ...base, previous:p, current:{ ...p, reps:8, rir:5 }, effortRir:0 }).reasons).not.toContain('REPETITIONS_DECREASED');
    expect(recommendRest({ ...base, overrideSeconds: 999 }).seconds).toBe(300);
    expect(recommendRest({ ...base, nextKind: null }).seconds).toBe(0);
    expect(recommendRest({ ...base, kind: 'warmup' }).seconds).toBe(150);
    expect(suggestRestPreference([])).toBeNull();
  });
  it('known pulley ratio is nominal only; unknown ratio and distinct configurations stay separate', () => {
    const c = defaultConfiguration('cable_row'); c.equipment.id = 'a';
    expect(nominalHandleLoad(30, c.equipment)).toBeNull();
    c.equipment = { ...c.equipment, measurement: 'cable_known', pulleyRatio: 2, ratioVerified: true };
    expect(nominalHandleLoad(30, c.equipment)).toBe(15);
    const b = structuredClone(c); b.equipment.id = 'b';
    expect(comparisonKey('cable_row', c)).not.toBe(comparisonKey('cable_row', b));
    c.equipment.comparisonGroup = b.equipment.comparisonGroup = 'verified';
    expect(comparisonKey('cable_row', c)).toBe(comparisonKey('cable_row', b));
    expect(recordedWork({ status: 'done', repetitions: 10, loadValue: 30, equipment: c.equipment } as SetPerformance)).toBeNull();
  });
  it('warmup rounding, unknown bar, previous work, low weights and bodyweight', () => {
    const e = defaultConfiguration('bench_press').equipment;
    const i = { workingLoad: 80, targetReps: 5, mode: 'heavy' as const, category: 'barbell_compound' as const, equipment: e, experience: 'experienced' as const, samePatternWorkDone: 0 };
    expect(warmupSuggestions(i)).toEqual([]);
    e.minimum = 15; e.step = 2.5;
    const result = warmupSuggestions(i); expect(result.map((s) => s.load)).toEqual([40, 55, 67.5]);
    expect(warmupSuggestions({ ...i, workingLoad: 15 })).toEqual([]);
    expect(warmupSuggestions({ ...i, equipment: { ...e, increments: [15, 30, 50, 60, 80] } }).map((s) => s.load)).toEqual([30, 50, 60]);
    expect(warmupSuggestions({ ...i, mode: 'moderate', category: 'isolation', samePatternWorkDone: 3 })).toEqual([]);
    expect(warmupSuggestions({ ...i, equipment: { ...e, measurement: 'bodyweight_added' } })).toEqual([]);
  });
});
