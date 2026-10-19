import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { exercise } from '../../domain/catalog';
import { previewNext } from '../../application/training';
import { EmptyState, Icon, OfflineBanner, Warnings } from '../components/common';
import { editableSession, workoutOrder } from '../../application/workout';
import { useServices } from '../services';
import { TEMPLATE_SV } from '../strings';

export function SyncLink() {
  const { syncStatus, online } = useServices();
  if (!syncStatus) return null;
  const { pending, conflicts, failed } = syncStatus;
  const needsLogin = syncStatus.state === 'auth_required';
  const label = needsLogin ? 'Logga in igen för att synka' : conflicts ? `${conflicts} konflikt${conflicts > 1 ? 'er' : ''}` : failed ? 'Synkfel' : pending ? (online ? `Synkar ${pending}` : `${pending} sparade lokalt`) : 'Synkat';
  const cls = needsLogin || conflicts || failed ? 'warn' : pending ? '' : 'ok';
  const I = needsLogin || conflicts || failed ? Icon.Alert : pending ? (online ? Icon.Sync : Icon.CloudOff) : Icon.Check;
  return (
    <Link to="/synk" className={`chip ${cls}`} aria-label={`Synkstatus: ${label}. Visa detaljer`} style={{ textDecoration: 'none' }}>
      <I /> {label}
    </Link>
  );
}

/** The primary next-workout action, embedded in Plan. */
export function NextWorkout() {
  const {ctx,online}=useServices();const nav=useNavigate();
  const current=useLiveQuery(()=>editableSession(ctx),[ctx]);
  const currentExercises=useLiveQuery(async()=>{
    if(!current)return null;
    const sets=await ctx.db.sets.where('sessionId').equals(current.id).toArray();
    return workoutOrder(await ctx.db.sessionExercises.where('sessionId').equals(current.id).toArray(),await ctx.db.workoutOrderEvents.where('sessionId').equals(current.id).toArray()).filter((e)=>sets.some((s)=>s.sessionExerciseId===e.id&&!s.deleted));
  },[ctx,current?.id]);
  const result=useLiveQuery(async()=>{try{return await previewNext(ctx);}catch{return null;}},[ctx]);
  const plan=current?.snapshot??result;
  const started=current&&current.status!=='preview';
  return <section className="card hero stack no-print" aria-label="Nästa pass">
    <OfflineBanner online={online}/>
    <p className="label">{started?'Pågående pass':'Nästa pass'}</p>
    <h2>{plan?(TEMPLATE_SV[plan.templateKey??'']??'Ditt pass'):'Ditt nästa pass'}</h2>
    {plan&&<p className="small muted">{(currentExercises??plan.exercises).slice(0,3).map((e)=>exercise(e.exerciseId).nameSv).join(' · ')}</p>}
    {plan&&<Warnings codes={plan.warnings}/>}
    {result===null&&!current?<EmptyState title="Kunde inte ta fram passet"><p>Dina sparade uppgifter finns kvar.</p></EmptyState>:<button type="button" className="btn primary block big" disabled={!plan} onClick={()=>nav(current?`/pass/${current.id}${started?'':'/oversikt'}`:'/forhandsvisning')}>{started?'Fortsätt passet':'Öppna passet'}</button>}
    {!current&&<button type="button" className="btn ghost" onClick={()=>nav('/spontan')}>Träna ett spontanpass</button>}
  </section>;
}
