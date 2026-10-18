import { SessionTrainingHistory } from '../components/TrainingHistory';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExerciseId } from '../../domain/catalog';
import { CATALOG, exercise } from '../../domain/catalog';
import { formatKg } from '../../domain/units';
import { listSessions, trainingSeriesOptions, strengthSeries } from '../../application/history';
import { DeleteWorkout } from '../components/DeleteWorkout';
import { Segmented } from '../components/common';
import { ProgressChart } from '../components/ProgressChart';
import { BalanceSection } from '../components/BalanceSection';
import { useServices } from '../services';
import { STATUS_SV, T, TEMPLATE_SV } from '../strings';

type Range = '4v' | '12v' | 'alla';

/** S12 Utveckling: kurva per övning (mätt/beräknad skiljs), senaste pass, rekord, filter 4v/12v/alla. */
export function Progress() {
  const { ctx } = useServices();
  const performed = useLiveQuery(async () => [...new Set((await ctx.db.sets.toArray()).filter((s) => (s.status === 'done' || s.detail?.performances.some((p) => p.status === 'done')) && !s.deleted && s.kind === 'work').map((s) => s.exerciseId))], [ctx]);
  const [ex, setEx] = useState<ExerciseId>('squat');
  const [range, setRange] = useState<Range>('12v');
  const sessions = useLiveQuery(() => listSessions(ctx, { limit: 10 }), [ctx]) ?? [];
  const [variant, setVariant] = useState('default');
  const variants = useLiveQuery(() => trainingSeriesOptions(ctx, ex), [ctx, ex]);

  useEffect(() => {
    if (performed && performed.length && !performed.includes(ex)) setEx(performed.includes('squat') ? 'squat' : performed[0]);
  }, [performed, ex]);

  const series = useLiveQuery(() => {
    const since = range === 'alla' ? undefined : new Date(Date.now() - (range === '4v' ? 28 : 84) * 86_400_000).toISOString();
    return strengthSeries(ctx, ex, since, variant);
  }, [ctx, ex, range, variant]);

  useEffect(() => {
    if (variants && variants.length && !variants.some((v) => v.value === variant)) setVariant(variants[0].value);
  }, [variants, variant]);

  const options = CATALOG.filter((c) => performed?.includes(c.slug));
  const perf = series?.points.filter((p) => p.source === 'performance') ?? [];
  const best = perf.length ? Math.max(...perf.map((p) => p.kg)) : null;
  const lk = exercise(ex).loadKind;
  const perHand = exercise(ex).loadDisplayBasis === 'per_hand_kg';
  const unit = series?.unit ?? (lk === 'duration_sec' ? 's' : perHand ? 'kg/hantel' : 'kg');
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
            <label className="field">Jämförelseserie<select value={variant} onChange={(e) => setVariant(e.target.value)}>{variants.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
          )}
          <Segmented label="Period" value={range} onChange={setRange} options={[{ value: '4v', label: '4 veckor' }, { value: '12v', label: '12 veckor' }, { value: 'alla', label: 'Allt' }]} />
          <div className="card stack">
            <h2>{exercise(ex).nameSv}</h2>
            {series?.latestMax && <div className="stack latest-strength" aria-label="Senaste maxvärde">
              <p><span className="label">{series.latestMax.source === 'measured' ? 'Senaste rapporterade max' : 'Senaste maxskattning'}:</span> <strong className="num">{formatKg(Math.round(series.latestMax.kg * 1000))} {unit}</strong></p>
              <p className="small muted">{series.latestMax.origin === 'input' ? 'Från din angivna styrkeuppgift' : 'Från registrerat set'} · {new Date(series.latestMax.at).toLocaleDateString('sv-SE')}. Värdet ligger kvar tills det finns nytt underlag.</p>
            </div>}
            {series && <ProgressChart points={series.points} unit={unit} title={`Utveckling ${exercise(ex).nameSv}`} />}
            {series?.note && <p className="small muted">{series.note}</p>}
            {series?.comparable && <p className="small muted">{T.INFO_1RM} är en uppskattning, inte ett testat maxvärde. {T.INFO_ESTIMATE}</p>}
            {series?.comparable && <p className="small muted">Ny maxskattning kräver ett kontrollerat arbetsset med 1–8 repetitioner och angiven repetitionsreserv eller maxansträngning. Övriga set visas som faktisk prestation. Ett enskilt lägre värde visar inte i sig att du blivit svagare.</p>}
            {best !== null && lk !== 'assistance_kg' && (
              <p>
                <span className="label">Bästa {lk === 'duration_sec' ? 'tid' : 'arbetsset'} i perioden:</span> <span className="num">{lk === 'duration_sec' ? `${best} s` : `${formatKg(Math.round(best * 1000))} ${unit}`}</span>
              </p>
            )}
          </div>
        </>
      )}
      <BalanceSection />
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
                <SessionTrainingHistory sessionId={s.session.id} />
                <DeleteWorkout sessionId={s.session.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
