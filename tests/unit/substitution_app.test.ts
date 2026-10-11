/**
 * STYRKA-CR-2026-10-10-01 – övningsbyte i applikationslagret (lokal IndexedDB, outbox, synk mot fake-server).
 * SUB10–SUB14, SUB16, SUB20, SUB21 samt revisionsposter, kalibreringsfortsättning och kalibreringsnivå.
 * Domänreglerna (SUB01–SUB09, SUB15, SUB19, SUB22–SUB24) testas i substitution.test.ts.
 */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { exercise, type ExerciseId } from '../../src/domain/catalog';
import { ENGINE_VERSION } from '../../src/domain/decision_engine';
import { RULESET_VERSION } from '../../src/domain/model';
import { SUBSTITUTION_CATALOG_VERSION } from '../../src/domain/substitutionCatalog';
import { dbNameFor, openUserDb, type LocalSessionExercise } from '../../src/storage/db';
import { SyncEngine } from '../../src/application/sync';
import { buildHistory } from '../../src/application/plannerInput';
import { strengthSeries } from '../../src/application/history';
import { exportCsv, exportJson } from '../../src/application/privacy';
import { removePermanentSubstitution } from '../../src/application/profile';
import {
  activeSession,
  displayOrder,
  finishSession,
  logSet,
  previewExtra,
  previewNext,
  previewSwapCandidates,
  rateSet,
  startSession,
  swapCandidates,
  swapExercise,
  swapExerciseLegacy,
  swapInPreview,
  updateCalibrations,
} from '../../src/application/training';
import { FakeServer, harness, onboard, TestClock, type Harness } from './appHarness';

const activeExs = async (h: Harness, sessionId: string) => displayOrder(await h.db.sessionExercises.where('sessionId').equals(sessionId).toArray());
const setsOf = (h: Harness, se: LocalSessionExercise) => h.db.sets.where('sessionExerciseId').equals(se.id).sortBy('ordinal');

/** Kör ett helt ordinarie pass med föreskrivna värden. */
async function doSession(h: Harness, calib: Partial<Record<ExerciseId, number>> = {}) {
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  for (const se of await activeExs(h, s.id)) {
    for (const set of await setsOf(h, se)) {
      h.clock.advanceHours(0.03);
      await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? (exercise(se.exerciseId).loadKind === 'duration_sec' ? null : (calib[se.exerciseId] ?? 20_000)), rir: 2 });
    }
  }
  const fin = await finishSession(h.ctx, s.id);
  h.clock.advanceHours(72);
  return fin;
}

/** Kör pass tills nästa förslag har given mall. */
async function untilTemplate(h: Harness, key: string | null) {
  for (let i = 0; i < 8; i++) {
    if ((await previewNext(h.ctx)).templateKey === key) return;
    await doSession(h, { front_squat: 30_000 });
  }
  throw new Error(`mall ${key} kom inte tillbaka`);
}

/** Startar nästa pass som innehåller övningen (kör igenom andra pass vid behov). */
async function startWith(h: Harness, ex: ExerciseId) {
  for (let i = 0; i < 4; i++) {
    const snap = await previewNext(h.ctx);
    if (snap.exercises.some((e) => e.exerciseId === ex)) {
      const s = await startSession(h.ctx, snap);
      const se = (await activeExs(h, s.id)).find((e) => e.exerciseId === ex)!;
      return { s, se };
    }
    await doSession(h);
  }
  throw new Error(`inget pass med ${ex}`);
}

function deviceB(A: Harness, server: FakeServer, clock: TestClock): Harness {
  const B = harness({ userId: crypto.randomUUID(), server, clock });
  B.ctx.userId = A.userId;
  const bDb = new (openUserDb(A.userId).constructor as typeof Dexie)(`${dbNameFor(A.userId)}_deviceB_${crypto.randomUUID()}`) as unknown as typeof A.db;
  B.ctx.db = bDb;
  return { ...B, db: bDb, userId: A.userId, sync: new SyncEngine(B.ctx) };
}

describe('övningsbyte i pågående pass', () => {
  it('SUB16/§4.3: utförda set behåller exercise_id; nya set knyts till ersättaren; revisionspost med versioner', async () => {
    const h = harness();
    await onboard(h);
    const { s, se: squat } = await startWith(h, 'squat');
    const [first] = await setsOf(h, squat);
    await logSet(h.ctx, first.id, {});
    const { sessionExercise: fs, event } = await swapExercise(h.ctx, squat.id, 'front_squat', { familiarity: 'familiar', startGrams: 57_500 });
    // Utfört knäböjsset ligger kvar på knäböj, oförändrat.
    expect(await h.db.sets.get(first.id)).toMatchObject({ exerciseId: 'squat', sessionExerciseId: squat.id, status: 'done' });
    // Oanvända planerade knäböjsset är borta lokalt (de hade aldrig synkats).
    expect((await setsOf(h, squat)).map((x) => x.id)).toEqual([first.id]);
    const newSets = await setsOf(h, fs);
    expect(newSets.length).toBe(fs.snapshot.sets);
    expect(newSets.every((x) => x.exerciseId === 'front_squat' && x.targetGrams === 57_500)).toBe(true);
    // Ersättaren står på originalets plats; originalet bevaras med sitt snapshot.
    const order = (await activeExs(h, s.id)).map((e) => e.exerciseId);
    expect(order.indexOf('front_squat')).toBe(s.snapshot.exercises.findIndex((e) => e.exerciseId === 'squat'));
    const orig = (await h.db.sessionExercises.get(squat.id))!;
    expect(orig.replacedById).toBe(fs.id);
    expect(orig.snapshot).toEqual(squat.snapshot);
    expect(fs.replacesId).toBe(squat.id);
    // Revisionspost (CR §4.3).
    expect(event).toMatchObject({
      sessionId: s.id,
      originalExerciseId: 'squat',
      replacementExerciseId: 'front_squat',
      originalSessionExerciseId: squat.id,
      replacementSessionExerciseId: fs.id,
      choiceScope: 'today',
      engineVersion: ENGINE_VERSION,
      substitutionCatalogVersion: SUBSTITUTION_CATALOG_VERSION,
      algorithmRuleVersion: RULESET_VERSION,
      loadEstimationKind: 'population_prior_low_confidence',
      userOverride: false,
    });
    expect(event.sourceEvidenceIds.length).toBeGreaterThan(0);
    expect(event.reasonCodes).toContain('SUB_POPULATION_PRIOR_LOW_CONFIDENCE');
    expect(event.createdAt).toBe(h.clock.now());
    // Synk: ersättare, set och revisionspost på servern.
    expect((await h.sync.syncNow()).stoppedBy).toBeNull();
    expect(h.server.table('session_exercises').get(fs.id)).toMatchObject({ exercise_slug: 'front_squat', load_basis: 'total_kg' });
    expect(h.server.table('session_exercise_substitution_events').get(event.id)).toMatchObject({ choice_scope: 'today', load_estimation_kind: 'population_prior_low_confidence', user_override: false, event_id: event.id });
    expect(h.server.sets.get(first.id)).toMatchObject({ sessionExerciseId: squat.id, status: 'done' });
  });

  it('hjälpskattning kräver bekräftad startvikt; ändrad vikt markeras som användarval', async () => {
    const h = harness();
    await onboard(h);
    const { se } = await startWith(h, 'squat');
    await expect(swapExercise(h.ctx, se.id, 'front_squat', { familiarity: 'familiar' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'CONFIRM_START_WEIGHT' });
    const { event, sessionExercise } = await swapExercise(h.ctx, se.id, 'front_squat', { familiarity: 'familiar', startGrams: 50_000 });
    expect(event.userOverride).toBe(true);
    expect((await setsOf(h, sessionExercise)).map((x) => x.targetGrams)).toEqual(Array(sessionExercise.snapshot.sets).fill(50_000));
    // Vanan sparas per övning.
    expect((await h.db.calibrations.toArray()).find((c) => c.exerciseId === 'front_squat')).toMatchObject({ familiarity: 'familiar', variantKey: 'default' });
    // Ett andra byte av samma (redan ersatta) övning avvisas.
    await expect(swapExercise(h.ctx, se.id, 'goblet_squat')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('SUB03 i appen: okänd vana ⇒ ingen siffra; kalibrering med användarvald vikt', async () => {
    const h = harness();
    await onboard(h);
    const { se } = await startWith(h, 'squat');
    const cands = await swapCandidates(h.ctx, se.id);
    const fsCand = [...cands.suggested, ...cands.more].find((c) => c.exerciseId === 'front_squat')!;
    expect(fsCand.result.needsFamiliarity).toBe(true);
    const { sessionExercise } = await swapExercise(h.ctx, se.id, 'front_squat');
    expect(sessionExercise.snapshot).toMatchObject({ kg: null, calibration: true, loadEstimationKind: 'none', calibrationSuggestionKg: null });
    expect((await setsOf(h, sessionExercise)).every((x) => x.targetGrams === null)).toBe(true);
  });

  it('§2.1 p.7/§3.3: efter första kalibreringssetet förifylls resten; "för tungt" ⇒ ett steg lättare; aldrig automatisk höjning', async () => {
    const h = harness();
    await onboard(h, { experience: 'novice' });
    const { se } = await startWith(h, 'squat');
    const { sessionExercise: fs } = await swapExercise(h.ctx, se.id, 'front_squat', { familiarity: 'unfamiliar' });
    const sets = await setsOf(h, fs);
    expect(sets.length).toBeGreaterThanOrEqual(2);
    await logSet(h.ctx, sets[0].id, { actualGrams: 30_000, actualReps: 5 });
    expect((await setsOf(h, fs)).slice(1).map((x) => x.targetGrams)).toEqual(Array(sets.length - 1).fill(30_000));
    await rateSet(h.ctx, sets[0].id, 'too_heavy');
    expect((await h.db.sets.get(sets[0].id))!.perceivedEffort).toBe('too_heavy');
    expect((await setsOf(h, fs)).slice(1).map((x) => x.targetGrams)).toEqual(Array(sets.length - 1).fill(27_500));
    await rateSet(h.ctx, sets[0].id, 'easy');
    expect((await setsOf(h, fs)).slice(1).map((x) => x.targetGrams)).toEqual(Array(sets.length - 1).fill(30_000));
    // Svaret synkas med setet.
    await h.sync.syncNow();
    expect(h.server.sets.get(sets[0].id)).toMatchObject({ perceivedEffort: 'easy', actualKg: '30.000' });
    // Ogiltigt svar avvisas.
    await expect(rateSet(h.ctx, sets[0].id, 'max' as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('SUB23 i appen: annan maskin för samma övning ⇒ separat historik, inga kilo överförs', async () => {
    const h = harness();
    await onboard(h);
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const machine = (await activeExs(h, s.id)).find((e) => exercise(e.exerciseId).requiresEquipmentProfile && e.snapshot.kg !== null)!;
    expect(machine).toBeTruthy();
    const { sessionExercise: m2, event } = await swapExercise(h.ctx, machine.id, machine.exerciseId, { variantKey: 'gym-b', scope: 'future' });
    expect(m2).toMatchObject({ exerciseId: machine.exerciseId, variantKey: 'gym-b' });
    expect(m2.snapshot).toMatchObject({ kg: null, calibration: true, loadEstimationKind: 'none' });
    expect(m2.snapshot.reasons).toContain('SUB_NEW_MACHINE_PROFILE');
    expect(event.choiceScope).toBe('future');
    expect((await h.db.profile.get(h.userId))!.equipmentProfiles).toEqual({ [machine.exerciseId]: 'gym-b' });
  });

  it('SUB13: samma byte på två enheter ⇒ en serverpost; olika redigeringar ⇒ revisionskonflikt, ingen tyst överskrivning', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const A = harness({ userId, server, clock });
    await onboard(A);
    const { s, se } = await startWith(A, 'squat');
    await A.sync.syncNow();
    const B = deviceB(A, server, clock);
    await B.sync.pull();
    expect((await B.db.sessionExercises.get(se.id))?.exerciseId).toBe('squat');
    const a = await swapExercise(A.ctx, se.id, 'front_squat', { familiarity: 'familiar', startGrams: 57_500 });
    const b = await swapExercise(B.ctx, se.id, 'front_squat', { familiarity: 'familiar', startGrams: 57_500 });
    expect(b.sessionExercise.id).toBe(a.sessionExercise.id);
    expect(b.event.id).toBe(a.event.id);
    const aSet = (await setsOf(A, a.sessionExercise))[0];
    const bSet = (await setsOf(B, b.sessionExercise))[0];
    expect(bSet.id).toBe(aSet.id);
    await logSet(A.ctx, aSet.id, { actualReps: 5 });
    await logSet(B.ctx, bSet.id, { actualReps: 3 });
    expect((await A.sync.syncNow()).stoppedBy).toBeNull();
    const rb = await B.sync.syncNow();
    expect(rb.conflicts).toBe(1);
    expect(server.sets.get(aSet.id)).toMatchObject({ actualReps: 5, revision: 1 });
    expect([...server.table('session_exercises').values()].filter((r) => r.session_id === s.id && r.exercise_slug === 'front_squat')).toHaveLength(1);
    expect([...server.table('session_exercise_substitution_events').values()]).toHaveLength(1);
    const conflicts = await B.sync.conflicts();
    expect(conflicts[0]).toMatchObject({ recordId: bSet.id });
    expect(conflicts[0].local.actualReps).toBe(3);
    expect(conflicts[0].server.actualReps).toBe(5);
  });

  it('SUB12: offline byte + sparat set + omstart + synk ⇒ byte och set exakt en gång', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const h1 = harness({ userId, server, clock });
    await onboard(h1);
    await h1.sync.syncNow();
    server.online = false;
    const { s, se } = await startWith(h1, 'squat');
    const { sessionExercise: fs, event } = await swapExercise(h1.ctx, se.id, 'goblet_squat');
    const [g1] = await setsOf(h1, fs);
    await logSet(h1.ctx, g1.id, { actualGrams: 16_000, actualReps: 8 });
    expect((await h1.sync.syncNow()).stoppedBy).toBe('OFFLINE');
    h1.db.close();
    const h2 = harness({ userId, server, clock });
    expect((await activeSession(h2.ctx))?.id).toBe(s.id);
    expect((await activeExs(h2, s.id)).map((e) => e.exerciseId)).toContain('goblet_squat');
    server.online = true;
    server.dropNextAck = 1; // tappad kvittens mitt i uppspelningen
    await h2.sync.syncNow();
    await h2.sync.syncNow();
    await h2.sync.syncNow();
    expect(await h2.db.outbox.count()).toBe(0);
    expect([...server.table('session_exercises').values()].filter((r) => r.exercise_slug === 'goblet_squat')).toHaveLength(1);
    expect([...server.table('session_exercise_substitution_events').keys()]).toEqual([event.id]);
    expect([...server.sets.values()].filter((x) => x.sessionExerciseId === fs.id)).toHaveLength(1);
    expect(server.sets.get(g1.id)).toMatchObject({ actualKg: '16.000', actualReps: 8, revision: 1 });
  });

  it('SUB14: hantelpress 24 kg per hand bevaras genom UI-data, synk, export och analys', async () => {
    const h = harness();
    await onboard(h);
    const { s, se } = await startWith(h, 'bench_press');
    const { sessionExercise: db } = await swapExercise(h.ctx, se.id, 'dumbbell_bench_press', { familiarity: 'familiar', startGrams: 24_000 });
    expect(db.snapshot.loadBasis).toBe('per_hand_kg');
    expect(db.snapshot.calibrationSuggestionKg).toBe(24); // SUB04: 0,83 × 100 × 0,60 / 2, nedåt till 2 kg
    for (const set of await setsOf(h, db)) await logSet(h.ctx, set.id, { actualGrams: 24_000, actualReps: 8, rir: 2 });
    await finishSession(h.ctx, s.id);
    await h.sync.syncNow();
    expect(h.server.table('session_exercises').get(db.id)).toMatchObject({ exercise_slug: 'dumbbell_bench_press', load_basis: 'per_hand_kg' });
    const serverSets = [...h.server.sets.values()].filter((x) => x.sessionExerciseId === db.id);
    expect(serverSets.length).toBe(db.snapshot.sets);
    expect(serverSets.every((x) => x.actualKg === '24.000')).toBe(true);
    const csv = await exportCsv(h.ctx);
    const header = csv.split('\n')[0].split(';');
    const row = csv.split('\n').find((l) => l.includes('dumbbell_bench_press'))!.split(';');
    expect(row[header.indexOf('actual_kg')]).toBe('24.000');
    expect(row[header.indexOf('load_basis')]).toBe('per_hand_kg');
    expect(row[header.indexOf('substituted_from')]).toBe('bench_press');
    const json = await exportJson(h.ctx);
    expect(json.substitutionEvents).toHaveLength(1);
    const series = await strengthSeries(h.ctx, 'dumbbell_bench_press');
    expect(Math.max(...series.points.filter((p) => p.source === 'performance').map((p) => p.kg))).toBe(24);
    // Bänkpressens serie innehåller inga hantelvärden.
    expect((await strengthSeries(h.ctx, 'bench_press')).points.some((p) => p.kg === 24)).toBe(false);
  });
});

describe('byte före start och omfattning', () => {
  it('SUB10: "Bara idag" ⇒ nästa pass med samma mall har originalövningen', async () => {
    const h = harness();
    await onboard(h);
    const snap = await previewNext(h.ctx);
    const i = snap.exercises.findIndex((e) => e.exerciseId === 'squat');
    expect(i).toBeGreaterThanOrEqual(0);
    const swapped = await swapInPreview(h.ctx, snap, i, 'front_squat', { familiarity: 'unfamiliar' });
    expect(swapped.exercises[i].exerciseId).toBe('front_squat');
    expect(swapped.substitutions).toHaveLength(1);
    const s = await startSession(h.ctx, swapped);
    const events = await h.db.substitutionEvents.where('sessionId').equals(s.id).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ originalExerciseId: 'squat', replacementExerciseId: 'front_squat', choiceScope: 'today', originalSessionExerciseId: null });
    for (const se of await activeExs(h, s.id)) for (const set of await setsOf(h, se)) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 30_000 });
    await finishSession(h.ctx, s.id);
    expect((await h.db.profile.get(h.userId))!.substitutions).toEqual({});
    // Kör vidare tills samma mall kommer igen: originalet finns kvar.
    h.clock.advanceHours(72);
    await untilTemplate(h, snap.templateKey);
    const again = await previewNext(h.ctx);
    expect(again.templateKey).toBe(snap.templateKey);
    expect(again.exercises.map((e) => e.exerciseId)).toContain('squat');
    expect(again.exercises.map((e) => e.exerciseId)).not.toContain('front_squat');
  });

  it('SUB11: "Använd framöver" ⇒ endast kommande pass; historisk logg och programversion oförändrade; kan återställas', async () => {
    const h = harness();
    await onboard(h);
    await doSession(h);
    await doSession(h);
    const before = { sets: await h.db.sets.toArray(), exs: await h.db.sessionExercises.toArray(), program: (await h.db.programs.toArray()).map(({ id, template, version, plannedSessionsPerWeek, createdAt }) => ({ id, template, version, plannedSessionsPerWeek, createdAt })) };
    const { s, se } = await startWith(h, 'squat');
    const template = s.templateKey;
    await swapExercise(h.ctx, se.id, 'safety_bar_squat', { scope: 'future' }).catch(() => undefined);
    // Utrustning för safety bar saknas i standardgymmet ⇒ inget byte, inget sparat.
    expect((await h.db.profile.get(h.userId))!.substitutions).toEqual({});
    await swapExercise(h.ctx, se.id, 'front_squat', { scope: 'future', familiarity: 'unfamiliar' });
    expect((await h.db.profile.get(h.userId))!.substitutions).toEqual({ squat: 'front_squat' });
    for (const x of await activeExs(h, s.id)) for (const set of await setsOf(h, x)) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 30_000 });
    await finishSession(h.ctx, s.id);
    // Historiska poster oförändrade.
    for (const old of before.sets) expect(await h.db.sets.get(old.id)).toEqual(old);
    for (const old of before.exs) expect(await h.db.sessionExercises.get(old.id)).toEqual(old);
    expect((await h.db.programs.toArray()).map(({ id, template, version, plannedSessionsPerWeek, createdAt }) => ({ id, template, version, plannedSessionsPerWeek, createdAt }))).toEqual(before.program);
    // Kommande pass med samma mall använder frontböj.
    h.clock.advanceHours(72);
    await untilTemplate(h, template);
    const next = await previewNext(h.ctx);
    expect(next.exercises.map((e) => e.exerciseId)).toContain('front_squat');
    expect(next.exercises.find((e) => e.exerciseId === 'front_squat')!.substitutionFrom).toBe('squat');
    // Återställ originalövningen.
    await removePermanentSubstitution(h.ctx, 'squat');
    expect((await previewNext(h.ctx)).exercises.map((e) => e.exerciseId)).toContain('squat');
  });

  it('byte i förhandsvisningen: kedja och tillbaka till originalet återställer originalföreskriften exakt', async () => {
    const h = harness();
    await onboard(h);
    const snap = await previewNext(h.ctx);
    const i = snap.exercises.findIndex((e) => e.exerciseId === 'squat');
    const one = await swapInPreview(h.ctx, snap, i, 'front_squat', { familiarity: 'unfamiliar' });
    const cands = await previewSwapCandidates(h.ctx, one, i);
    expect(cands.suggested[0].exerciseId).toBe('squat'); // ursprunglig övning först
    const two = await swapInPreview(h.ctx, one, i, 'goblet_squat');
    expect(two.substitutions).toHaveLength(1);
    expect(two.substitutions![0]).toMatchObject({ replacementExerciseId: 'goblet_squat' });
    expect(two.substitutions![0].original.exerciseId).toBe('squat');
    expect(two.exercises[i].substitutionFrom).toBe('squat');
    const back = await swapInPreview(h.ctx, two, i, 'squat');
    expect(back.exercises[i]).toEqual(snap.exercises[i]);
    expect(back.substitutions).toEqual([]);
    expect(back.estimatedMinutes).toBe(snap.estimatedMinutes);
  });

  it('SUB21: spontanpass med byte registreras i samma belastningshistorik och påverkar nästa plan enligt befintliga regler', async () => {
    const h = harness();
    await onboard(h);
    const baseline = await previewNext(h.ctx);
    const squatBefore = baseline.exercises.find((e) => e.exerciseId === 'squat')!;
    expect(squatBefore.mode).toBe('heavy');
    const extra = await previewExtra(h.ctx, { minutes: 30, readiness: 'good' });
    const lowerIdx = extra.exercises.findIndex((e) => exercise(e.exerciseId).recoveryGroup === 'lower' && e.loadKind === 'external_kg');
    expect(lowerIdx).toBeGreaterThanOrEqual(0);
    const cands = await previewSwapCandidates(h.ctx, extra, lowerIdx);
    const pick = cands.suggested.find((c) => exercise(c.exerciseId).recoveryGroup === 'lower')!;
    const swapped = await swapInPreview(h.ctx, extra, lowerIdx, pick.exerciseId, pick.result.requiresConfirmation ? { startGrams: 20_000 } : {});
    const s = await startSession(h.ctx, swapped);
    expect(s.kind).toBe('extra');
    for (const se of await activeExs(h, s.id)) for (const set of await setsOf(h, se)) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? (exercise(se.exerciseId).loadKind === 'duration_sec' ? null : 20_000), rir: 1 });
    await finishSession(h.ctx, s.id);
    const history = await buildHistory(h.db);
    expect(history.some((p) => p.exerciseId === pick.exerciseId && p.sessionKind === 'extra')).toBe(true);
    h.clock.advanceHours(12);
    const after = await previewNext(h.ctx);
    const squatAfter = after.exercises.find((e) => e.exerciseId === 'squat');
    // Befintliga återhämtningsregler: tung underkroppsträning inom 24–48 h ⇒ ingen ny tung knäböj.
    expect(squatAfter?.mode ?? 'removed').not.toBe('heavy');
    expect(await h.db.substitutionEvents.where('sessionId').equals(s.id).count()).toBe(1);
  });
});

describe('kalibreringsnivå och regression', () => {
  it('§3.3: "calibrated" efter två kontrollerade pass utan besvär; "för tungt" räknas inte', async () => {
    const h = harness();
    await onboard(h, { experience: 'novice' });
    const run = async (effort?: 'too_heavy') => {
      const { s, se } = await startWith(h, 'squat');
      const { sessionExercise: fs } = await swapExercise(h.ctx, se.id, 'front_squat', { familiarity: 'unfamiliar' });
      for (const x of await activeExs(h, s.id)) for (const set of await setsOf(h, x)) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 30_000, ...(x.id === fs.id && effort ? { perceivedEffort: effort } : {}) });
      await finishSession(h.ctx, s.id);
      h.clock.advanceHours(72);
      return (await h.db.calibrations.toArray()).find((c) => c.exerciseId === 'front_squat' && c.variantKey === 'default');
    };
    expect((await run())?.quality).toBe('calibrating');
    expect((await run('too_heavy'))?.quality).toBe('calibrating');
    const third = (await run())!;
    expect(third.quality).toBe('calibrated');
    expect(third.calibratedAt).not.toBeNull();
    expect(third.observations.length).toBeGreaterThan(0);
    // Observationer är referenser till utförda set (id), inga kopior.
    for (const o of third.observations) expect((await h.db.sets.get(o))?.exerciseId).toBe('front_squat');
    await h.sync.syncNow();
    expect(h.server.table('user_exercise_calibrations').get(third.id)).toMatchObject({ quality: 'calibrated', exercise_slug: 'front_squat' });
    await updateCalibrations(h.ctx, (await h.db.sessions.toArray())[0].id); // idempotent
  });

  it('SUB20: 36 tidigare pass – inga historiska set, e1RM-serier eller snapshots ändras av byten', { timeout: 180_000 }, async () => {
    const h = harness();
    await onboard(h);
    for (let i = 0; i < 36; i++) await doSession(h);
    expect((await h.sync.syncNow()).stoppedBy).toBeNull();
    const sets = await h.db.sets.toArray();
    const exs = await h.db.sessionExercises.toArray();
    const audits = await h.db.audits.toArray();
    const series = await Promise.all((['squat', 'bench_press', 'deadlift'] as const).map((x) => strengthSeries(h.ctx, x)));
    expect(series[0].points.length).toBeGreaterThan(10);
    const { s, se } = await startWith(h, 'squat');
    await swapExercise(h.ctx, se.id, 'front_squat', { familiarity: 'familiar', startGrams: 60_000, scope: 'future' });
    for (const x of await activeExs(h, s.id)) for (const set of await setsOf(h, x)) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 30_000 });
    await finishSession(h.ctx, s.id);
    await h.sync.syncNow();
    for (const old of sets) expect(await h.db.sets.get(old.id)).toEqual(old);
    for (const old of exs) expect(await h.db.sessionExercises.get(old.id)).toEqual(old);
    for (const old of audits) expect(await h.db.audits.get(old.id)).toEqual(old);
    const seriesAfter = await Promise.all((['squat', 'bench_press', 'deadlift'] as const).map((x) => strengthSeries(h.ctx, x)));
    // Historiska punkter är identiska; nya pass får bara lägga till punkter efter dem.
    for (const i of [1, 2]) expect(seriesAfter[i].points.slice(0, series[i].points.length)).toEqual(series[i].points);
    // Knäböjsserien får inga frontböjsvärden (knäböjen byttes innan något set gjordes).
    expect(seriesAfter[0]).toEqual(series[0]);
  });

  it('feature flag av: tidigare byte (S09 v1) fungerar oförändrat', async () => {
    const h = harness();
    await onboard(h);
    const { s, se } = await startWith(h, 'squat');
    const ne = await swapExerciseLegacy(h.ctx, se.id, 'leg_press');
    expect(ne.snapshot.substitutionFrom).toBe('squat');
    expect(ne.snapshot.reasons).toContain('USER_SWAP');
    expect(ne.orderIndex).toBe(Math.max(...(await h.db.sessionExercises.where('sessionId').equals(s.id).toArray()).filter((e) => e.id !== ne.id).map((e) => e.orderIndex)) + 1);
    expect(await h.db.substitutionEvents.count()).toBe(0);
  });
});
