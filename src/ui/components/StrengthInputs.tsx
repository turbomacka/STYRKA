import { useId, useState } from 'react';
import { formatKg, parseKg } from '../../domain/units';
import { resolveStrengthInputs, validStrengthDate, type StrengthInput } from '../../domain/strengthInputs';

export type StrengthDraft = { kind: StrengthInput['kind']; kg: string; reps: string; rir: string; testedAt: string; measured: boolean };
export const STRENGTH_LABELS = { '1rm': 'Max för 1 repetition', '3rm': 'Max för 3 repetitioner', submax: 'Ett vanligt träningsset' };
export const strengthDraft = (s: StrengthInput): StrengthDraft => ({ kind: s.kind, kg: formatKg(s.grams), reps: s.reps === null ? '' : String(s.reps), rir: s.rir === null ? '' : String(s.rir), testedAt: s.testedAt ?? '', measured: s.measured });

export function readStrengthDrafts(drafts: StrengthDraft[], today: string): { inputs: StrengthInput[]; error: string | null } {
  const inputs: StrengthInput[] = [];
  for (const d of drafts) {
    const weight = parseKg(d.kg);
    if (!weight.ok || weight.grams <= 0 || weight.grams > 500_000) return { inputs: [], error: 'Ange en vikt över 0 och högst 500 kg.' };
    if (d.kind === 'submax' && !/^[1-8]$/.test(d.reps)) return { inputs: [], error: 'Ange 1–8 repetitioner för träningssetet.' };
    if (d.kind === 'submax' && d.rir !== '' && !/^[0-3]$/.test(d.rir)) return { inputs: [], error: 'Ange 0–3 repetitioner kvar eller välj Vet inte.' };
    if (d.testedAt && (!validStrengthDate(d.testedAt) || d.testedAt > today)) return { inputs: [], error: 'Ange ett giltigt datum som inte ligger i framtiden.' };
    inputs.push({ kind: d.kind, grams: weight.grams, reps: d.kind === 'submax' ? Number(d.reps) : null, rir: d.kind === 'submax' && d.rir !== '' ? Number(d.rir) : null, testedAt: d.testedAt || null, measured: d.kind === '1rm' && d.measured });
  }
  return { inputs, error: null };
}

/** Each fixed-kind row owns its values. Adding another observation never reinterprets an existing weight. */
export function StrengthInputs({ drafts, onChange, today, unit = 'kg', allowSkip = false }: {
  drafts: StrengthDraft[]; onChange: (drafts: StrengthDraft[]) => void; today: string; unit?: string; allowSkip?: boolean;
}) {
  const id = useId();
  const [adding, setAdding] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const result = readStrengthDrafts(drafts, today);
  const resolution = result.error ? null : resolveStrengthInputs(result.inputs);
  const available = (Object.keys(STRENGTH_LABELS) as StrengthInput['kind'][]).filter((kind) => !drafts.some((d) => d.kind === kind));
  return <div className="stack">
    {drafts.map((d, i) => {
      const prefix = `${id}-${d.kind}`;
      const update = (patch: Partial<StrengthDraft>) => onChange(drafts.map((row, index) => index === i ? { ...row, ...patch } : row));
      return <fieldset key={d.kind} className="strength-entry stack">
        <legend>{STRENGTH_LABELS[d.kind]}</legend>
        <div className="field">
          <label htmlFor={`${prefix}-kg`}>Vikt ({unit})</label>
          <input id={`${prefix}-kg`} type="text" inputMode="decimal" value={d.kg} onChange={(e) => update({ kg: e.target.value })} />
        </div>
        {d.kind === 'submax' && <>
          <div className="field">
            <label htmlFor={`${prefix}-reps`}>Repetitioner (1–8)</label>
            <input id={`${prefix}-reps`} type="text" inputMode="numeric" value={d.reps} onChange={(e) => update({ reps: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-rir`}>Hur många fler repetitioner hade du kunnat göra?</label>
            <select id={`${prefix}-rir`} value={d.rir} onChange={(e) => update({ rir: e.target.value })}>
              <option value="">Vet inte</option>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n} kvar</option>)}
            </select>
          </div>
          {d.rir === '' && <p className="small muted">Setet sparas. Utan uppgift om repetitioner kvar räknar vi inte om det till maxstyrka.</p>}
        </>}
        {d.kind === '1rm' && <label className="check"><input type="checkbox" checked={d.measured} onChange={(e) => update({ measured: e.target.checked })} /><span>Jag har faktiskt lyft vikten, den är inte gissad</span></label>}
        <div className="field">
          <label htmlFor={`${prefix}-date`}>När gjorde du det? (valfritt)</label>
          <input id={`${prefix}-date`} type="date" max={today} value={d.testedAt} onChange={(e) => update({ testedAt: e.target.value })} />
        </div>
        <button type="button" className="btn ghost" aria-label={`Ta bort ${STRENGTH_LABELS[d.kind].toLowerCase()}`} onClick={() => onChange(drafts.filter((_, index) => index !== i))}>Ta bort uppgiften</button>
      </fieldset>;
    })}
    {available.length > 0 && (adding || drafts.length === 0 ? <div className="stack" role="group" aria-label="Välj uppgift att lägga till">
      <p className="small muted">Välj en uppgift du känner till. Du kan lägga till fler efteråt.</p>
      {available.map((kind) => <button key={kind} type="button" className="btn block" onClick={() => {
        onChange([...drafts, { kind, kg: '', reps: '', rir: '', testedAt: '', measured: false }]); setAdding(false); setSkipped(false);
      }}>{STRENGTH_LABELS[kind]}</button>)}
    </div> : <button type="button" className="btn block" onClick={() => setAdding(true)}>Lägg till ytterligare en uppgift</button>)}
    {result.error && <p className="error-text" role="alert">{result.error} Du kan också ta bort uppgiften eller hoppa över.</p>}
    {resolution && resolution.used > 0 && <p className="small muted" role="status">
      {resolution.disagreement ? 'Uppgifterna skiljer sig tydligt. Den lägre uppskattningen används för en försiktigare start.' : resolution.used > 1 ? `${resolution.used} uppgifter vägs samman till ett underlag för startvikten.` : 'En uppgift används som underlag för startvikten.'}
      {resolution.excluded > 0 && ' Övriga uppgifter sparas, men äldre eller odaterade värden och set utan repetitioner kvar ingår inte i denna beräkning.'}
    </p>}
    {resolution && drafts.length > 0 && resolution.used === 0 && <p className="small muted">Du väljer själv startvikt första gången. Vi anpassar sedan förslagen efter det du loggar.</p>}
    {allowSkip && <button type="button" className="btn ghost block" onClick={() => { onChange([]); setSkipped(true); setAdding(false); }}>Hoppa över – jag vet inte</button>}
    {skipped && <p className="small muted" role="status">Du väljer startvikt på gymmet. Uppgifter kan läggas till senare under Profil.</p>}
  </div>;
}
