import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const fixtures = vi.hoisted(() => ({
  session: { user: { id: 'review-synthetic-user', email: 'review@example.test' } },
  online: true,
  syncStatus: { state: 'idle', pullState: 'loading' },
  refresh: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/server/supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: () => ({ auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    getSession: () => Promise.resolve({ data: { session: fixtures.session } }),
  } }),
}));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => null }));
vi.mock('../../src/ui/services', () => ({
  ServicesProvider: ({ children }: { children: ReactNode }) => children,
  useServices: () => ({ ctx: { userId: 'review-synthetic-user' }, online: fixtures.online, syncStatus: fixtures.syncStatus, sync: { refresh: fixtures.refresh } }),
}));
vi.mock('../../src/ui/UpdatePrompt', () => ({ UpdatePrompt: () => null }));
vi.mock('../../src/ui/screens/Onboarding', () => ({ Onboarding: () => <h1>REVIEW NEW USER INTRO</h1> }));
import { App } from '../../src/ui/App';

afterEach(() => { cleanup(); vi.useRealTimers(); fixtures.online = true; fixtures.syncStatus = { state: 'idle', pullState: 'loading' }; vi.clearAllMocks(); });
it('never treats an unfinished first data fetch as proof that an existing user needs onboarding', async () => {
  vi.useFakeTimers();
  render(<App />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Hämtar dina uppgifter…')).toBeTruthy();
  await act(async () => { vi.advanceTimersByTime(30_000); });
  expect(screen.queryByText('REVIEW NEW USER INTRO')).toBeNull();
});

it('shows a retry after server failure without offering new-user onboarding', async () => {
  fixtures.syncStatus = { state: 'error', pullState: 'error' };
  render(<App />);
  await screen.findByRole('heading', { name: 'Vi kunde inte hämta dina uppgifter' });
  expect(screen.queryByText('REVIEW NEW USER INTRO')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
  expect(fixtures.refresh).toHaveBeenCalledTimes(1);
});

it('requires network on an unhydrated device instead of creating a replacement profile offline', async () => {
  fixtures.online = false;
  render(<App />);
  await screen.findByText('Anslut till internet för att hämta ditt konto till den här enheten.');
  expect(screen.queryByText('REVIEW NEW USER INTRO')).toBeNull();
  expect((screen.getByRole('button', { name: 'Försök igen' }) as HTMLButtonElement).disabled).toBe(true);
});
