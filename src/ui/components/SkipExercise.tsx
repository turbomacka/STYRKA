import { useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { skipExercise } from '../../application/skippedExercises';
import { latestSkipEvents } from '../../application/skipState';
import { activeHealthConsent } from '../../application/plannerInput';
import type { SkipReason } from '../../storage/db';
import { useServices } from '../services';

export const SKIP_REASON_LABEL: Record<SkipReason, string> = { time: 'Hann inte', equipment: 'Utrustningen upptagen', discomfort: 'Besvär', other: 'Ingen angiven orsak' };

export function SkipExercise({ exerciseId, name, onSkipped, prompt = false }: { exerciseId: string; name: string; onSkipped?: (reason: SkipReason) => void; prompt?: boolean }) {
  const { ctx } = useServices();
  const [open, setOpen] = useState(prompt);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const id = useId();
  const last = useLiveQuery(async () => latestSkipEvents(await ctx.db.skipEvents.where('sessionExerciseId').equals(exerciseId).toArray())[0] ?? null, [ctx, exerciseId]);
  const consent = useLiveQuery(() => activeHealthConsent(ctx.db, ctx.userId), [ctx]);
  async function choose(reason: SkipReason) {
    setBusy(true); setError(false);
    try { await skipExercise(ctx, exerciseId, reason); setOpen(false); setEditing(false); onSkipped?.(reason); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <div className="stack">
    {last && <p className="small muted" role="status">{name} – överhoppat: {SKIP_REASON_LABEL[last.reason].toLocaleLowerCase('sv-SE')}.</p>}
    {last?.reason === 'discomfort' && <p className="small">Övningen föreslås inte för att tas igen. Du kan rapportera besvären när du avslutar passet.</p>}
    {last && !editing && <button type="button" className="btn ghost" onClick={() => { setOpen(true); setEditing(true); }}>Ändra orsak</button>}
    {open && (!last || editing) ? <div role="group" aria-labelledby={id} className="stack">
      <p id={id}><strong>{name}</strong> – varför hoppar du över? (Valfritt)</p>
      <div className="stack">
        <button type="button" className="btn block" disabled={busy} onClick={() => void choose('time')}>Hann inte</button>
        <button type="button" className="btn block" disabled={busy} onClick={() => void choose('equipment')}>Utrustningen upptagen</button>
        <button type="button" className="btn block" disabled={busy || !consent} onClick={() => void choose('discomfort')}>Besvär</button>
        {!consent && <p className="small muted">För att spara besvär behövs samtycke under <Link to="/profil/begransningar">Profil → Begränsningar</Link>. Du kan hoppa över utan att ange orsak.</p>}
        <button type="button" className="btn ghost block" disabled={busy} onClick={() => void choose('other')}>Hoppa över utan orsak</button>
        {!prompt && <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>Avbryt</button>}
      </div>
    </div> : !last && <button type="button" className="btn ghost block" onClick={() => setOpen(true)}>Hoppa över övningen</button>}
    {error && <p role="alert">Kunde inte spara valet. Försök igen.</p>}
  </div>;
}
