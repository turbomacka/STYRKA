import { exercise } from './catalog';
import { canonicalJson } from './hash';
import type { PlannedExercise } from './model';
import { formatKg } from './units';

/** The same dose is used by plan rows and feedback. No decisions are made here. */
export type DisplayPrescription = Pick<PlannedExercise, 'exerciseId'|'sets'|'reps'|'loadKind'> & Partial<Omit<PlannedExercise, 'exerciseId'|'sets'|'reps'|'loadKind'|'loadBasis'>> & {loadBasis?: PlannedExercise['loadBasis'] | null};
export function prescriptionSignature(p: DisplayPrescription): string {
  return canonicalJson({exerciseId:p.exerciseId,variant:p.variantKey??'default',kg:p.kg??null,reps:p.reps,sets:p.sets,
    seconds:p.targetSeconds??null,load:p.targetLoadValue??null,second:p.targetSecondLoadValue??null,
    sides:p.sideTargets??null,configuration:p.configuration??null,kind:p.loadKind,basis:p.loadBasis??null});
}
export function prescriptionText(p: DisplayPrescription): string {
  const c=p.configuration, equipment=c?.equipment;
  const perSide=c ? ['sequential','alternating'].includes(c.executionMode) : exercise(p.exerciseId).unilateral && exercise(p.exerciseId).catalogSince!=='1.0.0';
  const single=c?.executionMode==='single_side' ? ` · ${c.startingSide==='right'?'höger':'vänster'}` : '';
  const perHand=equipment ? equipment.measurement==='per_dumbbell'?' per hantel':equipment.basis==='per_stack'?' per stapel':equipment.basis==='per_handle'?' per handtag':'' : p.loadBasis==='per_hand_kg'?' per hantel':'';
  const load=(kg:number|null|undefined, value:number|null|undefined=p.targetLoadValue):string=>{
    if (p.loadKind==='duration_sec'||p.loadKind==='reps_only') return '';
    if(equipment?.unit==='level'||equipment?.basis==='independent') {
      const unit=equipment.unit==='level'?'nivå':'kg';
      if(value==null)return 'välj belastning';
      return `${value.toLocaleString('sv-SE')} ${unit}${equipment.basis==='independent'?` + ${p.targetSecondLoadValue?.toLocaleString('sv-SE')??'?'} ${unit} · separata staplar`:''}`;
    }
    if(kg==null)return p.calibrationSuggestionKg!=null?`osäkert förslag ${formatKg(Math.round(p.calibrationSuggestionKg*1000))} kg${perHand}`:'välj startvikt';
    if(p.loadKind==='assistance_kg')return `${formatKg(Math.round(kg*1000))} kg assistans`;
    if(p.loadKind==='bodyweight_plus_kg')return kg===0?'kroppsvikt':`+${formatKg(Math.round(kg*1000))} kg`;
    return `${formatKg(Math.round(kg*1000))} kg${perHand}`;
  };
  const left=p.sideTargets?.left,right=p.sideTargets?.right;
  if(perSide&&left&&right&&(left.kg!==right.kg||left.reps!==right.reps)) {
    const side=(v:typeof left)=>`${p.sets} × ${v.reps} reps${load(v.kg,v.kg)?` · ${load(v.kg,v.kg)}`:''}`;
    return `Vänster ${side(left)} · Höger ${side(right)}`;
  }
  const selected=c?.executionMode==='single_side'?p.sideTargets?.[c.startingSide]:left&&right?left:undefined;
  const reps=p.loadKind==='duration_sec'?`${p.targetSeconds??'?'} s`:`${selected?.reps??p.reps} reps${perSide?' per sida':''}${single}`;
  const weight=load(selected?selected.kg:p.kg,selected?selected.kg:p.targetLoadValue);
  return `${p.sets} × ${reps}${weight?` · ${weight}`:''}`;
}
