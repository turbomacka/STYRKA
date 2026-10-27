import { describe, expect, it } from 'vitest';
import { planRegular, planReplacement, type PlanningHorizonContext } from '../../src/planner/planner';
import { activeSymptoms, gateFor, pastWork } from '../../src/planner/history';
import { assessRecovery, exposureOverlap, RECOVERY_POLICY, type RecoveryPolicyVariant } from '../../src/domain/recoveryPolicy';
import { muscleWorkOverlap, rollingDose, successfulDoseExposure, weeklyDoseGuard } from '../../src/domain/trainingDose';
import { recommendRest, type RestPerformance } from '../../src/domain/restPolicy';
import { comparisonKey, defaultConfiguration, trainingPreferences } from '../../src/domain/trainingFlow';
import { exercise } from '../../src/domain/catalog';
import type { PerformedExercise } from '../../src/domain/model';
import { ALL_ESTIMATES, NOW, hoursBefore, input, performed, plan, rule, sets, symptom } from './helpers';

describe('adaptation revision: meaningful goals within a bounded schedule',()=>{
  it('all 15 priority probes change a real choice, not just a reason code',()=>{
    for(const minutes of [20,30,45,60,90]) for(const rotationIndex of [0,1,2]) {
      const a=planRegular(input({minutes,rotationIndex,exerciseSettings:ALL_ESTIMATES,profile:{goals:{squat:3,bench_press:0,deadlift:1}}}));
      const b=planRegular(input({minutes,rotationIndex,exerciseSettings:ALL_ESTIMATES,profile:{goals:{squat:0,bench_press:3,deadlift:1}}}));
      const signature=(p:typeof a)=>p.exercises.map(e=>[e.exerciseId,e.sets,e.reps,e.kg]);
      expect(signature(a),`${minutes} min / rotation ${rotationIndex}`).not.toEqual(signature(b));
      expect(a.estimatedMinutes).toBeLessThanOrEqual(minutes+1);
      expect(b.estimatedMinutes).toBeLessThanOrEqual(minutes+1);
    }
  });

  it('puts the prioritised bench first in a short squat-template session',()=>{
    const p=planRegular(input({minutes:20,exerciseSettings:ALL_ESTIMATES,profile:{goals:{squat:0,bench_press:3,deadlift:1}}}));
    expect(p.exercises[0]).toMatchObject({exerciseId:'bench_press',role:'main'});
  });

  it.each([2,3])('includes horizontal and vertical pulling in a %i-session rotation without adding slots',frequency=>{
    const plans=[0,1,2].map(rotationIndex=>planRegular(input({rotationIndex,minutes:90,exerciseSettings:ALL_ESTIMATES,profile:{plannedSessionsPerWeek:frequency}})));
    const patterns=plans.flatMap(p=>p.exercises.map(e=>exercise(e.exerciseId).pattern));
    expect(patterns).toContain('horizontal_pull');expect(patterns).toContain('vertical_pull');
    expect(plans[1].exercises).toHaveLength(5);
  });

  it('does not let priorities bypass equipment or explicit blocks',()=>{
    const p=planRegular(input({minutes:20,exerciseSettings:ALL_ESTIMATES,profile:{goals:{bench_press:3,squat:0}},restrictions:[rule({kind:'block_exercise',exerciseA:'bench_press'})]}));
    expect(p.exercises.some(e=>e.exerciseId==='bench_press')).toBe(false);
    const limited=planRegular(input({rotationIndex:2,profile:{goals:{bench_press:3},equipment:['cable']}}));
    expect(limited.exercises.some(e=>e.exerciseId==='bench_press')).toBe(false);
  });

  it('recency prevents lower priority compound patterns from being excluded for weeks',()=>{
    const history:PerformedExercise[]=[];
    const selected=new Set<string>();
    for(let i=0;i<16;i++) {
      const now=new Date(Date.parse(NOW)+i*3.5*86400000).toISOString();
      const p=planRegular(input({nowUtc:now,minutes:20,rotationIndex:i,history,exerciseSettings:ALL_ESTIMATES,profile:{goals:{bench_press:3,squat:0,deadlift:0}}}));
      for(const e of p.exercises) {
        selected.add(exercise(e.exerciseId).pattern);
        const h=performed(e.exerciseId,now,e,sets(e.sets,{kg:e.kg??30,reps:e.reps,rir:3}));
        history.push(h);
      }
      expect(p.estimatedMinutes).toBeLessThanOrEqual(21);
    }
    expect(selected.has('horizontal_press')).toBe(true);
    expect(selected.has('squat')).toBe(true);
    expect(selected.has('hinge')).toBe(true);
    expect(selected.has('horizontal_pull')||selected.has('vertical_pull')).toBe(true);
  });

  it('keeps projected spacing separate from performed recovery and capacity',()=>{
    const i=input({exerciseSettings:ALL_ESTIMATES});
    const horizon:PlanningHorizonContext={plannedExposure:[{exerciseId:'squat',whenUtc:hoursBefore(NOW,24),sets:3,mode:'heavy'}]};
    const original=structuredClone(i),p=planRegular(i,horizon);
    expect(p.exercises.find(e=>e.exerciseId==='squat')?.mode).toBe('moderate');
    expect(p.exercises.find(e=>e.exerciseId==='squat')?.reasons).toContain('PLANNED_OVERLAP_DISTRIBUTION');
    expect(assessRecovery('squat',i.history,NOW).residualDose).toBe(0);
    expect(i).toEqual(original);
    expect(p).toEqual(planRegular(i,horizon));
  });
});

describe('adaptation revision: temporary dose lifecycle',()=>{
  it('restores a time-pruned ordinary set after more time without extra load or reps progression',()=>{
    const first=planRegular(input({minutes:30,exerciseSettings:ALL_ESTIMATES}));
    const short=first.exercises.find(e=>e.sets<(e.doseContext?.ordinarySets??e.sets));
    expect(short).toBeDefined();
    const h=performed(short!.exerciseId,hoursBefore(NOW,168),short!,sets(short!.sets,{kg:short!.kg??30,reps:short!.reps,rir:3}));
    const next=planRegular(input({minutes:90,history:[h],exerciseSettings:ALL_ESTIMATES})).exercises.find(e=>e.exerciseId===short!.exerciseId)!;
    expect(next.sets).toBe(Math.min(short!.sets+1,short!.doseContext!.ordinarySets));
    expect(next.kg).toBe(short!.kg);expect(next.reps).toBe(short!.reps);
  });

  it('does not restore a problem-related voluntary reduction when more time returns',()=>{
    const p=plan('squat',{kg:60,sets:3,reps:10,mode:'moderate',doseContext:{version:'DOSE/2.1.0',ordinarySets:3,temporaryReasons:[]}});
    const h=performed('squat',hoursBefore(NOW,168),p,sets(2,{kg:60,reps:6,plannedKg:60,plannedReps:10,rir:3}));
    const next=planRegular(input({minutes:90,history:[h],exerciseSettings:ALL_ESTIMATES,restrictions:[rule({kind:'region_note',area:'knee'})]})).exercises.find(e=>e.exerciseId==='squat')!;
    expect(next.sets).toBeLessThanOrEqual(2);expect(next.reps).toBeLessThanOrEqual(6);expect(next.kg).toBeLessThanOrEqual(60);
  });

  it('preserves a hard set limit as the allowed ordinary dose',()=>{
    const p=planRegular(input({minutes:90,exerciseSettings:ALL_ESTIMATES,restrictions:[rule({kind:'limit_sets',exerciseA:'squat',maxSets:1})]})).exercises.find(e=>e.exerciseId==='squat')!;
    expect(p.sets).toBe(1);expect(p.doseContext?.ordinarySets).toBe(1);
  });
  it('does not add a generic weekly set reduction on top of an established problem dose',()=>{
    const history=[168,120,72,24].map(hours=>performed('squat',hoursBefore(NOW,hours),{kg:60,sets:4,reps:10,mode:'moderate'},sets(3,{kg:60,reps:6,plannedReps:10,rir:3})));
    const next=planRegular(input({minutes:90,history,exerciseSettings:ALL_ESTIMATES,restrictions:[rule({kind:'region_note',area:'knee'})]})).exercises.find(e=>e.exerciseId==='squat')!;
    expect(next.sets).toBe(3);expect(next.reasons).not.toContain('ROLLING_WEEK_DOSE_HOLD');
    expect(next.reps).toBeLessThanOrEqual(6);
  });
});

function steadyRecoveryHistory():PerformedExercise[] {
  return [192,144,96,48].map(hours=>performed('squat',hoursBefore(NOW,hours),{kg:75,reps:8,sets:3,mode:'moderate',estimatedOneRM:100},sets(3,{kg:75,reps:8,rir:2,perceivedEffort:'ok'})));
}

describe('adaptation revision: uncertain recovery supported by observed outcomes',()=>{
  it('compares three policies on the same input and relaxes only the mild hold with repeated evidence',()=>{
    const history=steadyRecoveryHistory();
    const alternatives=Object.fromEntries((['general','gentle','individual'] as RecoveryPolicyVariant[]).map(variant=>[variant,assessRecovery('squat',history,NOW,undefined,{variant})]));
    expect(alternatives.general.modeCap).toBe('moderate');
    expect(alternatives.gentle.modeCap).toBe('moderate');
    expect(alternatives.individual.modeCap).toBeNull();
    expect(alternatives.individual.tolerance?.comparableOutcomes).toBe(3);
    expect(alternatives.individual.residualDose).toBe(alternatives.general.residualDose);
    expect(assessRecovery('squat',history.slice(-2),NOW).modeCap).toBe('moderate');
  });

  it('does not cherry-pick old successes after a new adverse outcome or an easier prescription',()=>{
    const h=steadyRecoveryHistory();h.at(-1)!.sets.forEach(s=>s.perceivedEffort='maximal');
    expect(assessRecovery('squat',h,NOW).tolerance?.moderateThreshold).toBe(RECOVERY_POLICY.moderateThreshold);
    const reduced=steadyRecoveryHistory();reduced.at(-1)!.plan.reasons=['RECOVERY_MODE_REDUCED'];
    expect(successfulDoseExposure(reduced.at(-1)!)).toBe(false);
    expect(assessRecovery('squat',reduced,NOW).tolerance?.comparableOutcomes).toBe(0);
  });

  it('does not learn readiness from missed, warm-up, preview or unperformed follow-up',()=>{
    const history=steadyRecoveryHistory();
    for(const h of history.slice(1)) h.sessionStatus='preview';
    expect(assessRecovery('squat',history,NOW).tolerance?.comparableOutcomes??0).toBe(0);
    const partial=steadyRecoveryHistory();partial.at(-1)!.sets[0].status='skipped';
    expect(assessRecovery('squat',partial,NOW).tolerance?.comparableOutcomes).toBe(0);
  });

  it('all policies retain high-dose caution and continuous nearby-time scores',()=>{
    const h=steadyRecoveryHistory();
    h.push(performed('squat',hoursBefore(NOW,1),{kg:75,reps:8,sets:4,mode:'moderate'},sets(4,{kg:75,reps:8,rir:0,perceivedEffort:'maximal'})));
    for(const variant of ['general','gentle','individual'] as const) {
      expect(assessRecovery('squat',h,NOW,undefined,{variant}).modeCap).toBe('light');
      const t=steadyRecoveryHistory();
      const before=assessRecovery('squat',t,hoursBefore(NOW,1/60),undefined,{variant});
      const after=assessRecovery('squat',t,NOW,undefined,{variant});
      expect(Math.abs(before.residualDose!-after.residualDose!)).toBeLessThan(.001);
      expect(before.modeCap).toBe(after.modeCap);
    }
  });

  it('keeps recovery overlap and descriptive muscle work separate',()=>{
    expect(muscleWorkOverlap('squat','deadlift')).toBe(.5);
    expect(exposureOverlap('squat','deadlift')).toBeLessThan(.5);
    const history=[performed('deadlift',hoursBefore(NOW,72),{sets:2,reps:5},sets(2,{kg:80,reps:5}))];
    expect(rollingDose('squat',history,NOW).left.sets).toBe(1);
    expect(muscleWorkOverlap('biceps_curl','triceps_pushdown')).toBe(0);
  });

  it('learns a bounded weekly guard from comparable actual follow-up without manufacturing a quota',()=>{
    const history=Array.from({length:10},(_,i)=>performed('squat',hoursBefore(NOW,(10-i)*48),{kg:60,reps:8,sets:4,mode:'moderate'},sets(4,{kg:60,reps:8,rir:3})));
    expect(weeklyDoseGuard('squat',history,NOW).ceilingSets).toBeGreaterThan(10);
    // Historical strength remains in history, but very old weeks do not justify
    // a newly expanded weekly guard after a long interruption.
    const later=new Date(Date.parse(NOW)+120*86400000).toISOString();
    expect(weeklyDoseGuard('squat',history,later).ceilingSets).toBe(10);
    const noHistory=weeklyDoseGuard('squat',[],NOW);
    expect(noHistory).toMatchObject({sets:0,repetitions:0,ceilingSets:10});
  });
});

describe('adaptation revision: rest, side and time semantics',()=>{
  const p:RestPerformance={comparisonKey:'same',side:'both',load:60,reps:10,targetReps:10,rir:null,kind:'work',technique:'controlled'};
  it('can cautiously add rest for a comparable repetition drop without RIR',()=>{
    const r=recommendRest({category:'other_compound',mode:'moderate',strengthFocus:true,experience:'experienced',adaptive:true,kind:'work',nextKind:'work',previous:p,current:{...p,reps:7},effort:'ok'});
    expect(r.seconds).toBe(135);expect(r.reasons).toContain('REPETITIONS_DECREASED_UNCERTAIN');
    const intentional=recommendRest({category:'other_compound',mode:'moderate',strengthFocus:true,experience:'experienced',adaptive:true,kind:'work',nextKind:'work',previous:p,current:{...p,reps:7},effort:'easy'});
    expect(intentional.seconds).toBe(120);
  });
  it('preserves explicit rest and does not compare unlike loads or sides',()=>{
    const common={category:'other_compound' as const,mode:'moderate' as const,strengthFocus:true,experience:'experienced' as const,adaptive:true,kind:'work' as const,nextKind:'work' as const,previous:p};
    expect(recommendRest({...common,current:{...p,reps:7},overrideSeconds:180}).seconds).toBe(180);
    expect(recommendRest({...common,current:{...p,reps:7,load:65}}).seconds).toBe(120);
    expect(recommendRest({...common,current:{...p,reps:7,side:'left'}}).seconds).toBe(120);
  });
  it('keeps a left transient signal after opposite-side-only work and permits a right-only safe proposal',()=>{
    const c={...defaultConfiguration('one_arm_dumbbell_row'),executionMode:'single_side' as const,startingSide:'right' as const};
    const h=performed('one_arm_dumbbell_row',hoursBefore(NOW,10),{},sets(1,{kg:20,reps:8}));
    h.sets[0].detail={version:1,configuration:c,rests:[],aborted:false,performances:[{id:'right',status:'done',side:'right',repetitions:8,loadValue:20,secondLoadValue:null,seconds:null,rir:3,technique:'controlled',startedAt:null,completedAt:h.whenUtc,equipment:c.equipment,executionMode:'single_side',comparisonKey:comparisonKey(h.exerciseId,c)}]};
    const warning=symptom({area:'elbow',side:'left',reaction:'transient',reportedAt:hoursBefore(NOW,20)});
    expect(activeSymptoms([warning],[h])).toHaveLength(1);
    const severe=symptom({area:'elbow',side:'left',reaction:'persistent'});
    const i=input({history:[h],symptoms:[severe],profile:{trainingPreferences:trainingPreferences({exerciseDefaults:{one_arm_dumbbell_row:c}})}});
    expect(gateFor(h.exerciseId,pastWork([h],NOW),[severe],NOW,c).relevantSymptoms).toBe('none');
    const replacement=planReplacement(i,{from:plan('cable_row'),to:h.exerciseId,others:[],familiarity:'familiar'});
    expect(replacement.status).toBe('ok');
  });
});
