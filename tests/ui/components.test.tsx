/** Komponentkontrakt (10 §1): setrad, vikt-/repsinmatning, statuschip, graf – inklusive axe i jsdom. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { SetRow } from '../../src/ui/components/SetRow';
import { SaveStateChip } from '../../src/ui/components/common';
import { ProgressChart } from '../../src/ui/components/ProgressChart';
import type { LocalSet } from '../../src/storage/db';

const baseSet: LocalSet = {
  id: 's1', sessionId: 'x', sessionExerciseId: 'e', exerciseId: 'squat', ordinal: 2, kind: 'work', status: 'planned',
  targetGrams: 80_000, targetReps: 5, targetSeconds: null, actualGrams: null, actualReps: null, actualSeconds: null, rir: null,
  technique: null, occurredAt: null, deleted: false, serverRevision: null, createQueued: false, manualOverride: false, syncState: 'local', updatedAt: '',
};

function row(over: Partial<LocalSet> = {}, props: Partial<Parameters<typeof SetRow>[0]> = {}) {
  const onLog = vi.fn(async () => undefined);
  render(<ul><SetRow set={{ ...baseSet, ...over }} displayNo={2} loadKind="external_kg" stepGrams={2500} online showRir failed={false} onLog={onLog} onEdit={vi.fn(async () => undefined)} onUndo={vi.fn(async () => undefined)} {...props} /></ul>);
  return { onLog };
}

describe('SetRow', () => {
  it('visar Set 2 | 80 kg | 5 reps | Klart och loggar förifyllt set med ett tryck', async () => {
    const { onLog } = row();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Vikt set 2: 80 kilo/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrera set 2' }));
    await waitFor(() => expect(onLog).toHaveBeenCalledWith({ actualGrams: 80_000, actualReps: 5, technique: 'controlled' }));
  });

  it('accepterar 102,5 och 102.5 som samma värde; 102,,5 ger inline-fel utan att stänga fältet', async () => {
    const onPlan=vi.fn(async()=>undefined);
    const { onLog } = row({}, {onPlan});
    fireEvent.click(screen.getByRole('button', { name: /Vikt set 2/ }));
    const input = screen.getByLabelText('Vikt (kg)') as HTMLInputElement;
    expect(input.inputMode).toBe('decimal');
    fireEvent.change(input, { target: { value: '102,,5' } });
    expect(screen.getByRole('alert').textContent).toMatch(/82,5/);
    expect(screen.getByLabelText('Vikt (kg)')).toBeTruthy();
    fireEvent.change(input, { target: { value: '102.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }));
    await waitFor(() => expect(onPlan).toHaveBeenLastCalledWith(expect.objectContaining({ actualGrams: 102_500 })));
    expect(onLog).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Vikt set 2/ }));
  });

  it('kommaknapp och ± steg', () => {
    row();
    fireEvent.click(screen.getByRole('button', { name: /Vikt set 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Öka 2,5 kilo' }));
    expect((screen.getByLabelText('Vikt (kg)') as HTMLInputElement).value).toBe('82,5');
  });

  it('kalibrering: utan vikt sparas inget, användaren uppmanas ange vikt', async () => {
    const { onLog } = row({ targetGrams: null });
    expect(screen.getByRole('button', { name: /vikt ej vald/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrera set 2' }));
    await waitFor(() => expect(screen.getByText('Välj vikten du använde.')).toBeTruthy());
    expect(onLog).not.toHaveBeenCalled();
  });

  it('utfört set visar bock och kan ångras; status med text, inte bara färg', () => {
    row({ status: 'done', actualGrams: 80_000, actualReps: 5, createQueued: true, syncState: 'queued' }, { online: false });
    expect(screen.getByRole('button', { name: 'Set 2 utfört. Ändra eller ångra' })).toBeTruthy();
    expect(screen.getByText('Utfört')).toBeTruthy();
  });

  it('misslyckad lokal sparning visas tydligt', () => {
    render(<SaveStateChip state="failed_local" online />);
    expect(screen.getByText('Kunde inte sparas')).toBeTruthy();
  });

  it('failed autosave retains the draft and retries without recording a set', async () => {
    const onPlan=vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const {onLog}=row({}, {onPlan});
    fireEvent.click(screen.getByRole('button',{name:/Vikt set 2/}));
    fireEvent.change(screen.getByLabelText('Vikt (kg)'),{target:{value:'82,5'}});
    fireEvent.click(screen.getByRole('button',{name:'Stäng'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Försök igen'})).toBeTruthy());
    expect((screen.getByLabelText('Vikt (kg)') as HTMLInputElement).value).toBe('82,5');
    expect(screen.queryByText(/✓ Planen sparad/)).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Försök igen'}));
    await waitFor(()=>expect(screen.getByText(/✓ Planen sparad/)).toBeTruthy());
    expect(onPlan).toHaveBeenCalledTimes(2);expect(onLog).not.toHaveBeenCalled();
  });

  it('independent stack editing uses the same autosave and never records completion',async()=>{
    const onPlan=vi.fn(async()=>undefined);const {onLog}=row({}, {onPlan,secondLoad:20});
    fireEvent.click(screen.getByRole('button',{name:/Andra viktstapeln:/}));
    fireEvent.change(screen.getByLabelText('Andra viktstapeln (kg)'),{target:{value:'22,5'}});
    fireEvent.click(screen.getByRole('button',{name:'Stäng'}));
    await waitFor(()=>expect(onPlan).toHaveBeenCalledWith(expect.objectContaining({actualGrams:80000,secondLoadValue:22.5})));
    expect(onLog).not.toHaveBeenCalled();
  });

  it('axe: inga allvarliga brott i setraden', async () => {
    const { container } = render(<ul><SetRow set={baseSet} displayNo={1} loadKind="assistance_kg" stepGrams={5000} online showRir={false} failed={false} onLog={vi.fn()} onEdit={vi.fn()} onUndo={vi.fn()} /></ul>);
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});

describe('ProgressChart', () => {
  it('skiljer faktisk, uppskattad och uppmätt och har tabellalternativ', () => {
    render(<ProgressChart title="Knäböj" points={[
      { at: '2026-09-01T10:00:00Z', kg: 80, source: 'performance', detail: 'bästa arbetsset' },
      { at: '2026-09-01T10:00:00Z', kg: 96, source: 'estimated', detail: 'x' },
      { at: '2026-09-08T10:00:00Z', kg: 100, source: 'measured', detail: '1 rep' },
    ]} />);
    expect(screen.getByText('Faktisk prestation')).toBeTruthy();
    expect(screen.getByText('Uppskattad maxstyrka (osäker)')).toBeTruthy();
    expect(screen.getByText('Uppmätt')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});

it('blocks value editing while undo is committing',async()=> {
 let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 row({status:'done',actualGrams:80000,actualReps:5},{onUndo:()=>pending});
 fireEvent.click(screen.getByRole('button',{name:'Ångra registrering'}));
 expect((screen.getByRole('button',{name:/Vikt set 2/}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:/Repetitioner set 2/}) as HTMLButtonElement).disabled).toBe(true);
 release();
 await waitFor(()=>expect((screen.getByRole('button',{name:/Vikt set 2/}) as HTMLButtonElement).disabled).toBe(false));
});
