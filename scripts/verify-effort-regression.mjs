// Read-only historical comparison; --write-golden explicitly records the new, reviewed policy baseline.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// Keep the original baseline after ENGINE/2 itself is committed; never silently compare HEAD to itself.
const baselineRef=process.argv.find(a=>a.startsWith('--baseline='))?.slice('--baseline='.length) ??
  '305aa36f4f028f5645a32f98698c26d1ea9a374c';
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

  const golden=JSON.parse(readFileSync('tests/unit/golden/plans_adaptive_v2_1.json','utf8'));
  if(digest(previous).sha256!==golden.sha256)throw Error('Baseline must match the frozen 2.1 policy');
  if(changes.some(c=>c.variant!==1))throw Error('Unexpected change outside recent-history scenarios');
  const report={baselineCommit,previous:digest(previous),current:digest(next),changed:changes.length,unchanged:next.length-changes.length,changes};
  mkdirSync('docs/evidence/effort-scale-2026-10-29',{recursive:true});
  writeFileSync('docs/evidence/effort-scale-2026-10-29/differential.json',JSON.stringify(report,null,2)+'\n');
  if(process.argv.includes('--write-golden'))writeFileSync('tests/unit/golden/plans_adaptive_v2_2.json',JSON.stringify({ruleSetVersion:'STYRKA-RULES/2.2.0',...digest(next),baselineCommit,previousPolicy:'plans_adaptive_v2_1.json',intentionalChange:'Known-source max evidence replaces unqualified capacity in relative intensity; unchanged initial plans; history cases inspected in differential.json.'},null,2)+'\n');
  console.log(JSON.stringify({baselineCommit,changed:changes.length,unchanged:next.length-changes.length,current:digest(next)}));
}finally{
  await server.close();
  if(dirname(resolve(dir))!==resolve(tmpdir())||!basename(dir).startsWith('styrka-adaptive-baseline-'))throw Error('Unexpected temporary path');
  rmSync(dir,{recursive:true});
}
