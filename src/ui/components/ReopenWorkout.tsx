import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { activeSession, reopenSession } from '../../application/training';
import { useServices } from '../services';

export function ReopenWorkout({ sessionId, disabled = false }: { sessionId: string; disabled?: boolean }) {
  const { ctx } = useServices();
  const nav = useNavigate();
  const active = useLiveQuery(() => activeSession(ctx), [ctx]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const otherActive = active && active.id !== sessionId;
  async function reopen() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      await reopenSession(ctx, sessionId);
      nav(`/pass/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error && e.message === 'INVALID_STATE:active_session_exists'
        ? 'Ett annat pass pågår. Avsluta det först.'
        : 'Kunde inte återuppta passet. Dina sparade set finns kvar. Försök igen.');
    } finally { saving.current = false; setBusy(false); }
  }
  return <div className="stack no-print">
    <button type="button" className="btn" disabled={disabled || busy || !!otherActive} onClick={() => void reopen()}>{busy ? 'Återupptar…' : 'Återuppta pass'}</button>
    {otherActive && <p className="small">Ett annat pass pågår. <button type="button" className="btn ghost" onClick={() => nav(`/pass/${active.id}`)}>Visa pågående pass</button></p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
