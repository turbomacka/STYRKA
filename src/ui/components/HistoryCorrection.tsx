import {useRef,useState} from 'react';
import type {PerceivedEffort,Technique} from '../../domain/model';
import {EFFORT_LABELS,EFFORT_OPTIONS,MAX_EFFORT_DESCRIPTION} from '../../domain/effort';
import type {LocalSessionExercise,LocalSet} from '../../storage/db';
import {editSet,recordPerformance} from '../../application/training';
import {refreshFuturePlan,type FuturePlanningResult} from '../../application/trainingPlan';
import {savedWorkoutFeedback} from '../../application/workoutFeedback';
import {compareSessionRecommendations} from '../../application/replanningFeedback';
import {defaultConfiguration,SIDE_LABELS,type SetPerformance} from '../../domain/trainingFlow';
import {parseKg,parseIntInRange,formatKg} from '../../domain/units';
import {Sheet} from './common';
import {useServices} from '../services';

export function HistoryCorrection({set,instance}:{set:LocalSet;instance:LocalSessionExercise}){
  const [open,setOpen]=useState(false);
  const [side,setSide]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const performed=set.detail?.performances.filter(p=>p.status==='done')??[];
  if(set.status!=='done'&&!performed.length)return null;
  const selected=performed.find(p=>p.side===side)??performed[0];
  return <div className="no-print">
    <button className="btn ghost" type="button" onClick={()=>{setSide(selected?.side??null);setOpen(true);}}>Korrigera {set.kind==='warmup'?'uppvärmning':'set'} {set.ordinal}</button>
    {open&&<Sheet title="Korrigera registrering" onClose={()=>{if(!busy)setOpen(false);}}>
      {performed.length>1&&<div className="row">{performed.map(p=><button type="button" className="btn" key={p.side} disabled={busy} aria-pressed={selected?.side===p.side} onClick={()=>setSide(p.side)}>{SIDE_LABELS[p.side]}</button>)}</div>}
      <CorrectionForm key={selected?.side??'legacy'} set={set} instance={instance} performance={selected} onBusy={setBusy} onDone={()=>setOpen(false)}/>
    </Sheet>}
  </div>;
}
function CorrectionForm({set,instance,performance:p,onBusy,onDone}:{set:LocalSet;instance:LocalSessionExercise;performance?:SetPerformance;onBusy:(busy:boolean)=>void;onDone:()=>void}){
  const {ctx}=useServices();
  const equipment=p?.equipment??defaultConfiguration(instance.exerciseId).equipment;
  const [weight,setWeight]=useState(p?.loadValue!=null?String(p.loadValue):set.actualGrams!=null?formatKg(set.actualGrams):'');
  const [second,setSecond]=useState(p?.secondLoadValue!=null?String(p.secondLoadValue):'');
  const [reps,setReps]=useState(String(p?.repetitions??set.actualReps??''));
  const [seconds,setSeconds]=useState(String(p?.seconds??set.actualSeconds??''));
  const [effort,setEffort]=useState<PerceivedEffort|null>(p?p.effort??null:set.perceivedEffort??null);
  const [rir,setRir]=useState(String((p?p.rir:set.rir)??''));
  const [technique,setTechnique]=useState<Technique|null>(p?p.technique:set.technique);
  const [performanceChanged,setPerformanceChanged]=useState(false);
  const saving=useRef(false);
  const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[updated,setUpdated]=useState(false),[error,setError]=useState('');
  const load= !['duration_sec','reps_only'].includes(instance.snapshot.loadKind);
  const duration=instance.snapshot.loadKind==='duration_sec';
  function changePerformance(update:()=>void){
    update();setEffort(null);setRir('');setPerformanceChanged(true);
  }
  async function replan(){
    let result:FuturePlanningResult|undefined;
    await refreshFuturePlan(ctx,{onPlanningResult:value=>{result=value;}});
    const comparison=await compareSessionRecommendations(ctx,set.sessionId,result);
    await savedWorkoutFeedback(ctx,set.sessionId,comparison);setUpdated(true);
  }
  async function save(){
    if(saving.current)return;saving.current=true;setBusy(true);onBusy(true);setError('');
    let committed=saved;
    try{
      if(!committed){
        const kg=load?parseKg(weight):null,kg2=equipment.basis==='independent'?parseKg(second):null;
        const n=parseIntInRange(duration?seconds:reps,1,duration?900:50);
        if((kg&&!kg.ok)||(kg2&&!kg2.ok)||!n.ok)throw new Error('INVALID_VALUES');
        const values={actualGrams:kg?.ok?kg.grams:null,actualReps:duration?null:n.value,actualSeconds:duration?n.value:null,
          ...(kg2?.ok?{secondLoadValue:kg2.grams/1000}:{}),
          technique,
          ...(set.kind==='work'?{perceivedEffort:effort,rir:duration||effort==='maximal'||rir===''?null:Number(rir)}:{})};
        if(p)await recordPerformance(ctx,set.id,p.side,values,{edit:true});else await editSet(ctx,set.id,values);
        committed=true;setSaved(true);
      }
      await replan();
    }catch(error){setError(error instanceof Error && error.message==='VALIDATION_ERROR:setDetailSize'?'Setets korrigeringshistorik har nått lagringsgränsen. Ingen ändring har sparats.':committed?'Korrigeringen är sparad. Planen kunde inte beräknas. Försök igen.':'Kontrollera värdena. Korrigeringen kunde inte sparas.');}
    finally{saving.current=false;setBusy(false);onBusy(false);}
  }
  return <form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
    <p className="small">Kommande pass anpassas efter dina ändringar. De ursprungliga målen finns kvar i historiken.</p>
    <fieldset disabled={busy||saved} className="training-set-controls stack">
      {load&&<label className="field">{equipment.unit==='level'?'Registrerad nivå':'Registrerad vikt (kg)'}<input type="text" inputMode="decimal" value={weight} onChange={e=>changePerformance(()=>setWeight(e.target.value))}/></label>}
      {equipment.basis==='independent'&&<label className="field">Andra stapeln<input type="text" inputMode="decimal" value={second} onChange={e=>changePerformance(()=>setSecond(e.target.value))}/></label>}
      <label className="field">{duration?'Registrerade sekunder':'Registrerade repetitioner'}<input type="text" inputMode="numeric" value={duration?seconds:reps} onChange={e=>changePerformance(()=>duration?setSeconds(e.target.value):setReps(e.target.value))}/></label>
      {set.kind==='work'&&<>
        {performanceChanged&&<p className="small muted">Prestationen har ändrats. Ange gärna känsla och repetitioner kvar igen för de nya värdena.</p>}
        <label className="field">Hur kändes setet?
          <select value={effort??''} onChange={e=>{const value=e.target.value as PerceivedEffort|'';setEffort(value||null);if(value==='maximal')setRir('');}}>
            <option value="">Inte angivet</option>
            {EFFORT_OPTIONS.map(value=><option key={value} value={value}>{EFFORT_LABELS[value]}</option>)}
            {effort==='too_heavy'&&<option value="too_heavy">{EFFORT_LABELS.too_heavy}</option>}
          </select>
        </label>
        {effort==='maximal'&&<p className="small muted">{MAX_EFFORT_DESCRIPTION}</p>}
        {!duration&&<label className="field">Repetitioner kvar (valfritt)
          <select value={rir} disabled={effort==='maximal'} onChange={e=>setRir(e.target.value)}>
            <option value="">Vet inte</option>
            {[0,1,2,3,4,5].map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
      </>}
      <label className="field">Teknik
        <select value={technique??''} onChange={e=>setTechnique((e.target.value as Technique)||null)}>
          <option value="">Inte angivet</option>
          <option value="controlled">Kontrollerad</option>
          <option value="uncertain">Osäker</option>
          <option value="poor">Dålig</option>
        </select>
      </label>
    </fieldset>
    {saved&&<p role="status">{updated?'Korrigeringen är sparad och planen är uppdaterad.':'Korrigeringen är sparad.'}</p>}
    {error&&<p role="alert">{error}</p>}
    {!updated&&<button type="submit" className="btn primary" disabled={busy}>{busy?'Sparar och beräknar…':saved?'Försök beräkna igen':'Spara korrigering'}</button>}
    {updated&&<button type="button" className="btn primary" onClick={onDone}>Klart</button>}
  </form>;
}
