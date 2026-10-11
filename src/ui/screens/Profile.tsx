import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Experience } from '../../domain/decision_engine';
import type { ExerciseId } from '../../domain/catalog';
import { ALL_EQUIPMENT, EQUIPMENT_LABEL_SV, OFFERED_CATALOG, exercise, type EquipmentSlug } from '../../domain/catalog';
import { formatKg, parseKg } from '../../domain/units';
import { patchProfile, removePermanentSubstitution, setActiveEquipmentProfile, setEstimate, updateExerciseSettings } from '../../application/profile';
import { Banner, PageHeader, Segmented, Stepper } from '../components/common';
import { FLAGS, useServices } from '../services';
import { EXPERIENCE_SV } from '../strings';

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
        <p className="small muted">Ändrad frekvens startar en ny programversion från i dag. Tidigare pass påverkas inte.</p>
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
  const [est, setEst] = useState('');
  const [estKind, setEstKind] = useState<'1rm' | '3rm'>('1rm');
  const g = (v: number | null | undefined) => (v == null ? '' : formatKg(v));
  const parse = (v: string) => (v.trim() === '' ? null : parseKg(v));
  return (
    <div className="page stack">
      <PageHeader title="Övningar" back={() => nav(-1)} />
      <div className="field">
        <label htmlFor="es-ex">Övning</label>
        <select id="es-ex" value={ex} onChange={(e) => { setEx(e.target.value as ExerciseId); setInc(''); setMax(''); setEst(''); setMsg(null); }}>
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
      {lk === 'external_kg' && (
        <form className="card stack" onSubmit={async (e) => {
          e.preventDefault();
          const p = parseKg(est);
          if (!p.ok || p.grams <= 0) return setMsg('Ange vikt, t.ex. 100');
          await setEstimate(ctx, { exerciseId: ex, kind: estKind, grams: p.grams });
          setEst('');
          setMsg('Uppskattningen sparad. Påverkar bara nya föreskrifter.');
        }}>
          <h2>Uppskattad maxstyrka</h2>
          <p className="small muted">Nu: {s?.estimateGrams != null ? `${formatKg(s.estimateGrams)} kg (${s.estimateKind?.toUpperCase()})` : 'ingen – kalibrering används'}.</p>
          <Segmented label="Typ" value={estKind} onChange={setEstKind} options={[{ value: '1rm', label: '1RM' }, { value: '3rm', label: '3RM' }]} />
          <div className="field">
            <label htmlFor="es-est">{unit === 'kg' ? 'Kg' : 'Kg per hantel'}</label>
            <input id="es-est" type="text" inputMode="decimal" value={est} onChange={(e) => setEst(e.target.value)} />
          </div>
          <button type="submit" className="btn">Spara uppskattning</button>
        </form>
      )}
      {lk === 'assistance_kg' && (
        <p className="small muted">Assistans räknas aldrig om till skivstångsvikt. Startvärdet väljer du själv första gången.</p>
      )}
    </div>
  );
}
