import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { SyncState } from '../../storage/db';
import type { Confidence, WarningCode } from '../../domain/model';
import { CONFIDENCE_SV, EV_SV, T, reasonText } from '../strings';

const svg = (d: ReactNode) => (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={props.className}>
    {d}
  </svg>
);
export const Icon = {
  Today: svg(<><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></>),
  Chart: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  Person: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
  Check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  Alert: svg(<><path d="M12 3l9.5 17H2.5z" /><path d="M12 10v4M12 17.5v.01" /></>),
  Info: svg(<><circle cx="12" cy="12" r="9.5" /><path d="M12 11v6M12 7.5v.01" /></>),
  Cloud: svg(<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z" />),
  CloudOff: svg(<><path d="M7 18h10a4 4 0 0 0 1.7-.4M20.5 13.5A4 4 0 0 0 17.5 10a6 6 0 0 0-8-4.6M6.1 8.1A6 6 0 0 0 6 11.5 3.5 3.5 0 0 0 7 18" /><path d="M3 3l18 18" /></>),
  Sync: svg(<><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>),
  Back: svg(<path d="M15 5l-7 7 7 7" />),
  Close: svg(<path d="M6 6l12 12M18 6L6 18" />),
  Plus: svg(<path d="M12 5v14M5 12h14" />),
  Minus: svg(<path d="M5 12h14" />),
  Pause: svg(<path d="M9 5v14M15 5v14" />),
  Swap: svg(<path d="M7 7h12l-3-3M17 17H5l3 3" />),
  Lock: svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
};

export function Banner({ kind = 'info', children, title }: { kind?: 'info' | 'warn' | 'danger'; children: ReactNode; title?: string }) {
  const I = kind === 'info' ? Icon.Info : Icon.Alert;
  return (
    <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : 'note'}>
      <I className="ico" />
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

const WARN_TEXT: Record<WarningCode, { text: string; kind: 'info' | 'warn' | 'danger' }> = {
  WARN_CAL: { text: T.WARN_CAL, kind: 'info' },
  WARN_TIME: { text: T.WARN_TIME, kind: 'info' },
  WARN_REVIEW: { text: T.WARN_REVIEW, kind: 'warn' },
  WARN_NO_FULL_SCHEDULE: { text: T.WARN_NO_FULL_SCHEDULE, kind: 'warn' },
  WARN_TIME_INSUFFICIENT: { text: T.WARN_TIME_INSUFFICIENT, kind: 'warn' },
  WARN_EMPTY: { text: T.WARN_EMPTY, kind: 'warn' },
  WARN_PAIN: { text: T.WARN_PAIN, kind: 'warn' },
  WARN_RECOVERY: { text: T.WARN_RECOVERY, kind: 'info' },
};

export function Warnings({ codes }: { codes: WarningCode[] }) {
  // Tomläge visas av EmptyState; dubbla varningar undviks.
  const list = codes.filter((c) => c !== 'WARN_EMPTY');
  if (!list.length) return null;
  return (
    <div className="stack">
      {list.map((c) => (
        <Banner key={c} kind={WARN_TEXT[c].kind}>
          {WARN_TEXT[c].text}
        </Banner>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card" role="status">
      <h2>{title}</h2>
      {children}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/** Statuschip för sparning (01 §3.1). Visar aldrig "sparat" innan lokal commit. */
export function SaveStateChip({ state, online }: { state: SyncState | 'failed_local' | null; online: boolean }) {
  if (!state || state === 'local') return null;
  if (state === 'failed_local' || state === 'failed')
    return (
      <span className="chip danger">
        <Icon.Alert /> {T.SAVE_FAILED}
      </span>
    );
  if (state === 'conflict')
    return (
      <span className="chip warn">
        <Icon.Alert /> {T.SAVE_CONFLICT}
      </span>
    );
  if (state === 'synced')
    return (
      <span className="chip ok">
        <Icon.Check /> {T.SAVED_SYNCED}
      </span>
    );
  return (
    <span className="chip">
      {online ? <Icon.Cloud /> : <Icon.CloudOff />} {online ? T.SAVED_LOCAL : T.SAVED_QUEUED}
    </span>
  );
}

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="banner warn" role="status">
      <Icon.CloudOff className="ico" />
      <div>{T.WARN_OFFLINE}</div>
    </div>
  );
}

export function LoadConfidence({ confidence }: { confidence: Confidence }) {
  return <span className={`chip ${confidence === 'high' ? 'ok' : ''}`}>{CONFIDENCE_SV[confidence]}</span>;
}

/** "Varför det här förslaget?" – skälkoder i klartext med evidensklass. */
export function ReasonPopover({ reasons, title = T.INFO_REASONS }: { reasons: string[]; title?: string }) {
  const items = [...new Set(reasons)].map((r) => ({ code: r, info: reasonText(r) })).filter((x) => x.info);
  if (!items.length) return null;
  return (
    <details>
      <summary>{title}</summary>
      <ul className="list small">
        {items.map(({ code, info }) => (
          <li key={code}>
            {info!.text} <span className="muted">({EV_SV[info!.ev]})</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Stepper({ label, value, min, max, step = 1, onChange, format }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const id = useId();
  return (
    <div className="field">
      <span className="label" id={id}>
        {label}
      </span>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button type="button" className="btn icon" aria-label={`Minska ${label.toLowerCase()}`} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))}>
          <Icon.Minus />
        </button>
        <output className="num" aria-live="polite">
          {format ? format(value) : value}
        </output>
        <button type="button" className="btn icon" aria-label={`Öka ${label.toLowerCase()}`} disabled={value + step > max} onClick={() => onChange(Math.min(max, value + step))}>
          <Icon.Plus />
        </button>
      </div>
    </div>
  );
}

export function Segmented<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: Array<{ value: V; label: string }>; onChange: (v: V) => void }) {
  const id = useId();
  return (
    <div className="field">
      <span className="label" id={id}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h2 id={titleId} style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="btn icon ghost" aria-label="Stäng" onClick={onClose}>
            <Icon.Close />
          </button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export function ToastWithUndo({ message, onUndo, onDone, ms = 6000 }: { message: string; onUndo?: () => void; onDone: () => void; ms?: number }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [onDone, ms]);
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {onUndo && (
        <button type="button" className="btn" onClick={onUndo}>
          {T.CTA_UNDO}
        </button>
      )}
    </div>
  );
}

/** Tvåstegsbekräftelse för irreversibla val (S15). */
export function ConfirmTwice({ label, confirmLabel, onConfirm, danger = true, requireText }: { label: string; confirmLabel: string; onConfirm: () => Promise<void> | void; danger?: boolean; requireText?: string }) {
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  if (step === 0)
    return (
      <button type="button" className={`btn block ${danger ? '' : ''}`} onClick={() => setStep(1)}>
        {label}
      </button>
    );
  return (
    <div className="card stack" role="group" aria-label={label}>
      <p>
        <strong>Är du säker?</strong> Det här går inte att ångra.
      </p>
      {requireText && (
        <div className="field">
          <label htmlFor={id}>Skriv {requireText} för att bekräfta</label>
          <input id={id} type="text" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
      )}
      <div className="row">
        <button type="button" className="btn grow" onClick={() => setStep(0)}>
          Avbryt
        </button>
        <button
          type="button"
          className={`btn grow ${danger ? 'danger' : 'primary'}`}
          disabled={busy || (!!requireText && text.trim() !== requireText)}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setStep(0);
            }
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function PageHeader({ title, back }: { title: string; back?: () => void }) {
  return (
    <div className="row" style={{ marginBottom: 12 }}>
      {back && (
        <button type="button" className="btn icon ghost" aria-label="Tillbaka" onClick={back}>
          <Icon.Back />
        </button>
      )}
      <h1 style={{ margin: 0 }}>{title}</h1>
    </div>
  );
}
