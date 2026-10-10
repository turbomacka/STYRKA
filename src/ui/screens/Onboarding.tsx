import { useId, useState } from 'react';
import type { ExerciseId, Experience } from '../../domain/decision_engine';
import { ALL_EQUIPMENT, EQUIPMENT_LABEL_SV, exercise, type EquipmentSlug } from '../../domain/catalog';
import { formatKg, parseKg } from '../../domain/units';
import { completeOnboarding, DEFAULT_PROFILE, GYM_STANDARD, type EstimateInput, type NewRestriction } from '../../application/profile';
import { Banner, Segmented, Stepper } from '../components/common';
import { ConsentPanel, RestrictionPicker } from '../components/widgets';
import { useServices } from '../services';
import { EXPERIENCE_SV } from '../strings';

type EstKind = 'none' | '1rm' | '3rm' | 'submax';
type EstDraft = { kind: EstKind; kg: string; reps: string; rir: string };
const LIFTS: ExerciseId[] = ['squat', 'bench_press', 'deadlift'];

/** S02–S05: fyra korta steg, endast det nödvändiga är obligatoriskt; maxlyft krävs aldrig (41). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { ctx } = useServices();
  const [step, setStep] = useState(1);
  const [adult, setAdult] = useState(false);
  const [freq, setFreq] = useState(DEFAULT_PROFILE.plannedSessionsPerWeek);
  const [minutes, setMinutes] = useState(DEFAULT_PROFILE.minutesPerSession);
  const [exp, setExp] = useState<Experience>(DEFAULT_PROFILE.experience);
  const [equipment, setEquipment] = useState<EquipmentSlug[]>(GYM_STANDARD);
  const [goals, setGoals] = useState<Record<string, number>>({ squat: 1, bench_press: 1, deadlift: 1 });
  const [pull, setPull] = useState<'lat_pulldown' | 'assisted_pullup' | 'pullup'>('lat_pulldown');
  const [est, setEst] = useState<Record<string, EstDraft>>(Object.fromEntries(LIFTS.map((l) => [l, { kind: 'none', kg: '', reps: '', rir: '' }])));
  const [consent, setConsent] = useState(false);
  const [rules, setRules] = useState<NewRestriction[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  const estError = (d: EstDraft): string | null => {
    if (d.kind === 'none') return null;
    const p = parseKg(d.kg);
    if (!p.ok || p.grams <= 0) return 'Ange vikt, t.ex. 82,5';
    if (d.kind === 'submax' && !/^[1-8]$/.test(d.reps)) return 'Ange 1–8 repetitioner';
    return null;
  };

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const estimates: EstimateInput[] = LIFTS.filter((l) => est[l].kind !== 'none').map((l) => {
        const d = est[l];
        const p = parseKg(d.kg);
        return { exerciseId: l, kind: d.kind as '1rm' | '3rm' | 'submax', grams: p.ok ? p.grams : 0, reps: d.kind === 'submax' ? Number(d.reps) : null, rir: d.kind === 'submax' && d.rir !== '' ? Number(d.rir) : null };
      });
      await completeOnboarding(ctx, {
        adultConfirmed: adult,
        plannedSessionsPerWeek: freq,
        minutesPerSession: minutes,
        experience: exp,
        equipment,
        goals,
        substitutions: pull === 'lat_pulldown' ? {} : { lat_pulldown: pull },
        estimates,
        healthConsent: consent,
        restrictions: rules.filter((r) => consent || !r.area),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm',
      });
      onDone();
    } catch (e) {
      setError((e as { code?: string }).code === 'LOCAL_SAVE_FAILED' ? 'Kunde inte spara på enheten. Försök igen.' : 'Något i uppgifterna behöver rättas.');
    } finally {
      setBusy(false);
    }
  }

  const canNext = step === 1 ? adult : step === 2 ? equipment.length > 0 : step === 3 ? LIFTS.every((l) => !estError(est[l])) : true;

  return (
    <main className="shell">
      <div className="page full stack">
        <p className="label" aria-live="polite">
          Intro {step}/4
        </p>
        <div className="progress" aria-hidden="true">
          <div style={{ width: `${step * 25}%` }} />
        </div>
        {step === 1 && (
          <section className="stack" aria-labelledby={`${uid}-h1`}>
            <h1 id={`${uid}-h1`}>Hur vill du träna?</h1>
            <div className="card stack">
              <Stepper label="Pass per vecka" value={freq} min={1} max={7} onChange={setFreq} />
              <Stepper label="Minuter per pass" value={minutes} min={15} max={120} step={5} onChange={setMinutes} format={(v) => `${v} min`} />
              <Segmented label="Erfarenhet av styrketräning" value={exp} onChange={setExp} options={(Object.keys(EXPERIENCE_SV) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_SV[v] }))} />
            </div>
            <label className="check card">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              <span>Jag bekräftar att jag är vuxen (18 år eller äldre).</span>
            </label>
          </section>
        )}
        {step === 2 && (
          <section className="stack" aria-labelledby={`${uid}-h2`}>
            <h1 id={`${uid}-h2`}>Utrustning och prioriteringar</h1>
            <fieldset className="card">
              <legend className="label">Tillgänglig utrustning (förvalt: standardgym)</legend>
              {ALL_EQUIPMENT.map((e) => (
                <label key={e} className="check">
                  <input type="checkbox" checked={equipment.includes(e)} onChange={(ev) => setEquipment(ev.target.checked ? [...equipment, e] : equipment.filter((x) => x !== e))} />
                  <span>{EQUIPMENT_LABEL_SV[e]}</span>
                </label>
              ))}
            </fieldset>
            <div className="card stack">
              <span className="label">Prioritet för huvudlyften (0 = ingen, 3 = högst)</span>
              {LIFTS.map((l) => (
                <Stepper key={l} label={exercise(l).nameSv} value={goals[l]} min={0} max={3} onChange={(v) => setGoals({ ...goals, [l]: v })} />
              ))}
            </div>
            <div className="card">
              <Segmented label="Vertikalt drag" value={pull} onChange={setPull} options={[{ value: 'lat_pulldown', label: 'Latsdrag' }, { value: 'assisted_pullup', label: 'Assisterade chins' }, { value: 'pullup', label: 'Chins' }]} />
            </div>
          </section>
        )}
        {step === 3 && (
          <section className="stack" aria-labelledby={`${uid}-h3`}>
            <h1 id={`${uid}-h3`}>Nuvarande styrka</h1>
            <p className="muted">Inga maxlyft krävs. Vet du inte – välj kalibrering, så hittar vi en lämplig vikt tillsammans i gymmet.</p>
            {LIFTS.map((l) => {
              const d = est[l];
              const err = estError(d);
              const set = (patch: Partial<EstDraft>) => setEst({ ...est, [l]: { ...d, ...patch } });
              const p = parseKg(d.kg);
              const e1 = p.ok && d.kind === '3rm' ? formatKg(Math.round(p.grams * 1.1)) : null;
              return (
                <div key={l} className="card stack">
                  <h2>{exercise(l).nameSv}</h2>
                  <Segmented label="Uppgift" value={d.kind} onChange={(kind) => set({ kind })} options={[{ value: 'none', label: 'Kalibrera' }, { value: '1rm', label: '1RM' }, { value: '3rm', label: '3RM' }, { value: 'submax', label: 'Set' }]} />
                  {d.kind !== 'none' && (
                    <div className="field">
                      <label htmlFor={`${uid}-${l}-kg`}>{d.kind === 'submax' ? 'Vikt i ett nyligen utfört set (kg)' : d.kind === '3rm' ? 'Max för tre tekniskt godkända reps (kg)' : 'Max för en repetition (kg)'}</label>
                      <input id={`${uid}-${l}-kg`} type="text" inputMode="decimal" value={d.kg} onChange={(e) => set({ kg: e.target.value })} aria-invalid={!!err} />
                    </div>
                  )}
                  {d.kind === 'submax' && (
                    <div className="row">
                      <div className="field grow">
                        <label htmlFor={`${uid}-${l}-r`}>Reps (1–8)</label>
                        <input id={`${uid}-${l}-r`} type="text" inputMode="numeric" value={d.reps} onChange={(e) => set({ reps: e.target.value })} />
                      </div>
                      <div className="field grow">
                        <label htmlFor={`${uid}-${l}-rir`}>Reps kvar (0–3)</label>
                        <select id={`${uid}-${l}-rir`} value={d.rir} onChange={(e) => set({ rir: e.target.value })}>
                          <option value="">Vet inte</option>
                          {[0, 1, 2, 3].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {err && d.kg !== '' && (
                    <p className="error-text" role="alert">
                      {err}
                    </p>
                  )}
                  <p className="small muted">
                    {d.kind === 'none' && 'Säkerhet: okänd – du väljer själv vikten första gången.'}
                    {d.kind === '1rm' && 'Säkerhet: medel (om inte nyligen uppmätt).'}
                    {d.kind === '3rm' && `Säkerhet: medel. Uppskattad maxstyrka ≈ ${e1 ?? '–'} kg (alltid ungefärlig).`}
                    {d.kind === 'submax' && (d.rir === '' ? 'Utan reps kvar används setet bara som arbetsvikt, inte som uppskattning.' : 'Säkerhet: låg.')}
                  </p>
                </div>
              );
            })}
          </section>
        )}
        {step === 4 && (
          <section className="stack" aria-labelledby={`${uid}-h4`}>
            <h1 id={`${uid}-h4`}>Begränsningar (frivilligt)</h1>
            <p className="muted">Hoppa gärna över. Du kan alltid lägga till eller ändra senare under Profil.</p>
            <ConsentPanel granted={consent} onChange={setConsent} />
            {rules.length > 0 && (
              <ul className="list card">
                {rules.map((r, i) => (
                  <li key={i} className="row spread">
                    <span>
                      {r.kind === 'block_exercise' && `Föreslå aldrig ${r.exerciseA ? exercise(r.exerciseA).nameSv : 'övningar i området'}`}
                      {r.kind === 'block_pair_heavy' && `Aldrig tung ${exercise(r.exerciseA!).nameSv} + tung ${exercise(r.exerciseB!).nameSv}`}
                      {r.kind === 'limit_sets' && `Högst ${r.maxSets} set ${r.exerciseA ? exercise(r.exerciseA).nameSv : ''}`}
                      {r.kind === 'limit_mode' && `Högst ${r.maxMode === 'light' ? 'lätt' : 'medel'} ${r.exerciseA ? exercise(r.exerciseA).nameSv : ''}`}
                      {r.kind === 'region_note' && 'Notering om problemområde'}
                    </span>
                    <button type="button" className="btn ghost" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
                      Ta bort
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {adding ? (
              <RestrictionPicker
                consent={consent}
                onCancel={() => setAdding(false)}
                onSave={async (r) => {
                  if (r.area && !consent) throw Object.assign(new Error(), { code: 'PRIVACY_CONSENT_REQUIRED' });
                  if (r.kind === 'block_pair_heavy' && (!r.exerciseA || !r.exerciseB || r.exerciseA === r.exerciseB)) throw new Error();
                  if ((r.kind === 'block_exercise' || r.kind === 'limit_sets' || r.kind === 'limit_mode') && !r.exerciseA && !r.area) throw new Error();
                  setRules([...rules, r]);
                  setAdding(false);
                }}
              />
            ) : (
              <button type="button" className="btn block" onClick={() => setAdding(true)}>
                Lägg till regel
              </button>
            )}
            {error && <Banner kind="danger">{error}</Banner>}
          </section>
        )}
        <div className="bottom-cta row">
          {step > 1 && (
            <button type="button" className="btn big grow" onClick={() => setStep(step - 1)}>
              Tillbaka
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn primary big grow" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Nästa
            </button>
          ) : (
            <button type="button" className="btn primary big grow" disabled={busy} onClick={finish}>
              {rules.length || consent ? 'Klar' : 'Hoppa över och börja'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
