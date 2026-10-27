import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recommendNext, type Exposure, type Experience, type Recommendation } from '../../src/domain/decision_engine';
import { recommendNext as baselineNext, type Recommendation as OldRecommendation } from '../../spec/src/decision_engine';
import { base, exposure } from './adaptiveFixtures';

type Persona={name:string;experience:Experience;step:number;start:number;frequency:number;rir:boolean;noise?:boolean;breaks?:boolean;failTrials?:boolean;dose?:'reps'|'load'|'sets';partial?:boolean;extra?:boolean;cap?:number};
const personas:Persona[]=[
  {name:'novice',experience:'novice',step:2.5,start:30,frequency:3,rir:true},
  {name:'intermediate',experience:'intermediate',step:2.5,start:60,frequency:3,rir:true},
  {name:'experienced',experience:'experienced',step:2.5,start:80,frequency:3,rir:true},
  {name:'small-steps',experience:'experienced',step:1,start:80,frequency:3,rir:true},
  {name:'coarse-steps',experience:'experienced',step:5,start:20,frequency:3,rir:true},
  {name:'no-rir',experience:'experienced',step:2.5,start:40,frequency:3,rir:false},
  {name:'daily-variation',experience:'intermediate',step:2.5,start:60,frequency:3,rir:true,noise:true},
  {name:'breaks',experience:'experienced',step:2.5,start:80,frequency:3,rir:true,breaks:true},
  {name:'failed-trials',experience:'experienced',step:2.5,start:80,frequency:3,rir:false,failTrials:true},
  {name:'chosen-reps',experience:'experienced',step:2.5,start:60,frequency:3,rir:true,dose:'reps'},
  {name:'chosen-load',experience:'experienced',step:2.5,start:60,frequency:3,rir:true,dose:'load'},
  {name:'chosen-sets',experience:'experienced',step:2.5,start:60,frequency:3,rir:true,dose:'sets'},
  {name:'skipped-work',experience:'experienced',step:2.5,start:80,frequency:3,rir:true,partial:true},
  {name:'extra-work',experience:'experienced',step:2.5,start:80,frequency:3,rir:true,extra:true},
  {name:'two-weekly',experience:'experienced',step:2.5,start:80,frequency:2,rir:true},
  {name:'hard-cap',experience:'experienced',step:2.5,start:80,frequency:3,rir:true,cap:81},
];

function simulate(persona:Persona,trend:'improving'|'stable'|'declining',version:'baseline'|'adaptive',curve:'epley'|'brzycki'='epley') {
  let previous:Recommendation={...base,kg:persona.start,sets:persona.dose==='sets'?4:3,reps:persona.dose==='reps'?10:7,bandMax:persona.dose==='reps'?10:7};
  const falseReductionExamples:unknown[]=[],doseChoiceExamples:unknown[]=[];
  const stallReasons:Record<string,number>={},reversalReasons:Record<string,number>={};
  const history:Exposure[]=[],weekly:Array<{week:number;plannedSets:number;performedSets:number;plannedReps:number;performedReps:number;load:number}>=[];
  let stalls=0,limitViolations=0,falseReductions=0,doseMisinterpretations=0,supportedDoseReviews=0,oscillations=0,rollbackLag=0,failedTrials=0,resumed=0,lastDirection=0,lastKg=previous.kg!,streak=0;
  let confirmed={kg:persona.start,reps:previous.reps,sets:previous.sets},confirmWins=0,lastSuccessful=confirmed,failedAt=-1;
  for(let week=0;week<24;week++) {
    const row={week:week+1,plannedSets:0,performedSets:0,plannedReps:0,performedReps:0,load:previous.kg!};
    if(persona.breaks && [7,8,9,17].includes(week)){weekly.push(row);continue;}
    for(let session=0;session<persona.frequency;session++) {
      const index=week*persona.frequency+session;
      // The same latent capacity/noise trajectory drives both policies; no simulated training efficacy is claimed.
      const growth=trend==='stable'?0:trend==='declining'?-.004:persona.experience==='novice'?.025:persona.experience==='intermediate'?.012:.006;
      const noise=persona.noise?Math.sin(index*7.13)*.045:0;
      const capacity=persona.start*(1+((persona.dose==='reps'?10:7)+3)/30)*(1+week*growth+noise);
      const chosen=persona.dose && week>=3 && week<18;
      const kg=chosen&&persona.dose==='load'?persona.start-2*persona.step:previous.kg!;
      let possible=Math.max(1,Math.floor(curve==='epley'?30*(capacity/Math.max(kg,.1)-1):(1.0278-kg/capacity)/.0278));
      if(persona.failTrials && (kg>persona.start||previous.reps>7) && week<12)possible=Math.min(possible,Math.max(1,previous.reps-1));
      const reps=chosen&&persona.dose==='reps'?6:Math.min(previous.reps,possible);
      const partial=persona.partial&&index%7===0;
      const setCount=chosen&&persona.dose==='sets'?2:partial?1:previous.sets+(persona.extra&&index%9===0?1:0);
      const p={...previous,sets:previous.sets},e=exposure(p,{kg,reps,sets:setCount,rir:persona.rir?Math.max(0,Math.min(5,possible-reps)):null},index);
      e.whenUtc=new Date(Date.UTC(2026,0,1)+(week*7+session*7/persona.frequency)*86400000).toISOString();
      if(partial){e.finished=false;e.voluntaryAbort=true;e.complete=false;}
      row.plannedSets+=p.sets;row.performedSets+=setCount;row.plannedReps+=p.sets*p.reps;row.performedReps+=setCount*reps;
      const harder=kg>confirmed.kg+.001||(kg===confirmed.kg&&p.reps>confirmed.reps);
      const failed=harder&&reps<p.reps&&!partial&&!chosen;
      if(failed){failedTrials++;failedAt=index;}
      if(reps>=p.reps&&!partial&&!chosen) {
        const actual={kg,reps,sets:setCount};
        confirmWins=JSON.stringify(actual)===JSON.stringify(lastSuccessful)?confirmWins+1:1;lastSuccessful=actual;
        if(confirmWins>=2)confirmed=actual;
      }
      const hours=history.length?(Date.parse(e.whenUtc)-Date.parse(history.at(-1)!.whenUtc))/3600000:72;
      history.push(e);
      const args={previous:p,history,experience:persona.experience,increment:persona.step,hoursSinceRelevant:hours,relevantSymptoms:'none' as const,impactedRegion:!!persona.dose};
      const r:Recommendation=version==='baseline'?baselineNext({...args,previous:p as OldRecommendation}):recommendNext({...args,maxLoadKg:persona.cap});
      // An explicitly anchored, small review after new positive performances is distinct
      // from ignoring the user's dose. Independently check the observations, not just the reason code.
      const stableChosen=history.filter(x=>Date.parse(x.whenUtc)>Date.UTC(2026,0,22)&&x.complete&&!x.voluntaryAbort&&x.sets.length===setCount&&x.sets.every(s=>s.actualKg===kg&&s.actualReps===reps&&s.technique==='controlled'&&s.rir!==null&&s.rir>=2));
      const supportedReview=chosen&&r.reasons.includes('USER_DOSE_REVIEW_TRIAL')&&stableChosen.length>=2&&
        e.sets.every(s=>s.rir!==null&&s.rir>=2)&&r.adaptive?.trialBaseline?.kg===kg&&r.adaptive.trialBaseline.reps===reps&&r.adaptive.trialBaseline.sets===setCount&&
        r.sets===setCount&&((r.kg===kg&&r.reps===reps+1)||(r.kg===kg+persona.step&&r.reps<=reps));
      if(supportedReview)supportedDoseReviews++;
      if(r.kg!==null && r.kg>(persona.cap??Infinity))limitViolations++;
      if(failed && r.kg!==null && r.kg<confirmed.kg-.001){falseReductions++;falseReductionExamples.push({week,index,previous:p,confirmed,result:r});}
      if(chosen && !supportedReview && ((persona.dose==='reps'&&(r.reps>6||r.kg!>kg))||(persona.dose==='load'&&r.kg!>kg)||(persona.dose==='sets'&&r.sets>2))){doseMisinterpretations++;doseChoiceExamples.push({week,index,planned:{kg:p.kg,reps:p.reps,sets:p.sets},actual:{kg,reps,sets:setCount},next:{kg:r.kg,reps:r.reps,sets:r.sets},reasons:r.reasons});}
      if(failedAt>=0&&r.kg===confirmed.kg&&r.reps===confirmed.reps){rollbackLag=Math.max(rollbackLag,index-failedAt);failedAt=-1;}
      if(week>=12&&persona.failTrials&&r.kg!>persona.start)resumed++;
      const dir=Math.sign((r.kg??lastKg)-lastKg);if(dir && lastDirection && dir!==lastDirection){oscillations++;const reason=r.reasons[0];reversalReasons[reason]=(reversalReasons[reason]??0)+1;}if(dir)lastDirection=dir;lastKg=r.kg??lastKg;
      const supportedNext=kg+persona.step<=capacity/(1+base.bandMin/30);
      streak=reps>=p.reps&&!partial&&!chosen&&supportedNext&&r.kg===p.kg&&r.reps===p.reps?streak+1:0;if(streak>=6){stalls++;const reason=r.reasons[0];stallReasons[reason]=(stallReasons[reason]??0)+1;}
      previous=r;row.load=r.kg??kg;
    }
    weekly.push(row);
  }
  return {name:persona.name,trend,version,curve,falseReductionExamples,doseChoiceExamples,stallReasons,reversalReasons,stalls,limitViolations,falseReductions,doseMisinterpretations,supportedDoseReviews,rollbackLag,failedTrials,resumed,oscillations,finalKg:previous.kg,weekly};
}

describe('24-week deterministic counterfactual simulations',()=>{
  it('runs 16 profiles × 3 capacity trajectories through frozen ENGINE/1 and ENGINE/2.1',()=>{
    const results=personas.flatMap(p=>(['improving','stable','declining'] as const).flatMap(t=>(['baseline','adaptive'] as const).map(v=>simulate(p,t,v))));
    const totals=(version:string)=>results.filter(r=>r.version===version).reduce((s,r)=>({stalls:s.stalls+r.stalls,limitViolations:s.limitViolations+r.limitViolations,falseReductions:s.falseReductions+r.falseReductions,doseMisinterpretations:s.doseMisinterpretations+r.doseMisinterpretations,oscillations:s.oscillations+r.oscillations}),{stalls:0,limitViolations:0,falseReductions:0,doseMisinterpretations:0,oscillations:0});
    // Identical observed trajectories isolate trial/cap regressions that the frozen engine's stalls can hide.
    const commonReplay=[{name:'failed-weight',p:{...base,kg:82.5,reps:5},h:[exposure(base,{},0),exposure(base,{},1),exposure({...base,kg:82.5,reps:5},{reps:3,rir:null},2),exposure({...base,kg:82.5,reps:5},{reps:3,rir:null},3)],maximum:500},
      {name:'failed-rep',p:{...base,kg:40,reps:8,bandMax:10},h:[exposure({...base,kg:40}, {rir:null},0),exposure({...base,kg:40},{rir:null},1),exposure({...base,kg:40,reps:8},{reps:7,rir:null},2),exposure({...base,kg:40,reps:8},{reps:7,rir:null},3)],maximum:500},
      {name:'manual-over-cap',p:{...base,kg:100},h:[exposure({...base,kg:100},{},0),exposure({...base,kg:100},{},1)],maximum:81}].map(c=> {
        const args={previous:c.p,history:c.h,experience:'experienced' as const,increment:2.5,hoursSinceRelevant:72,relevantSymptoms:'none' as const,impactedRegion:false};
        const before=baselineNext({...args,previous:c.p as OldRecommendation}),after=recommendNext({...args,maxLoadKg:c.maximum});
        return {name:c.name,before:{kg:before.kg,reps:before.reps},after:{kg:after.kg,reps:after.reps},maximum:c.maximum};
      });
    expect(commonReplay[0].after).toEqual({kg:80,reps:7});expect(commonReplay[1].after).toEqual({kg:40,reps:7});expect(commonReplay[2].after.kg).toBeLessThanOrEqual(81);
    const report={commonReplay,weeks:24,personas:personas.length,trajectories:3,seed:'deterministic sine, index 7.13',assumptions:'Synthetic capacity is independent of recommendations. Counterfactual trajectories are not physiological predictions; kilogram arithmetic is confined to this mass-only simulator. Application/ordinal/side cases have separate tests.',baseline:totals('baseline'),adaptive:totals('adaptive'),results};
    mkdirSync('docs/evidence/adaptation-2026-10-26',{recursive:true});writeFileSync('docs/evidence/adaptation-2026-10-26/simulation.json',JSON.stringify(report,null,2)+'\n');
    expect(report.adaptive.limitViolations).toBe(0);expect(report.adaptive.falseReductions).toBe(0);
    expect(report.adaptive.stalls).toBeLessThan(report.baseline.stalls);expect(report.adaptive.doseMisinterpretations).toBeLessThan(report.baseline.doseMisinterpretations);
    for(const r of results.filter(r=>r.version==='adaptive'))expect(r.finalKg).toBeGreaterThanOrEqual(0);
  });
});

it('6,000 seeded properties: caps, feasible steps, trial rollback, missing RIR and determinism',()=>{
  let seed=23026;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<6000;i++) {
    const step=[.5,1,2.5,5,10][Math.floor(rand()*5)],kg=step*(2+Math.floor(rand()*40)),reps=5+Math.floor(rand()*6),max=kg+rand()*step;
    const p={...base,kg,reps,bandMax:reps,sets:1+Math.floor(rand()*4)};
    const h=[exposure(p,{rir:rand()<.5?null:2},0),exposure(p,{rir:rand()<.5?null:2},1)];
    const args={previous:p,history:h,experience:'experienced' as const,increment:step,hoursSinceRelevant:72,relevantSymptoms:'none' as const,impactedRegion:false,maxLoadKg:max};
    const r=recommendNext(args);expect(r.kg).toBeLessThanOrEqual(max);expect(Number.isFinite(r.kg)).toBe(true);expect(Math.abs(r.kg!/step-Math.round(r.kg!/step))).toBeLessThan(1e-6);expect(recommendNext(args)).toEqual(r);
    const trial={...p,kg:kg+step,reps:5};h.push(exposure(trial,{reps:3,rir:null},2));
    const back=recommendNext({...args,previous:trial,maxLoadKg:undefined});expect(back.kg).toBe(kg);expect(back.reps).toBe(reps);
    const dose=recommendNext({...args,previous:p,history:[exposure(p,{reps:Math.max(1,Math.floor(reps*.6))},3)],impactedRegion:true});expect(dose.kg).toBeLessThanOrEqual(kg);expect(dose.reps).toBeLessThan(reps);
  }
});

it('1,000 ordered-level properties: irregular levels, restarts and deterministic replay',()=>{
  let seed=243;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1000;i++) {
    const loads=[1,3+Math.floor(rand()*4),10+Math.floor(rand()*8),25+Math.floor(rand()*20)];
    const kg=loads[Math.floor(rand()*loads.length)],p={...base,kg},history=[exposure(p,{rir:null},0),exposure(p,{rir:null},1)];
    const args={previous:p,history,experience:'experienced' as const,increment:1,availableLoads:loads,loadModel:'ordinal' as const,hoursSinceRelevant:i%2?800:72,relevantSymptoms:'none' as const,impactedRegion:false};
    const r=recommendNext(args);expect(loads).toContain(r.kg);expect(r.adaptive?.capacity.estimatedMax).toBeNull();
    expect(recommendNext({...args,history:[history[1],history[0]]})).toEqual(r);
  }
});


it('3,000 manual dose properties: easy trials use selected anchors, edits and direct logs agree, caps survive',()=>{
  let seed=261026;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<3000;i++) {
    const step=[.5,1,2.5,5][Math.floor(rand()*4)],kg=step*(10+Math.floor(rand()*50)),selected=kg-step*2;
    const reps=5+Math.floor(rand()*6),p={...base,kg,reps,bandMax:reps},feeling=i%2?'easy' as const:'ok' as const;
    const direct=exposure(p,{kg:selected,rir:null},0);direct.sets.forEach(s=>{s.effort=feeling;s.originalKg=kg;s.originalReps=reps;});
    const edited=structuredClone(direct);edited.sets.forEach(s=>s.plannedKg=selected);
    const args={previous:p,experience:'experienced' as const,increment:step,hoursSinceRelevant:72,relevantSymptoms:'none' as const,impactedRegion:false};
    const a=recommendNext({...args,history:[direct]}),b=recommendNext({...args,history:[edited]});
    expect([a.kg,a.reps,a.sets]).toEqual([b.kg,b.reps,b.sets]);expect(a.kg).toBeGreaterThanOrEqual(selected);
    expect(a.adaptive?.confirmed).toBeNull();
    if(feeling==='ok')expect(a.kg).toBe(selected);
    if(a.adaptive?.attempted) {
      expect(a.adaptive.trialBaseline).toEqual({kg:selected,reps,sets:3});
      const failed=exposure(a,{reps:Math.max(1,a.reps-2),rir:null},1);failed.attemptBaseline=a.adaptive.trialBaseline;failed.attempted=a.adaptive.attempted;
      const back=recommendNext({...args,previous:a,history:[direct,failed]});expect(back).toMatchObject({kg:selected,reps,sets:3});
    }
    const capped=recommendNext({...args,history:[direct],maxLoadKg:selected});expect(capped.kg).toBeLessThanOrEqual(selected);
    const preview=recommendNext({...args,previous:a,history:[direct]});expect([preview.kg,preview.reps,preview.sets]).toEqual([a.kg,a.reps,a.sets]);
  }
});

it('alternative repetition curve preserves safety and learns repeated smaller dose choices',()=>{
  const results=personas.flatMap(p=>(['improving','stable','declining'] as const).flatMap(t=>(['baseline','adaptive'] as const).map(v=>simulate(p,t,v,'brzycki'))));
  writeFileSync('docs/evidence/adaptation-2026-10-26/simulation-alternative-curve.json',JSON.stringify({weeks:24,curve:'Brzycki inverse (1.0278 - load/capacity) / .0278, same independent capacity trajectory',limitation:'A sensitivity test against a different algebraic repetition curve; neither simulator is a physiological validation.',results},null,2)+'\n');
  for(const r of results.filter(x=>x.version==='adaptive')) {
    expect(r.limitViolations).toBe(0);expect(r.falseReductions).toBe(0);
    // When the intended six reps equal the current target, intent is initially unobservable.
    // Two attempts at seven can supply the repeated-choice evidence; no continued retries follow.
    expect(r.doseMisinterpretations).toBeLessThanOrEqual(r.name==='chosen-reps'?2:0);
  }

});
