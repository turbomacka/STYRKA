import 'fake-indexeddb/auto';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {useLiveQuery} from 'dexie-react-hooks';
import {harness,onboard,type Harness} from '../unit/appHarness';
import {configureExercise,finishSession,previewNext,recordPerformance,startSession} from '../../src/application/training';
import {refreshFuturePlan,latestRevision,type PlanSlot} from '../../src/application/trainingPlan';
import * as planning from '../../src/application/trainingPlan';
import {defaultConfiguration} from '../../src/domain/trainingFlow';
import {HistoryCorrection} from '../../src/ui/components/HistoryCorrection';
import {Plan} from '../../src/ui/screens/Plan';
import type {PerceivedEffort} from '../../src/domain/model';
const mocked=vi.hoisted(()=>({services:{} as unknown}));
vi.mock('../../src/ui/services',()=>({useServices:()=>mocked.services}));
vi.mock('../../src/ui/screens/Today',()=>({NextWorkout:()=>null,SyncLink:()=>null}));
let h:Harness;
afterEach(async()=>{cleanup();vi.restoreAllMocks();h?.sync.dispose();await h?.db.delete();});
it('8: correct one historical side, recalculate, preserve other side, original plan and audit',async()=>{
 h=harness();await onboard(h);mocked.services={ctx:h.ctx,online:false};
 const session=await startSession(h.ctx,await previewNext(h.ctx));
 const instance=(await h.db.sessionExercises.toArray()).find(e=>e.exerciseId==='lat_pulldown')!;
 await configureExercise(h.ctx,instance.id,{...defaultConfiguration('lat_pulldown'),executionMode:'sequential'});
 const row=(await h.db.sets.where('sessionExerciseId').equals(instance.id).sortBy('ordinal'))[0];
 for(const side of ['right','left'] as const)await recordPerformance(h.ctx,row.id,side,{actualGrams:30000,actualReps:10});
 await finishSession(h.ctx,session.id);const prior=(await refreshFuturePlan(h.ctx))!;
 const original=structuredClone((await h.db.sessionExercises.get(instance.id))!.snapshot);
 render(<HistoryCorrection set={(await h.db.sets.get(row.id))!} instance={instance}/>);
 fireEvent.click(screen.getByRole('button',{name:'Korrigera set 1'}));
 fireEvent.click(screen.getByRole('button',{name:'Vänster'}));
 fireEvent.change(screen.getByLabelText('Registrerad vikt (kg)'),{target:{value:'25'}});
 fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
 await screen.findByText('Korrigeringen är sparad och planen är uppdaterad.');
 const saved=(await h.db.sets.get(row.id))!;
 expect(saved.detail!.performances.find(p=>p.side==='right')!.loadValue).toBe(30);
 expect(saved.detail!.performances.find(p=>p.side==='left')!.loadValue).toBe(25);
 expect(saved.detail!.recordingChanges!.at(-1)!.before.sides.find(p=>p.side==='left')!.loadValue).toBe(30);
 expect((await h.db.sessionExercises.get(instance.id))!.snapshot).toEqual(original);
 expect((await h.db.planRevisions.get(prior.id))!.contentHash).toBe(prior.contentHash);
 expect(await h.db.planRevisions.count()).toBeGreaterThan(1);
});

async function completedBench(effort:PerceivedEffort='ok'){
 h=harness();await onboard(h,{experience:'experienced'});mocked.services={ctx:h.ctx,online:false};
 const snapshot=await previewNext(h.ctx),bench=snapshot.exercises.find(e=>e.exerciseId==='bench_press')!;
 const session=await startSession(h.ctx,{...snapshot,exercises:[{...bench,mode:'heavy',kg:80,reps:7,bandMin:5,bandMax:7,sets:3,calibration:false,configuration:defaultConfiguration('bench_press')}]});
 const rows=await h.db.sets.where('sessionId').equals(session.id).sortBy('ordinal');
 for(const row of rows)await recordPerformance(h.ctx,row.id,'both',{actualGrams:75000,actualReps:7,perceivedEffort:effort,technique:'controlled'});
 await finishSession(h.ctx,session.id);h.clock.advanceHours(72);
 const instance=(await h.db.sessionExercises.where('sessionId').equals(session.id).first())!;
 return {session,rows,instance};
}

it.each(['easy','ok'] as const)('editing the latest workout to %s produces the same adaptive plan as direct registration, including offline sync',async(effort)=>{
 const {session,rows,instance}=await completedBench(effort);
 const expected=(await refreshFuturePlan(h.ctx))!;
 const expectedDose=(expected.slots as PlanSlot[]).flatMap(s=>s.exercises).find(e=>e.exerciseId==='bench_press'&&e.mode==='heavy')!;
 expect(expectedDose.kg).toBe(effort==='easy'?77.5:75);
 // Start from an incorrectly registered load and effort, then correct through the UI.
 for(const row of rows)await recordPerformance(h.ctx,row.id,'both',{actualGrams:80000,perceivedEffort:'maximal'},{edit:true});
 const before=(await refreshFuturePlan(h.ctx))!;
 expect(before.contentHash).not.toBe(expected.contentHash);
 const originalSession=structuredClone(await h.db.sessions.get(session.id));
 const originalProgram=structuredClone(await h.db.programs.toArray());
 h.server.online=false;
 for(const row of rows){
  render(<HistoryCorrection set={(await h.db.sets.get(row.id))!} instance={instance}/>);
  fireEvent.click(screen.getByRole('button',{name:`Korrigera set ${row.ordinal}`}));
  fireEvent.change(screen.getByLabelText('Registrerad vikt (kg)'),{target:{value:'75'}});
  expect((screen.getByLabelText('Hur kändes setet?') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Hur kändes setet?'),{target:{value:effort}});
  fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
  await screen.findByText('Korrigeringen är sparad och planen är uppdaterad.');
  const saved=(await h.db.sets.get(row.id))!;
  expect(saved.detail!.performances[0]).toMatchObject({effort,loadValue:75,rir:null});
  expect(saved.targetGrams).toBe(80000);
  cleanup();
 }
 const corrected=(await latestRevision(h.ctx))!;
 expect(corrected.slots).toEqual(expected.slots);
 expect(await h.db.sessions.get(session.id)).toEqual(originalSession);
 expect(await h.db.programs.toArray()).toEqual(originalProgram);
 expect(await h.db.planRevisions.get(before.id)).toEqual(before);
 expect(await h.db.outbox.count()).toBeGreaterThan(0);
 h.server.online=true;await h.sync.syncNow();await h.sync.pull();
 expect((await refreshFuturePlan(h.ctx))!.slots).toEqual(expected.slots);
});

it('retries planning without saving a second correction when recalculation fails',async()=>{
 const {rows,instance}=await completedBench();
 vi.spyOn(planning,'refreshFuturePlan').mockRejectedValueOnce(new Error('planner unavailable'));
 render(<HistoryCorrection set={(await h.db.sets.get(rows[0].id))!} instance={instance}/>);
 fireEvent.click(screen.getByRole('button',{name:'Korrigera set 1'}));
 fireEvent.change(screen.getByLabelText('Hur kändes setet?'),{target:{value:'easy'}});
 fireEvent.change(screen.getByLabelText('Teknik'),{target:{value:'uncertain'}});
 fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
 await screen.findByText('Korrigeringen är sparad. Planen kunde inte beräknas. Försök igen.');
 const saved=(await h.db.sets.get(rows[0].id))!;
 expect(saved.detail!.performances[0]).toMatchObject({effort:'easy',technique:'uncertain'});
 fireEvent.click(screen.getByRole('button',{name:'Försök beräkna igen'}));
 await screen.findByText('Korrigeringen är sparad och planen är uppdaterad.');
 expect(await h.db.sets.get(rows[0].id)).toEqual(saved);
});

it.each([false,true])('validates before saving and handles maximal effort with legacy=%s',async(legacy)=>{
 const {rows,instance}=await completedBench();
 await recordPerformance(h.ctx,rows[0].id,'both',{rir:3},{edit:true});
 if(legacy)await h.db.sets.update(rows[0].id,{detail:undefined});
 const original=(await h.db.sets.get(rows[0].id))!;
 render(<HistoryCorrection set={original} instance={instance}/>);
 fireEvent.click(screen.getByRole('button',{name:'Korrigera set 1'}));
 expect((screen.getByLabelText('Repetitioner kvar (valfritt)') as HTMLSelectElement).value).toBe('3');
 fireEvent.change(screen.getByLabelText('Registrerade repetitioner'),{target:{value:'-1'}});
 fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
 await screen.findByRole('alert');
 expect(await h.db.sets.get(rows[0].id)).toEqual(original);
 fireEvent.change(screen.getByLabelText('Registrerade repetitioner'),{target:{value:'6'}});
 fireEvent.change(screen.getByLabelText('Hur kändes setet?'),{target:{value:'maximal'}});
 expect((screen.getByLabelText('Repetitioner kvar (valfritt)') as HTMLSelectElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
 await screen.findByText('Korrigeringen är sparad och planen är uppdaterad.');
 const saved=(await h.db.sets.get(rows[0].id))!;
 expect(saved).toMatchObject({actualReps:6,perceivedEffort:'maximal',rir:null});
 expect(saved.occurredAt).toBe(original.occurredAt);
 if(!legacy)expect(saved.detail!.performances[0]).toMatchObject({effort:'maximal',rir:null});
 fireEvent.click(screen.getByRole('button',{name:'Klart'}));
 expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps the selected side and success state when live history reorders corrected performances',async()=>{
 h=harness();await onboard(h);mocked.services={ctx:h.ctx,online:false};
 // The component receives real live DB updates, including changed performance order.
 const session=await startSession(h.ctx,await previewNext(h.ctx));
 const se=(await h.db.sessionExercises.where('sessionId').equals(session.id).toArray()).find(e=>e.exerciseId==='lat_pulldown')!;
 await configureExercise(h.ctx,se.id,{...se.configuration!,executionMode:'sequential'});
 const row=(await h.db.sets.where('sessionExerciseId').equals(se.id).first())!;
 for(const side of ['right','left'] as const)await recordPerformance(h.ctx,row.id,side,{actualGrams:30000,actualReps:7,perceivedEffort:'hard'});
 await finishSession(h.ctx,session.id);
 function LiveCorrection(){const set=useLiveQuery(()=>h.db.sets.get(row.id),[]);return set?<HistoryCorrection set={set} instance={se}/>:null;}
 render(<LiveCorrection/>);
 fireEvent.click(await screen.findByRole('button',{name:`Korrigera set ${row.ordinal}`}));
 fireEvent.change(screen.getByLabelText('Hur kändes setet?'),{target:{value:'easy'}});
 fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
 await screen.findByText('Korrigeringen är sparad och planen är uppdaterad.');
 expect(screen.getByRole('button',{name:'Höger'}).getAttribute('aria-pressed')).toBe('true');
 const saved=(await h.db.sets.get(row.id))!;
 expect(saved.detail!.performances.find(p=>p.side==='right')!.effort).toBe('easy');
 expect(saved.detail!.performances.find(p=>p.side==='left')!.effort).toBe('hard');
});

it('edits an older workout after loading more history without losing the open workout',async()=>{
 const {session}=await completedBench();
 const finished=(await h.db.sessions.get(session.id))!;
 await h.db.sessions.bulkPut(Array.from({length:30},(_,i)=>({...finished,id:h.ctx.ids.uuid(),kind:'extra' as const,programId:null,rotationIndex:null,startedAt:new Date(Date.parse(finished.startedAt!)+(i+1)*60000).toISOString()})));
 render(<MemoryRouter initialEntries={['/?flik=genomforda']}><Plan/></MemoryRouter>);
 const list=await screen.findByRole('list',{name:'Genomförda pass'});
 await waitFor(()=>expect(within(list).getAllByRole('button',{expanded:false})).toHaveLength(30));
 fireEvent.click(screen.getByRole('button',{name:'Visa fler'}));
 await waitFor(()=>expect(list.querySelectorAll('.plan-row')).toHaveLength(31));
 const old=list.querySelectorAll('.plan-row')[30] as HTMLElement;
 fireEvent.click(within(old).getByRole('button',{expanded:false}));
 fireEvent.click(await within(old).findByRole('button',{name:'Redigera pass'}));
 fireEvent.click(within(old).getByRole('button',{name:'Korrigera set 1'}));
 fireEvent.change(screen.getByLabelText('Hur kändes setet?'),{target:{value:'easy'}});
 fireEvent.click(screen.getByRole('button',{name:'Spara korrigering'}));
 await screen.findByText('Korrigeringen är sparad och planen är uppdaterad.');
 expect(list.querySelectorAll('.plan-row')).toHaveLength(31);
 fireEvent.click(screen.getByRole('button',{name:'Stäng'}));
 expect(within(old).getByRole('button',{name:'Klar med redigeringen'})).toBeDefined();
});
