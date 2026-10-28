import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { harness, onboard, type Harness } from '../unit/appHarness';
import { configureExercise, finishSession, previewNext, recordPerformance, startSession } from '../../src/application/training';
import { Finish } from '../../src/ui/screens/Finish';

const mocked=vi.hoisted(()=>({services:{} as unknown,refresh:vi.fn()}));
vi.mock('../../src/ui/services',()=>({useServices:()=>mocked.services}));
vi.mock('../../src/application/trainingPlan',async(importOriginal)=>({...await importOriginal<object>(),refreshFuturePlan:mocked.refresh}));
let h:Harness;
afterEach(async()=>{cleanup();vi.clearAllMocks();h?.sync.dispose();await h?.db.delete();});

it('reopening a completed session replaces stale cached praise with current versioned feedback',async()=>{
  h=harness();await onboard(h);mocked.services={ctx:h.ctx,online:true};
  const session=await startSession(h.ctx,await previewNext(h.ctx));await finishSession(h.ctx,session.id);
  await h.db.meta.put({key:'workout-feedback:'+session.id,value:{sessionId:session.id,text:'Felaktigt gammalt rekord!',category:'progress',createdAt:h.clock.now()}});
  render(<MemoryRouter initialEntries={[`/pass/${session.id}/avsluta`]}><Routes><Route path="/pass/:id/avsluta" element={<Finish/>}/></Routes></MemoryRouter>);
  await screen.findByRole('heading',{name:'Passet är sparat'});
  expect(screen.queryByText('Felaktigt gammalt rekord!')).toBeNull();
  expect(document.querySelector('.finish-feedback')?.textContent).toMatch(/utan.*arbetsset|Inga.*arbetsset/);
});

it.each(['bilateral', 'sequential'] as const)('H: planning failure after %s training preserves committed performances and retries only planning',async(executionMode)=>{
  h=harness();await onboard(h);
  mocked.services={ctx:h.ctx,online:true};
  mocked.refresh.mockRejectedValueOnce(new Error('planner unavailable')).mockResolvedValue({});
  const session=await startSession(h.ctx,await previewNext(h.ctx));
  const instance=(await h.db.sessionExercises.where('sessionId').equals(session.id).toArray()).find(e=>e.exerciseId==='lat_pulldown')!;
  await configureExercise(h.ctx,instance.id,{...instance.configuration!,executionMode});
  const set=(await h.db.sets.where('sessionId').equals(session.id).toArray()).find(s=>s.sessionExerciseId===instance.id&&s.ordinal===1)!;
  const sides=executionMode==='bilateral'?['both'] as const:['right','left'] as const;
  for(const side of sides) await recordPerformance(h.ctx,set.id,side,{actualGrams:30000,actualReps:10});
  const performances=(await h.db.sets.get(set.id))!.detail!.performances;
  expect(performances.map(p=>p.side)).toEqual([...sides]);
  render(<MemoryRouter initialEntries={[`/pass/${session.id}/avsluta`]}><Routes><Route path="/pass/:id/avsluta" element={<Finish/>}/><Route path="/" element={<h1>Min träningsplan</h1>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Avsluta och spara'}));
  await screen.findByText('Träningen är sparad. Nästa pass kunde inte räknas fram just nu.');
  const saved=await h.db.sessions.get(session.id);expect(saved!.status).toBe('partial');
  expect((await h.db.sets.get(set.id))!.status).toBe('done');
  const revision=saved!.revision;
  fireEvent.click(screen.getByRole('button',{name:'Försök beräkna igen'}));
  await screen.findByRole('heading',{name:'Så påverkas kommande träning'});
  fireEvent.click(screen.getByRole('button',{name:'Till planen'}));
  await screen.findByRole('heading',{name:'Min träningsplan'});
  await waitFor(()=>expect(mocked.refresh).toHaveBeenCalledTimes(2));
  expect((await h.db.sessions.get(session.id))!.revision).toBe(revision);
  expect((await h.db.sets.get(set.id))!.detail!.performances).toEqual(performances);
});
