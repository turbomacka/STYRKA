import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Approved 2026-11-17. Development tooling only; remove when upstream is fixed.
// See docs/SECURITY-EXCEPTION-2026-11-17.md. Never waive other high/critical findings.
const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const expires = Date.parse('2026-11-24T00:00:00Z');
const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const high = severity => levels.indexOf(severity) >= 3;

export function assessAudit(report, production, lock, now = Date.now()) {
  for (const audit of [report, production]) {
    assert.equal(audit.auditReportVersion, 2, 'Unrecognized audit format');
    assert.ok(!audit.error && audit.vulnerabilities && audit.metadata?.vulnerabilities, 'Incomplete audit');
    const entries = Object.values(audit.vulnerabilities);
    assert.equal(entries.length, audit.metadata.vulnerabilities.total, 'Incomplete findings');
    for (const entry of entries) {
      assert.ok(levels.includes(entry.severity) && Array.isArray(entry.via) && entry.via.length, 'Invalid finding');
      for (const via of entry.via) {
        assert.ok(typeof via === 'string' ? audit.vulnerabilities[via] :
          via && levels.includes(via.severity) && typeof via.url === 'string', 'Invalid advisory chain');
      }
    }
  }
  for (const entry of Object.values(production.vulnerabilities)) {
    assert.ok(!high(entry.severity), `Production vulnerability: ${entry.name}`);
    assert.ok(!entry.via.some(via => typeof via === 'object' && via.url === advisory), 'Exception reached production');
  }
  function allowed(name, visiting = new Set()) {
    assert.ok(!visiting.has(name), 'Cyclic advisory chain');
    const entry = report.vulnerabilities[name];
    if (!high(entry.severity)) return true; // Existing moderate threshold is unchanged.
    assert.equal(entry.severity, 'high', `Critical vulnerability: ${name}`);
    assert.ok(now < expires, 'Temporary audit exception expired');
    assert.ok(entry.nodes?.length && entry.nodes.every(node => lock.packages?.[node]?.dev === true), `Not development-only: ${name}`);
    const next = new Set([...visiting, name]);
    return entry.via.every(via => typeof via === 'string' ? allowed(via, next) :
      !high(via.severity) || (via.severity === 'high' && via.url === advisory && via.name === 'picomatch'));
  }
  const waived = [];
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    if (!high(entry.severity)) continue;
    assert.ok(allowed(name), `Unexcepted vulnerability: ${name}`);
    waived.push(name);
  }
  return { findings: report.metadata.vulnerabilities, temporaryDevelopmentException: waived, expires: new Date(expires).toISOString() };
}

function audit(production = false) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['audit', '--json', ...(production ? ['--omit=dev'] : [])],
    { encoding: 'utf8', shell: process.platform === 'win32', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  assert.ok(!result.error && [0, 1].includes(result.status), 'npm audit request failed');
  return JSON.parse(result.stdout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = assessAudit(audit(), audit(true), JSON.parse(readFileSync('package-lock.json', 'utf8')));
  console.log(JSON.stringify(result, null, 2));
}
