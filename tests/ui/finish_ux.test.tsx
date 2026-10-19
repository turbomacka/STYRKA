import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { harness, onboard, type Harness } from '../unit/appHarness';
import { previewNext, recordPerformance, startSession } from '../../src/application/training';
import { Finish } from '../../src/ui/screens/Finish';

const mocked=vi.hoisted(()=>({services:{} as unknown,refresh:vi.fn()}));
vi.mock('../../src/ui/services',()=>({useServices:()=>mocked.services}));
vi.mock('../../src/application/trainingPlan',async(importOriginal)=>({...await importOriginal<object>(),refreshFuturePlan:mocked.refresh}));
let h:Harness;
afterEach(async()=>{cleanup();vi.clearAllMocks();h?.sync.dispose();await h?.db.delete();});

it('H: planning failure after finish preserves committed training and retries only planning',async()=>{
  h=harness();await onboard(h);
  mocked.services={ctx:h.ctx,online:true};
  mocked.refresh.mockRejectedValueOnce(new Error('planner unavailable')).mockResolvedValue({});
  const session=await startSession(h.ctx,await previewNext(h.ctx));
  const set=(await h.db.sets.where('sessionId').equals(session.id).toArray())[0];
  await recordPerformance(h.ctx,set.id,'both',{});
  render(<MemoryRouter initialEntries={[`/pass/${session.id}/avsluta`]}><Routes><Route path="/pass/:id/avsluta" element={<Finish/>}/><Route path="/" element={<h1>Min träningsplan</h1>}/></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Avsluta och spara'}));
  await screen.findByText('Träningen är sparad. Nästa pass kunde inte räknas fram just nu.');
  const saved=await h.db.sessions.get(session.id);expect(saved!.status).toBe('partial');
  expect((await h.db.sets.get(set.id))!.status).toBe('done');
  const revision=saved!.revision;
  fireEvent.click(screen.getByRole('button',{name:'Försök beräkna igen'}));
  await screen.findByRole('heading',{name:'Min träningsplan'});
  await waitFor(()=>expect(mocked.refresh).toHaveBeenCalledTimes(2));
  expect((await h.db.sessions.get(session.id))!.revision).toBe(revision);
});
