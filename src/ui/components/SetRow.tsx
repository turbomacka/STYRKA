import { useEffect, useId, useRef, useState } from 'react';
import type { LoadKind } from '../../domain/catalog';
import type { Technique } from '../../domain/model';
import { formatKg, parseIntInRange, parseKg } from '../../domain/units';
import type { LocalSet, SyncState } from '../../storage/db';
import type { SetValues } from '../../application/training';
import { T } from '../strings';
import { Icon, SaveStateChip } from './common';

export function kgLabel(grams: number | null, lk: LoadKind): string {
  if (lk === 'duration_sec' || lk === 'reps_only') return '';
  if (grams === null) return 'Välj vikt';
  if (lk === 'bodyweight_plus_kg') return grams === 0 ? 'Kroppsvikt' : `+${formatKg(grams)} kg`;
  return `${formatKg(grams)} kg`;
}

export function kgSpoken(grams: number | null, lk: LoadKind): string {
  if (grams === null) return 'vikt ej vald';
  const v = formatKg(grams).replace(',', ' komma ');
  if (lk === 'assistance_kg') return `${v} kilo assistans`;
  if (lk === 'bodyweight_plus_kg') return grams === 0 ? 'kroppsvikt' : `plus ${v} kilo`;
  return `${v} kilo`;
}

/** Viktfält: inputMode=decimal, accepterar 102,5 och 102.5, synlig kommaknapp, ± utrustningssteg (10 §1). */
export function EditableKg({ id, value, onChange, stepGrams, label, autoFocus }: { id: string; value: string; onChange: (v: string) => void; stepGrams: number; label: string; autoFocus?: boolean }) {
  const parsed = value === '' ? null : parseKg(value);
  const err = parsed && !parsed.ok ? (parsed.error === 'TOO_LARGE' ? 'Högst 500 kg.' : parsed.error === 'TOO_PRECISE' ? 'Högst tre decimaler.' : 'Ange vikt som t.ex. 82,5') : null;
  const ref = useRef<HTMLInputElement>(null);
  const bump = (dir: 1 | -1) => {
    const cur = parsed && parsed.ok ? parsed.grams : 0;
    const next = Math.max(0, Math.min(500_000, cur + dir * stepGrams));
    onChange(formatKg(next));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="kg-input">
        <button type="button" className="btn icon" aria-label={`Minska ${formatKg(stepGrams)} kilo`} onClick={() => bump(-1)}>
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
        <button type="button" className="btn icon" aria-label={`Öka ${formatKg(stepGrams)} kilo`} onClick={() => bump(1)}>
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
        <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done" value={value} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} className="num" />
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
export function SetRow({ set, displayNo, loadKind, stepGrams, online, showRir, failed, onLog, onEdit, onUndo }: SetRowProps) {
  const done = set.status === 'done';
  const [editing, setEditing] = useState<null | 'kg' | 'reps' | 'edit'>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(set, done));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (draft.rir !== '') out.rir = Number(draft.rir);
    out.technique = draft.technique;
    return out;
  }

  async function submit(kind: 'log' | 'edit') {
    const v = values();
    if (!v) {
      setEditing(editing ?? 'kg');
      setError(needsKg && draft.kg.trim() === '' ? 'Ange vikten du använde.' : 'Kontrollera värdena.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (kind === 'log') await onLog(v);
      else await onEdit(v);
      setEditing(null);
    } catch {
      setError(T.WARN_UNSAVED);
    } finally {
      setBusy(false);
    }
  }

  const kgText = kgLabel(done ? set.actualGrams : set.targetGrams, loadKind);
  const repsText = isDuration ? `${(done ? set.actualSeconds : set.targetSeconds) ?? '–'}` : `${(done ? set.actualReps : set.targetReps) ?? '–'}`;
  const unit = isDuration ? 's' : 'reps';
  const spokenReps = isDuration ? `${repsText} sekunder` : `${repsText} repetitioner`;
  const statusSpoken = done ? 'utfört' : set.status === 'skipped' ? 'överhoppat' : 'planerat';

  return (
    <li className={`set-row ${done ? 'done' : ''}`} aria-label={`Set ${displayNo}, ${hasKg ? kgSpoken(done ? set.actualGrams : set.targetGrams, loadKind) + ', ' : ''}${spokenReps}, ${statusSpoken}`}>
      <span className="set-no num">Set {displayNo}</span>
      {hasKg ? (
        <button type="button" className="val num" aria-label={`Vikt set ${displayNo}: ${kgSpoken(done ? set.actualGrams : set.targetGrams, loadKind)}. Ändra`} onClick={() => setEditing(done ? 'edit' : 'kg')}>
          {kgText}
          {loadKind === 'assistance_kg' && set.targetGrams !== null && <span className="unit">assist.</span>}
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="val num" aria-label={`${isDuration ? 'Tid' : 'Repetitioner'} set ${displayNo}: ${spokenReps}. Ändra`} onClick={() => setEditing(done ? 'edit' : 'reps')}>
        {repsText}
        <span className="unit">{unit}</span>
      </button>
      {done ? (
        <button type="button" className="done-mark" aria-label={`Set ${displayNo} utfört. Ändra eller ångra`} aria-expanded={editing === 'edit'} onClick={() => setEditing(editing === 'edit' ? null : 'edit')}>
          <Icon.Check /> <span className="visually-hidden">Utfört</span>
        </button>
      ) : (
        <button type="button" className="btn primary log" disabled={busy} onClick={() => submit('log')} aria-label={`${T.CTA_LOG}, set ${displayNo}`}>
          {T.CTA_LOG}
        </button>
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
          {hasKg && <EditableKg id={`${uid}-kg`} label={loadKind === 'assistance_kg' ? 'Assistans (kg) – lägre = tyngre' : loadKind === 'bodyweight_plus_kg' ? 'Extra vikt (kg), tomt = kroppsvikt' : 'Vikt (kg)'} value={draft.kg} stepGrams={stepGrams} onChange={(kg) => setDraft({ ...draft, kg })} autoFocus={editing === 'kg'} />}
          {isDuration ? (
            <EditableReps id={`${uid}-s`} label="Sekunder" max={900} value={draft.secs} onChange={(secs) => setDraft({ ...draft, secs })} autoFocus={editing === 'reps'} />
          ) : (
            <EditableReps id={`${uid}-r`} label="Repetitioner" value={draft.reps} onChange={(reps) => setDraft({ ...draft, reps })} autoFocus={editing === 'reps'} />
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
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onUndo();
                      setEditing(null);
                    } catch {
                      setError(T.WARN_UNSAVED);
                    } finally {
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
