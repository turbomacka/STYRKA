import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { acceptCatchUp, catchUpOverview, dismissCatchUp } from '../../application/skippedExercises';
import { exercise } from '../../domain/catalog';
import type { PlanSnapshot } from '../../domain/model';
import { useServices } from '../services';
import { prescriptionText } from './widgets';

export function CatchUpExplanation({ change }: { change: NonNullable<PlanSnapshot['catchUp']> }) {
  return <p>{exercise(change.exerciseId).nameSv} prioriteras eftersom {change.reason === 'time' ? 'du inte hann med övningen' : 'utrustningen var upptagen'}. {exercise(change.replacesExerciseId).nameSv} utgår ur det här passet. Följande pass fortsätter enligt grundplanen.</p>;
}

export function CatchUpCard() {
  const { ctx } = useServices();
  const view = useLiveQuery(() => catchUpOverview(ctx), [ctx]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  if (!view || (!view.proposal && !view.accepted && !view.message)) return message ? <p role="status">{message}</p> : null;
  const p = view.proposal;
  const work = p?.after.exercises.find((e) => e.exerciseId === p.exerciseId);
  async function act(fn: () => Promise<void>, success: string) {
    setBusy(true); setError(false);
    try { await fn(); setMessage(success); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <section className="card stack no-print" aria-label="Anpassning av nästa pass">
    <h2>{p ? 'Ett förslag efter förra passet' : view.accepted ? 'Ditt val för nästa pass' : 'Efter förra passet'}</h2>
    {p?.after.catchUp && <CatchUpExplanation change={p.after.catchUp} />}
    {view.applied && <CatchUpExplanation change={view.applied} />}
    {work && <p><strong>{exercise(work.exerciseId).nameSv}:</strong> {prescriptionText(work)}. Hela passet beräknas ta cirka {Math.round(p!.after.estimatedMinutes)} minuter.</p>}
    {view.message && <p>{view.message}</p>}
    {p && <>
      <p className="small muted">Planen ändras när du godkänner. Huvudövningen och övriga övningars antal set behålls.</p>
      <button type="button" className="btn primary block" disabled={busy} onClick={() => void act(() => acceptCatchUp(ctx, p), 'Ändringen är sparad.')}>Använd förslaget nästa pass</button>
      <button type="button" className="btn ghost block" disabled={busy} onClick={() => void act(() => dismissCatchUp(ctx, p.event), 'Grundplanen behålls.')}>Behåll grundplanen</button>
    </>}
    {view.accepted && <button type="button" className="btn ghost block" disabled={busy} onClick={() => void act(() => dismissCatchUp(ctx, view.accepted!), 'Grundplanen återställd.')}>Ångra ändringen</button>}
    {error && <p role="alert">Underlaget kan ha ändrats eller valet kunde inte sparas. Kontrollera förslaget och försök igen.</p>}
  </section>;
}
