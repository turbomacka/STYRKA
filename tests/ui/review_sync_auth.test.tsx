import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [] }));
vi.mock('../../src/ui/services', () => ({
  useServices: () => ({
    ctx: {}, online: true,
    sync: { syncNow: vi.fn() },
    syncStatus: { state: 'auth_required', pending: 1, conflicts: 0, failed: 0, lastSyncedAt: null, nextRetryAt: null },
  }),
}));
import { SyncLink } from '../../src/ui/screens/Today';
import { SyncScreen } from '../../src/ui/screens/Account';
afterEach(cleanup);
it('explains expired authentication and offers login instead of showing an indefinitely syncing queue', () => {
  render(<MemoryRouter><SyncLink /><SyncScreen /></MemoryRouter>);
  expect(screen.queryByRole('button', { name: /logga in/i }) ?? screen.queryByRole('link', { name: /logga in/i })).not.toBeNull();
});
