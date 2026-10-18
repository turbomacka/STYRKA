// Read-only historical comparison; --write-golden explicitly records the new, reviewed policy baseline.
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'styrka-recovery-baseline-'));
const archive = join(dir, 'baseline.tar');
writeFileSync(archive, execFileSync('git', ['archive', '--format=tar', '3ec01ef', 'src/domain', 'src/planner']));
execFileSync('tar', ['-xf', archive, '-C', dir]);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
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
  const golden = JSON.parse(readFileSync('tests/unit/golden/plans_pre_cr_3ec01ef.json', 'utf8'));
  if (digest(previous).sha256 !== golden.sha256) throw Error('Historical generator does not match original golden hash');
  if (changes.some((c) => c.variant !== 1)) throw Error('Unexpected differences outside recent-work scenarios');
  const report = { baselineCommit: '3ec01ef', originalGoldenVerified: true, previous: digest(previous), current: digest(next), changed: changes.length, unchanged: next.length - changes.length, changedOnlyRecentWork: true, examples: changes.slice(0, 5) };
  mkdirSync('docs/evidence/recovery', { recursive: true });
  writeFileSync('docs/evidence/recovery/differential.json', JSON.stringify(report, null, 2) + '\n');
  if (process.argv.includes('--write-golden')) writeFileSync('tests/unit/golden/plans_recovery_v2.json', JSON.stringify({ ruleSetVersion: 'STYRKA-RULES/1.3.0', ...digest(next), originalBaseline: 'plans_pre_cr_3ec01ef.json', intentionalChange: 'Dose, effort and movement overlap. All differences verified to be confined to recent-work scenarios.' }, null, 2) + '\n');
  console.log(JSON.stringify({ baselineVerified: true, changed: report.changed, unchanged: report.unchanged, changedOnlyRecentWork: true, current: report.current }));
} finally {
  await server.close();
  // Delete only the exact temporary directory created above, after verifying its parent and prefix.
  if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('styrka-recovery-baseline-')) throw Error('Unexpected temporary path');
  rmSync(dir, { recursive: true });
}
