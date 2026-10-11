// Kontrollerar evidensregistrets källänkar (SUB18): DOI mot doi.org:s handle-API, övriga URL:er via HTTP.
// Kräver nätverk; körs manuellt och vid ändring av evidence.json. Skriver resultat till docs/evidence/evidence_links.md.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const reg = JSON.parse(readFileSync('src/science/evidence.json', 'utf8'));
const rows = [];
let failures = 0;
for (const s of reg.sources) {
  let ok = false;
  let detail = '';
  try {
    if (s.doi) {
      const r = await fetch(`https://doi.org/api/handles/${encodeURIComponent(s.doi)}`);
      const j = await r.json();
      ok = j.responseCode === 1;
      detail = `doi.org handle responseCode=${j.responseCode}`;
    }
    const u = await fetch(s.public_url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (STYRKA link check)' } });
    const urlOk = u.status < 400 || u.status === 403; // vissa förlag blockerar automatiska anrop med 403
    detail += `${detail ? '; ' : ''}URL ${u.status}`;
    ok = s.doi ? ok : urlOk;
  } catch (e) {
    detail += ` fel: ${e}`;
  }
  if (!ok) failures++;
  rows.push(`| ${s.source_id} | ${s.doi ?? '–'} | ${ok ? 'OK' : 'FEL'} | ${detail} |`);
}
mkdirSync('docs/evidence', { recursive: true });
const out = [`# Kontroll av källänkar (${new Date().toISOString().slice(0, 10)})`, '', `Register: ${reg.registryVersion}. DOI kontrolleras mot doi.org:s handle-API (responseCode 1 = registrerad DOI).`, '', '| Källa | DOI | Resultat | Detalj |', '|---|---|---|---|', ...rows, '', `Fel: ${failures}`].join('\n');
writeFileSync('docs/evidence/evidence_links.md', out + '\n');
console.log(out);
if (failures) process.exit(1);
