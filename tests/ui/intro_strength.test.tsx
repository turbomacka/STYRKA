import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { IntroStrengthEntry } from '../../src/ui/components/IntroStrengthEntry';
import { LoadSourceChoice } from '../../src/ui/components/LoadSourceChoice';
import type { IntroStrengthDraft } from '../../src/application/onboardingDraft';

function Entry() {
  const [draft, setDraft] = useState<IntroStrengthDraft>({ kind: 'submax', kg: '', reps: '', rir: '', testedAt: '', measured: false });
  return <IntroStrengthEntry draft={draft} onChange={setDraft} today="2026-10-17" attempted={false} />;
}
it('does not accuse an untouched form; preserves comma decimals and unknown RIR', () => {
  render(<Entry />);
  expect(screen.queryByText('Ange 1–8 repetitioner.')).toBeNull();
  fireEvent.change(screen.getByLabelText('Vikt (kg)'), { target: { value: '82,5' } });
  fireEvent.blur(screen.getByLabelText('Vikt (kg)'));
  expect(screen.queryByText('Ange 1–8 repetitioner.')).toBeNull();
  fireEvent.change(screen.getByLabelText('Repetitioner (1–8)'), { target: { value: '5' } });
  expect(screen.getByRole('status').textContent).toBe('✓ Redo att fortsätta');
  expect((screen.getByLabelText('Vikt (kg)') as HTMLInputElement).value).toBe('82,5');
  expect((screen.getByRole('combobox', { hidden: true }) as HTMLSelectElement).value).toBe('');
});
it('explains invalid input after leaving the field, without changing the supplied value', () => {
  render(<Entry />);
  const field = screen.getByLabelText('Vikt (kg)');
  fireEvent.change(field, { target: { value: '501' } }); fireEvent.blur(field);
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect((field as HTMLInputElement).value).toBe('501');
  expect(screen.getByText('Ange en vikt över 0 och högst 500 kg.')).toBeTruthy();
});
it('shows an explicit accessible source choice with the history option selected', () => {
  render(<LoadSourceChoice value="performed_sets" onChange={() => undefined} />);
  expect((screen.getByRole('radio', { name: /Utgå från mina träningspass/ }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('radio', { name: /Ange styrkeuppgifter nu/ }) as HTMLInputElement).checked).toBe(false);
});
