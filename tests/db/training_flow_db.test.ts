import 'fake-indexeddb/auto';
import {deleteTrainingSet,restorePlannedSet} from '../../src/application/workout';
import {refreshFuturePlan} from '../../src/application/trainingPlan';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { StyrkaDB } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { SyncEngine } from '../../src/application/sync';
import type { AppContext } from '../../src/application/context';
import { completeOnboarding, patchProfile } from '../../src/application/profile';
import { finishSession, undoPerformance, configureExercise, previewNext, recordPerformance, startSession, ensureWarmups } from '../../src/application/training';
import { defaultConfiguration, trainingPreferences } from '../../src/domain/trainingFlow';
import { ONBOARDING, TestClock } from '../unit/appHarness';
import { closeSql, newUser, sql, withProfile, type TestUser } from './dbHelpers';
let a: TestUser, b: TestUser;
const dbs: StyrkaDB[] = [], syncs: SyncEngine[] = [];
beforeAll(async () => { a = await newUser('flow-a'); b = await newUser('flow-b'); await withProfile(b); });
afterAll(async () => { for (const s of syncs) s.dispose(); for (const d of dbs) await d.delete(); await sql('delete from auth.users where id=any($1::uuid[])', [[a.id,b.id]]); await closeSql(); });
it('rejects incomplete detail objects while preserving unknown legacy detail', async () => {
  const d = { version: 1, configuration: defaultConfiguration('squat'), performances: [], rests: [], aborted: false };
  for (const key of Object.keys(d)) {
    const invalid: Record<string, unknown> = { ...d }; delete invalid[key];
    expect((await sql('select private.valid_set_detail($1::jsonb,$2) as valid',[JSON.stringify(invalid),'planned']))[0].valid).toBe(false);
  }
  expect((await sql("select private.valid_set_detail(null,'done') as valid"))[0].valid).toBe(true);
  expect((await sql("select private.valid_set_detail(null,'partial') as valid"))[0].valid).toBe(false);
});
it('real queue roundtrip: partial sides, snapshots, warmups, rest, ownership and retries', async () => {
  const make = (): AppContext => { const db = new StyrkaDB(`test-flow-${randomUUID()}`); dbs.push(db); return { db, userId: a.id, transport: new SupabaseTransport(a.client), clock: new TestClock(), ids: { uuid: randomUUID }, isOnline: () => true }; };
  const c1 = make(), c2 = make(); const s1 = new SyncEngine(c1), s2 = new SyncEngine(c2); syncs.push(s1,s2);
  await completeOnboarding(c1,ONBOARDING);
  const plan = await previewNext(c1); plan.exercises = [{ ...plan.exercises[0], exerciseId: 'one_arm_dumbbell_row', sets: 3, kg: 25, reps: 10, calibration: false }];
  const session = await startSession(c1,plan);
  const se = (await c1.db.sessionExercises.where('sessionId').equals(session.id).toArray())[0];
  const work = await c1.db.sets.toArray();
  await recordPerformance(c1,work[0].id,'right',{ actualGrams: 25000, actualReps: 10 });
  expect(await s1.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null }); await s2.pull();
  expect((await c2.db.sets.get(work[0].id))?.detail?.performances).toHaveLength(1);
  expect((await c2.db.sets.get(work[0].id))?.status).toBe('partial');
  await recordPerformance(c2,work[0].id,'left',{ actualGrams: 22000, actualReps: 8 });
  expect(await s2.syncNow()).toMatchObject({ rejected: 0, conflicts: 0, stoppedBy: null }); await s1.pull();
  expect((await c1.db.sets.get(work[0].id))?.detail?.performances).toHaveLength(2);
  const cfg = defaultConfiguration(se.exerciseId); cfg.equipment.name = 'Hantlar A'; cfg.equipment.id = randomUUID();
  await configureExercise(c1,se.id,cfg); await patchProfile(c1,{ trainingPreferences: trainingPreferences({ showWarmupSets: true, exerciseDefaults: { one_arm_dumbbell_row: cfg } }) });
  expect(await s1.syncNow()).toMatchObject({ rejected: 0, stoppedBy: null }); await s2.pull();
  expect((await c2.db.sessionExercises.get(se.id))?.configuration?.equipment.id).toBe(cfg.equipment.id);
  expect((await c2.db.sets.get(work[0].id))?.detail?.performances[0].equipment.id).toBe('');
  expect((await b.client.from('training_sets').select('id').eq('id',work[0].id)).data).toEqual([]);
  expect((await b.client.from('session_exercises').update({ configuration: cfg }).eq('id',se.id).select('id')).data).toEqual([]);
  expect((await a.client.from('session_exercises').update({ exercise_slug: 'squat' }).eq('id',se.id)).error).not.toBeNull();
  const current = (await a.client.from('training_sets').select('*').eq('id',work[0].id).single()).data;
  const event = randomUUID(); const payload = { detail: current.detail, status: 'done', actualKg: 22, actualReps: 8 };
  const applied = await c1.transport.applySetMutation(event,work[0].id,current.revision,payload);
  expect(applied.status).toBe('applied');
  expect((await c1.transport.applySetMutation(event,work[0].id,current.revision,payload)).status).toBe('duplicate');
  const bad = structuredClone(current.detail); bad.performances.push(bad.performances[0]);
  expect((await c1.transport.applySetMutation(randomUUID(),work[0].id,current.revision+1,{ detail: bad })).status).toBe('rejected');
  expect((await c1.transport.applySetMutation(randomUUID(),work[0].id,current.revision+1,{ status: 'planned' })).status).toBe('rejected');
  for (const mutate of [
    (d: typeof current.detail) => { d.performances[0].repetitions = 3.5; },
    (d: typeof current.detail) => { d.performances[0].equipment.ratioVerified = null; },
    (d: typeof current.detail) => { d.performances[0].completedAt = 'invalid'; },
    (d: typeof current.detail) => { d.performances[0].loadValue = null; },
  ]) {
    const invalid = structuredClone(current.detail); mutate(invalid);
    expect((await c1.transport.applySetMutation(randomUUID(),work[0].id,current.revision+1,{ detail: invalid })).status).toBe('rejected');
  }
  const invalidConfiguration = structuredClone(cfg); invalidConfiguration.equipment.step = 0;
  expect((await a.client.from('session_exercises').update({ configuration: invalidConfiguration }).eq('id',se.id)).error).not.toBeNull();
  // New instance verifies persisted warmup plans independently from already started work.
  await c1.db.sessions.update(session.id,{ status: 'partial' });
  const next = await startSession(c1,plan); const se2 = (await c1.db.sessionExercises.where('sessionId').equals(next.id).toArray())[0];
  await ensureWarmups(c1,se2.id); expect(await s1.syncNow()).toMatchObject({ rejected: 0, stoppedBy: null });
  await s2.pull(); expect((await c2.db.sets.where('sessionExerciseId').equals(se2.id).toArray()).some((s) => s.kind === 'warmup' && s.status === 'planned')).toBe(true);
});

it('adaptive metadata, completed-set deletion/restore and revised plans survive real sync',async()=>{
  const db=new StyrkaDB('test-adaptive-'+randomUUID());dbs.push(db);
  const ctx:AppContext={db,userId:a.id,transport:new SupabaseTransport(a.client),clock:new TestClock(),ids:{uuid:randomUUID},isOnline:()=>true};
  const sync=new SyncEngine(ctx);syncs.push(sync);await sync.pull();
  for(const s of await db.sessions.toArray())if(['in_progress','paused'].includes(s.status))await finishSession(ctx,s.id);
  await patchProfile(ctx,{trainingPreferences:trainingPreferences({showWarmupSets:true})});
  const plan=await previewNext(ctx);plan.exercises=[{...plan.exercises[0],exerciseId:'squat',kg:100,reps:5,sets:3,mode:'heavy'}];
  const session=await startSession(ctx,plan);
  const ex=(await db.sessionExercises.where('sessionId').equals(session.id).toArray())[0];
  const cfg=defaultConfiguration('squat');cfg.equipment.minimum=20;await configureExercise(ctx,ex.id,cfg,false);await ensureWarmups(ctx,ex.id);
  const warm=(await db.sets.where('sessionExerciseId').equals(ex.id).toArray()).find(s=>s.kind==='warmup')!;
  expect(warm.detail?.warmupProposal?.policyVersion).toBe('WARMUP/2.0.0');
  const work=(await db.sets.where('sessionExerciseId').equals(ex.id).toArray()).find(s=>s.kind==='work')!;
  await recordPerformance(ctx,work.id,'both',{actualGrams:80000,actualReps:5,rir:2});
  await deleteTrainingSet(ctx,work.id);
  expect(await sync.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});
  expect((await a.client.from('training_sets').select('deleted_at').eq('id',work.id).single()).data?.deleted_at).toBeTruthy();
  await restorePlannedSet(ctx,work.id);await finishSession(ctx,session.id);
  const old=await refreshFuturePlan(ctx);
  expect(await sync.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});
  expect((await refreshFuturePlan(ctx))!.id).toBe(old!.id);
  await undoPerformance(ctx,work.id,'both');const revision=await refreshFuturePlan(ctx);
  expect(revision!.id).not.toBe(old!.id);
  expect(await sync.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});
  const copy=new StyrkaDB('test-adaptive-copy-'+randomUUID());dbs.push(copy);const copySync=new SyncEngine({...ctx,db:copy});syncs.push(copySync);await copySync.pull();
  expect((await copy.sets.get(warm.id))!.detail?.warmupProposal).toEqual(warm.detail!.warmupProposal);
  expect((await copy.sets.get(work.id))!.status).toBe('planned');
  expect((await copy.sets.get(work.id))!.detail!.recordingChanges!.some(c=>c.before.grams===80000)).toBe(true);
  expect((await copy.planRevisions.get(old!.id))!.contentHash).toBe(old!.contentHash);
  expect((await copy.planRevisions.get(revision!.id))!.inputsHash).toBe(revision!.inputsHash);
});
