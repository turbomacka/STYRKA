import { useEffect, useId, useRef, useState } from 'react';
import type { LoadDisplayBasis, LoadKind } from '../../domain/catalog';
import type { PerceivedEffort, Technique } from '../../domain/model';
import { EffortFeedback } from './EffortFeedback';
import { formatKg, parseIntInRange, parseKg } from '../../domain/units';
import type { LocalSet } from '../../storage/db';
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
    const animation = ref.current.animate([{ opacity: 0.75 }, { opacity: 1 }], { duration: ms });
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
export function EditableKg({
  id,
  value,
  onChange,
  stepGrams,
  label,
  autoFocus,
  unit = 'kg',
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  stepGrams: number;
  label: string;
  autoFocus?: boolean;
  unit?: 'kg' | 'level';
}) {
  const parsed = value === '' ? null : parseKg(value);
  const err =
    parsed && !parsed.ok
      ? parsed.error === 'TOO_LARGE'
        ? `Högst 500 ${unit === 'level' ? 'nivåer' : 'kg'}.`
        : parsed.error === 'TOO_PRECISE'
          ? 'Högst tre decimaler.'
          : 'Ange vikt som t.ex. 82,5'
      : null;
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
        <button
          type="button"
          className="btn icon"
          aria-label={`Minska ${formatKg(stepGrams)} ${unit === 'level' ? 'nivåer' : 'kilo'}`}
          onClick={() => bump(-1)}
        >
          <Icon.Minus />
        </button>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          aria-invalid={!!err}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          className="num"
        />
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
        <button
          type="button"
          className="btn icon"
          aria-label={`Öka ${formatKg(stepGrams)} ${unit === 'level' ? 'nivåer' : 'kilo'}`}
          onClick={() => bump(1)}
        >
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

export function EditableReps({
  id,
  value,
  onChange,
  label,
  max = 50,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  max?: number;
  autoFocus?: boolean;
}) {
  const ref = useValueFeedback(value);
  const parsed = value === '' ? null : parseIntInRange(value, 0, max);
  const err = parsed && !parsed.ok ? `Ange ett heltal 0–${max}.` : null;
  const cur = parsed && parsed.ok ? parsed.value : 0;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="kg-input">
        <button
          type="button"
          className="btn icon"
          aria-label={`Minska ${label.toLowerCase()}`}
          onClick={() => onChange(String(Math.max(0, cur - 1)))}
        >
          <Icon.Minus />
        </button>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          aria-invalid={!!err}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          className="num"
        />
        <button
          type="button"
          className="btn icon"
          aria-label={`Öka ${label.toLowerCase()}`}
          onClick={() => onChange(String(Math.min(max, cur + 1)))}
        >
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
  onPlan?: (v: SetValues) => Promise<void>;
  planning?: boolean;
  secondLoad?: number | null;
  /** Lastbas (t.ex. per hantel) – visas endast när den är definierad (katalog 2.0.0). */
  loadBasis?: LoadDisplayBasis;
  loadUnit?: 'kg' | 'level';
  /** Optional descriptive feedback after a saved working set, including legacy records. */
  effortPrompt?: boolean;
  onRate?: (e: PerceivedEffort | null) => Promise<void>;
};

type Draft = { second: string; kg: string; reps: string; secs: string; rir: string; technique: Technique };

function draftFrom(s: LocalSet, done: boolean, second?: number | null): Draft {
  const g = done ? s.actualGrams : s.targetGrams;
  const r = done ? s.actualReps : s.targetReps;
  const sec = done ? s.actualSeconds : s.targetSeconds;
  return {
    second: second == null ? '' : formatKg(Math.round(second * 1000)),
    kg: g === null ? '' : formatKg(g),
    reps: r === null ? '' : String(r),
    secs: sec === null ? '' : String(sec),
    rir: s.rir === null ? '' : String(s.rir),
    technique: s.technique ?? 'controlled',
  };
}

/** A number editor saves a plan; only the explicit completion action logs training. */
export function SetRow({
  set,
  displayNo,
  loadKind,
  stepGrams,
  online,
  showRir,
  failed,
  onLog,
  onEdit,
  onUndo,
  onPlan,
  planning = false,
  secondLoad,
  loadBasis,
  effortPrompt,
  onRate,
  loadUnit = 'kg',
}: SetRowProps) {
  const done = set.status === 'done';
  const [editing, setEditing] = useState<null | 'kg' | 'reps' | 'edit'>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(set, done, secondLoad));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'' | 'pending' | 'saved' | 'failed'>('');
  const [feedback, setFeedback] = useState(false);
  const inFlight = useRef(false),
    committed = useRef(false),
    dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const editVersion = useRef(0),
    lastQueued = useRef('');
  const callbacks = useRef({ onPlan, onEdit });
  callbacks.current = { onPlan, onEdit };
  const uid = useId();
  const isDuration = loadKind === 'duration_sec',
    hasKg = !['duration_sec', 'reps_only'].includes(loadKind);
  const needsKg = loadKind === 'external_kg' || loadKind === 'assistance_kg';
  useEffect(() => {
    if (!done) {
      committed.current = false;
      setFeedback(false);
    }
  }, [done]);
  useEffect(() => {
    if (!editing) {
      const next = draftFrom(set, done, secondLoad);
      setDraft(next);
      draftRef.current = next;
    }
  }, [set, done, editing, secondLoad]);
  const flush = useRef<() => void>(() => {});
  flush.current = () => {
    void persist();
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current) flush.current();
    },
    [],
  );

  function values(d: Draft, requireLoad: boolean): SetValues | null {
    const out: SetValues = {};
    if (secondLoad !== undefined) {
      const parsed = parseKg(d.second);
      if (!parsed.ok) {
        if (d.second.trim() || requireLoad) return null;
        out.secondLoadValue = null;
      } else out.secondLoadValue = parsed.grams / 1000;
    }
    if (hasKg) {
      if (!d.kg.trim()) {
        if (requireLoad && needsKg) return null;
        out.actualGrams = loadKind === 'bodyweight_plus_kg' ? 0 : null;
      } else {
        const p = parseKg(d.kg);
        if (!p.ok) return null;
        out.actualGrams = p.grams;
      }
    }
    const rep = parseIntInRange(isDuration ? d.secs : d.reps, 0, isDuration ? 900 : 50);
    if (!rep.ok) return null;
    if (isDuration) out.actualSeconds = rep.value;
    else out.actualReps = rep.value;
    if (done || d.rir !== '') out.rir = d.rir === '' ? null : Number(d.rir);
    out.technique = d.technique;
    return out;
  }
  function persist(d = draftRef.current): Promise<boolean> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return queue.current;
    const v = values(d, done);
    if (!v) {
      setError('Kontrollera värdena. Ändringen är inte sparad.');
      return Promise.resolve(false);
    }
    const key = JSON.stringify(v);
    if (key === lastQueued.current) return queue.current;
    lastQueued.current = key;
    const version = editVersion.current;
    setSaveState('pending');
    queue.current = queue.current.then(async () => {
      try {
        const save = done ? callbacks.current.onEdit : callbacks.current.onPlan;
        if (!save) throw new Error('MISSING_PLAN_EDITOR');
        await save(v);
        if (version === editVersion.current) {
          dirty.current = false;
          setSaveState('saved');
          setError(null);
        }
        return true;
      } catch {
        if (version === editVersion.current) {
          setSaveState('failed');
          setError('Kunde inte spara ändringen. Försök igen.');
          lastQueued.current = '';
        }
        return false;
      }
    });
    return queue.current;
  }
  function change(patch: Partial<Draft>) {
    const next = {
      ...draftRef.current,
      ...patch,
      ...(done && ('kg' in patch || 'reps' in patch || 'secs' in patch || 'second' in patch) ? { rir: '' } : {}),
    };
    draftRef.current = next;
    setDraft(next);
    dirty.current = true;
    editVersion.current++;
    setSaveState('pending');
    setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist(next);
    }, 300);
  }
  async function close() {
    if (await persist()) setEditing(null);
  }
  async function log() {
    if (inFlight.current || committed.current || done) return;
    const v = values(draftRef.current, true);
    if (!v) {
      setEditing('kg');
      setError(needsKg && !draftRef.current.kg.trim() ? 'Välj vikten du använde.' : 'Kontrollera värdena.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!(await persist())) return;
      await onLog(v);
      committed.current = true;
      setFeedback(true);
      confirmSetHaptic();
      setEditing(null);
    } catch {
      setError(T.WARN_UNSAVED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const grams = done ? set.actualGrams : set.targetGrams;
  const reps = isDuration ? (done ? set.actualSeconds : set.targetSeconds) : done ? set.actualReps : set.targetReps;
  const spoken = loadUnit === 'level' ? (grams === null ? 'välj nivå' : `${formatKg(grams)} nivå`) : kgSpoken(grams, loadKind, loadBasis);
  return (
    <li
      className={`set-row ${done ? 'done' : ''} ${planning ? 'planning' : ''}`}
      data-feedback={feedback ? 'saved' : undefined}
      aria-label={`Set ${displayNo}, ${hasKg ? spoken + ', ' : ''}${reps ?? '–'} ${isDuration ? 'sekunder' : 'repetitioner'}, ${done ? 'utfört' : 'planerat'}`}
    >
      <span className="set-no num">{displayNo}</span>
      {hasKg ? (
        <button type="button" className="val num" aria-label={`Vikt set ${displayNo}: ${spoken}. Ändra`} onClick={() => setEditing('kg')}>
          <span className="set-value">{grams === null ? 'Välj vikt' : formatKg(grams)}</span>
          <span className="unit">
            {loadUnit === 'level'
              ? 'nivå'
              : loadBasis === 'per_hand_kg'
                ? 'kg/hantel'
                : loadKind === 'assistance_kg'
                  ? 'kg assistans'
                  : loadKind === 'bodyweight_plus_kg'
                    ? 'kg extra'
                    : 'kg'}
          </span>
        </button>
      ) : (
        <span className="small muted">{isDuration ? 'Tid' : 'Kroppsvikt'}</span>
      )}
      <button
        type="button"
        className="val num"
        aria-label={`${isDuration ? 'Tid' : 'Repetitioner'} set ${displayNo}: ${reps ?? '–'}. Ändra`}
        onClick={() => setEditing('reps')}
      >
        <span className="set-value">{reps ?? '–'}</span>
        <span className="unit">{isDuration ? 's' : 'reps'}</span>
      </button>
      {done ? (
        <button
          type="button"
          className="done-mark"
          aria-label={`Set ${displayNo} utfört. Ändra eller ångra`}
          onClick={() => {
            if (editing) void close();
            else setEditing('edit');
          }}
        >
          <Icon.Check />
          <span className="visually-hidden">Utfört</span>
        </button>
      ) : !planning && !editing ? (
        <button
          type="button"
          className="btn primary log"
          disabled={busy}
          aria-busy={busy}
          aria-label={`Registrera set ${displayNo}`}
          onClick={() => void log()}
        >
          {busy ? 'Sparar…' : 'Registrera'}
        </button>
      ) : (
        <span className="small muted">Planerat</span>
      )}
      {secondLoad !== undefined && (
        <button type="button" className="btn ghost set-status" onClick={() => setEditing('edit')}>
          Andra viktstapeln:{' '}
          {secondLoad === null ? 'Välj belastning' : `${formatKg(Math.round(secondLoad * 1000))} ${loadUnit === 'level' ? 'nivå' : 'kg'}`}
        </button>
      )}
      {done && effortPrompt && onRate && (
        <div className="set-effort">
          <EffortFeedback value={set.perceivedEffort ?? null} label={`Set ${displayNo}`} onRate={onRate} />
        </div>
      )}
      {(error || failed || set.syncState === 'conflict' || set.syncState === 'failed') && (
        <div className="set-status">
          <SaveStateChip state={failed ? 'failed_local' : set.syncState} online={online} />
          {error && (
            <span className="error-text" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
      {editing && (
        <div
          className="editor stack"
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void persist();
          }}
        >
          <p className="small muted">{done ? 'Ändra utfört set' : 'Ändra planerat set'}</p>
          {hasKg && (
            <EditableKg
              id={`${uid}-kg`}
              unit={loadUnit}
              label={loadUnit === 'level' ? 'Belastningsnivå' : loadBasis === 'per_hand_kg' ? 'Vikt (kg per hantel)' : 'Vikt (kg)'}
              value={draft.kg}
              stepGrams={stepGrams}
              onChange={(kg) => change({ kg })}
              autoFocus={editing === 'kg'}
            />
          )}
          {secondLoad !== undefined && (
            <EditableKg
              id={`${uid}-second`}
              unit={loadUnit}
              label={`Andra viktstapeln (${loadUnit === 'level' ? 'nivå' : 'kg'})`}
              value={draft.second}
              stepGrams={stepGrams}
              onChange={(second) => change({ second })}
            />
          )}
          <EditableReps
            id={`${uid}-reps`}
            label={isDuration ? 'Sekunder' : 'Repetitioner'}
            max={isDuration ? 900 : 50}
            value={isDuration ? draft.secs : draft.reps}
            onChange={(value) => change(isDuration ? { secs: value } : { reps: value })}
            autoFocus={editing === 'reps'}
          />
          {done && (
            <details>
              <summary>Fler uppgifter</summary>
              {showRir && (
                <label className="field">
                  Repetitioner kvar (valfritt)
                  <select value={draft.rir} onChange={(e) => change({ rir: e.target.value })}>
                    <option value="">Vet inte</option>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Teknik
                <select value={draft.technique} onChange={(e) => change({ technique: e.target.value as Technique })}>
                  <option value="controlled">Kontrollerad</option>
                  <option value="uncertain">Osäker</option>
                  <option value="poor">Dålig</option>
                </select>
              </label>
            </details>
          )}
          <p className="small" role="status">
            {saveState === 'pending'
              ? 'Sparar ändring…'
              : saveState === 'saved'
                ? done
                  ? '✓ Ändringen sparad'
                  : '✓ Planen sparad · setet är inte registrerat'
                : saveState === 'failed'
                  ? 'Inte sparat'
                  : 'Ändringar sparas automatiskt.'}
          </p>
          <div className="row wrap">
            {done && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={async () => {
                  if (inFlight.current) return;
                  inFlight.current = true;
                  setBusy(true);
                  try {
                    if (!(await persist())) return;
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
                Ångra registrering
              </button>
            )}
            {saveState === 'failed' && (
              <button type="button" className="btn" onClick={() => void persist()}>
                Försök igen
              </button>
            )}
            <button type="button" className="btn grow" onClick={() => void close()}>
              Stäng
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
