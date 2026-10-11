import { useEffect, useId, useState } from 'react';
import type { Mode } from '../../domain/decision_engine';
import type { ExerciseId } from '../../domain/catalog';
import { ALL_AREAS, AREA_LABEL_SV, CATALOG, OFFERED_CATALOG, V1_SLUGS, exercise, isAvailable, type Area, type EquipmentSlug } from '../../domain/catalog';
import type { PlannedExercise, RuleKind, Side } from '../../domain/model';
import { formatKg } from '../../domain/units';
import type { ConflictEntry } from '../../storage/db';
import type { NewRestriction } from '../../application/profile';
import { TEMPLATES } from '../../planner/planner';
import { MODE_SV, SIDE_SV, T } from '../strings';
import { Icon, LoadConfidence, ReasonPopover, Sheet } from './common';

export function prescriptionText(p: PlannedExercise): string {
  // Lastbas och "per sida" visas endast för övningar med definierad semantik (katalog 2.0.0); äldre data tolkas inte om.
  const perSide = exercise(p.exerciseId).unilateral && exercise(p.exerciseId).catalogSince !== '1.0.0' ? ' per sida' : '';
  const perHand = p.loadBasis === 'per_hand_kg' ? ' per hantel' : '';
  const reps = p.loadKind === 'duration_sec' ? `${p.targetSeconds ?? '?'} s` : `${p.reps} reps${perSide}`;
  const suggestion = p.calibrationSuggestionKg != null ? ` · osäkert förslag ${formatKg(Math.round(p.calibrationSuggestionKg * 1000))} kg${perHand}` : ' · välj vikt';
  const kg = p.loadKind === 'duration_sec' || p.loadKind === 'reps_only' ? '' : p.kg === null ? suggestion : p.loadKind === 'assistance_kg' ? ` · ${formatKg(Math.round(p.kg * 1000))} kg assistans` : p.loadKind === 'bodyweight_plus_kg' ? (p.kg === 0 ? ' · kroppsvikt' : ` · +${formatKg(Math.round(p.kg * 1000))} kg`) : ` · ${formatKg(Math.round(p.kg * 1000))} kg${perHand}`;
  return `${p.sets} × ${reps}${kg}`;
}

/** Övningskort i förhandsvisning (S07). */
export function LiftCard({ p, showRir, onSwap }: { p: PlannedExercise; showRir: boolean; onSwap?: () => void }) {
  return (
    <li className="card">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>{exercise(p.exerciseId).nameSv}</h3>
        <span className="chip">{MODE_SV[p.mode]}</span>
      </div>
      <p className="num" style={{ fontSize: 20, fontWeight: 700, margin: '6px 0' }}>
        {prescriptionText(p)}
      </p>
      <div className="row wrap small muted">
        <span>
          {T.INFO_RECOMMEND}: {p.bandMin === p.bandMax ? `${p.bandMin}` : `${p.bandMin}–${p.bandMax}`} reps per set
        </span>
        {showRir && p.mode === 'heavy' && <span>· sikta på 2–3 repetitioner kvar</span>}
        {p.kg !== null && <LoadConfidence confidence={p.confidence} />}
        {p.substitutionFrom && <span>· ersätter {exercise(p.substitutionFrom).nameSv}</span>}
      </div>
      <ReasonPopover reasons={p.reasons} />
      {onSwap && (
        <button type="button" className="btn ghost" onClick={onSwap} aria-label={`Byt övning: ${exercise(p.exerciseId).nameSv}`}>
          <Icon.Swap /> Byt övning
        </button>
      )}
    </li>
  );
}

/** Vilotimer efter loggat set. Tidsvärden från tidsmodellen (02 §7, H). Respekterar reducerad rörelse (ingen animation). */
export function RestTimer({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setLeft(Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))), 500);
    return () => clearInterval(t);
  }, [seconds]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="card row spread" role="timer" aria-live="off" aria-label={`Vila ${mm} minuter ${ss} sekunder kvar`}>
      <div>
        <div className="label">Vila</div>
        <div className="big-num num">{left === 0 ? 'Klar' : `${mm}:${ss}`}</div>
      </div>
      <button type="button" className="btn" onClick={onClose}>
        {left === 0 ? 'Stäng' : 'Hoppa över'}
      </button>
    </div>
  );
}

export function restSecondsFor(p: PlannedExercise): number {
  const kind = exercise(p.exerciseId).timeKind;
  const min = kind === 'barbell_compound' ? (p.mode === 'heavy' ? 2.5 : 1.5) : kind === 'isolation' ? 1 : 1.5;
  return Math.round(min * 60);
}

/** S09: likvärdiga rörelsemönster; otillgängliga markeras med skäl. */
export function ExerciseSwapSheet({ current, equipment, blocked, onPick, onClose }: { current: ExerciseId; equipment: EquipmentSlug[]; blocked: (id: ExerciseId) => string | null; onPick: (id: ExerciseId) => void; onClose: () => void }) {
  const cur = exercise(current);
  const family = new Set<ExerciseId>([...((TEMPLATES.replacementFamilies[current] ?? []) as ExerciseId[]), ...Object.entries(TEMPLATES.replacementFamilies).filter(([, v]) => v.includes(current)).map(([k]) => k as ExerciseId)]);
  const candidates = CATALOG.filter((c) => V1_SLUGS.has(c.slug) && c.slug !== current && (c.pattern === cur.pattern || family.has(c.slug) || (cur.recoveryGroup !== 'own' && c.recoveryGroup === cur.recoveryGroup)));
  const eq = new Set(equipment);
  return (
    <Sheet title="Byt övning" onClose={onClose}>
      <p className="small muted">Liknande rörelser. Tidigare loggade set påverkas inte. Ersättning garanterar inte att övningen passar vid besvär.</p>
      <ul className="list">
        {candidates.map((c) => {
          const missing = !isAvailable(c.slug, eq) ? 'Utrustning saknas' : null;
          const why = missing ?? blocked(c.slug);
          return (
            <li key={c.slug} className="row spread">
              <div>
                <div style={{ fontWeight: 600 }}>{c.nameSv}</div>
                {why && <div className="small muted">{why}</div>}
              </div>
              <button type="button" className="btn" disabled={!!why} onClick={() => onPick(c.slug)} aria-label={`Välj ${c.nameSv}`}>
                Välj
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** S16: visar båda versionerna; användaren väljer. */
export function ConflictResolver({ conflict, onResolve }: { conflict: ConflictEntry; onResolve: (choice: 'mine' | 'server') => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const fmt = (v: Record<string, unknown>) => {
    if (conflict.recordType === 'profile') return `${v.planned_sessions_per_week ?? '?'} pass/vecka, ${v.minutes_per_session ?? '?'} min`;
    if (conflict.recordType === 'note') return String(v.body ?? '') || '(tom anteckning)';
    const kg = v.actualKg === null || v.actualKg === undefined ? '–' : `${String(v.actualKg).replace(/\.?0+$/, '').replace('.', ',')} kg`;
    const reps = v.actualReps ?? v.actualSeconds ?? '–';
    return `${kg} × ${reps}${v.deleted ? ' (borttaget)' : ''}${v.status && v.status !== 'done' ? ` (${v.status === 'planned' ? 'ångrat' : 'överhoppat'})` : ''}`;
  };
  const choose = async (c: 'mine' | 'server') => {
    setBusy(true);
    try {
      await onResolve(c);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack">
      <p>{conflict.recordType === 'profile' ? 'Dina inställningar har ändrats på en annan enhet. Välj vilken version du vill behålla.' : conflict.recordType === 'note' ? 'Din anteckning har ändrats på en annan enhet. Välj vilken version du vill behålla.' : T.WARN_CONFLICT}</p>
      <div className="row wrap">
        <div className="grow card">
          <div className="label">Den här enheten</div>
          <div className="num" style={{ fontWeight: 700 }}>{fmt(conflict.local)}</div>
        </div>
        <div className="grow card">
          <div className="label">Annan enhet (sparad)</div>
          <div className="num" style={{ fontWeight: 700 }}>{fmt(conflict.server)}</div>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn grow" disabled={busy} onClick={() => choose('server')}>
          Behåll sparad
        </button>
        <button type="button" className="btn primary grow" disabled={busy} onClick={() => choose('mine')}>
          Behåll min
        </button>
      </div>
    </div>
  );
}

/** S14: frivilliga, användardefinierade regler. Områdesval kräver hälsosamtycke. */
export function RestrictionPicker({ consent, onSave, onCancel }: { consent: boolean; onSave: (r: NewRestriction) => Promise<void>; onCancel: () => void }) {
  const uid = useId();
  const [kind, setKind] = useState<RuleKind>('block_exercise');
  const [a, setA] = useState<ExerciseId | ''>('');
  const [b, setB] = useState<ExerciseId | ''>('');
  const [area, setArea] = useState<Area | ''>('');
  const [side, setSide] = useState<Side>('not_applicable');
  const [maxSets, setMaxSets] = useState(2);
  const [maxMode, setMaxMode] = useState<Mode>('light');
  const [err, setErr] = useState<string | null>(null);
  const needsArea = kind === 'region_note';
  const save = async () => {
    setErr(null);
    try {
      await onSave({ kind, exerciseA: a || null, exerciseB: kind === 'block_pair_heavy' ? b || null : null, area: area || null, side: area ? side : null, maxSets: kind === 'limit_sets' ? maxSets : null, maxMode: kind === 'limit_mode' ? maxMode : null, active: true });
    } catch (e) {
      setErr((e as { code?: string }).code === 'PRIVACY_CONSENT_REQUIRED' ? 'Områdesuppgifter kräver ditt samtycke för hälsorelaterade uppgifter.' : 'Kontrollera valen – regeln är inte komplett.');
    }
  };
  const exSelect = (id: string, label: string, val: string, set: (v: ExerciseId | '') => void) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={val} onChange={(e) => set(e.target.value as ExerciseId | '')}>
        <option value="">{kind === 'block_exercise' || kind === 'limit_sets' || kind === 'limit_mode' ? (consent ? 'Välj övning (eller område nedan)' : 'Välj övning') : 'Välj övning'}</option>
        {OFFERED_CATALOG.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.nameSv}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="card stack">
      <div className="field">
        <label htmlFor={`${uid}-k`}>Typ av regel</label>
        <select id={`${uid}-k`} value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
          <option value="block_exercise">Föreslå aldrig en övning</option>
          <option value="block_pair_heavy">Aldrig två tunga övningar i samma pass</option>
          <option value="limit_sets">Högst antal set</option>
          <option value="limit_mode">Högst belastningsnivå</option>
          {consent && <option value="region_note">Notering om problemområde</option>}
        </select>
      </div>
      {kind !== 'region_note' && exSelect(`${uid}-a`, kind === 'block_pair_heavy' ? 'Första övningen' : 'Övning', a, setA)}
      {kind === 'block_pair_heavy' && exSelect(`${uid}-b`, 'Andra övningen', b, setB)}
      {kind === 'limit_sets' && (
        <div className="field">
          <label htmlFor={`${uid}-ms`}>Högst antal set</label>
          <select id={`${uid}-ms`} value={maxSets} onChange={(e) => setMaxSets(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      {kind === 'limit_mode' && (
        <div className="field">
          <label htmlFor={`${uid}-mm`}>Högst</label>
          <select id={`${uid}-mm`} value={maxMode} onChange={(e) => setMaxMode(e.target.value as Mode)}>
            <option value="light">{MODE_SV.light}</option>
            <option value="moderate">{MODE_SV.moderate}</option>
          </select>
        </div>
      )}
      {consent && kind !== 'block_pair_heavy' && (
        <>
          <div className="field">
            <label htmlFor={`${uid}-ar`}>{needsArea ? 'Område' : 'Eller gäller alla övningar som belastar området (valfritt)'}</label>
            <select id={`${uid}-ar`} value={area} onChange={(e) => setArea(e.target.value as Area | '')}>
              <option value="">{needsArea ? 'Välj område' : 'Inget område'}</option>
              {ALL_AREAS.map((x) => (
                <option key={x} value={x}>
                  {AREA_LABEL_SV[x]}
                </option>
              ))}
            </select>
          </div>
          {area && (
            <div className="field">
              <label htmlFor={`${uid}-sd`}>Sida</label>
              <select id={`${uid}-sd`} value={side} onChange={(e) => setSide(e.target.value as Side)}>
                {(Object.keys(SIDE_SV) as Side[]).map((s) => (
                  <option key={s} value={s}>
                    {SIDE_SV[s]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {!consent && (
        <p className="small muted">
          <Icon.Lock className="ico" /> Regler per område (t.ex. knä) kräver att du först ger samtycke för hälsorelaterade uppgifter.
        </p>
      )}
      {err && (
        <p className="error-text" role="alert">
          {err}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn grow" onClick={onCancel}>
          Avbryt
        </button>
        <button type="button" className="btn primary grow" onClick={save}>
          Spara regel
        </button>
      </div>
    </div>
  );
}

/** Separat, frivilligt och återkalleligt samtycke för hälsorelaterade uppgifter (03 §4). Juridisk text kräver granskning (G5). */
export function ConsentPanel({ granted, onChange }: { granted: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="card stack">
      <h3>Hälsorelaterade uppgifter (frivilligt)</h3>
      <p className="small">
        Om du vill kan du registrera problemområden och besvär efter pass. Då pausar appen automatisk ökning för berörda övningar. Uppgifterna används bara för dina egna förslag, delas inte och kan raderas separat när som helst. Utan samtycke fungerar appen ändå, och du kan fortfarande blockera enskilda övningar.
      </p>
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={granted} onChange={(e) => onChange(e.target.checked)} />
        <span>Jag samtycker till att STYRKA sparar hälsorelaterade uppgifter som jag själv anger.</span>
      </label>
      <p className="small muted">Utkast till samtyckestext – kräver juridisk granskning före extern pilot.</p>
    </div>
  );
}
