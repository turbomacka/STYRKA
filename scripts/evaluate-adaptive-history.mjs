// Offline evaluation of explicitly supplied PlannerInput snapshots. No database, network
// connector, telemetry or individual identifiers are included in the aggregate output.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const file=process.argv[2];
if(!file) throw new Error('Usage: node scripts/evaluate-adaptive-history.mjs <local PlannerInput JSON array>');
const inputs=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(inputs)||inputs.length>10000) throw new Error('Expected at most 10,000 PlannerInput snapshots');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {planRegular}=await server.ssrLoadModule('/src/planner/planner.ts');
  const {ENGINE_VERSION}=await server.ssrLoadModule('/src/domain/decision_engine.ts');
  const {ADAPTIVE_POLICY}=await server.ssrLoadModule('/src/domain/adaptiveProgression.ts');
  const report={engineVersion:ENGINE_VERSION,policyVersion:ADAPTIVE_POLICY.version,plans:0,exercises:0,workSets:0,workRepetitions:0,estimatedMinutes:0,reasons:{}};
  for(const input of inputs) {
    const p=planRegular(input);
    report.plans++;report.estimatedMinutes+=p.estimatedMinutes;
    for(const e of p.exercises) {
      report.exercises++;report.workSets+=e.sets;report.workRepetitions+=e.sets*e.reps;
      for(const reason of new Set(e.reasons))report.reasons[reason]=(report.reasons[reason]??0)+1;
    }
  }
  report.estimatedMinutes=+report.estimatedMinutes.toFixed(2);
  console.log(JSON.stringify(report,null,2));
} finally {await server.close();}
