import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { StyrkaDB } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { SyncEngine } from '../../src/application/sync';
import type { AppContext } from '../../src/application/context';
import { completeOnboarding } from '../../src/application/profile';
import { previewNext, rateSet, recordPerformance, startSession } from '../../src/application/training';
import { ONBOARDING, TestClock } from '../unit/appHarness';
import { closeSql, newUser, sql, withProfile, type TestUser } from './dbHelpers';
let a: TestUser,b: TestUser;
const dbs: StyrkaDB[] = [],syncs: SyncEngine[] = [];
beforeAll(async()=>{a=await newUser('effort-a');b=await newUser('effort-b');await withProfile(b);});
afterAll(async()=>{for(const s of syncs)s.dispose();for(const d of dbs)await d.delete();await sql('delete from auth.users where id=any($1::uuid[])',[[a?.id,b?.id].filter(Boolean)]);await closeSql();});

it('real sync preserves per-side feedback, removal, snapshots and timestamps; ownership and validation remain enforced',async()=>{
  const make=():AppContext=>{const db=new StyrkaDB(`test-effort-${randomUUID()}`);dbs.push(db);return{db,userId:a.id,transport:new SupabaseTransport(a.client),clock:new TestClock(),ids:{uuid:randomUUID},isOnline:()=>true};};
  const c1=make(),c2=make(),s1=new SyncEngine(c1),s2=new SyncEngine(c2);syncs.push(s1,s2);
  await completeOnboarding(c1,ONBOARDING);
  const plan=await previewNext(c1);plan.exercises=[{...plan.exercises[0],exerciseId:'one_arm_dumbbell_row',sets:3,kg:25,reps:6,calibration:false}];
  const session=await startSession(c1,plan);const set=(await c1.db.sets.where('sessionId').equals(session.id).toArray()).sort((a,b)=>a.ordinal-b.ordinal)[0];
  await recordPerformance(c1,set.id,'right',{actualGrams:25000,actualReps:6});await rateSet(c1,set.id,'easy','right');
  expect(await s1.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});await s2.pull();
  expect((await c2.db.sets.get(set.id))?.detail?.performances[0].effort).toBe('easy');
  await recordPerformance(c2,set.id,'left',{actualGrams:22500,actualReps:5});await rateSet(c2,set.id,'maximal','left');
  expect(await s2.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});await s1.pull();
  const before=(await c1.db.sets.get(set.id))!;
  expect(before.detail?.performances.map((p)=>p.effort)).toEqual(['easy','maximal']);
  expect(before.detail?.performances.map((p)=>p.rir)).toEqual([null,null]);
  await rateSet(c1,set.id,null,'left');expect(await s1.syncNow()).toMatchObject({rejected:0,conflicts:0});await s2.pull();
  const after=(await c2.db.sets.get(set.id))!;
  expect(after.detail?.performances.map((p)=>p.effort)).toEqual(['easy',null]);
  expect(after.detail!.rests[0].startedAt).toBe(before.detail!.rests[0].startedAt);
  expect(after.detail!.rests[0].recommendedSeconds).toBe(before.detail!.rests[0].recommendedSeconds-30);
  expect(after.detail?.performances.map((p)=>[p.id,p.completedAt,p.equipment])).toEqual(before.detail?.performances.map((p)=>[p.id,p.completedAt,p.equipment]));
  const other=new SupabaseTransport(b.client);
  expect((await other.applySetMutation(randomUUID(),set.id,after.serverRevision,{perceivedEffort:'maximal'}))).toMatchObject({status:'rejected',code:'NOT_FOUND'});
  for(const effort of [42,'unrecognised',{kind:'maximal'}]){
    const detail=structuredClone(after.detail!);Object.assign(detail.performances[0],{effort});
    expect((await c2.transport.applySetMutation(randomUUID(),set.id,after.serverRevision,{detail})).status).toBe('rejected');
  }
  const contradiction=structuredClone(after.detail!);Object.assign(contradiction.performances[0],{effort:'maximal',rir:3});
  expect((await c2.transport.applySetMutation(randomUUID(),set.id,after.serverRevision,{detail:contradiction})).status).toBe('rejected');
  expect((await sql('select revision from public.training_sets where id=$1',[set.id]))[0].revision).toBe(after.serverRevision);
});

it('legacy set API accepts five levels and old calibration answers; clear and duplicate operations are safe',async()=>{
  const sessionId=randomUUID(),seId=randomUUID(),id=randomUUID();
  expect((await a.client.from('training_sessions').insert({id:sessionId,user_id:a.id,kind:'extra',status:'in_progress'})).error).toBeNull();
  expect((await a.client.from('session_exercises').insert({id:seId,user_id:a.id,session_id:sessionId,exercise_slug:'squat',order_index:0,mode:'heavy',band_min:5,band_max:7,target_sets:3})).error).toBeNull();
  const t=new SupabaseTransport(a.client);
  expect((await t.applySetMutation(randomUUID(),id,null,{sessionExerciseId:seId,ordinal:1,kind:'work',status:'done',actualKg:'80.000',actualReps:5,occurredAt:new Date().toISOString()})).status).toBe('applied');
  let revision=1;
  for(const effort of ['too_easy','easy','ok','hard','maximal','too_heavy',null]){
    const event=randomUUID(),payload={perceivedEffort:effort};
    expect((await t.applySetMutation(event,id,revision,payload)).status).toBe('applied');
    expect((await t.applySetMutation(event,id,revision,payload)).status).toBe('duplicate');
    revision++;
    expect((await sql('select perceived_effort,detail from public.training_sets where id=$1',[id]))[0]).toEqual({perceived_effort:effort,detail:null});
  }
  expect((await t.applySetMutation(randomUUID(),id,revision,{perceivedEffort:'maximal',rir:2})).status).toBe('rejected');
});
