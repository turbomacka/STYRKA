// Kör buildkitets oberoende smoke-kontroll (26 assertions) mot den oförändrade referensmotorn.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('spec/MANIFEST_SHA256.json', 'utf8'));
const expected = manifest.files.find((f) => f.path === 'src/decision_engine.ts').sha256;
for (const p of ['spec/src/decision_engine.ts', 'src/domain/decision_engine.ts']) {
  const h = createHash('sha256').update(readFileSync(p)).digest('hex');
  if (h !== expected) throw new Error(`Referensmotorn ${p} avviker från manifestet (${h})`);
  console.log(`SHA256 OK ${p}`);
}
const tsc = 'node_modules/typescript/bin/tsc';
execFileSync(process.execPath, [tsc, 'spec/src/decision_engine.ts', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--strict', '--outDir', 'spec/.reference-dist'], { stdio: 'inherit' });
execFileSync(process.execPath, ['spec/tests/smoke.node.cjs'], { stdio: 'inherit' });
