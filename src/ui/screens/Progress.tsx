import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExerciseId } from '../../domain/catalog';
import { CATALOG, exercise } from '../../domain/catalog';
import { formatKg } from '../../domain/units';
import { listSessions, performedVariants, strengthSeries, type SessionSummary, type StrengthSeries } from '../../application/history';
import { Segmented } from '../components/common';
import { ProgressChart } from '../components/ProgressChart';
import { useServices } from '../services';
import { STATUS_SV, T, TEMPLATE_SV } from '../strings';

type Range = '4v' | '12v' | 'alla';

/** S12 Utveckling: kurva per övning (mätt/beräknad skiljs), senaste pass, rekord, filter 4v/12v/alla. */
export function Progress() {
  const { ctx } = useServices();
  const performed = useLiveQuery(async () => [...new Set((await ctx.db.sets.toArray()).filter((s) => s.status === 'done' && !s.deleted).map((s) => s.exerciseId))], [ctx]);
  const setsVersion = useLiveQuery(() => ctx.db.sets.count(), [ctx]);
  const [ex, setEx] = useState<ExerciseId>('squat');
  const [range, setRange] = useState<Range>('12v');
  const [series, setSeries] = useState<StrengthSeries | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [variant, setVariant] = useState('default');
  const variants = useLiveQuery(() => performedVariants(ctx, ex), [ctx, ex, setsVersion]);

  useEffect(() => {
    if (performed && performed.length && !performed.includes(ex)) setEx(performed.includes('squat') ? 'squat' : performed[0]);
  }, [performed, ex]);

  useEffect(() => {
    const since = range === 'alla' ? undefined : new Date(Date.now() - (range === '4v' ? 28 : 84) * 86_400_000).toISOString();
    void strengthSeries(ctx, ex, since, variant).then(setSeries);
    void listSessions(ctx, { limit: 10 }).then(setSessions);
  }, [ctx, ex, range, setsVersion, variant]);

  useEffect(() => {
    if (variants && variants.length && !variants.includes(variant)) setVariant(variants[0]);
  }, [variants, variant]);

  const options = CATALOG.filter((c) => performed?.includes(c.slug));
  const perf = series?.points.filter((p) => p.source === 'performance') ?? [];
  const best = perf.length ? Math.max(...perf.map((p) => p.kg)) : null;
  const lk = exercise(ex).loadKind;
  const perHand = exercise(ex).loadDisplayBasis === 'per_hand_kg';
  const unit = lk === 'duration_sec' ? 's' : perHand ? 'kg/hantel' : 'kg';
  return (
    <div className="page stack">
      <h1>{T.TITLE_PR}</h1>
      {!options.length ? (
        <div className="card">
          <p>När du har genomfört pass visas din utveckling här.</p>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="pr-ex">Övning</label>
            <select id="pr-ex" value={ex} onChange={(e) => { setEx(e.target.value as ExerciseId); setVariant('default'); }}>
              {options.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nameSv}
                </option>
              ))}
            </select>
          </div>
          {variants && variants.length > 1 && (
            <Segmented label="Maskin (egna serier)" value={variant} onChange={setVariant} options={variants.map((v) => ({ value: v, label: v === 'default' ? 'Standard' : v }))} />
          )}
          <Segmented label="Period" value={range} onChange={setRange} options={[{ value: '4v', label: '4 veckor' }, { value: '12v', label: '12 veckor' }, { value: 'alla', label: 'Allt' }]} />
          <div className="card stack">
            <h2>{exercise(ex).nameSv}</h2>
            {series && <ProgressChart points={series.points} unit={unit} title={`Utveckling ${exercise(ex).nameSv}`} />}
            {series?.note && <p className="small muted">{series.note}</p>}
            {series?.comparable && <p className="small muted">{T.INFO_1RM} är en uppskattning, inte ett testat maxvärde. {T.INFO_ESTIMATE}</p>}
            {best !== null && lk !== 'assistance_kg' && (
              <p>
                <span className="label">Bästa {lk === 'duration_sec' ? 'tid' : 'arbetsset'} i perioden:</span> <span className="num">{lk === 'duration_sec' ? `${best} s` : `${formatKg(Math.round(best * 1000))} ${unit}`}</span>
              </p>
            )}
          </div>
        </>
      )}
      <section className="card">
        <h2>Senaste pass</h2>
        {sessions.length === 0 ? (
          <p className="muted">Inga avslutade pass ännu.</p>
        ) : (
          <ul className="list">
            {sessions.map((s) => (
              <li key={s.session.id}>
                <div className="row spread">
                  <strong>{s.session.kind === 'extra' ? 'Spontanpass' : (TEMPLATE_SV[s.session.templateKey ?? ''] ?? 'Pass')}</strong>
                  <span className="small muted">{new Date(s.session.startedAt ?? '').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
                <div className="small muted">
                  {STATUS_SV[s.session.status]} · {s.doneWorkSets} set · {s.exercises.map((e) => exercise(e.exerciseId).nameSv).join(', ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
