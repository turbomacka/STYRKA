import { TrainingPreferencesControl } from '../components/TrainingFlow';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Experience } from '../../domain/decision_engine';
import type { ExerciseId } from '../../domain/catalog';
import { ALL_EQUIPMENT, EQUIPMENT_LABEL_SV, OFFERED_CATALOG, exercise, type EquipmentSlug } from '../../domain/catalog';
import { formatKg, parseKg } from '../../domain/units';
import { patchProfile, removePermanentSubstitution, setActiveEquipmentProfile, setStrengthInputs, strengthInputsFromSettings, updateExerciseSettings } from '../../application/profile';
import { Banner, PageHeader, Segmented, Stepper } from '../components/common';
import { FLAGS, useServices } from '../services';
import { EXPERIENCE_SV } from '../strings';
import type { LocalExerciseSettings } from '../../storage/db';
import { StrengthInputs, readStrengthDrafts, strengthDraft } from '../components/StrengthInputs';
import { Appearance } from '../components/Appearance';
import { LoadSourceChoice } from '../components/LoadSourceChoice';
import { trainingPreferences } from '../../domain/trainingFlow';
import '../onboarding.css';

/** S13 Profil: frekvens, minuter, nivå, utrustning, variant. Ändringar gäller endast kommande pass. */
export function Profile() {
  const { ctx, email } = useServices();
  const p = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const [msg, setMsg] = useState<string | null>(null);
  if (!p) return <p className="page" aria-busy="true">Laddar…</p>;
  const save = async (changes: Parameters<typeof patchProfile>[1]) => {
    try {
      await patchProfile(ctx, changes);
      setMsg('Sparat. Gäller från nästa pass.');
    } catch {
      setMsg('Kunde inte spara ändringen.');
    }
  };
  const pull = (p.substitutions.lat_pulldown ?? 'lat_pulldown') as 'lat_pulldown' | 'assisted_pullup' | 'pullup';
  // Permanenta byten ("Använd framöver"); vertikalt drag har egen kontroll ovan.
  const permanent = (Object.entries(p.substitutions) as Array<[ExerciseId, ExerciseId | undefined]>).filter(([from, to]) => to && from !== 'lat_pulldown') as Array<[ExerciseId, ExerciseId]>;
  const machines = Object.entries(p.equipmentProfiles ?? {}) as Array<[ExerciseId, string]>;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
    } catch {
      setMsg('Kunde inte spara ändringen.');
    }
  };
  return (
    <div className="page stack">
      <h1>Profil</h1>
      {email && <p className="muted small">Inloggad som {email}</p>}
      <div aria-live="polite">{msg && <Banner kind="info">{msg}</Banner>}</div>
      <div className="card stack">
        <Stepper label="Pass per vecka" value={p.plannedSessionsPerWeek} min={1} max={7} onChange={(v) => save({ plannedSessionsPerWeek: v })} />
        <p className="small muted">Ändrat antal pass gäller från i dag. Tidigare pass påverkas inte.</p>
        <Stepper label="Minuter per pass" value={p.minutesPerSession} min={15} max={120} step={5} onChange={(v) => save({ minutesPerSession: v })} format={(v) => `${v} min`} />
        <Segmented label="Erfarenhet" value={p.experience} onChange={(v: Experience) => save({ experience: v })} options={(Object.keys(EXPERIENCE_SV) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_SV[v] }))} />
        <Segmented label="Vertikalt drag" value={pull} onChange={(v) => save({ substitutions: { ...p.substitutions, lat_pulldown: v === 'lat_pulldown' ? undefined : v } })} options={[{ value: 'lat_pulldown', label: 'Latsdrag' }, { value: 'assisted_pullup', label: 'Assisterade chins' }, { value: 'pullup', label: 'Chins' }]} />
      </div>
      {FLAGS.substitutionV2 && (permanent.length > 0 || machines.length > 0) && (
        <section className="card stack" aria-labelledby="bytta-ovningar">
          <h2 id="bytta-ovningar">Bytta övningar</h2>
          <p className="small muted">Gäller kommande pass. Tidigare pass och din historik ändras inte.</p>
          {permanent.length > 0 && (
            <ul className="list">
              {permanent.map(([from, to]) => (
                <li key={from} className="row spread wrap">
                  <span>
                    {exercise(from).nameSv} → <strong>{exercise(to).nameSv}</strong>
                  </span>
                  <button type="button" className="btn" onClick={() => act(() => removePermanentSubstitution(ctx, from), `${exercise(from).nameSv} är återställd från nästa pass.`)}>
                    Återställ {exercise(from).nameSv.toLowerCase()}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {machines.length > 0 && (
            <ul className="list" aria-label="Maskinprofiler">
              {machines.map(([ex, key]) => (
                <li key={ex} className="row spread wrap">
                  <span>
                    {exercise(ex).nameSv}: maskin <strong>{key}</strong>
                  </span>
                  <button type="button" className="btn" onClick={() => act(() => setActiveEquipmentProfile(ctx, ex, 'default'), 'Standardmaskinen används från nästa pass.')}>
                    Använd standardmaskin
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <fieldset className="card">
        <legend className="label">Utrustning</legend>
        {ALL_EQUIPMENT.map((e) => (
          <label key={e} className="check">
            <input type="checkbox" checked={p.equipment.includes(e)} onChange={(ev) => {
              const next: EquipmentSlug[] = ev.target.checked ? [...p.equipment, e] : p.equipment.filter((x) => x !== e);
              if (next.length) void save({ equipment: next });
            }} />
            <span>{EQUIPMENT_LABEL_SV[e]}</span>
          </label>
        ))}
      </fieldset>
      <nav className="card" aria-label="Fler inställningar">
        <ul className="list">
          <li><Link to="/profil/ovningar">Övningar: nivå, viktsteg och maxvärden</Link></li>
          <li><Link to="/profil/begransningar">Begränsningar och hälsouppgifter</Link></li>
          <li><Link to="/synk">Synkstatus</Link></li>
          <li><Link to="/profil/data">Data och konto</Link></li>
          <li><Link to="/integritet">Integritet</Link></li>
        </ul>
      </nav>
      <section className="card stack"><h2>Underlag för viktförslag</h2><LoadSourceChoice profile value={p.trainingPreferences?.loadRecommendationSource ?? 'strength_inputs'} onChange={(loadRecommendationSource) => save({ trainingPreferences: trainingPreferences({ ...p.trainingPreferences, loadRecommendationSource }) })} /><p className="small muted">Gäller kommande pass. Sparade styrkeuppgifter och tidigare pass finns kvar.</p></section>
      <section className="card stack"><h2>Under träningspasset</h2><TrainingPreferencesControl /></section>
        <Appearance />
      <section className="card" aria-labelledby="om-styrka">
        <h2 id="om-styrka">Om STYRKA</h2>
        <ul className="list">
          <li><Link to="/vetenskap">Vetenskap och metoder</Link></li>
        </ul>
      </section>
    </div>
  );
}

/** Övningsspecifika inställningar: nivå, viktsteg (maskin/stång), maxlasttak, uppskattning. */
export function ExerciseSettingsScreen() {
  const { ctx } = useServices();
  const nav = useNavigate();
  const settings = useLiveQuery(() => ctx.db.exerciseSettings.toArray(), [ctx]);
  const [ex, setEx] = useState<ExerciseId>('squat');
  const [msg, setMsg] = useState<string | null>(null);
  const s = settings?.find((x) => x.exerciseId === ex);
  const lk = exercise(ex).loadKind;
  const unit = exercise(ex).loadDisplayBasis === 'per_hand_kg' ? 'kg per hantel' : 'kg';
  const [inc, setInc] = useState('');
  const [max, setMax] = useState('');
  const g = (v: number | null | undefined) => (v == null ? '' : formatKg(v));
  const parse = (v: string) => (v.trim() === '' ? null : parseKg(v));
  return (
    <div className="page stack">
      <PageHeader title="Övningar" back={() => nav(-1)} />
      <div className="field">
        <label htmlFor="es-ex">Övning</label>
        <select id="es-ex" value={ex} onChange={(e) => { setEx(e.target.value as ExerciseId); setInc(''); setMax(''); setMsg(null); }}>
          {OFFERED_CATALOG.map((c) => (
            <option key={c.slug} value={c.slug}>{c.nameSv}</option>
          ))}
        </select>
      </div>
      <div aria-live="polite">{msg && <Banner kind="info">{msg}</Banner>}</div>
      <div className="card stack">
        <Segmented label="Nivå för övningen" value={s?.experience ?? 'default'} onChange={async (v) => { await updateExerciseSettings(ctx, ex, { experience: v === 'default' ? null : (v as Experience) }); setMsg('Sparat.'); }} options={[{ value: 'default', label: 'Som profil' }, ...(Object.keys(EXPERIENCE_SV) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_SV[v] }))]} />
        {lk !== 'duration_sec' && (
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            const pi = parse(inc), pm = parse(max);
            if ((pi && !pi.ok) || (pm && !pm.ok)) return setMsg('Kontrollera värdena.');
            try {
              await updateExerciseSettings(ctx, ex, { ...(pi ? { incrementGrams: pi.ok ? pi.grams : null } : {}), ...(pm ? { maxLoadGrams: pm.ok ? pm.grams : null } : {}) });
              setMsg('Sparat. Gäller från nästa pass.');
            } catch { setMsg('Viktsteg måste vara större än 0 och högst 10 kg.'); }
          }}>
            <div className="field">
              <label htmlFor="es-inc">Minsta viktsteg (kg) – nu {g(s?.incrementGrams) || formatKg(exercise(ex).defaultIncrementKg * 1000)}</label>
              <input id="es-inc" type="text" inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} placeholder="t.ex. 1,25" />
            </div>
            {lk === 'external_kg' && (
              <div className="field">
                <label htmlFor="es-max">Högsta vikt jag vill få föreslagen ({unit}, valfritt) – nu {g(s?.maxLoadGrams) || 'ingen'}</label>
                <input id="es-max" type="text" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
              </div>
            )}
            <button type="submit" className="btn">Spara</button>
          </form>
        )}
      </div>
      {lk === 'external_kg' && settings !== undefined && <SavedStrengthInputs key={ex} exerciseId={ex} settings={s} unit={unit} />}
      {lk === 'assistance_kg' && (
        <p className="small muted">Assistans räknas aldrig om till skivstångsvikt. Startvärdet väljer du själv första gången.</p>
      )}
    </div>
  );
}

function SavedStrengthInputs({ exerciseId, settings, unit }: { exerciseId: ExerciseId; settings?: LocalExerciseSettings; unit: string }) {
  const { ctx } = useServices();
  const [drafts, setDrafts] = useState(() => strengthInputsFromSettings(settings).map(strengthDraft));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = ctx.clock.now().slice(0, 10);
  const result = readStrengthDrafts(drafts, today);
  return <form className="card stack" onSubmit={async (event) => {
    event.preventDefault();
    if (result.error) return;
    setBusy(true);
    try {
      await setStrengthInputs(ctx, exerciseId, result.inputs);
      setMessage('Styrkeuppgifterna sparade. Tidigare pass ändras inte.');
    } catch { setMessage('Kunde inte spara uppgifterna. Försök igen.'); }
    finally { setBusy(false); }
  }}>
    <h2>Styrkeuppgifter (frivilligt)</h2>
    <p className="small muted">Ett värde räcker. Fler uppgifter sparas var för sig och kan hjälpa oss att föreslå en startvikt. Ta bort alla och spara om du vill välja startvikt själv.</p>
    <StrengthInputs drafts={drafts} onChange={(next) => { setDrafts(next); setMessage(null); }} today={today} unit={unit} />
    <button type="submit" className="btn primary block" disabled={busy || !!result.error}>Spara styrkeuppgifter</button>
    <div role="status">{message && <p>{message}</p>}</div>
  </form>;
}
