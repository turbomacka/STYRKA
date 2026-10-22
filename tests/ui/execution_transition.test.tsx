import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { harness, onboard, type Harness } from '../unit/appHarness';
import { previewNext, startSession } from '../../src/application/training';
import { Train } from '../../src/ui/screens/Train';

const mocked = vi.hoisted(() => ({ services: {} as unknown, beforeSave: vi.fn<() => Promise<void>>() }));
vi.mock('../../src/ui/services', async (original) => ({ ...await original<object>(), useServices: () => mocked.services }));
vi.mock('../../src/application/training', async (original) => {
  const actual = await original<typeof import('../../src/application/training')>();
  return { ...actual, configureExercise: async (...args: Parameters<typeof actual.configureExercise>) => { await mocked.beforeSave(); return actual.configureExercise(...args); } };
});
let h: Harness;
afterEach(async () => { cleanup(); vi.restoreAllMocks(); mocked.beforeSave.mockReset(); h?.sync.dispose(); await h?.db.delete(); });

async function openExercise() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  h = harness(); await onboard(h); mocked.services = { ctx: h.ctx, online: true };
  const session = await startSession(h.ctx, await previewNext(h.ctx));
  const instance = (await h.db.sessionExercises.where('sessionId').equals(session.id).toArray()).find(e => e.exerciseId === 'lat_pulldown')!;
  render(<MemoryRouter initialEntries={[`/pass/${session.id}/trana?ovning=${instance.id}`]}><Routes><Route path="/pass/:id/trana" element={<Train />} /></Routes></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Latsdrag' });
  fireEvent.click(screen.getByText('Utförande och sida'));
  return within(screen.getByRole('listitem', { name: 'Arbetsset 1' }));
}

it('blocks editing during an execution change, then saves to the committed side without closing the editor', async () => {
  let release!: () => void;
  mocked.beforeSave.mockImplementation(() => new Promise<void>(r => { release = r; }));
  const row = await openExercise();
  fireEvent.change(screen.getByLabelText('Utförande'), { target: { value: 'sequential' } });
  const weight = row.getByRole('button', { name: /Vikt set 1:/ });
  expect(weight.matches(':disabled')).toBe(true);
  act(() => weight.click());
  expect(row.queryByLabelText('Vikt (kg)')).toBeNull();
  await act(async () => release());
  await waitFor(() => expect(row.getByRole('button', { name: /Vikt set 1:/ }).matches(':disabled')).toBe(false));
  expect(row.getByText('Höger')).toBeTruthy();
  fireEvent.click(row.getByRole('button', { name: /Vikt set 1:/ }));
  fireEvent.change(row.getByLabelText('Vikt (kg)'), { target: { value: '30' } });
  await waitFor(() => expect(row.getByRole('status').textContent).toContain('Planen sparad'));
  expect((row.getByLabelText('Vikt (kg)') as HTMLInputElement).value).toBe('30');
  const set = (await h.db.sets.toArray()).find(s => s.exerciseId === 'lat_pulldown' && s.ordinal === 1)!;
  expect(set.status).toBe('planned');
  expect(set.detail?.plannedSides?.right?.grams).toBe(30000);
  expect(set.detail?.performances).toEqual([]);
});

it('failed execution change preserves the original mode and re-enables editing', async () => {
  mocked.beforeSave.mockRejectedValue(new Error('local write failed'));
  const row = await openExercise();
  fireEvent.change(screen.getByLabelText('Utförande'), { target: { value: 'sequential' } });
  await screen.findByRole('alert');
  await waitFor(() => expect(row.getByRole('button', { name: /Vikt set 1:/ }).matches(':disabled')).toBe(false));
  expect((screen.getByLabelText('Utförande') as HTMLSelectElement).value).toBe('bilateral');
  fireEvent.click(row.getByRole('button', { name: /Vikt set 1:/ }));
  expect(row.getByLabelText('Vikt (kg)')).toBeTruthy();
});
