import { afterEach, expect, it, vi } from 'vitest';
import { harness, onboard, type Harness } from './appHarness';
import { editSet, logSet, previewNext, rateSet, recordPerformance, startSession, undoPerformance, undoSet } from '../../src/application/training';
import { strengthSeries, trainingSeriesOptions } from '../../src/application/history';
import { buildHistory } from '../../src/application/plannerInput';
import { comparableHistory } from '../../src/domain/comparableTraining';
import { effectiveRir } from '../../src/domain/effort';
import { applyServerSetValues } from '../../src/server/mapping';
import type { ExerciseId } from '../../src/domain/catalog';
import { exportJson } from '../../src/application/privacy';

const hs: Harness[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const h of hs.splice(0)) { h.sync.dispose(); await h.db.delete(); } });
async function setup(id: ExerciseId = 'squat') {
  const h = harness(); hs.push(h); await onboard(h);
  h.clock.advanceHours(24);
  const plan = await previewNext(h.ctx);
  plan.exercises = [{ ...plan.exercises[0], exerciseId: id, sets: 3, reps: 5, kg: 70, calibration: true }];
  const session = await startSession(h.ctx,plan);
  const se = (await h.db.sessionExercises.where('sessionId').equals(session.id).toArray())[0];
  const sets = (await h.db.sets.where('sessionId').equals(session.id).toArray()).sort((a,b)=>a.ordinal-b.ordinal);
  return { ...h,session,se,sets };
}

it('stores different feelings per set; only explicit max supplies zero reserve and a new max point', async () => {
  const h = await setup();
  for (const [i,load,feel] of [[0,70000,'easy'],[1,90000,'hard'],[2,100000,'maximal']] as const) {
    await recordPerformance(h.ctx,h.sets[i].id,'both',{ actualGrams:load,actualReps:6 });
    await rateSet(h.ctx,h.sets[i].id,feel);
    const saved = (await h.db.sets.get(h.sets[i].id))!;
    expect(saved.rir).toBeNull(); expect(saved.detail?.performances[0].effort).toBe(feel);
    if (i < 2) expect((await strengthSeries(h.ctx,'squat')).points.filter((p) => p.sessionId && p.source !== 'performance')).toEqual([]);
  }
  const series = await strengthSeries(h.ctx,'squat');
  expect(series.points.filter((p) => p.origin === 'input')).toHaveLength(1);
  expect(series.latestMax).toMatchObject({ kg:120,sessionId:h.session.id,source:'estimated' });
  expect(series.latestMax?.detail).toContain('maxansträngning');
  const hs = comparableHistory(await buildHistory(h.db),'squat',h.se.configuration);
  expect(hs[0].sets.map((s) => s.rir)).toEqual([null,null,0]);
  expect(JSON.stringify(await exportJson(h.ctx))).toContain('maximal');
  // The last estimate is visible even when a later period has no new observations.
  const later = await strengthSeries(h.ctx,'squat','2026-12-01T00:00:00Z');
  expect(later.points).toEqual([]); expect(later.latestMax?.at).toBe(series.latestMax?.at);
  await rateSet(h.ctx,h.sets[2].id,'hard');
  expect((await strengthSeries(h.ctx,'squat')).latestMax?.origin).toBe('input');
});

it('a measured single does not relabel a higher calculated result from another set', async () => {
  const h = await setup();
  await recordPerformance(h.ctx,h.sets[0].id,'both',{actualGrams:90000,actualReps:1,rir:0});
  await recordPerformance(h.ctx,h.sets[1].id,'both',{actualGrams:100000,actualReps:6});
  await rateSet(h.ctx,h.sets[1].id,'maximal');
  expect((await strengthSeries(h.ctx,'squat')).latestMax).toMatchObject({kg:120,source:'estimated',detail:'uppskattad från maxansträngning'});
});

it('a settings sync timestamp cannot replace a real workout estimate with the input reference', async () => {
  const h = await setup();
  await recordPerformance(h.ctx,h.sets[0].id,'both',{actualGrams:80000,actualReps:6});
  await rateSet(h.ctx,h.sets[0].id,'maximal');
  const before = (await strengthSeries(h.ctx,'squat')).latestMax!;
  expect(before).toMatchObject({kg:96,sessionId:h.session.id});
  await h.db.exerciseSettings.where('exerciseId').equals('squat').modify({updatedAt:'2026-12-01T10:00:00Z'});
  const after = await strengthSeries(h.ctx,'squat');
  expect(after.latestMax).toEqual(before);
  expect(after.points.find(p=>p.origin==='input')?.at).toBe('2026-12-01T10:00:00Z');
  await rateSet(h.ctx,h.sets[0].id,null);
  expect((await strengthSeries(h.ctx,'squat')).latestMax?.origin).toBe('input');
});

it('an older snapshot arriving after an acknowledged answer cannot overwrite the new revision', async () => {
  const h=await setup(); const id=h.sets[0].id;
  await recordPerformance(h.ctx,id,'both',{actualGrams:80000,actualReps:6});
  await h.sync.refresh();
  for (const answer of ['maximal',null] as const) {
    const oldSnapshot=await h.server.pullAll(h.userId);
    let release!:()=>void, started!:()=>void;
    const began=new Promise<void>(r=>{started=r;});
    vi.spyOn(h.server,'pullAll').mockImplementationOnce(async()=>{
      started(); await new Promise<void>(r=>{release=r;}); return oldSnapshot;
    });
    const pull=h.sync.pull(); await began;
    await rateSet(h.ctx,id,answer); await h.sync.syncNow();
    const acknowledged=await h.db.sets.get(id);
    expect(acknowledged?.syncState).toBe('synced');
    release(); await pull;
    expect(await h.db.sets.get(id)).toEqual(acknowledged);
    expect((await strengthSeries(h.ctx,'squat')).latestMax?.origin).toBe(answer ? undefined : 'input');
  }
});

it('hard does not lower a calibrated load; no rating, skipped and warmup sets remain distinct', async () => {
  const h=await setup();
  await expect(rateSet(h.ctx,h.sets[0].id,'hard')).rejects.toThrow();
  await recordPerformance(h.ctx,h.sets[0].id,'both',{ actualGrams:80000,actualReps:5 });
  await rateSet(h.ctx,h.sets[0].id,'hard');
  expect((await h.db.sets.get(h.sets[1].id))?.targetGrams).toBe(80000);
  await rateSet(h.ctx,h.sets[0].id,null);
  expect((await h.db.sets.get(h.sets[0].id))?.detail?.performances[0].effort).toBeNull();
  await h.db.sets.update(h.sets[0].id,{kind:'warmup'});
  await expect(rateSet(h.ctx,h.sets[0].id,'maximal')).rejects.toThrow();
  for (const effort of ['too_easy','easy','ok','hard','too_heavy'] as const) expect(effectiveRir(null,effort)).toBeNull();
});

it('side answers stay independent, including partial sets, and max on one side limits shared progression', async () => {
  const h=await setup('one_arm_dumbbell_row');
  await recordPerformance(h.ctx,h.sets[0].id,'right',{actualGrams:25000,actualReps:6});
  await rateSet(h.ctx,h.sets[0].id,'easy','right');
  expect((await h.db.sets.get(h.sets[0].id))?.status).toBe('partial');
  await recordPerformance(h.ctx,h.sets[0].id,'left',{actualGrams:20000,actualReps:5});
  await rateSet(h.ctx,h.sets[0].id,'maximal','left');
  const saved=(await h.db.sets.get(h.sets[0].id))!;
  expect(saved.detail?.performances.map((p)=>p.effort)).toEqual(['easy','maximal']);
  expect(saved.perceivedEffort).toBeNull();
  expect(comparableHistory(await buildHistory(h.db),h.se.exerciseId,h.se.configuration)[0].sets[0].rir).toBe(0);
  const options=await trainingSeriesOptions(h.ctx,h.se.exerciseId);
  expect((await strengthSeries(h.ctx,h.se.exerciseId,undefined,options.find((o)=>o.label.includes('Höger'))!.value)).latestMax).toBeUndefined();
  expect((await strengthSeries(h.ctx,h.se.exerciseId,undefined,options.find((o)=>o.label.includes('Vänster'))!.value)).latestMax?.kg).toBe(23.333);
  await undoPerformance(h.ctx,h.sets[0].id,'left');
  expect((await h.db.sets.get(h.sets[0].id))?.detail?.performances.map((p)=>p.effort)).toEqual(['easy']);
});

it('edits invalidate old max answers, explicit reserve overrides them, and repeated taps are idempotent', async () => {
  const h=await setup(); const id=h.sets[0].id;
  await recordPerformance(h.ctx,id,'both',{actualGrams:80000,actualReps:5,rir:3});
  await rateSet(h.ctx,id,'maximal'); const queued=await h.db.outbox.count();
  await rateSet(h.ctx,id,'maximal'); expect(await h.db.outbox.count()).toBe(queued);
  expect((await h.db.sets.get(id))?.detail?.performances[0].rir).toBeNull();
  await recordPerformance(h.ctx,id,'both',{actualGrams:85000},{edit:true});
  expect((await h.db.sets.get(id))?.detail?.performances[0].effort).toBeNull();
  await rateSet(h.ctx,id,'maximal'); await recordPerformance(h.ctx,id,'both',{rir:2},{edit:true});
  expect((await h.db.sets.get(id))?.detail?.performances[0]).toMatchObject({rir:2,effort:null});
  await undoSet(h.ctx,id); await recordPerformance(h.ctx,id,'both',{});
  expect((await h.db.sets.get(id))?.perceivedEffort).toBeNull();
});

it('failed effort writes roll back without losing the completed set or touching rest timestamps', async () => {
  const h=await setup(); const id=h.sets[0].id;
  await recordPerformance(h.ctx,id,'both',{actualGrams:80000,actualReps:5});
  const before=await h.db.sets.get(id);
  vi.spyOn(h.db.outbox,'add').mockRejectedValueOnce(new Error('disk full'));
  await expect(rateSet(h.ctx,id,'maximal')).rejects.toThrow();
  expect(await h.db.sets.get(id)).toEqual(before);
  await rateSet(h.ctx,id,'maximal');
  expect((await h.db.sets.get(id))?.detail?.rests).toEqual(before?.detail?.rests);
});

it('legacy answers remain usable, clear correctly in conflicts, and high-rep max is not silently estimated', async () => {
  const h=await setup(); const id=h.sets[0].id;
  await logSet(h.ctx,id,{actualGrams:80000,actualReps:5}); await rateSet(h.ctx,id,'maximal');
  expect((await strengthSeries(h.ctx,'squat')).latestMax?.sessionId).toBe(h.session.id);
  const old=(await h.db.sets.get(id))!;
  expect(applyServerSetValues(old,{perceivedEffort:null},2).perceivedEffort).toBeNull();
  await editSet(h.ctx,id,{actualReps:12}); await rateSet(h.ctx,id,'maximal');
  expect((await strengthSeries(h.ctx,'squat')).latestMax?.origin).toBe('input');
  await undoSet(h.ctx,id); expect((await h.db.sets.get(id))?.perceivedEffort).toBeNull();
});
