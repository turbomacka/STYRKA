import { useEffect, useId, useRef, useState } from 'react';
import type { LoadDisplayBasis, LoadKind } from '../../domain/catalog';
import type { PerceivedEffort, Technique } from '../../domain/model';
import { EffortFeedback } from './EffortFeedback';
import { formatKg, parseIntInRange, parseKg } from '../../domain/units';
import type { LocalSet, SyncState } from '../../storage/db';
import type { SetValues } from '../../application/training';
import { T } from '../strings';
import { Icon, SaveStateChip } from './common';
import { confirmSetHaptic, refinedDesign } from '../design';

function useValueFeedback(value: string) {
  const ref = useRef<HTMLInputElement>(null);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (!refinedDesign || !ref.current?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ms = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-release')) || 120;
    const animation = ref.current.animate([{ opacity: .75 }, { opacity: 1 }], { duration: ms });
    return () => animation.cancel();
  }, [value]);
  return ref;
}

export function kgLabel(grams: number | null, lk: LoadKind, basis?: LoadDisplayBasis): string {
  if (lk === 'duration_sec' || lk === 'reps_only') return '';
  if (grams === null) return 'Välj vikt';
  if (lk === 'bodyweight_plus_kg') return grams === 0 ? 'Kroppsvikt' : `+${formatKg(grams)} kg`;
  return `${formatKg(grams)} kg${basis === 'per_hand_kg' ? '/hantel' : ''}`;
}

export function kgSpoken(grams: number | null, lk: LoadKind, basis?: LoadDisplayBasis): string {
  if (grams === null) return 'vikt ej vald';
  const v = formatKg(grams).replace(',', ' komma ');
  if (lk === 'assistance_kg') return `${v} kilo assistans`;
  if (lk === 'bodyweight_plus_kg') return grams === 0 ? 'kroppsvikt' : `plus ${v} kilo`;
  return `${v} kilo${basis === 'per_hand_kg' ? ' per hantel' : ''}`;
}

/** Viktfält: inputMode=decimal, accepterar 102,5 och 102.5, synlig kommaknapp, ± utrustningssteg (10 §1). */
export function EditableKg({ id, value, onChange, stepGrams, label, autoFocus, unit = "kg" }: { id: string; value: string; onChange: (v: string) => void; stepGrams: number; label: string; autoFocus?: boolean; unit?: "kg" | "level" }) {
  const parsed = value === '' ? null : parseKg(value);
  const err = parsed && !parsed.ok ? (parsed.error === 'TOO_LARGE' ? `Högst 500 ${unit === 'level' ? 'nivåer' : 'kg'}.` : parsed.error === 'TOO_PRECISE' ? 'Högst tre decimaler.' : 'Ange vikt som t.ex. 82,5') : null;
  const ref = useValueFeedback(value);
  const bump = (dir: 1 | -1) => {
    const cur = parsed && parsed.ok ? parsed.grams : 0;
    const next = Math.max(0, Math.min(500_000, cur + dir * stepGrams));
    onChange(formatKg(next));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="kg-input">
        <button type="button" className="btn icon" aria-label={`Minska ${formatKg(stepGrams)} ${unit === 'level' ? 'nivåer' : 'kilo'}`} onClick={() => bump(-1)}>
          <Icon.Minus />
        </button>
        <input ref={ref} id={id} type="text" inputMode="decimal" autoComplete="off" enterKeyHint="done" value={value} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} className="num" />
        <button
          type="button"
          className="btn icon"
          aria-label="Skriv decimalkomma"
          onClick={() => {
            onChange(value.includes(',') || value.includes('.') ? value : `${value},`);
            ref.current?.focus();
          }}
        >
          ,
        </button>
        <button type="button" className="btn icon" aria-label={`Öka ${formatKg(stepGrams)} ${unit === 'level' ? 'nivåer' : 'kilo'}`} onClick={() => bump(1)}>
          <Icon.Plus />
        </button>
      </div>
      {err && (
        <span id={`${id}-err`} className="error-text" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

export function EditableReps({ id, value, onChange, label, max = 50, autoFocus }: { id: string; value: string; onChange: (v: string) => void; label: string; max?: number; autoFocus?: boolean }) {
  const ref = useValueFeedback(value);
  const parsed = value === '' ? null : parseIntInRange(value, 0, max);
  const err = parsed && !parsed.ok ? `Ange ett heltal 0–${max}.` : null;
  const cur = parsed && parsed.ok ? parsed.value : 0;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="kg-input">
        <button type="button" className="btn icon" aria-label={`Minska ${label.toLowerCase()}`} onClick={() => onChange(String(Math.max(0, cur - 1)))}>
          <Icon.Minus />
        </button>
        <input ref={ref} id={id} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done" value={value} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} className="num" />
        <button type="button" className="btn icon" aria-label={`Öka ${label.toLowerCase()}`} onClick={() => onChange(String(Math.min(max, cur + 1)))}>
          <Icon.Plus />
        </button>
      </div>
      {err && (
        <span id={`${id}-err`} className="error-text" role="alert">
          {err}
        </span>
      )}
    </div>
  );
}

export type SetRowProps = {
  set: LocalSet;
  displayNo: number;
  loadKind: LoadKind;
  stepGrams: number;
  online: boolean;
  showRir: boolean;
  failed: boolean;
  onLog: (v: SetValues) => Promise<void>;
  onEdit: (v: SetValues) => Promise<void>;
  onUndo: () => Promise<void>;
  /** Lastbas (t.ex. per hantel) – visas endast när den är definierad (katalog 2.0.0). */
  loadBasis?: LoadDisplayBasis;
  loadUnit?: 'kg' | 'level';
  /** Optional descriptive feedback after a saved working set, including legacy records. */
  effortPrompt?: boolean;
  onRate?: (e: PerceivedEffort | null) => Promise<void>;
};

type Draft = { kg: string; reps: string; secs: string; rir: string; technique: Technique };

function draftFrom(s: LocalSet, done: boolean): Draft {
  const g = done ? s.actualGrams : s.targetGrams;
  const r = done ? s.actualReps : s.targetReps;
  const sec = done ? s.actualSeconds : s.targetSeconds;
  return { kg: g === null ? '' : formatKg(g), reps: r === null ? '' : String(r), secs: sec === null ? '' : String(sec), rir: s.rir === null ? '' : String(s.rir), technique: s.technique ?? 'controlled' };
}

/**
 * S08 setrad: `Set 2 | 80 kg | 5 reps | [Klart]`. Förifyllt set sparas med ETT tryck.
 * Vikt och reps är individuellt tryckbara och öppnar numeriskt tangentbord.
 */
export function SetRow({ set, displayNo, loadKind, stepGrams, online, showRir, failed, onLog, onEdit, onUndo, loadBasis, effortPrompt, onRate, loadUnit = 'kg' }: SetRowProps) {
  const done = set.status === 'done';
  const [editing, setEditing] = useState<null | 'kg' | 'reps' | 'edit'>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(set, done));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const committed = useRef(false);
  const [feedback, setFeedback] = useState(false);
  useEffect(() => { if (!done) { committed.current = false; setFeedback(false); } }, [done]);
  const uid = useId();
  useEffect(() => {
    if (!editing) setDraft(draftFrom(set, done));
  }, [set, done, editing]);

  const isDuration = loadKind === 'duration_sec';
  const hasKg = loadKind !== 'duration_sec' && loadKind !== 'reps_only';
  const needsKg = loadKind === 'external_kg' || loadKind === 'assistance_kg';

  function values(): SetValues | null {
    const out: SetValues = {};
    if (hasKg) {
      if (draft.kg.trim() === '') {
        if (needsKg) return null;
        out.actualGrams = loadKind === 'bodyweight_plus_kg' ? 0 : null;
      } else {
        const p = parseKg(draft.kg);
        if (!p.ok) return null;
        out.actualGrams = p.grams;
      }
    }
    if (isDuration) {
      const p = parseIntInRange(draft.secs, 0, 900);
      if (!p.ok) return null;
      out.actualSeconds = p.value;
    } else {
      const p = parseIntInRange(draft.reps, 0, 50);
      if (!p.ok) return null;
      out.actualReps = p.value;
    }
    if (draft.rir !== '' || done) out.rir = draft.rir !== '' ? Number(draft.rir) : null;
    out.technique = draft.technique;
    return out;
  }

  async function submit(kind: 'log' | 'edit') {
    if (inFlight.current || (kind === 'log' && (committed.current || done))) return;
    const v = values();
    if (!v) {
      setEditing(editing ?? 'kg');
      setError(needsKg && draft.kg.trim() === '' ? 'Ange vikten du använde.' : 'Kontrollera värdena.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFeedback(false);
    setError(null);
    try {
      if (kind === 'log') {
        await onLog(v);
        committed.current = true;
        setFeedback(true);
        confirmSetHaptic();
      } else await onEdit(v);
      setEditing(null);
    } catch {
      setError(T.WARN_UNSAVED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const shownGrams = done ? set.actualGrams : set.targetGrams;
  const spokenLoad = (g: number | null) => loadUnit === 'level' ? (g === null ? 'välj nivå' : `${formatKg(g)} nivå`) : kgSpoken(g, loadKind, loadBasis);
  const kgText = loadUnit === 'level' ? 'Välj nivå' : kgLabel(shownGrams, loadKind);
  const repsText = isDuration ? `${(done ? set.actualSeconds : set.targetSeconds) ?? '–'}` : `${(done ? set.actualReps : set.targetReps) ?? '–'}`;
  const unit = isDuration ? 's' : 'reps';
  const spokenReps = isDuration ? `${repsText} sekunder` : `${repsText} repetitioner`;
  const statusSpoken = done ? 'utfört' : set.status === 'skipped' ? 'överhoppat' : 'planerat';

  return (
    <li className={`set-row ${done ? 'done' : ''}`} data-feedback={feedback ? 'saved' : undefined} aria-label={`Set ${displayNo}, ${hasKg ? spokenLoad(done ? set.actualGrams : set.targetGrams) + ', ' : ''}${spokenReps}, ${statusSpoken}`}>
      <span className="set-no num">Set {displayNo}</span>
      {hasKg ? (
        <button type="button" className="val num" aria-label={`Vikt set ${displayNo}: ${spokenLoad(done ? set.actualGrams : set.targetGrams)}. Ändra`} onClick={() => setEditing(done ? 'edit' : 'kg')}>
          {shownGrams !== null && !(loadKind === 'bodyweight_plus_kg' && shownGrams === 0) ? (
            <>
              <span className="set-value">{loadKind === 'bodyweight_plus_kg' ? '+' : ''}{formatKg(shownGrams)}</span>{' '}
              <span className="unit">{loadUnit === 'level' ? 'nivå' : loadBasis === 'per_hand_kg' ? 'kg/hantel' : 'kg'}</span>
            </>
          ) : (
            kgText
          )}
          {loadKind === 'assistance_kg' && set.targetGrams !== null && <span className="unit">assist.</span>}
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="val num" aria-label={`${isDuration ? 'Tid' : 'Repetitioner'} set ${displayNo}: ${spokenReps}. Ändra`} onClick={() => setEditing(done ? 'edit' : 'reps')}>
        <span className="set-value">{repsText}</span>
        <span className="unit">{unit}</span>
      </button>
      {done ? (
        <button type="button" className="done-mark" aria-label={`Set ${displayNo} utfört. Ändra eller ångra`} aria-expanded={editing === 'edit'} onClick={() => setEditing(editing === 'edit' ? null : 'edit')}>
          <Icon.Check /> <span className="visually-hidden">Utfört</span>
        </button>
      ) : (
        <button type="button" className="btn primary log" disabled={busy} aria-busy={busy} onClick={() => submit('log')} aria-label={`${T.CTA_LOG}, set ${displayNo}`}>
          {busy ? 'Sparar…' : T.CTA_LOG}
        </button>
      )}
      {done && effortPrompt && onRate && (
        <div className="set-effort"><EffortFeedback value={set.perceivedEffort ?? null} label={`Set ${displayNo}`} onRate={onRate} /></div>
      )}
      <div className="set-status">
        <SaveStateChip state={failed ? 'failed_local' : done || set.createQueued ? (set.syncState as SyncState) : null} online={online} />
        {error && (
          <span className="error-text" role="alert">
            {' '}
            {error}
          </span>
        )}
      </div>
      {editing && (
        <div className="editor stack">
          {hasKg && <EditableKg id={`${uid}-kg`} unit={loadUnit} label={loadUnit === 'level' ? 'Belastningsnivå' : loadKind === 'assistance_kg' ? 'Assistans (kg) – lägre = tyngre' : loadKind === 'bodyweight_plus_kg' ? 'Extra vikt (kg), tomt = kroppsvikt' : loadBasis === 'per_hand_kg' ? 'Vikt (kg per hantel)' : 'Vikt (kg)'} value={draft.kg} stepGrams={stepGrams} onChange={(kg) => setDraft({ ...draft, kg, ...(done ? { rir: '' } : {}) })} autoFocus={editing === 'kg'} />}
          {isDuration ? (
            <EditableReps id={`${uid}-s`} label="Sekunder" max={900} value={draft.secs} onChange={(secs) => setDraft({ ...draft, secs, ...(done ? { rir: '' } : {}) })} autoFocus={editing === 'reps'} />
          ) : (
            <EditableReps id={`${uid}-r`} label="Repetitioner" value={draft.reps} onChange={(reps) => setDraft({ ...draft, reps, ...(done ? { rir: '' } : {}) })} autoFocus={editing === 'reps'} />
          )}
          {showRir && (
            <div className="field">
              <label htmlFor={`${uid}-rir`}>Repetitioner kvar (valfritt)</label>
              <select id={`${uid}-rir`} value={draft.rir} onChange={(e) => setDraft({ ...draft, rir: e.target.value })}>
                <option value="">Vet inte</option>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor={`${uid}-tech`}>Teknik (valfritt)</label>
            <select id={`${uid}-tech`} value={draft.technique} onChange={(e) => setDraft({ ...draft, technique: e.target.value as Technique })}>
              <option value="controlled">Kontrollerad</option>
              <option value="uncertain">Osäker</option>
              <option value="poor">Dålig</option>
            </select>
          </div>
          <div className="row">
            {done ? (
              <>
                <button
                  type="button"
                  className="btn grow"
                  disabled={busy}
                  onClick={async () => {
                    if (inFlight.current) return;
                    inFlight.current = true;
                    setBusy(true);
                    try {
                      await onUndo();
                      setEditing(null);
                    } catch {
                      setError(T.WARN_UNSAVED);
                    } finally {
                      inFlight.current = false;
                      setBusy(false);
                    }
                  }}
                >
                  {T.CTA_UNDO}
                </button>
                <button type="button" className="btn primary grow" disabled={busy} onClick={() => submit('edit')}>
                  {T.CTA_EDIT}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn grow" onClick={() => setEditing(null)}>
                  Stäng
                </button>
                <button type="button" className="btn primary grow" disabled={busy} onClick={() => submit('log')}>
                  {T.CTA_LOG}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
