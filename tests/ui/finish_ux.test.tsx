import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { harness, onboard, type Harness } from '../unit/appHarness';
import { configureExercise, finishSession, previewNext, recordPerformance, startSession } from '../../src/application/training';
import { Finish } from '../../src/ui/screens/Finish';
import { mixedWorkout } from '../fixtures/mixedWorkout';

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
  expect(document.querySelector('.finish-feedback')?.textContent).toMatch(/utan.*arbetsset|inga.*arbetsset|inga arbetsset|inget genomfört arbetsset/i);
});

it('shows every mixed-workout exercise once and opens observed work and future proposals without duplicate lists',async()=>{
  h=harness();mocked.services={ctx:h.ctx,online:false};
  const {session,feedback}=await mixedWorkout(h);
  render(<MemoryRouter initialEntries={[`/pass/${session.id}/avsluta`]}><Routes><Route path="/pass/:id/avsluta" element={<Finish/>}/></Routes></MemoryRouter>);
  await screen.findByText('Kommande rekommendationer är klara.');
  const list=screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  const user=userEvent.setup();
  for(const e of feedback.exercises!){
    const heading=within(list).getByRole('heading',{name:new RegExp(e.name)});
    const row=heading.closest('li')!;
    expect(within(row).getByText(e.headline)).toBeTruthy();
    const detail=row.querySelector('details')!;
    expect(detail.open).toBe(false);
    await user.click(within(row).getByLabelText(`Detaljer och nästa förslag för ${e.name}`));
    expect(detail.open).toBe(true);
    const observation=e.variants[0].observations[0];
    expect(within(row).getByText(`Dagens arbete: ${observation.work}`)).toBeTruthy();
    expect(within(row).getAllByText(e.variants[0].recommendation!.recommendation!)).toHaveLength(1);
    expect(within(row).getAllByText(e.headline)).toHaveLength(1);
  }
  expect(screen.queryByRole('heading',{name:'Så påverkas kommande träning'})).toBeNull();
  expect(mocked.refresh).not.toHaveBeenCalled();
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
  expect(screen.getByRole('heading',{name:'Latsdrag'})).toBeTruthy();
  expect(screen.getAllByText(/Nästa rekommendation har ännu inte kunnat beräknas/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'Försök beräkna igen'}));
  await screen.findByText('Kommande rekommendationer är klara.');
  fireEvent.click(screen.getByRole('button',{name:'Till planen'}));
  await screen.findByRole('heading',{name:'Min träningsplan'});
  await waitFor(()=>expect(mocked.refresh).toHaveBeenCalledTimes(2));
  expect((await h.db.sessions.get(session.id))!.revision).toBe(revision);
  expect((await h.db.sets.get(set.id))!.detail!.performances).toEqual(performances);
});
