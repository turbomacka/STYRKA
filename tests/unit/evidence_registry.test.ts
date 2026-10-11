/** Evidensregistret (CR §1.3–§1.4): kartläggning, märkning, ankare och avsaknad av persondata. */
import { describe, expect, it } from 'vitest';
import raw from '../../src/science/evidence.json';
import { EVIDENCE, HEURISTIC_LABEL, ruleForReason, sourceHref, matchesQuery } from '../../src/science/registry';
import { REASONS } from '../../src/ui/strings';
import { RULESET_VERSION } from '../../src/domain/model';
import { SUBSTITUTION_CATALOG_VERSION, allRelations } from '../../src/domain/substitutionCatalog';
import { ENGINE_VERSION } from '../../src/domain/decision_engine';

describe('evidensregister', () => {
  it('versioner stämmer med motor, regelverk och substitutionskatalog', () => {
    expect(EVIDENCE.engineVersion).toBe(ENGINE_VERSION);
    expect(EVIDENCE.ruleSetVersion).toBe(RULESET_VERSION);
    expect(EVIDENCE.substitutionCatalogVersion).toBe(SUBSTITUTION_CATALOG_VERSION);
  });

  it('varje påstående kartläggs till minst en befintlig källa och befintliga regler', () => {
    const sources = new Set(EVIDENCE.sources.map((s) => s.source_id));
    const rules = new Set(EVIDENCE.rules.map((r) => r.rule_id));
    for (const c of EVIDENCE.claims) {
      expect(c.source_ids.length, c.claim_id).toBeGreaterThan(0);
      for (const s of c.source_ids) expect(sources.has(s), `${c.claim_id}→${s}`).toBe(true);
      for (const r of c.rule_ids) expect(rules.has(r), `${c.claim_id}→${r}`).toBe(true);
      expect(['A', 'B', 'C', 'D']).toContain(c.section);
      expect(['E1', 'E2', 'H', 'U', 'R']).toContain(c.evidence_kind);
    }
    // Alla källor används och alla evidens-id i substitutionskatalogen finns.
    const used = new Set(EVIDENCE.claims.flatMap((c) => c.source_ids));
    for (const s of EVIDENCE.sources) expect(used.has(s.source_id), s.source_id).toBe(true);
    for (const r of allRelations()) for (const e of r.evidence_ids) expect(sources.has(e), `${r.from}->${r.to}: ${e}`).toBe(true);
  });

  it('källor har författare, år, titel, publikation, giltig DOI eller https-länk, design, population och kontrolldatum', () => {
    for (const s of EVIDENCE.sources) {
      expect(s.authors && s.title && s.publication && s.design && s.population && s.notes, s.source_id).toBeTruthy();
      expect(s.year, s.source_id).toBeGreaterThan(2000);
      if (s.doi) expect(s.doi, s.source_id).toMatch(/^10\.\d{4,9}\/\S+$/);
      expect(sourceHref(s), s.source_id).toMatch(/^https:\/\//);
      expect(s.last_checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('alla skälkoder som motorn kan visa har en metodregel med stabilt ankare', () => {
    const codes = [...Object.keys(REASONS), 'TEMPLATE_A', 'TEMPLATE_lower_squat', 'TIME_LIMIT_30', 'SUB_RELATION_CLOSE', 'SUB_RELATION_FAMILY', 'SUB_RELATION_COMPLEMENTARY', 'SUB_TARGET_OBSERVED', 'SUB_TARGET_ESTIMATED', 'SUB_CALIBRATION', 'SUB_POPULATION_PRIOR_LOW_CONFIDENCE', 'SUB_NO_ESTIMATE', 'SUB_NEW_MACHINE_PROFILE', 'CALIBRATION_EFFORT_TOO_HEAVY'];
    const missing = codes.filter((c) => !ruleForReason(c));
    expect(missing).toEqual([]);
    const ids = EVIDENCE.rules.map((r) => r.rule_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('regler med siffror utan direkt empiriskt stöd är märkta som produktregel', () => {
    const mustBeHeuristic = ['e1rm-uppskattning', 'startvikt', 'set-och-repetitioner', 'dubbel-progression', 'reps-i-reserv', 'missade-mal', 'tung-belastning', 'aterhamtning', 'omstart', 'tidsmodell', 'unilateral-tid', 'prioritet-baslyft', 'prior-frontboj', 'prior-hantelpress', 'forsta-exponering', 'kalibrerad-niva', 'upplevd-anstrangning'];
    for (const id of mustBeHeuristic) expect(EVIDENCE.rules.find((r) => r.rule_id === id)?.heuristic, id).toBe(true);
    expect(HEURISTIC_LABEL).toBe('Produktregel / ännu inte validerad tröskel');
    // Inga kvantitativa omräkningar anges som kliniskt validerade.
    expect(JSON.stringify(raw)).not.toMatch(/kliniskt validerad (faktor|omräkning)(?! )/i);
  });

  it('registret innehåller inga persondata eller personfält', () => {
    const text = JSON.stringify(raw);
    expect(text).not.toMatch(/user_id|email|e-post:|@[a-z0-9-]+\.[a-z]{2,}/i);
    const allowedTop = ['registryVersion', 'methodVersion', 'ruleSetVersion', 'engineVersion', 'substitutionCatalogVersion', 'lastSubstantiveUpdate', 'verificationNote', 'sources', 'claims', 'rules'];
    expect(Object.keys(raw).sort()).toEqual([...allowedTop].sort());
  });

  it('fritextsökning matchar alla ord oberoende av skiftläge', () => {
    expect(matchesQuery('Frontböj och knäböj: olika maxvikt', 'FRONTBÖJ maxvikt')).toBe(true);
    expect(matchesQuery('Frontböj', 'marklyft')).toBe(false);
  });
});
