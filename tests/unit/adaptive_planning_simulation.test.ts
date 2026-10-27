import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { planRegular } from '../../src/planner/planner';
import { assessRecovery } from '../../src/domain/recoveryPolicy';
import { exercise } from '../../src/domain/catalog';
import type { PerformedExercise } from '../../src/domain/model';
import { ALL_ESTIMATES, NOW, input, performed, rule, sets } from './helpers';

it('24-week whole-planner trajectories include frequency, overlapping work, skipped and extra exercises',()=>{
  const reports=[];
  for(const scenario of ['ordinary','no-rir','variable','chosen-dose','skipped','extra'] as const) {
    for(const frequency of [2,3]) for(const trend of ['improving','stable','declining'] as const) {
      const history:PerformedExercise[]=[],weeks=[];
      for(let week=0;week<24;week++) {
        const row={week:week+1,plannedSets:0,performedSets:0,plannedReps:0,performedReps:0,minutes:0,patterns:{} as Record<string,{plannedReps:number;performedReps:number}>};
        for(let session=0;session<frequency;session++) {
          const now=new Date(Date.parse(NOW)+(week*7+session*7/frequency)*86400000).toISOString();
          const index=week*frequency+session;
          const p=planRegular(input({nowUtc:now,history,rotationIndex:index,exerciseSettings:ALL_ESTIMATES,profile:{plannedSessionsPerWeek:frequency,experience:'experienced'},restrictions:scenario==='chosen-dose'?[rule({kind:'region_note',area:'knee'})]:[]}));
          expect(p.estimatedMinutes).toBeLessThanOrEqual(61);
          expect(p.exercises.every(e=>Number.isFinite(e.reps)&&e.reps>0&&(e.kg===null||Number.isFinite(e.kg)))).toBe(true);
          row.minutes+=p.estimatedMinutes;
          for(const [order,e] of p.exercises.entries()) {
            const pattern=exercise(e.exerciseId).pattern;
            row.patterns[pattern]??={plannedReps:0,performedReps:0};
            row.plannedSets+=e.sets;row.plannedReps+=e.sets*e.reps;row.patterns[pattern].plannedReps+=e.sets*e.reps;
            if(scenario==='skipped'&&index%5===0&&order>0) continue;
            const initial=ALL_ESTIMATES.find(s=>s.exerciseId===e.exerciseId)?.estimate?.kg??40;
            // Independent synthetic capacity, no assumption that following the plan causes this growth.
            const capacity=initial*(1+week*(trend==='improving'?.006:trend==='declining'?-.004:0)+(scenario==='variable'?Math.sin(index*7.13)*.04:0));
            const kg=e.kg??Math.floor(initial*.4/2.5)*2.5;
            const possible=kg>0?Math.max(1,Math.floor(30*(capacity/kg-1))):e.reps;
            const adapted=scenario==='chosen-dose'&&week>=3&&week<18&&exercise(e.exerciseId).areas.includes('knee');
            const reps=Math.min(e.reps,possible,adapted?6:Infinity),count=adapted?Math.min(2,e.sets):e.sets;
            const h=performed(e.exerciseId,now,e,sets(count,{kg,reps,plannedKg:e.kg,plannedReps:e.reps,rir:scenario==='no-rir'?null:Math.max(0,Math.min(5,possible-reps))}));
            h.sessionId=`${scenario}:${frequency}:${trend}:${index}`;history.push(h);
            row.performedSets+=count;row.performedReps+=count*reps;row.patterns[pattern].performedReps+=count*reps;
          }
          if(scenario==='extra'&&index%5===0) {
            const h=performed('romanian_deadlift',now,{kg:40,reps:10,sets:2,substitutionReason:'USER_ADDED'},sets(2,{kg:40,reps:10,rir:2}));
            h.sessionId=`extra:${frequency}:${trend}:${index}`;history.push(h);
            row.performedSets+=2;row.performedReps+=20;
            row.patterns.hinge??={plannedReps:0,performedReps:0};row.patterns.hinge.performedReps+=20;
          }
          expect(assessRecovery('squat',history,now).residualDose).toBeGreaterThanOrEqual(0);
        }
        weeks.push(row);
      }
      reports.push({scenario,frequency,trend,weeks});
    }
  }
  writeFileSync('docs/evidence/adaptation-2026-10-26/planning-simulation.json',JSON.stringify({weeks:24,runs:reports.length,assumptions:'Synthetic independent capacity. Full current planner, not a physiological forecast. Dose keeps repetitions and sets separate; pattern labels describe movement only.',reports},null,2)+'\n');
},120_000);
