/**
 * Evidensregistret (CR §1.3–§1.4) mot produktägarens `STYRKA_evidence_register.json` (schema 1.0.0):
 * samma källor och påståenden, ordagranna registertexter, verifierbara länkar, märkning och ankare, inga persondata.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import raw from '../../src/science/evidence.json';
import { CLASSIFICATION_SV, EVIDENCE, HEURISTIC_LABEL, claimAnchor, ruleForReason, sourceHref, matchesQuery } from '../../src/science/registry';
import { REASONS } from '../../src/ui/strings';
import { RULESET_VERSION } from '../../src/domain/model';
import { SEED, SUBSTITUTION_CATALOG_VERSION, allRelations } from '../../src/domain/substitutionCatalog';
import { ENGINE_VERSION } from '../../src/domain/decision_engine';

type RegSource = { id: string; title: string; year: number; permalink: string; study_type: string; population_or_scope: string; supported_claim_sv: string; limitations_sv: string };
type RegClaim = { id: string; source_ids: string[]; classification: string; rule_ids: string[] };
const register = JSON.parse(readFileSync('spec/cr-2026-10-10-01/STYRKA_evidence_register.json', 'utf8')) as { schema_version: string; reviewed_at: string; sources: RegSource[]; claims: RegClaim[] };

describe('evidensregister', () => {
  it('versioner stämmer med motor, regelverk, substitutionskatalog och källregistret', () => {
    expect(EVIDENCE.engineVersion).toBe(ENGINE_VERSION);
    expect(EVIDENCE.ruleSetVersion).toBe(RULESET_VERSION);
    expect(EVIDENCE.substitutionCatalogVersion).toBe(SUBSTITUTION_CATALOG_VERSION);
    expect(EVIDENCE.sourceRegister).toMatchObject({ file: 'spec/cr-2026-10-10-01/STYRKA_evidence_register.json', schema_version: register.schema_version, reviewed_at: register.reviewed_at });
  });

  it('källorna är exakt registrets (ordagrant) plus endast versionssatta, märkta tillägg', () => {
    expect(EVIDENCE.sources.slice(0, register.sources.length).map((s) => s.source_id)).toEqual(register.sources.map((s) => s.id));
    const additions = EVIDENCE.sources.slice(register.sources.length);
    expect(additions.map((s) => s.source_id)).toEqual(EVIDENCE.registryAdditions.flatMap((a) => a.source_ids));
    for (const s of additions) {
      expect(EVIDENCE.registryAdditions.find((a)=>a.source_ids.includes(s.source_id))?.version).toBe(s.added_in);
      expect(s.doi, s.source_id).toMatch(/^10\.\d{4,9}\/\S+$/);
      expect(s.public_url).toMatch(/^https:\/\//);
      expect(s.supported_claim_sv && s.limitations_sv && s.design && s.population, s.source_id).toBeTruthy();
      expect(EVIDENCE.balanceMethod.source_ids.includes(s.source_id) || EVIDENCE.claims.some((c)=>c.source_ids.includes(s.source_id))).toBe(true);
    }
    for (const s of EVIDENCE.sources.slice(0, register.sources.length)) expect(s.added_in, s.source_id).toBeUndefined();
    for (const r of register.sources) {
      const s = EVIDENCE.sources.find((x) => x.source_id === r.id)!;
      expect({ title: s.title, year: s.year, public_url: s.public_url, design: s.design, population: s.population, supported: s.supported_claim_sv, limits: s.limitations_sv }, r.id).toEqual({
        title: r.title,
        year: r.year,
        public_url: r.permalink,
        design: r.study_type,
        population: r.population_or_scope,
        supported: r.supported_claim_sv,
        limits: r.limitations_sv,
      });
      expect(sourceHref(s)).toBe(r.permalink);
      expect(s.authors && s.publication, r.id).toBeTruthy();
      if (s.doi) expect(s.doi, r.id).toMatch(/^10\.\d{4,9}\/\S+$/);
      if (r.permalink.startsWith('https://doi.org/')) expect(r.permalink).toBe(`https://doi.org/${s.doi}`);
      expect(s.last_checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('påståendena är exakt registrets (id, källor, klassning, regel-id) och kartläggs till befintliga metodregler', () => {
    expect(EVIDENCE.claims.slice(0,register.claims.length).map((c) => c.claim_id)).toEqual(register.claims.map((c) => c.id));
    const rules = new Set(EVIDENCE.rules.map((r) => r.rule_id));
    for (const r of register.claims) {
      const c = EVIDENCE.claims.find((x) => x.claim_id === r.id)!;
      expect({ s: c.source_ids, k: c.evidence_kind, r: c.register_rule_ids }, r.id).toEqual({ s: r.source_ids, k: r.classification, r: r.rule_ids });
      expect(c.rule_is_heuristic, r.id).toBe(r.classification === 'product_heuristic_unvalidated');
      // Påståenden utan källa måste vara märkta produktregler (registrets egen modell).
      if (!c.source_ids.length) expect(c.rule_is_heuristic, r.id).toBe(true);
      for (const id of c.rule_ids) expect(rules.has(id), `${r.id}→${id}`).toBe(true);
      expect(['A', 'B', 'C', 'D']).toContain(c.section);
      expect(CLASSIFICATION_SV[c.evidence_kind], r.id).toBeTruthy();
      expect(c.last_reviewed_at).toBe(register.reviewed_at);
      expect(claimAnchor(c.claim_id)).toMatch(/^pastaende-[a-z0-9-]+$/);
    }
    // Alla registerkällor används; alla evidens-id i substitutionskatalogen och seed-filen finns i registret.
    const sources = new Set(EVIDENCE.sources.map((s) => s.source_id));
    const used = new Set(EVIDENCE.claims.flatMap((c) => c.source_ids));
    for (const r of allRelations()) for (const e of r.evidence_ids) expect(sources.has(e), `${r.from}->${r.to}: ${e}`).toBe(true);
    for (const id of Object.keys(SEED.reference_urls)) expect(sources.has(id), id).toBe(true);
    for (const s of EVIDENCE.sources) expect(used.has(s.source_id) || allRelations().some((r) => r.evidence_ids.includes(s.source_id)) || EVIDENCE.balanceMethod.source_ids.includes(s.source_id), s.source_id).toBe(true);
    // Seed-filens länkar är desamma som registrets.
    for (const [id, url] of Object.entries(SEED.reference_urls)) expect(EVIDENCE.sources.find((s) => s.source_id === id)!.public_url).toBe(url);
  });

  it('alla skälkoder som motorn kan visa har en metodregel med stabilt ankare', () => {
    const codes = [...Object.keys(REASONS), 'TEMPLATE_A', 'TEMPLATE_lower_squat', 'TIME_LIMIT_30', 'SUB_RELATION_NEAR_VARIANT', 'SUB_RELATION_MOVEMENT_FAMILY', 'SUB_RELATION_ACCESSORY', 'SUB_TARGET_OBSERVED', 'SUB_TARGET_ESTIMATED', 'SUB_CALIBRATION', 'SUB_POPULATION_PRIOR_LOW_CONFIDENCE', 'SUB_NO_ESTIMATE', 'SUB_NEW_MACHINE_PROFILE', 'SUB_REVERT_TO_ORIGINAL', 'CALIBRATION_EFFORT_TOO_HEAVY'];
    const missing = codes.filter((c) => !ruleForReason(c));
    expect(missing).toEqual([]);
    const ids = EVIDENCE.rules.map((r) => r.rule_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('regler med siffror utan direkt empiriskt stöd är märkta som produktregel; inga påståenden om klinisk validering', () => {
    const mustBeHeuristic = ['balans-allsidighet', 'balans-styrka', 'balans-forslag', 'e1rm-uppskattning', 'startvikt', 'set-och-repetitioner', 'dubbel-progression', 'reps-i-reserv', 'missade-mal', 'tung-belastning', 'aterhamtning', 'omstart', 'tidsmodell', 'unilateral-tid', 'prioritet-baslyft', 'ovningsbyte-relationer', 'prior-frontboj', 'prior-hantelpress', 'forsta-exponering', 'kalibrerad-niva', 'upplevd-anstrangning'];
    for (const id of mustBeHeuristic) expect(EVIDENCE.rules.find((r) => r.rule_id === id)?.heuristic, id).toBe(true);
    expect(HEURISTIC_LABEL).toBe('Appens antagande – inte vetenskapligt validerat');
    const text = JSON.stringify(raw);
    expect(text).not.toMatch(/kliniskt validerad (faktor|omräkning)(?! )/i);
    // Ingen juridisk slutsats om medicinteknisk status – bara att avsett ändamål avgör och att bedömning återstår.
    expect(text).not.toMatch(/är inte en medicinteknisk produkt/i);
    expect(EVIDENCE.claims.find((c) => c.claim_id === 'claims.regulatory_boundary')!.plain_language_sv).toMatch(/juridisk bedömning/);
  });

  it('registret innehåller inga persondata eller personfält', () => {
    const text = JSON.stringify(raw);
    expect(text).not.toMatch(/user_id|email|e-post:|@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(raw.adaptiveResearch.sources).toHaveLength(8);
    expect(raw.adaptiveResearch.sources.map(s=>s.doi)).toContain('10.1007/s40279-024-02069-2');
    expect(raw.adaptiveResearch.limitation).toContain('produktantaganden');
    const allowedTop = ['adaptiveResearch', 'registryVersion', 'sourceRegister', 'methodVersion', 'ruleSetVersion', 'engineVersion', 'substitutionCatalogVersion', 'lastSubstantiveUpdate', 'verificationNote', 'sources', 'claims', 'limitations', 'rules', 'registryAdditions', 'balanceMethod'];
    expect(Object.keys(raw).sort()).toEqual([...allowedTop].sort());
  });

  it('fritextsökning matchar alla ord oberoende av skiftläge', () => {
    expect(matchesQuery('Frontböj och knäböj: olika maxvikt', 'FRONTBÖJ maxvikt')).toBe(true);
    expect(matchesQuery('Frontböj', 'marklyft')).toBe(false);
  });
});
