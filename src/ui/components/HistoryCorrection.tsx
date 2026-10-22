import {useState} from 'react';
import type {LocalSessionExercise,LocalSet} from '../../storage/db';
import {editSet,recordPerformance} from '../../application/training';
import {refreshFuturePlan} from '../../application/trainingPlan';
import {savedWorkoutFeedback} from '../../application/workoutFeedback';
import {defaultConfiguration,SIDE_LABELS,type SetPerformance} from '../../domain/trainingFlow';
import {parseKg,parseIntInRange,formatKg} from '../../domain/units';
import {Sheet} from './common';
import {useServices} from '../services';

export function HistoryCorrection({set,instance}:{set:LocalSet;instance:LocalSessionExercise}){
  const [open,setOpen]=useState(false);
  const [side,setSide]=useState<string|null>(null);
  const performed=set.detail?.performances.filter(p=>p.status==='done')??[];
  if(set.status!=='done'&&!performed.length)return null;
  const selected=performed.find(p=>p.side===side)??performed[0];
  return <div className="no-print">
    <button className="btn ghost" type="button" onClick={()=>setOpen(true)}>Korrigera {set.kind==='warmup'?'uppvärmning':'set'} {set.ordinal}</button>
    {open&&<Sheet title="Korrigera registrering" onClose={()=>setOpen(false)}>
      {performed.length>1&&<div className="row">{performed.map(p=><button type="button" className="btn" key={p.side} aria-pressed={selected?.side===p.side} onClick={()=>setSide(p.side)}>{SIDE_LABELS[p.side]}</button>)}</div>}
      <CorrectionForm key={selected?.side??'legacy'} set={set} instance={instance} performance={selected}/>
    </Sheet>}
  </div>;
}
function CorrectionForm({set,instance,performance:p}:{set:LocalSet;instance:LocalSessionExercise;performance?:SetPerformance}){
  const {ctx}=useServices();
  const equipment=p?.equipment??defaultConfiguration(instance.exerciseId).equipment;
  const [weight,setWeight]=useState(p?.loadValue!=null?String(p.loadValue):set.actualGrams!=null?formatKg(set.actualGrams):'');
  const [second,setSecond]=useState(p?.secondLoadValue!=null?String(p.secondLoadValue):'');
  const [reps,setReps]=useState(String(p?.repetitions??set.actualReps??''));
  const [seconds,setSeconds]=useState(String(p?.seconds??set.actualSeconds??''));
  const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[updated,setUpdated]=useState(false),[error,setError]=useState('');
  const load= !['duration_sec','reps_only'].includes(instance.snapshot.loadKind);
  const duration=instance.snapshot.loadKind==='duration_sec';
  async function replan(){
    await refreshFuturePlan(ctx);await savedWorkoutFeedback(ctx,set.sessionId);setUpdated(true);
  }
  async function save(){
    if(busy)return;setBusy(true);setError('');
    let committed=saved;
    try{
      if(!committed){
        const kg=load?parseKg(weight):null,kg2=equipment.basis==='independent'?parseKg(second):null;
        const n=parseIntInRange(duration?seconds:reps,1,duration?900:50);
        if((kg&&!kg.ok)||(kg2&&!kg2.ok)||!n.ok)throw new Error('INVALID_VALUES');
        const values={actualGrams:kg?.ok?kg.grams:null,actualReps:duration?null:n.value,actualSeconds:duration?n.value:null,
          ...(kg2?.ok?{secondLoadValue:kg2.grams/1000}:{})};
        if(p)await recordPerformance(ctx,set.id,p.side,values,{edit:true});else await editSet(ctx,set.id,values);
        committed=true;setSaved(true);
      }
      await replan();
    }catch(error){setError(error instanceof Error && error.message==='VALIDATION_ERROR:setDetailSize'?'Setets korrigeringshistorik har nått lagringsgränsen. Ingen ändring har sparats.':committed?'Korrigeringen är sparad. Planen kunde inte beräknas. Försök igen.':'Kontrollera värdena. Korrigeringen kunde inte sparas.');}
    finally{setBusy(false);}
  }
  return <form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
    <p className="small">Du ändrar en genomförd prestation. Den ursprungliga planversionen behålls.</p>
    <fieldset disabled={busy||saved} className="training-set-controls stack">
      {load&&<label className="field">{equipment.unit==='level'?'Registrerad nivå':'Registrerad vikt (kg)'}<input type="text" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)}/></label>}
      {equipment.basis==='independent'&&<label className="field">Andra stapeln<input type="text" inputMode="decimal" value={second} onChange={e=>setSecond(e.target.value)}/></label>}
      <label className="field">{duration?'Registrerade sekunder':'Registrerade repetitioner'}<input type="text" inputMode="numeric" value={duration?seconds:reps} onChange={e=>duration?setSeconds(e.target.value):setReps(e.target.value)}/></label>
    </fieldset>
    {saved&&<p role="status">{updated?'Korrigeringen är sparad och planen är uppdaterad.':'Korrigeringen är sparad.'}</p>}
    {error&&<p role="alert">{error}</p>}
    {!updated&&<button type="submit" className="btn primary" disabled={busy}>{busy?'Sparar och beräknar…':saved?'Försök beräkna igen':'Spara korrigering'}</button>}
  </form>;
}
