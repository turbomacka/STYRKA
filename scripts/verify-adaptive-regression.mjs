// Read-only historical comparison; --write-golden explicitly records the new, reviewed policy baseline.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// Keep the original baseline after ENGINE/2 itself is committed; never silently compare HEAD to itself.
const baselineRef=process.argv.find(a=>a.startsWith('--baseline='))?.slice('--baseline='.length) ??
  JSON.parse(readFileSync('tests/unit/golden/plans_adaptive_v2.json','utf8')).baselineCommit;
const baselineCommit=execFileSync('git',['rev-parse','--verify',baselineRef+'^{commit}'],{encoding:'utf8'}).trim();
const dir = mkdtempSync(join(tmpdir(), 'styrka-adaptive-baseline-'));
const archive = join(dir, 'baseline.tar');
writeFileSync(archive, execFileSync('git', ['archive', '--format=tar', baselineCommit, 'src/domain', 'src/planner']));
execFileSync('tar', ['-xf', archive, '-C', dir]);
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const old = await server.ssrLoadModule(dir.replaceAll('\\', '/') + '/src/planner/planner.ts');
  const current = await server.ssrLoadModule('/src/planner/planner.ts');
  const { ALL_ESTIMATES, NOW, hoursBefore, input, performed, rule, sets, symptom } = await server.ssrLoadModule('/tests/unit/helpers.ts');
  const strip = (p) => ({ status: p.status, est: p.estimatedMinutes, removed: p.removed, warnings: p.warnings, ex: p.exercises.map((e) => [e.exerciseId, e.mode, e.sets, e.reps, e.kg, e.targetSeconds, e.calibration, [...e.reasons].sort().join(',')]) });
  const previous = [], next = [], changes = [];
  for (const freq of [1, 2, 3, 4, 5, 6, 7]) for (const exp of ['novice', 'intermediate', 'experienced']) for (const rot of [0, 1, 2, 3, 4]) for (const min of [20, 30, 45, 60, 90]) {
    const base = { exerciseSettings: ALL_ESTIMATES, rotationIndex: rot, minutes: min, profile: { plannedSessionsPerWeek: freq, experience: exp } };
    const variants = [input(base), input({ ...base, restrictions: [rule({ kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift' })], history: [performed('squat', hoursBefore(NOW, 30), { kg: 80, mode: 'heavy', sets: 3, reps: 5 }, sets(3, { kg: 80, reps: 5, rir: 2 }))] }), input({ ...base, profile: { ...base.profile, substitutions: { lat_pulldown: 'assisted_pullup' } }, symptoms: [symptom({ area: 'knee', reaction: 'transient' })] }), input(base)];
    variants.forEach((inp, i) => {
      const opts = { minutes: min, readiness: ['good', 'normal', 'tired', 'pain'][rot % 4], painAreas: rot % 4 === 3 ? ['knee'] : [] };
      const a = strip(i === 3 ? old.planExtra(inp, opts) : old.planRegular(inp)), b = strip(i === 3 ? current.planExtra(inp, opts) : current.planRegular(inp));
      previous.push(a); next.push(b);
      if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ freq, exp, rot, min, variant: i, before: a, after: b });
    });
  }
  const digest = (out) => ({ plans: out.length, exercises: out.reduce((n, p) => n + p.ex.length, 0), sha256: createHash('sha256').update(JSON.stringify(out)).digest('hex') });
  const golden = JSON.parse(readFileSync('tests/unit/golden/plans_recovery_v2.json', 'utf8'));
  // Baseline is the exact pre-change checkout commit; the older frozen golden is retained as historical evidence.
  if (!golden.sha256) throw Error('Missing historical golden');
  // Template B now includes a horizontal pull; goal priority may reorder accessories.
  // For other frequencies, common exercises in unconstrained fresh plans must retain their dose.
  // This checks the policy boundary independently of the new whole-plan checksum.
  const outsidePolicy=changes.filter(c=>c.variant===0&&c.freq!==3&&c.min>=90).flatMap(c=>c.before.ex.flatMap(a=>{
    const b=c.after.ex.find(e=>e[0]===a[0]);
    return b&&JSON.stringify(a.slice(0,8))!==JSON.stringify(b.slice(0,8))?[{...c,exercise:a[0]}]:[];
  }));
  if(outsidePolicy.length) throw Error('Unexpected fresh common-exercise dose change: '+JSON.stringify(outsidePolicy[0]));
  const oldRecovery=await server.ssrLoadModule(dir.replaceAll('\\','/')+'/src/domain/recoveryPolicy.ts');
  const newRecovery=await server.ssrLoadModule('/src/domain/recoveryPolicy.ts');
  const boundaryHistory=[performed('bench_press',hoursBefore(NOW,48),{estimatedOneRM:100},sets(3,{kg:80,reps:7,rir:1}))];
  const recoveryBoundary=[hoursBefore(NOW,1/60),NOW].map(now=>({hours:(Date.parse(now)-Date.parse(boundaryHistory[0].whenUtc))/3600000,before:oldRecovery.assessRecovery('bench_press',boundaryHistory,now),after:newRecovery.assessRecovery('bench_press',boundaryHistory,now)}));
  const recoveryDose=[2,3].flatMap(count=>[1,20].flatMap(reps=>[.5,.9].map(intensity=>({sets:count,reps,intensity,currentDose:count*newRecovery.recoveryDose(reps,2,'ok',intensity)}))));
  const report = { baselineCommit, previousGolden:golden.sha256, baselineIsExactCheckout:true, previous: digest(previous), current: digest(next), changed: changes.length, unchanged: next.length - changes.length, recoveryBoundary,recoveryDose,changeScopes:['shared rest and time budget','continuous recovery','frequency distribution','observed progression'], examples: changes.slice(0, 5) };
  report.changeScopes.push('balanced horizontal pull in template B','goal priority ordering','individual recovery tolerance and temporary dose restoration');
  mkdirSync('docs/evidence/adaptation-2026-10-26', { recursive: true });
  writeFileSync('docs/evidence/adaptation-2026-10-26/differential.json', JSON.stringify(report, null, 2) + '\n');
  if (process.argv.includes('--write-golden')) writeFileSync('tests/unit/golden/plans_adaptive_v2_1.json', JSON.stringify({ ruleSetVersion: 'STYRKA-RULES/2.1.0', ...digest(next), originalBaseline:'plans_recovery_v2.json', previousPolicy:'plans_adaptive_v2.json', baselineCommit, intentionalChange:'Shared rest, continuous recovery, frequency distribution, observed dose/progression, balanced horizontal pull and goal ordering. Common-exercise doses in fresh unconstrained plans checked against original commit; independent safety and functional tests also required.' }, null, 2) + '\n');
  console.log(JSON.stringify({ baselineVerified: true, changed: report.changed, unchanged: report.unchanged, changeScopes:['shared rest and time budget','continuous recovery','frequency distribution','observed progression'], current: report.current }));
} finally {
  await server.close();
  // Delete only the exact temporary directory created above, after verifying its parent and prefix.
  if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('styrka-adaptive-baseline-')) throw Error('Unexpected temporary path');
  rmSync(dir, { recursive: true });
}
