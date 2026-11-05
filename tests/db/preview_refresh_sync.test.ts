import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { StyrkaDB } from '../../src/storage/db';
import { SupabaseTransport } from '../../src/server/supabaseTransport';
import { SyncEngine } from '../../src/application/sync';
import { completeOnboarding } from '../../src/application/profile';
import { displayOrder, previewNext, startSession, recordPerformance, setStatus } from '../../src/application/training';
import { refreshPreparedSession } from '../../src/application/refreshPreview';
import { ONBOARDING, TestClock } from '../unit/appHarness';
import { closeSql, newUser, sql, type TestUser } from './dbHelpers';

const users:TestUser[]=[];
const dbs:StyrkaDB[]=[], syncs:SyncEngine[]=[];
afterAll(async()=>{for(const s of syncs)s.dispose();for(const db of dbs)await db.delete();for(const user of users)await sql('delete from auth.users where id=$1',[user.id]);await closeSql();});
async function account(){const user=await newUser('preview-refresh');users.push(user);return user;}
function make(user:TestUser){
  const db=new StyrkaDB(`preview-refresh-${randomUUID()}`);dbs.push(db);
  const ctx={db,userId:user.id,transport:new SupabaseTransport(user.client),clock:new TestClock(),ids:{uuid:randomUUID},isOnline:()=>true};
  const sync=new SyncEngine(ctx);syncs.push(sync);return{ctx,db,sync};
}

it('refreshing an already synced preview saves replacement exercises and their sets on real Postgres',async()=>{
  const user=await account();const a=make(user);await completeOnboarding(a.ctx,ONBOARDING);
  const p=await previewNext(a.ctx);
  const draft=await startSession(a.ctx,{...p,exercises:p.exercises.map(e=>({...e,engineVersion:'2.2.0'}))},true);
  expect(await a.sync.syncNow()).toMatchObject({rejected:0,stoppedBy:null});
  const before=displayOrder(await a.db.sessionExercises.where('sessionId').equals(draft.id).toArray()).map(e=>e.exerciseId);
  expect(await refreshPreparedSession(a.ctx,draft.id)).toBe(true);
  expect(await a.sync.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});
  expect(await a.sync.pendingCount()).toBe(0);
  const b=make(user);await b.sync.pull();
  const exs=await b.db.sessionExercises.where('sessionId').equals(draft.id).toArray();
  expect(displayOrder(exs).map(e=>e.exerciseId)).toEqual(before);
  expect(new Set(exs.map(e=>e.orderIndex)).size).toBe(exs.length);
  expect((await b.db.sets.where('sessionId').equals(draft.id).toArray()).filter(s=>!s.deleted)).toHaveLength(p.exercises.reduce((n,e)=>n+e.sets,0));
});

it('repairs the rejected refresh queue after training, preserving performed sets and unrelated errors',async()=>{
  const user=await account();const a=make(user);await completeOnboarding(a.ctx,ONBOARDING);
  const p=await previewNext(a.ctx);
  const draft=await startSession(a.ctx,{...p,exercises:p.exercises.map(e=>({...e,engineVersion:'2.2.0'}))},true);
  expect(await a.sync.syncNow()).toMatchObject({rejected:0,stoppedBy:null});
  const before=displayOrder(await a.db.sessionExercises.where('sessionId').equals(draft.id).toArray()).map(e=>e.exerciseId);
  await refreshPreparedSession(a.ctx,draft.id);
  const nodes=displayOrder(await a.db.sessionExercises.where('sessionId').equals(draft.id).toArray());
  await setStatus(a.ctx,draft.id,'in_progress');
  const set=(await a.db.sets.where('sessionExerciseId').equals(nodes[0].id).toArray())[0];
  await recordPerformance(a.ctx,set.id,'both',{actualGrams:75000,actualReps:6,perceivedEffort:'easy',technique:'controlled'});
  await setStatus(a.ctx,draft.id,'partial');
  const performed=await a.db.sets.get(set.id);
  // Recreate the previous release's duplicate index and actual server rejections.
  for(const node of nodes){
    const parent=(await a.db.sessionExercises.get(node.replacesId!))!;
    const queue=await a.db.outbox.toArray();
    const creation=queue.find(e=>e.recordId===node.id && e.op.type==='upsert')!;
    if(creation.op.type!=='upsert')throw new Error('missing exercise upsert');
    const row={...creation.op.row,order_index:parent.orderIndex};
    const result=await user.client.from('session_exercises').upsert(row,{onConflict:'id',ignoreDuplicates:true});
    expect(result.error?.code).toBe('23505');
    await a.db.sessionExercises.update(node.id,{orderIndex:parent.orderIndex});
    await a.db.outbox.update(creation.seq!,{op:{...creation.op,row},status:'rejected',lastError:'VALIDATION_ERROR'});
    for(const child of await a.db.sets.where('sessionExerciseId').equals(node.id).toArray()){
      const entry=queue.find(e=>e.recordId===child.id && e.op.type==='set' && e.op.create)!;
      if(entry.op.type!=='set')throw new Error('missing set create');
      expect(await a.ctx.transport.applySetMutation(entry.eventId,child.id,null,entry.op.payload)).toMatchObject({status:'rejected',code:'NOT_FOUND'});
      await a.db.outbox.update(entry.seq!,{status:'rejected',lastError:'NOT_FOUND'});
      await a.db.sets.update(child.id,{syncState:'failed'});
    }
  }
  const broken=await a.db.outbox.toArray();
  const unrelated={eventId:randomUUID(),recordId:randomUUID(),op:{type:'upsert' as const,table:'session_exercises' as const,row:{id:randomUUID()},immutable:true},createdAt:a.ctx.clock.now(),attempts:1,status:'rejected' as const,lastError:'VALIDATION_ERROR'};
  const unrelatedSeq=await a.db.outbox.add(unrelated);
  expect(await a.sync.syncNow()).toMatchObject({rejected:0,conflicts:0,stoppedBy:null});
  expect(await a.db.outbox.toArray()).toEqual([{...unrelated,seq:unrelatedSeq}]);
  expect(await a.sync.syncNow()).toMatchObject({sent:0});
  const saved=await a.db.sets.get(set.id);
  expect(saved).toMatchObject({actualGrams:75000,actualReps:6,status:'done',syncState:'synced',detail:performed!.detail});
  const b=make(user);await b.sync.pull();
  expect(await b.db.sets.get(set.id)).toMatchObject({actualGrams:75000,actualReps:6,status:'done',detail:JSON.parse(JSON.stringify(performed!.detail))});
  expect(displayOrder(await b.db.sessionExercises.where('sessionId').equals(draft.id).toArray()).map(e=>e.exerciseId)).toEqual(before);
  expect((await sql('select event_id from mutation_receipts where user_id=$1',[user.id])).map(r=>r.event_id)).toEqual(expect.arrayContaining(broken.filter(e=>e.op.type==='set').map(e=>e.eventId)));
});
