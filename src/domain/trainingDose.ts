import { exercise, type ExerciseId } from './catalog';
import type { PerformedExercise } from './model';
import { requiredSides } from './trainingFlow';

export type Dose = { sets: number; repetitions: number; seconds: number; exposures: number };
/** Descriptive work overlap, deliberately distinct from the recovery model.
 * Half credit is a transparent planning heuristic, not a physiological conversion. */
export function muscleWorkOverlap(a: ExerciseId, b: ExerciseId): number {
  if(a===b) return 1;
  const x=exercise(a),y=exercise(b);
  if(x.pattern===y.pattern) {
    // Flexion and extension are distinct despite sharing the broad arm label.
    if(x.pattern==='isolation_arm') {
      const flexion=(id:ExerciseId)=>['biceps_curl','dumbbell_curl','cable_curl','incline_dumbbell_curl'].includes(id);
      return flexion(a)===flexion(b)?1:0;
    }
    return 1;
  }
  if(['press','pull','lower'].includes(x.recoveryGroup) && x.recoveryGroup===y.recoveryGroup) return .5;
  return 0;
}

/** Only observed comparable target completion supports tolerance learning. An
 * easier recovery prescription, missing follow-up or an unfinished exercise does not. */
export function successfulDoseExposure(h: PerformedExercise): boolean {
  const reduced=(r:string)=>r==='RECOVERY_MODE_REDUCED'||r==='RECOVERY_DOSE_REDUCED'||r.startsWith('TIME_')||r.includes('RESTART');
  if(!['completed','partial'].includes(h.sessionStatus) || !['normal','caution'].includes(h.plan.state) ||
    h.plan.reasons.some(reduced) || h.plan.doseContext?.temporaryReasons.some(reduced)) return false;
  const work=h.sets.filter(s=>s.kind==='work');
  if(work.filter(s=>s.status==='done').length<h.plan.sets || !work.length) return false;
  return work.every(s=>{
    if(s.status!=='done') return false;
    if(s.detail) {
      const ps=s.detail.performances.filter(p=>p.status==='done');
      return requiredSides(s.detail.configuration).every(side=>ps.some(p=>p.side===side)) && ps.every(p=>{
        const target=s.detail?.plannedSides?.[p.side];
        const expected=target?.reps??s.plannedReps;
        const expectedSeconds=target?.seconds??s.plannedSeconds;
        const plannedLoad=p.equipment.unit==='level'?(s.detail?.targetLoadValue??h.plan.targetLoadValue):(target?.grams!=null?target.grams/1000:s.plannedKg);
        const loadOk=plannedLoad==null || (p.loadValue!=null && (h.plan.loadKind==='assistance_kg'?p.loadValue<=plannedLoad:p.loadValue>=plannedLoad));
        return p.technique==='controlled' && (p.rir==null||p.rir>=2) && !['maximal','too_heavy'].includes(p.effort??'') && loadOk &&
          (expectedSeconds!=null ? (p.seconds??0)>=expectedSeconds : expected!=null&&(p.repetitions??0)>=expected);
      });
    }
    const loadOk=s.plannedKg==null || (s.actualKg!=null && (h.plan.loadKind==='assistance_kg'?s.actualKg<=s.plannedKg:s.actualKg>=s.plannedKg));
    return s.technique==='controlled' && (s.rir==null||s.rir>=2) && !['maximal','too_heavy'].includes(s.perceivedEffort??'') && loadOk &&
      (s.plannedSeconds!=null ? (s.actualSeconds??0)>=s.plannedSeconds : s.plannedReps!=null&&(s.actualReps??0)>=s.plannedReps);
  });
}
/** Per-side rolling exposure. Added exercises/sets and partial sides count; warmups/previews do not.
 * Kilograms remain on observations, not summed into a physiological dose equivalence.
 */
export function rollingDose(id: ExerciseId, history: PerformedExercise[], nowUtc: string, days = 7): Record<'left'|'right',Dose> {
  const now=Date.parse(nowUtc), result={left:{sets:0,repetitions:0,seconds:0,exposures:0},right:{sets:0,repetitions:0,seconds:0,exposures:0}};
  const seen=new Set<string>();
  for(const h of history) {
    if(h.sessionStatus==='preview') continue;
    const overlap=muscleWorkOverlap(id,h.exerciseId);
    if(!overlap) continue;
    const sides=new Set<'left'|'right'>();
    for(const [index,s] of h.sets.entries()) {
      if(s.kind!=='work') continue;
      const ps=s.detail?s.detail.performances.filter(p=>p.status==='done').map(p=>({id:p.id,side:p.side,reps:p.repetitions??0,seconds:p.seconds??0,time:p.completedAt??s.occurredAt??h.whenUtc})):
        s.status==='done'?[{id:String(index),side:'both' as const,reps:s.actualReps??0,seconds:s.actualSeconds??0,time:s.occurredAt??h.whenUtc}]:[];
      for(const p of ps) {
        const age=(now-Date.parse(p.time))/86400000,key=`${h.sessionId}:${h.exerciseId}:${p.id}`;
        if(age<0||age>days||!Number.isFinite(age)||seen.has(key)||(!p.reps&&!p.seconds))continue;
        seen.add(key);
        for(const side of p.side==='both'?['left','right'] as const:[p.side]) {
          result[side].sets+=overlap;result[side].repetitions+=p.reps*overlap;result[side].seconds+=p.seconds*overlap;sides.add(side);
        }
      }
    }
    for(const side of sides) result[side].exposures++;
  }
  return result;
}

/** An upper planning guard grows only from repeated successful outcomes after a
 * similar observed week. No volume quota or automatic compensation is created. */
export function weeklyDoseGuard(id: ExerciseId, history: PerformedExercise[], nowUtc: string): { sets: number; repetitions: number; ceilingSets: number; supportedWeeks: number } {
  const dose=rollingDose(id,history,nowUtc),seen=new Set<string>();
  const now=Date.parse(nowUtc);
  const recent=history.filter(h=>h.exerciseId===id && h.sessionStatus!=='preview' && Date.parse(h.whenUtc)<now && Date.parse(h.whenUtc)>=now-90*86400000 && !seen.has(h.sessionId) && (seen.add(h.sessionId),true)).sort((a,b)=>a.whenUtc.localeCompare(b.whenUtc)||a.sessionId.localeCompare(b.sessionId));
  const latestVariant=recent.at(-1)?.plan.variantKey??'default';
  const relevant=recent.filter(h=>(h.plan.variantKey??'default')===latestVariant).slice(-8);
  const samples:number[]=[];
  // A latest adverse/ambiguous observation cannot be erased by selecting old successes.
  if(relevant.at(-1) && successfulDoseExposure(relevant.at(-1)!)) for(const h of relevant) {
    if(!successfulDoseExposure(h)) continue;
    const prior=rollingDose(id,history.filter(p=>p.sessionId!==h.sessionId),h.whenUtc);
    const sets=Math.max(prior.left.sets,prior.right.sets);
    if(sets>0) samples.push(sets);
  }
  samples.sort((a,b)=>a-b);
  const supported=samples.length>=3?samples[Math.floor((samples.length-1)/2)]:0;
  return {sets:Math.max(dose.left.sets,dose.right.sets),repetitions:Math.max(dose.left.repetitions,dose.right.repetitions),ceilingSets:Math.max(10,supported*1.2),supportedWeeks:samples.length};
}
