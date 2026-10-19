import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PlanSnapshot } from '../../domain/model';
import type { AppContext } from '../../application/context';
import { previewExtra, previewNext, startSession } from '../../application/training';
import { editableSession } from '../../application/workout';
import { Banner } from '../components/common';
import { FLAGS, useServices } from '../services';

export type PreviewState = { kind: 'extra'; minutes: number; readiness: 'good' | 'normal' | 'tired' | 'pain'; painAreas?: string[] } | null;

/** Viktförslag kan stängas av med feature flag utan att historik påverkas (04 §4). */
export function applyLoadFlag(p: PlanSnapshot): PlanSnapshot {
  if (FLAGS.loadRecommendationsEnabled) return p;
  return { ...p, exercises: p.exercises.map((e) => (e.reasons.includes('LOAD_RECOMMENDATIONS_DISABLED') ? e : { ...e, kg: null, calibrationSuggestionKg: null, calibration: e.loadKind === 'external_kg' || e.loadKind === 'assistance_kg', reasons: [...e.reasons, 'LOAD_RECOMMENDATIONS_DISABLED'] })) };
}


const preparing = new WeakMap<AppContext['db'], Promise<string>>();
async function prepare(ctx:AppContext, extra:PreviewState):Promise<string> {
  const existing = await editableSession(ctx);
  if(existing)return existing.id;
  const plan=extra?await previewExtra(ctx,{minutes:extra.minutes,readiness:extra.readiness,painAreas:extra.painAreas as never}):await previewNext(ctx);
  return (await startSession(ctx,applyLoadFlag(plan),true)).id;
}
export function Preview() {
  const {ctx}=useServices(); const nav=useNavigate(); const loc=useLocation();
  const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let alive=true;
    let task=preparing.get(ctx.db);
    if(!task){task=prepare(ctx,(loc.state as PreviewState)??null);preparing.set(ctx.db,task);void task.finally(()=>preparing.delete(ctx.db)).catch(()=>{});}
    void task.then((id)=>{if(alive)nav(`/pass/${id}/oversikt`,{replace:true});}).catch(()=>{if(alive)setError('Kunde inte öppna passet. Försök igen.');});
    return()=>{alive=false;};
  },[ctx,loc.state,nav,attempt]);
  return <div className="page stack"><h1>Ditt pass</h1>{error?<><Banner kind="danger">{error}</Banner><button type="button" className="btn primary" onClick={()=>{setError('');setAttempt(attempt+1);}}>Försök igen</button></>:<p role="status" aria-busy="true">Förbereder passet…</p>}</div>;
}
