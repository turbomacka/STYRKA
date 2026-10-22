import { useLiveQuery } from 'dexie-react-hooks';
import { exercise } from '../../domain/catalog';
import { LOAD_LABELS, SIDE_LABELS, recordedWork, setCounts } from '../../domain/trainingFlow';
import { REST_REASONS } from '../../domain/restPolicy';
import { EFFORT_LABELS } from '../../domain/effort';
import type { LocalSet } from '../../storage/db';
import { useServices } from '../services';

export function PerformanceHistory({ set }: { set: LocalSet }) {
  if (!set.detail) return null;
  return <div className="training-history small stack">
    <span><strong>{set.status === 'partial' ? 'Delvis genomfört' : set.status === 'done' ? 'Utfört' : set.status === 'skipped' ? 'Överhoppat' : 'Inte utfört'}</strong> · {set.kind === 'warmup' ? 'Uppvärmning' : 'Arbetsset'} {set.ordinal}</span>
    <ul>{set.detail.performances.map((p) => <li key={p.id}>
      <strong>{SIDE_LABELS[p.side]}</strong>: {p.status === 'done' ? <>{p.loadValue !== null && <>{p.loadValue.toLocaleString('sv-SE')}{p.secondLoadValue !== null ? ` / ${p.secondLoadValue.toLocaleString('sv-SE')}` : ''} {p.equipment.unit === 'level' ? 'nivå' : 'kg'} × </>}{p.repetitions ?? p.seconds} {p.seconds !== null ? 's' : 'reps'}{p.rir !== null ? ` · ${p.rir} reps kvar` : ''}</> : p.status === 'skipped' ? 'Överhoppad' : 'Påbörjad'}
      <span className="block-text muted">{LOAD_LABELS[p.equipment.measurement]}{p.equipment.basis === 'per_stack' ? ' · per stapel' : p.equipment.basis === 'per_handle' ? ' · per handtag' : p.equipment.basis === 'independent' ? ' · två oberoende staplar' : ''}{p.equipment.name ? ` · ${p.equipment.name}` : ''}</span>
      {p.status === 'done' && p.effort && <span className="block-text">Känsla: {EFFORT_LABELS[p.effort]}</span>}
    </li>)}</ul>
    {!!set.detail.recordingChanges?.length && <details><summary>Korrigeringshistorik</summary><ul>{set.detail.recordingChanges.map(c=><li key={c.id}>{new Date(c.at).toLocaleString('sv-SE')}: tidigare {c.before.status==='done'?'utfört':'delvis registrerat'}{c.before.sides.length ? c.before.sides.map(p=>` · ${SIDE_LABELS[p.side]}: ${p.loadValue??'–'} ${p.unit} × ${p.repetitions??p.seconds??'–'}`).join('') : ` · ${c.before.grams===null?'–':c.before.grams/1000} kg × ${c.before.reps??c.before.seconds??'–'}`}</li>)}</ul></details>}
    {!!set.detail.rests.length && <details><summary>Vila och registrering</summary>{set.detail.rests.map((r) => <p key={r.id}>{r.type === 'between_sides' ? 'Mellan sidor' : r.type === 'before_work' ? 'Inför arbetsset' : r.type === 'warmup' ? 'Mellan uppvärmningsset' : 'Mellan set'}: förslag {r.recommendedSeconds} s{r.adjustmentSeconds ? `, egen justering ${r.adjustmentSeconds > 0 ? '+' : ''}${r.adjustmentSeconds} s` : ''}. Faktisk vila: {r.actualSeconds === null ? 'okänd' : `${r.actualSeconds} s`}. <span className="muted">{r.reasons.map((c) => REST_REASONS[c] ?? '').join(' ')}</span></p>)}</details>}
  </div>;
}

export function SessionTrainingHistory({ sessionId }: { sessionId: string }) {
  const { ctx } = useServices();
  const sets = useLiveQuery(() => ctx.db.sets.where('sessionId').equals(sessionId).filter((s) => !s.deleted).toArray(), [ctx, sessionId]);
  if (!sets?.some((s) => s.detail)) return null;
  const counts = setCounts(sets);
  const volume = (kind: 'work' | 'warmup') => sets.filter((s) => s.kind === kind).flatMap((s) => s.detail?.performances ?? []).flatMap((p) => { const v = recordedWork(p); return v === null ? [] : [v]; });
  const work = volume('work'), warm = volume('warmup');
  return <details className="training-history"><summary>Set, sidor och uppvärmning</summary><div className="stack">
    <p>{counts.complete} kompletta arbetsset · {counts.partial} delvisa · {counts.performances} registrerade delprestationer. Höger: {counts.right} set, vänster: {counts.left} set.</p>
    {!!counts.unknownSideSets && <p className="small muted">{counts.unknownSideSets} äldre set saknar uppdelning per sida.</p>}
    {(work.length > 0 || warm.length > 0) && <p className="small muted">Registrerad massa × repetitioner för fria vikter: arbetsset {work.reduce((a,b) => a+b,0).toLocaleString('sv-SE')} kg·reps; inklusive uppvärmning {[...work,...warm].reduce((a,b) => a+b,0).toLocaleString('sv-SE')} kg·reps. Maskiner, kroppsvikt och äldre ospecificerade set ingår inte i detta mått.</p>}
    {sets.filter((s) => s.detail && s.status !== 'planned').sort((a,b) => a.exerciseId.localeCompare(b.exerciseId) || (a.kind === 'warmup' ? 0 : 1) - (b.kind === 'warmup' ? 0 : 1) || a.ordinal-b.ordinal).map((s) => <div key={s.id}><strong>{exercise(s.exerciseId).nameSv}</strong><PerformanceHistory set={s} /></div>)}
  </div></details>;
}
