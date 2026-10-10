import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ALL_AREAS, AREA_LABEL_SV, type Area } from '../../domain/catalog';
import type { Readiness } from '../../domain/model';
import { Banner, PageHeader, Segmented, Stepper } from '../components/common';
import { useServices } from '../services';
import { READINESS_SV, T } from '../strings';

/** S10 Spontanpass: minuter + dagsform, därefter förslag (S07 i extra-läge). Standardval ⇒ 3 tryck från Idag. */
export function Spontaneous() {
  const { ctx } = useServices();
  const nav = useNavigate();
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<Readiness>('normal');
  const [areas, setAreas] = useState<Area[]>([]);
  const m = minutes ?? profile?.minutesPerSession ?? 40;
  return (
    <div className="page full stack">
      <PageHeader title={T.CTA_EXTRA} back={() => nav(-1)} />
      <p className="muted">Ett extra pass utöver din plan. Det räknas in i din belastningshistorik men ersätter inte nästa ordinarie pass om du inte själv väljer det.</p>
      <div className="card stack">
        <Stepper label="Tid" value={m} min={15} max={120} step={5} onChange={setMinutes} format={(v) => `${v} min`} />
        <Segmented label="Dagsform" value={readiness} onChange={setReadiness} options={(Object.keys(READINESS_SV) as Readiness[]).map((v) => ({ value: v, label: READINESS_SV[v] }))} />
      </div>
      {readiness === 'pain' && (
        <>
          <Banner kind="warn">{T.WARN_PAIN}</Banner>
          <fieldset className="card">
            <legend className="label">Var har du ont? Övningar som belastar området utesluts (sparas inte).</legend>
            {ALL_AREAS.filter((a) => a !== 'other').map((a) => (
              <label key={a} className="check">
                <input type="checkbox" checked={areas.includes(a)} onChange={(e) => setAreas(e.target.checked ? [...areas, a] : areas.filter((x) => x !== a))} />
                <span>{AREA_LABEL_SV[a]}</span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      <div className="bottom-cta">
        <button type="button" className="btn primary block big" onClick={() => nav('/forhandsvisning', { state: { kind: 'extra', minutes: m, readiness, painAreas: areas } })}>
          Visa förslag
        </button>
      </div>
    </div>
  );
}
