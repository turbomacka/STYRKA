import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SetRow, type SetRowProps } from '../../src/ui/components/SetRow';
import { Expandable, Sheet, ToastWithUndo } from '../../src/ui/components/common';
import { ProgressChart } from '../../src/ui/components/ProgressChart';
import { confirmSetHaptic, setHaptics } from '../../src/ui/design';
import type { LocalSet } from '../../src/storage/db';

const set: LocalSet = { id: 'des-set', sessionId: 'x', sessionExerciseId: 'e', exerciseId: 'squat', ordinal: 1, kind: 'work', status: 'planned', targetGrams: 80000, targetReps: 5, targetSeconds: null, actualGrams: null, actualReps: null, actualSeconds: null, rir: null, technique: null, occurredAt: null, deleted: false, serverRevision: null, createQueued: false, manualOverride: false, syncState: 'local', updatedAt: '' };
const props = (onLog: SetRowProps['onLog']): SetRowProps => ({ set, displayNo: 1, loadKind: 'external_kg', stepGrams: 2500, online: false, showRir: false, failed: false, onLog, onEdit: vi.fn(), onUndo: vi.fn() });
afterEach(() => { setHaptics(false); vi.restoreAllMocks(); });

it('confirmation lifetime is not extended by unrelated rerenders', () => {
  vi.useFakeTimers();
  try {
    const done = vi.fn();
    const { rerender } = render(<ToastWithUndo message="Sparat" onDone={() => done()} ms={6000} />);
    act(() => vi.advanceTimersByTime(5000));
    rerender(<ToastWithUndo message="Sparat" onDone={() => done()} ms={6000} />);
    act(() => vi.advanceTimersByTime(1000)); expect(done).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});

it('DES10–13: delayed local commit, synchronous double activation guard and no early success', async () => {
  let resolve!: () => void;
  const onLog = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
  const { container } = render(<ul><SetRow {...props(onLog)} /></ul>);
  const log = screen.getByRole('button', { name: 'Klart, set 1' });
  act(() => { log.click(); log.click(); });
  expect(onLog).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-feedback="saved"]')).toBeNull();
  expect(log.getAttribute('aria-busy')).toBe('true');
  await act(async () => resolve());
  expect(container.querySelector('[data-feedback="saved"]')).not.toBeNull();
  // Even before the database observer has delivered the done prop.
  fireEvent.click(log); expect(onLog).toHaveBeenCalledTimes(1);
});

it('DES12: failed commit has no success or haptics; retry works', async () => {
  const vibrate = vi.fn(); Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate }); setHaptics(true);
  const onLog = vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  const { container } = render(<ul><SetRow {...props(onLog)} /></ul>);
  fireEvent.click(screen.getByRole('button', { name: 'Klart, set 1' }));
  await screen.findByRole('alert');
  expect(container.querySelector('[data-feedback="saved"]')).toBeNull(); expect(vibrate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Klart, set 1' }));
  await waitFor(() => expect(container.querySelector('[data-feedback="saved"]')).not.toBeNull());
  expect(onLog).toHaveBeenCalledTimes(2); expect(vibrate).toHaveBeenCalledOnce();
});

it('DES18–21: haptics opt-in, missing API, false return and exception are harmless', () => {
  const vibrate = vi.fn(() => false); Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  confirmSetHaptic(); expect(vibrate).not.toHaveBeenCalled();
  setHaptics(true); confirmSetHaptic(); expect(vibrate).toHaveBeenCalledWith(8);
  vibrate.mockImplementation(() => { throw new Error('unsupported'); }); expect(confirmSetHaptic).not.toThrow();
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined }); expect(confirmSetHaptic).not.toThrow();
});

it('DES15: collapse preserves the mounted input and its unsaved value', () => {
  const { rerender } = render(<Expandable open id="panel"><input aria-label="Anteckning" defaultValue="" /></Expandable>);
  const input = screen.getByLabelText('Anteckning'); fireEvent.change(input, { target: { value: 'Mitt utkast' } });
  rerender(<Expandable open={false} id="panel"><input aria-label="Anteckning" defaultValue="" /></Expandable>);
  expect(input.closest('[inert]')).not.toBeNull();
  rerender(<Expandable open id="panel"><input aria-label="Anteckning" defaultValue="" /></Expandable>);
  expect(screen.getByLabelText('Anteckning')).toBe(input); expect((input as HTMLInputElement).value).toBe('Mitt utkast');
});

it('DES26: dialog rerender does not steal focus and Escape uses current callback', () => {
  const first = vi.fn(), next = vi.fn();
  const { rerender } = render(<Sheet title="Test" onClose={first}><input aria-label="Egen text" /></Sheet>);
  const input = screen.getByLabelText('Egen text'); input.focus();
  rerender(<Sheet title="Test" onClose={next}><input aria-label="Egen text" /></Sheet>);
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(document, { key: 'Escape' }); expect(next).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled();
});

it('DES16–17: point selection leaves values, line geometry and scale unchanged', () => {
  const points = Object.freeze([Object.freeze({ at: '2026-10-01T10:00:00Z', kg: 80, source: 'performance' as const, detail: '5 reps' }), Object.freeze({ at: '2026-10-08T10:00:00Z', kg: 82.5, source: 'performance' as const, detail: '5 reps' })]);
  const { container } = render(<ProgressChart title="Knäböj" points={[...points]} />);
  const svg = container.querySelector('.chart')!.innerHTML;
  fireEvent.change(screen.getByLabelText('Välj datapunkt'), { target: { value: '1' } });
  expect(screen.getByRole('status').textContent).toContain('82,5 kg');
  expect(screen.getByRole('status').textContent).toContain('2026-10-08');
  expect(container.querySelector('.chart')!.innerHTML).toBe(svg);
  expect(points[1].kg).toBe(82.5);
});
