import { useEffect, useRef, useState } from 'react';
import type { PerceivedEffort } from '../../domain/model';
import { EFFORT_LABELS, EFFORT_OPTIONS, MAX_EFFORT_DESCRIPTION } from '../../domain/effort';

/** The set is already saved. Feedback is a separate, optional atomic operation. */
export function EffortFeedback({ value, label, onRate }: { value: PerceivedEffort | null; label: string; onRate: (value: PerceivedEffort | null) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const group = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  async function save(answer: PerceivedEffort | null) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await onRate(answer); restoreFocus.current = true; setEditing(false); setDismissed(answer === null); }
    catch { setError('Kunde inte spara känslan. Setet är redan sparat. Försök igen.'); }
    finally { saving.current = false; setBusy(false); }
  }
  const expanded = editing || (!value && !dismissed);
  useEffect(() => {
    if (!expanded && !busy && restoreFocus.current) {
      if (document.activeElement === document.body || group.current?.contains(document.activeElement)) editButton.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [expanded, busy]);
  return <div ref={group} className="effort-feedback stack" role="group" aria-label={`Hur kändes setet? ${label}`} aria-busy={busy}>
    <div className="row wrap spread"><strong className="small">{expanded ? `Hur kändes setet? ${label}` : value ? `Känsla: ${EFFORT_LABELS[value]}` : 'Känsla: inte angiven'}</strong>
      {!expanded && <button ref={editButton} type="button" className="btn" onClick={() => setEditing(true)}>{value ? 'Ändra känsla' : 'Ange känsla'}</button>}
    </div>
    {expanded && <><p className="small muted">Valfritt. Bedöm just det här setet.</p><div className="effort-options">
      {EFFORT_OPTIONS.map((answer) => <button type="button" className="btn" key={answer} aria-pressed={value === answer} disabled={busy} onClick={() => void save(answer)}>
        <span>{EFFORT_LABELS[answer]}</span>{answer === 'maximal' && <span className="small">{MAX_EFFORT_DESCRIPTION}</span>}
      </button>)}
    </div><div className="row wrap">
      <button type="button" className="btn" disabled={busy} onClick={() => { restoreFocus.current = true; setEditing(false); setDismissed(true); setError(''); }}>Senare</button>
      {value && <button type="button" className="btn" disabled={busy} onClick={() => void save(null)}>Ta bort svar</button>}
    </div></>}
    {!expanded && value === 'maximal' && <p className="small muted">{MAX_EFFORT_DESCRIPTION}</p>}
    {error && <p role="alert" className="error-text">{error}</p>}
  </div>;
}
