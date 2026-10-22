import { useEffect, useId, useRef, useState } from 'react';
import type { ExerciseId } from '../../domain/catalog';
import { EQUIPMENT_LABEL_SV, exercise } from '../../domain/catalog';
import type { ChoiceScope, Familiarity, PlannedExercise } from '../../domain/model';
import { formatKg, kgToGrams, parseKg } from '../../domain/units';
import type { ReplacementResult, SubstitutionCandidate } from '../../planner/planner';
import type { SwapOptions } from '../../application/training';
import { Banner, Segmented, Sheet } from './common';
import { EditableKg } from './SetRow';
import { prescriptionText } from './widgets';
import { SUB, SUB_BLOCKED_SV } from '../strings';

export type SubstitutionSheetProps = {
  /** Aktuell (planerad eller pågående) övning. */
  from: PlannedExercise;
  loadCandidates: () => Promise<{ suggested: SubstitutionCandidate[]; more: SubstitutionCandidate[] }>;
  preview: (to: ExerciseId, opts: { familiarity?: Familiarity; variantKey?: string }) => Promise<ReplacementResult>;
  onConfirm: (to: ExerciseId, opts: SwapOptions) => Promise<void>;
  onClose: () => void;
  /** Prioriterade huvudlyft (för diskret målnotis vid "Använd framöver"). */
  goals: Partial<Record<ExerciseId, number>>;
};

type Choice = { to: ExerciseId };

export function SubstitutionSheet({ from, loadCandidates, preview, onConfirm, onClose, goals }: SubstitutionSheetProps) {
  const [list, setList] = useState<{ suggested: SubstitutionCandidate[]; more: SubstitutionCandidate[] } | null>(null);
  const [query,setQuery]=useState('');
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

  const candidates = list ? [...list.suggested,...list.more].filter((c)=>c.result.status==='ok'&&exercise(c.exerciseId).nameSv.toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv'))) : [];
  return (
    <Sheet title={choice ? exercise(choice.to).nameSv : SUB.TITLE} onClose={onClose}>
      {err && <Banner kind="danger">{err}</Banner>}
      {!choice && (
        <div className="stack">
          <label className="field">Sök övning<input type="search" value={query} onChange={(e)=>setQuery(e.target.value)} /></label>
          {!list?<p aria-busy="true">Hämtar alternativ…</p>:<ul className="list sub-list" aria-label="Föreslagna alternativ">{candidates.map((c)=><CandidateRow key={c.exerciseId} c={c} onPick={()=>setChoice({to:c.exerciseId})}/>)}{candidates.length===0&&<li className="muted">Inga alternativ med din utrustning och dina begränsningar.</li>}</ul>}
          <button type="button" className="btn block" onClick={onClose}>
            {SUB.KEEP(exercise(from.exerciseId).nameSv)}
          </button>
        </div>
      )}
      {choice && <ConfirmStep key={choice.to} from={from} choice={choice} rootName={rootName} goal={(goals[root] ?? 0) > 0} preview={preview} onBack={() => setChoice(null)} onConfirm={onConfirm} />}
    </Sheet>
  );
}

function CandidateRow({c,onPick}:{c:SubstitutionCandidate;onPick:()=>void}) {
  const ex=exercise(c.exerciseId);
  return <li><button type="button" className="sub-option" onClick={onPick} aria-label={ex.nameSv}><strong>{ex.nameSv}</strong><span className="small muted">{ex.equipment.map((e)=>EQUIPMENT_LABEL_SV[e]).join(', ')}</span></button></li>;
}

function ConfirmStep({ from, choice, rootName, goal, preview, onBack, onConfirm }: { from: PlannedExercise; choice: Choice; rootName: string; goal: boolean; preview: SubstitutionSheetProps['preview']; onBack: () => void; onConfirm: SubstitutionSheetProps['onConfirm'] }) {
  const uid = useId();
  const headingRef = useRef<HTMLParagraphElement>(null);
  const [familiarity, setFamiliarity] = useState<Familiarity | undefined>(undefined);
  const [res, setRes] = useState<ReplacementResult | null>(null);
  const [kg, setKg] = useState<string>('');
  const [kgTouched, setKgTouched] = useState(false);
  const [scope, setScope] = useState<ChoiceScope>('today');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kgTouchedRef = useRef(false);
  kgTouchedRef.current = kgTouched;
  useEffect(() => {
    let alive = true;
    preview(choice.to, { familiarity })
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
  }, [preview, choice.to, familiarity]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const p = res?.planned ?? null;
  const lk = p?.loadKind ?? exercise(choice.to).loadKind;
  const hasKg = lk === 'external_kg' || lk === 'assistance_kg';
  const perHand = (p?.loadBasis ?? exercise(choice.to).loadDisplayBasis) === 'per_hand_kg';

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
      const opts: SwapOptions = { scope, ...(familiarity ? { familiarity } : {}) };
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
        {`Ersätter ${exercise(from.exerciseId).nameSv.toLowerCase()}`}
      </p>
      {res && res.status !== 'ok' && <Banner kind="warn">{SUB_BLOCKED_SV[res.status] ?? SUB.FAILED}</Banner>}
      {p && (
        <>
          <p className="num" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {prescriptionText(p)}
          </p>
          {res?.needsFamiliarity && (
            <div className="stack">
              <Segmented label={SUB.FAMILIARITY_Q} value={familiarity ?? ('' as Familiarity)} onChange={(v: Familiarity) => setFamiliarity(v)} options={[{ value: 'familiar', label: SUB.FAMILIARITY_YES }, { value: 'unfamiliar', label: SUB.FAMILIARITY_NO }]} />

            </div>
          )}
          {hasKg && (
            <>
              {(p.substitution?.prior || p.recommendation?.confidence === 'low') && <p className="small muted">Vikten är ett första förslag. Börja kontrollerat och justera vid behov.</p>}
              {p.kg === null && <p className="small muted">Välj en försiktig startvikt. Du kan ändra efter första setet.</p>}
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
          <details><summary>Använd bytet framöver</summary><Segmented label={SUB.SCOPE_LEGEND} value={scope} onChange={(v: ChoiceScope) => setScope(v)} options={[{ value: 'today', label: SUB.SCOPE_TODAY }, { value: 'future', label: SUB.SCOPE_FUTURE }]} />
          {scope === 'future' && <p className="small muted">{SUB.SCOPE_FUTURE_HELP}</p>}
          {scope === 'future' && goal && choice.to !== (from.substitutionFrom ?? from.exerciseId) && <p className="small muted">{SUB.GOAL_NOTE(rootName)}</p>}
          </details>
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
