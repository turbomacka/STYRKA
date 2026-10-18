import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EffortFeedback } from '../../src/ui/components/EffortFeedback';
import { ProgressChart } from '../../src/ui/components/ProgressChart';

it('five choices are unselected and optional; failed feedback does not claim the set was lost', async () => {
  const save=vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  render(<EffortFeedback value={null} label="Set 1" onRate={save}/>);
  expect(screen.getAllByRole('button').filter((b)=>b.getAttribute('aria-pressed')==='true')).toHaveLength(0);
  expect(screen.getAllByRole('button').filter((b)=>b.hasAttribute('aria-pressed'))).toHaveLength(5);
  fireEvent.click(screen.getByRole('button',{name:/Maxansträngning/}));
  expect((await screen.findByRole('alert')).textContent).toContain('Setet är redan sparat');
  fireEvent.click(screen.getByRole('button',{name:/Maxansträngning/}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button',{name:'Senare'}));
  expect(screen.queryByRole('button',{name:'Tungt'})).toBeNull();
  expect(save).toHaveBeenCalledTimes(2);
});

it('pending save prevents double activation and rating can be cleared', async () => {
  let resolve!:()=>void; const save=vi.fn(()=>new Promise<void>((r)=>{resolve=r;}));
  const {rerender}=render(<EffortFeedback value={null} label="Set 2 · Vänster" onRate={save}/>);
  const button=screen.getByRole('button',{name:'Tungt'});
  act(()=>{button.click();button.click();}); expect(save).toHaveBeenCalledOnce();
  expect(screen.getByRole('group').getAttribute('aria-busy')).toBe('true');
  await act(async()=>resolve());
  rerender(<EffortFeedback value="hard" label="Set 2 · Vänster" onRate={save}/>);
  expect(screen.getByText('Känsla: Tungt')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Ändra känsla'}));
  fireEvent.click(screen.getByRole('button',{name:'Ändra känsla'}));
  fireEvent.click(screen.getByRole('button',{name:'Ta bort svar'}));
  expect(save).toHaveBeenLastCalledWith(null); await act(async()=>resolve());
});

it('an input reference and the first workout estimate are never joined into a falling trend line', () => {
  const {container}=render(<ProgressChart title="Knäböj" points={[
    {at:'2026-10-01T10:00:00Z',kg:100,source:'estimated',origin:'input',detail:'1RM-uppgift'},
    {at:'2026-10-02T10:00:00Z',kg:93.3,source:'estimated',detail:'träningsset'},
  ]}/>);
  expect(container.querySelector('.chart path[stroke-dasharray]')).toBeNull();
  fireEvent.change(screen.getByLabelText('Välj datapunkt'),{target:{value:'0'}});
  expect(screen.getByRole('status').textContent).toContain('Angiven styrkeuppgift');
});
