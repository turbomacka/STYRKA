import { useId, useState } from 'react';
import { deleteWorkout } from '../../application/deleteWorkout';
import { useServices } from '../services';

export function DeleteWorkout({ sessionId }: { sessionId: string }) {
  const { ctx } = useServices();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const id = useId();
  async function remove() {
    setBusy(true);
    setError(false);
    try { await deleteWorkout(ctx, sessionId); }
    catch { setError(true); setBusy(false); }
  }
  return <div className="stack no-print">
    {!confirm ? <button type="button" className="btn ghost" onClick={() => setConfirm(true)}>Ta bort pass</button> :
      <div className="card stack" role="group" aria-labelledby={id}>
        <strong id={id}>Ta bort det här passet?</strong>
        <p>Passet, dess set och anteckningar tas bort från historik och statistik. Det går inte att ångra.</p>
        <p className="small muted">Rapporterade besvär behålls. Är du offline synkas raderingen när du är uppkopplad igen.</p>
        <div className="row">
          <button type="button" className="btn grow" disabled={busy} onClick={() => setConfirm(false)}>Avbryt</button>
          <button type="button" className="btn danger grow" disabled={busy} onClick={() => void remove()}>{busy ? 'Tar bort…' : 'Ja, ta bort passet'}</button>
        </div>
        {error && <p role="alert">Passet kunde inte tas bort. Försök igen.</p>}
      </div>}
  </div>;
}
