import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { trainingPreferences } from '../../src/domain/trainingFlow';
import { TrainingPreferencesControl } from '../../src/ui/components/TrainingFlow';

const state = vi.hoisted(() => ({ profile: undefined as unknown, patch: vi.fn(async () => undefined) }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => state.profile }));
vi.mock('../../src/ui/services', () => ({ useServices: () => ({ ctx: { userId: 'test' } }) }));
vi.mock('../../src/application/profile', () => ({ patchProfile: state.patch }));

it('waits for stored preferences before offering changes and preserves unrelated settings', async () => {
  state.profile = undefined;
  const view = render(<TrainingPreferencesControl />);
  expect(screen.queryByLabelText('Visa uppvärmningsset')).toBeNull();
  expect(screen.getByText('Laddar inställningarna…').getAttribute('aria-busy')).toBe('true');
  const prefs = trainingPreferences({ showWarmupSets: true, adaptiveRestEnabled: false, defaultStartingSide: 'left' });
  state.profile = { trainingPreferences: prefs };
  view.rerender(<TrainingPreferencesControl />);
  expect((screen.getByLabelText('Visa uppvärmningsset') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByLabelText('Visa uppvärmningsset'));
  await waitFor(() => expect(state.patch).toHaveBeenCalledWith(expect.anything(), { trainingPreferences: { ...prefs, showWarmupSets: false } }));
  await waitFor(() => expect(screen.getByText('Inställningen är sparad.')).toBeTruthy());
});
