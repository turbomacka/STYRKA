import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

// Read-only verification of the existing staging release. No credentials in output.
const origin = 'https://styrka-staging.homeboard-mh.workers.dev';
const directory = 'docs/evidence/adaptation-2026-10-26';
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'package.json', 'package-lock.json', 'vite.config.ts', 'wrangler.jsonc', 'index.html', 'public'], { stdio: 'ignore' });
const deployments = JSON.parse(execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deployments', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  .sort((a, b) => a.created_on.localeCompare(b.created_on));
const latest = deployments.at(-1);
assert.equal(latest.versions.length, 1);
assert.equal(latest.versions[0].percentage, 100);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const files = readdirSync('dist', { recursive: true }).filter((file) => /\.(js|css|html|svg|png|webmanifest)$/.test(file));
assert.ok(files.includes('index.html') && files.includes('sw.js'));
const assets = [];
let csp;
for (const localName of files) {
  const name = localName.replaceAll('\\', '/');
  const response = await fetch(`${origin}/${name}?release=${latest.versions[0].version_id}`);
  assert.equal(response.status, 200, name);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(body), hash(readFileSync(`dist/${localName}`)), `Published bytes differ: ${name}`);
  assets.push({ file: name, bytes: body.length, sha256: hash(body), matchesLocalBuild: true });
  if (name === 'index.html') {
    csp = response.headers.get('content-security-policy');
    assert.ok(csp?.includes('https://zjjlttbwofohyqmklvkf.supabase.co'));
    assert.ok(!csp.includes('127.0.0.1'));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
}
const result = { checkedAt: new Date().toISOString(), sourceCommit, url: origin,
  version: latest.versions[0].version_id, deployment: latest.id, publishedAt: latest.created_on,
  trafficPercent: 100, previousVersions: deployments.at(-2)?.versions ?? [], schemaChanges: false,
  engineVersion: '2.1.0', assets, csp };
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/deployment.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ sourceCommit, version: result.version, trafficPercent: 100, verifiedAssets: assets.length, matchedLocalBuild: true }));
