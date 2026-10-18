import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const origin = 'https://styrka-staging.homeboard-mh.workers.dev';
const deployments = JSON.parse(execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deployments', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const latest = deployments.sort((a, b) => a.created_on.localeCompare(b.created_on)).at(-1);
assert.equal(latest.versions.length, 1);
assert.equal(latest.versions[0].percentage, 100);
const hash = (b) => createHash('sha256').update(b).digest('hex');
const files = readdirSync('dist', { recursive: true }).filter((f) => /\.(js|css|html|svg|png|webmanifest)$/.test(f));
const assets = [];
let csp;
for (const localName of files) {
  const name = localName.replaceAll('\\', '/');
  const response = await fetch(`${origin}/${name}?release=${latest.versions[0].version_id}`);
  assert.equal(response.status, 200, name);
  const body = Buffer.from(await response.arrayBuffer());
  const expected = readFileSync(`dist/${localName}`);
  assert.equal(hash(body), hash(expected), `Published bytes differ: ${name}`);
  assets.push({ file: name, bytes: body.length, sha256: hash(body), matchesLocalBuild: true });
  if (name === 'index.html') {
    csp = response.headers.get('content-security-policy');
    assert.ok(csp?.includes('https://zjjlttbwofohyqmklvkf.supabase.co'));
    assert.ok(!csp.includes('127.0.0.1'));
  }
}
const result = { checkedAt: new Date().toISOString(), url: origin, version: latest.versions[0].version_id, deployment: latest.id,
  publishedAt: latest.created_on, trafficPercent: 100, previousVersion: 'f8c2e87b-88b8-4f57-a2a5-87b44e0e41b1',
  schemaChanges: false, loadSourcePolicyVersion: 'STYRKA-LOAD-SOURCE/1.0.0', assets, csp };
writeFileSync('docs/evidence/onboarding/deployment.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ version: result.version, trafficPercent: result.trafficPercent, verifiedAssets: assets.length, matchedLocalBuild: true }));
