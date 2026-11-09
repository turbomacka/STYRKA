import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { harness, onboard, type Harness } from '../unit/appHarness';
import { finishSession, logSet, previewNext, startSession } from '../../src/application/training';
import { ReopenWorkout } from '../../src/ui/components/ReopenWorkout';
import { Plan } from '../../src/ui/screens/Plan';
import * as planning from '../../src/application/trainingPlan';

const mocked = vi.hoisted(() => ({ services: {} as unknown }));
vi.mock('../../src/ui/services', () => ({ useServices: () => mocked.services }));
vi.mock('../../src/ui/screens/Today', () => ({ NextWorkout: () => null, SyncLink: () => null }));
let h: Harness;
const historyReads: Promise<unknown>[] = [];
afterEach(async () => {
  cleanup();
  // Navigation can leave a history refresh in flight; finish it before deleting its database.
  await Promise.all(historyReads.splice(0));
  vi.restoreAllMocks(); h?.sync.dispose(); await h?.db.delete();
});
async function setup() {
  h = harness(); await onboard(h); mocked.services = { ctx: h.ctx, online: false };
  const session = await startSession(h.ctx, await previewNext(h.ctx));
  const set = (await h.db.sets.where('sessionId').equals(session.id).toArray()).find(s => s.exerciseId === 'bench_press')!;
  await logSet(h.ctx, set.id, {}); await finishSession(h.ctx, session.id);
  return session;
}
function Destination() { const { id } = useParams(); return <h1>Träna {id}</h1>; }
function routes(element: React.ReactNode) {
  return <MemoryRouter initialEntries={['/?flik=genomforda']}><Routes><Route path="/" element={element}/><Route path="/pass/:id" element={<Destination/>}/></Routes></MemoryRouter>;
}

it('offers reopening from completed history and navigates to the original workout', async () => {
  const session = await setup();
  const getHistory = planning.getWorkoutHistory;
  vi.spyOn(planning, 'getWorkoutHistory').mockImplementation((...args) => {
    const read = getHistory(...args); historyReads.push(read); return read;
  });
  render(routes(<Plan/>));
  fireEvent.click(await screen.findByRole('button', { expanded: false, name: /Pass 1/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Återuppta pass' }));
  await screen.findByRole('heading', { name: `Träna ${session.id}` });
  expect((await h.db.sessions.get(session.id))!.status).toBe('in_progress');
  expect(await h.db.sessions.count()).toBe(1);
});

it('keeps a failed save visible and retries without leaving the page early', async () => {
  const session = await setup();
  vi.spyOn(h.db.outbox, 'add').mockRejectedValueOnce(new Error('storage full'));
  render(routes(<ReopenWorkout sessionId={session.id}/>));
  fireEvent.click(screen.getByRole('button', { name: 'Återuppta pass' }));
  await screen.findByRole('alert');
  expect((await h.db.sessions.get(session.id))!.status).toBe('partial');
  expect(screen.queryByRole('heading')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Återuppta pass' }));
  await screen.findByRole('heading', { name: `Träna ${session.id}` });
});

it('explains another active workout and offers to navigate there', async () => {
  const session = await setup(), other = await startSession(h.ctx, await previewNext(h.ctx));
  render(routes(<ReopenWorkout sessionId={session.id}/>));
  const go = await screen.findByRole('button', { name: 'Visa pågående pass' });
  expect((screen.getByRole('button', { name: 'Återuppta pass' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(go); await screen.findByRole('heading', { name: `Träna ${other.id}` });
  expect((await h.db.sessions.get(session.id))!.status).toBe('partial');
});
