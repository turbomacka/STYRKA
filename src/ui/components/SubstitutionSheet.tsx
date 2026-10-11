/**
 * "Byt övning" v2 (STYRKA-CR-2026-10-10-01 §2.1): högst 3 prioriterade alternativ + "Visa fler", relation,
 * utrustning, viktstatus och kort motivering. Efter val: nya set/reps och separat viktförslag eller tydligt
 * kalibreringsläge, redigerbar startvikt, "Bara idag"/"Använd framöver". Två tryck från listan till bytt övning.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { ExerciseId } from '../../domain/catalog';
import { EQUIPMENT_LABEL_SV, exercise } from '../../domain/catalog';
import type { ChoiceScope, Familiarity, PlannedExercise } from '../../domain/model';
import { RELATION_LABEL_SV, priorBasisSv } from '../../domain/substitutionCatalog';
import { formatKg, kgToGrams, parseKg } from '../../domain/units';
import type { ReplacementResult, SubstitutionCandidate } from '../../planner/planner';
import type { SwapOptions } from '../../application/training';
import { Banner, ReasonPopover, Segmented, Sheet } from './common';
import { EditableKg } from './SetRow';
import { prescriptionText } from './widgets';
import { SUB, SUB_BLOCKED_SV, loadStatusText } from '../strings';

export type SubstitutionSheetProps = {
  /** Aktuell (planerad eller pågående) övning. */
  from: PlannedExercise;
  loadCandidates: () => Promise<{ suggested: SubstitutionCandidate[]; more: SubstitutionCandidate[] }>;
  preview: (to: ExerciseId, opts: { familiarity?: Familiarity; variantKey?: string }) => Promise<ReplacementResult>;
  onConfirm: (to: ExerciseId, opts: SwapOptions) => Promise<void>;
  onClose: () => void;
  /** Prioriterade huvudlyft (för diskret målnotis vid "Använd framöver"). */
  goals: Partial<Record<ExerciseId, number>>;
  /** Kända maskinprofiler för aktuell maskinövning ('default' = standard). */
  machineProfiles?: string[];
};

type Choice = { to: ExerciseId; variantKey?: string; machine?: boolean };

export function SubstitutionSheet({ from, loadCandidates, preview, onConfirm, onClose, goals, machineProfiles = [] }: SubstitutionSheetProps) {
  const [list, setList] = useState<{ suggested: SubstitutionCandidate[]; more: SubstitutionCandidate[] } | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const root = from.substitutionFrom ?? from.exerciseId;
  const rootName = exercise(root).nameSv;

  useEffect(() => {
    let alive = true;
    loadCandidates()
      .then((x) => alive && setList(x))
      .catch(() => alive && setErr(SUB.FAILED));
    return () => {
      alive = false;
    };
  }, [loadCandidates]);

  const machine = exercise(from.exerciseId).requiresEquipmentProfile;
  return (
    <Sheet title={choice ? exercise(choice.to).nameSv : SUB.TITLE} onClose={onClose}>
      {err && <Banner kind="danger">{err}</Banner>}
      {!choice && (
        <div className="stack">
          <p className="small muted">{SUB.INTRO}</p>
          <p className="small muted">{SUB.CANDIDATES_NOTE}</p>
          {!list ? (
            <p aria-busy="true">Hämtar alternativ…</p>
          ) : (
            <>
              <ul className="list sub-list" aria-label="Föreslagna alternativ">
                {list.suggested.map((c) => (
                  <CandidateRow key={c.exerciseId} c={c} rootName={rootName} onPick={() => setChoice({ to: c.exerciseId })} />
                ))}
                {list.suggested.length === 0 && <li className="small muted">Inga tillåtna alternativ med din utrustning och dina regler.</li>}
              </ul>
              {list.more.length > 0 && (
                <>
                  <button type="button" className="btn ghost block" aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
                    {showMore ? SUB.SHOW_LESS : `${SUB.SHOW_MORE} (${list.more.length})`}
                  </button>
                  {showMore && (
                    <ul className="list sub-list" aria-label="Fler alternativ">
                      {list.more.map((c) => (
                        <CandidateRow key={c.exerciseId} c={c} rootName={rootName} onPick={() => setChoice({ to: c.exerciseId })} />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
          {machine && (
            <button type="button" className="btn block" onClick={() => setChoice({ to: from.exerciseId, machine: true })}>
              {SUB.OTHER_MACHINE}
            </button>
          )}
          <button type="button" className="btn block" onClick={onClose}>
            {SUB.KEEP(exercise(from.exerciseId).nameSv)}
          </button>
        </div>
      )}
      {choice && <ConfirmStep key={`${choice.to}|${choice.machine ? 'm' : ''}`} from={from} choice={choice} rootName={rootName} goal={(goals[root] ?? 0) > 0} preview={preview} machineProfiles={machineProfiles} onBack={() => setChoice(null)} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function CandidateRow({ c, rootName, onPick }: { c: SubstitutionCandidate; rootName: string; onPick: () => void }) {
  const ex = exercise(c.exerciseId);
  const r = c.result;
  const blocked = r.status !== 'ok' ? (SUB_BLOCKED_SV[r.status] ?? 'Kan inte väljas') : null;
  const relation = c.relation ? RELATION_LABEL_SV[c.relation.relation] : SUB.ORIGINAL;
  const transfer = c.relation && c.relation.relation !== 'near_variant' ? SUB.TRANSFER[c.relation.relation](rootName) : null;
  const status = blocked ?? loadStatusText(r.planned?.loadEstimationKind, r.needsFamiliarity);
  const equipment = ex.equipment.map((e) => EQUIPMENT_LABEL_SV[e]).join(', ');
  return (
    <li>
      <button type="button" className="sub-option" disabled={!!blocked} onClick={onPick} aria-label={`${ex.nameSv}. ${relation}. ${status}`}>
        <span className="row spread wrap">
          <span className="sub-name">{ex.nameSv}</span>
          <span className="chip">{relation}</span>
        </span>
        <span className="small muted">{equipment}</span>
        <span className={`small ${blocked ? 'error-text' : ''}`}>{status}</span>
        {c.relation && <span className="small">{c.relation.rationale_sv}</span>}
        {transfer && <span className="small muted">{transfer}</span>}
      </button>
    </li>
  );
}

function ConfirmStep({ from, choice, rootName, goal, preview, machineProfiles, onBack, onConfirm }: { from: PlannedExercise; choice: Choice; rootName: string; goal: boolean; preview: SubstitutionSheetProps['preview']; machineProfiles: string[]; onBack: () => void; onConfirm: SubstitutionSheetProps['onConfirm'] }) {
  const uid = useId();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const [familiarity, setFamiliarity] = useState<Familiarity | undefined>(undefined);
  const currentVariant = from.variantKey ?? 'default';
  const [variant, setVariant] = useState<string>(choice.machine ? '' : (choice.variantKey ?? ''));
  const [res, setRes] = useState<ReplacementResult | null>(null);
  const [kg, setKg] = useState<string>('');
  const [kgTouched, setKgTouched] = useState(false);
  const [scope, setScope] = useState<ChoiceScope>('today');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const variantKey = choice.machine ? variant.trim() || undefined : undefined;
  const sameMachine = choice.machine && (variantKey ?? '') === '' ? true : choice.machine && variantKey === currentVariant;

  const kgTouchedRef = useRef(false);
  kgTouchedRef.current = kgTouched;
  useEffect(() => {
    if (sameMachine) {
      setRes(null);
      return;
    }
    let alive = true;
    preview(choice.to, { familiarity, variantKey })
      .then((r) => {
        if (!alive) return;
        setRes(r);
        if (!kgTouchedRef.current) {
          const start = r.planned ? (r.planned.kg ?? r.planned.calibrationSuggestionKg ?? null) : null;
          setKg(start === null ? '' : formatKg(kgToGrams(start)));
        }
      })
      .catch(() => alive && setErr(SUB.FAILED));
    return () => {
      alive = false;
    };
  }, [preview, choice.to, familiarity, variantKey, sameMachine]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const p = res?.planned ?? null;
  const lk = p?.loadKind ?? exercise(choice.to).loadKind;
  const hasKg = lk === 'external_kg' || lk === 'assistance_kg';
  const perHand = (p?.loadBasis ?? exercise(choice.to).loadDisplayBasis) === 'per_hand_kg';
  const prior = p?.substitution?.prior;
  const parsed = kg.trim() === '' ? null : parseKg(kg);
  const kgInvalid = parsed !== null && !parsed.ok;

  async function confirm() {
    if (!p || !res || res.status !== 'ok') return;
    if (kgInvalid) {
      setErr('Kontrollera vikten.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const grams = parsed && parsed.ok ? parsed.grams : null;
      const opts: SwapOptions = { scope, ...(familiarity ? { familiarity } : {}), ...(variantKey ? { variantKey } : {}) };
      if (hasKg && (res.requiresConfirmation || kgTouched)) opts.startGrams = grams;
      await onConfirm(choice.to, opts);
    } catch {
      setErr(SUB.FAILED);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p ref={headingRef} tabIndex={-1} className="small muted" style={{ margin: 0 }}>
        {choice.machine ? SUB.MACHINE_HELP : `Ersätter ${exercise(from.exerciseId).nameSv.toLowerCase()}${res?.relation ? ` · ${RELATION_LABEL_SV[res.relation.relation].toLowerCase()}` : ''}`}
      </p>
      {choice.machine && (
        <div className="field">
          <label htmlFor={`${uid}-machine`}>{SUB.MACHINE_LABEL}</label>
          <input id={`${uid}-machine`} type="text" maxLength={64} autoComplete="off" value={variant} onChange={(e) => setVariant(e.target.value)} list={`${uid}-known`} />
          <datalist id={`${uid}-known`}>
            {machineProfiles.filter((m) => m !== 'default' && m !== currentVariant).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {machineProfiles.length > 0 && currentVariant !== 'default' && (
            <button type="button" className="btn ghost" onClick={() => setVariant('default')}>
              {SUB.STANDARD_MACHINE}
            </button>
          )}
        </div>
      )}
      {res && res.status !== 'ok' && <Banner kind="warn">{SUB_BLOCKED_SV[res.status] ?? SUB.FAILED}</Banner>}
      {p && (
        <>
          <p className="num" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {prescriptionText(p)}
          </p>
          {res?.needsFamiliarity && (
            <div className="stack">
              <Segmented label={SUB.FAMILIARITY_Q} value={familiarity ?? ('' as Familiarity)} onChange={(v: Familiarity) => setFamiliarity(v)} options={[{ value: 'familiar', label: SUB.FAMILIARITY_YES }, { value: 'unfamiliar', label: SUB.FAMILIARITY_NO }]} />
              <p className="small muted">{SUB.FAMILIARITY_HELP}</p>
            </div>
          )}
          {hasKg && (
            <>
              {prior ? (
                <Banner kind="warn" title={SUB.PRIOR_NOTE}>
                  {SUB.PRIOR_DETAIL(exercise(prior.sourceExerciseId).nameSv.toLowerCase(), prior.pct)} {priorBasisSv(prior.sourceExerciseId, choice.to)}
                </Banner>
              ) : p.kg === null ? (
                <Banner kind="info" title={SUB.NO_WEIGHT}>
                  {SUB.NO_WEIGHT_HELP} {SUB.CAL_INSTRUCTIONS}
                </Banner>
              ) : null}
              <EditableKg
                id={`${uid}-kg`}
                label={lk === 'assistance_kg' ? SUB.START_ASSIST : perHand ? SUB.START_WEIGHT_PER_HAND : SUB.START_WEIGHT}
                value={kg}
                stepGrams={Math.round(p.incrementKg * 1000)}
                onChange={(v) => {
                  setKg(v);
                  setKgTouched(true);
                }}
              />
            </>
          )}
          <Segmented label={SUB.SCOPE_LEGEND} value={scope} onChange={(v: ChoiceScope) => setScope(v)} options={[{ value: 'today', label: SUB.SCOPE_TODAY }, { value: 'future', label: SUB.SCOPE_FUTURE }]} />
          {scope === 'future' && <p className="small muted">{SUB.SCOPE_FUTURE_HELP}</p>}
          {scope === 'future' && goal && choice.to !== (from.substitutionFrom ?? from.exerciseId) && <p className="small muted">{SUB.GOAL_NOTE(rootName)}</p>}
          <ReasonPopover reasons={p.reasons} />
        </>
      )}
      {err && <Banner kind="danger">{err}</Banner>}
      <div className="row">
        <button type="button" className="btn grow" onClick={onBack}>
          {SUB.BACK}
        </button>
        <button type="button" className="btn primary grow" disabled={busy || !p || res?.status !== 'ok' || kgInvalid} onClick={confirm}>
          {SUB.CONFIRM(exercise(choice.to).nameSv)}
        </button>
      </div>
    </div>
  );
}
