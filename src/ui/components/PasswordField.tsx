import { useState } from 'react';

export function PasswordField({ id, label, value, onChange, autoComplete, hint, disabled = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password'; hint?: string; disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
        <button type="button" className="btn ghost" aria-label={`${show ? 'Dölj' : 'Visa'} ${label.toLowerCase()}`} aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Dölj' : 'Visa'}</button>
      </div>
      {hint && <span id={`${id}-hint`} className="small muted">{hint}</span>}
    </div>
  );
}
