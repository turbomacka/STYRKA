/**
 * Evidensregistret (STYRKA-CR-2026-10-10-01 §1.3) som versionsstyrd, statisk data.
 * Innehåller ENDAST publikt innehåll – inga personuppgifter. Påståenden kartläggs till källor,
 * regler har metodbeskrivning och märks som produktregel när siffran saknar direkt empiriskt stöd.
 */
import registry from './evidence.json';

/** Klassning enligt produktägarens evidensregister (`classification`). */
export type Classification =
  | 'synthesis'
  | 'empirical_group_means_not_individual'
  | 'empirical_group_mean_not_individual'
  | 'recommendation_plus_biomechanics'
  | 'product_heuristic_unvalidated'
  | 'regulatory_guidance';
export type Section = 'A' | 'B' | 'C' | 'D';

export type EvidenceSource = {
  source_id: string;
  authors: string;
  year: number;
  title: string;
  publication: string;
  doi: string | null;
  /** Registrets `permalink` (DOI-länk eller offentlig publikationssida). */
  public_url: string;
  design: string;
  population: string;
  /** Ordagrant från registret. */
  supported_claim_sv: string;
  limitations_sv: string;
  last_checked_at: string;
  /** Versionssatt tillägg utanför produktägarens register (t.ex. EVIDENS/2.1.0 för Balans). */
  added_in?: string;
};

export type EvidenceClaim = {
  claim_id: string;
  section: Section;
  title_sv: string;
  plain_language_sv: string;
  evidence_kind: Classification;
  population_scope: string;
  caveats_sv: string;
  source_ids: string[];
  /** Registrets `rule_ids` (ordagrant). */
  register_rule_ids: string[];
  /** Metodregler på sidan (ankare). */
  rule_ids: string[];
  last_reviewed_at: string;
  rule_is_heuristic: boolean;
  engine_version: string;
};

export type MethodRule = {
  rule_id: string;
  group: Section;
  title_sv: string;
  method_sv: string;
  value_sv: string;
  rationale_sv: string;
  heuristic: boolean;
  /** Skälkoder i förslagen som förklaras av regeln. Avslutas med prefix för koder som TEMPLATE_A. */
  reason_codes: string[];
};

export type EvidenceRegistry = {
  registryVersion: string;
  sourceRegister: { file: string; schema_version: string; reviewed_at: string; warning_sv: string };
  methodVersion: string;
  ruleSetVersion: string;
  engineVersion: string;
  substitutionCatalogVersion: string;
  lastSubstantiveUpdate: string;
  verificationNote: string;
  sources: EvidenceSource[];
  claims: EvidenceClaim[];
  /** Produktens begränsningar (avsnitt D) – inga forskningspåståenden. */
  limitations: string[];
  rules: MethodRule[];
  registryAdditions: Array<{ version: string; date: string; reason: string; source_ids: string[] }>;
  /** ÄA-BAL-001 §11: metodbeskrivning för Balans. */
  balanceMethod: { patternPolicyVersion: string; decisionPolicyVersion: string; points: string[]; source_ids: string[] };
};

export const EVIDENCE = registry as EvidenceRegistry;

export const CLASSIFICATION_SV: Record<Classification, string> = {
  synthesis: 'Syntes av forskningsöversikter (gruppnivå)',
  empirical_group_means_not_individual: 'Gruppmedelvärden – inte en individuell faktor',
  empirical_group_mean_not_individual: 'Gruppmedelvärde – inte en individuell faktor',
  recommendation_plus_biomechanics: 'Klinisk riktlinje och biomekanisk studie',
  product_heuristic_unvalidated: 'Produktregel / ännu inte validerad tröskel',
  regulatory_guidance: 'Myndighetsvägledning',
};

export const HEURISTIC_LABEL = 'Produktregel / ännu inte validerad tröskel';

export const ruleAnchor = (ruleId: string) => `regel-${ruleId}`;
export const claimAnchor = (claimId: string) => `pastaende-${claimId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export const sourceAnchor = (sourceId: string) => `kalla-${sourceId}`;

/** Prefixkoder som har ett variabelt suffix i motorn (t.ex. TEMPLATE_A, TIME_LIMIT_30). */
const PREFIX_CODES = ['TEMPLATE', 'TIME_LIMIT'];

/** Vilken metodregel förklarar en skälkod? Används av "Varför?" för stabila ankarlänkar. */
export function ruleForReason(code: string): MethodRule | null {
  const prefix = PREFIX_CODES.find((p) => code.startsWith(`${p}_`));
  const key = prefix ?? code;
  return EVIDENCE.rules.find((r) => r.reason_codes.includes(key)) ?? null;
}

export function sourceById(id: string): EvidenceSource | undefined {
  return EVIDENCE.sources.find((s) => s.source_id === id);
}

export function ruleById(id: string): MethodRule | undefined {
  return EVIDENCE.rules.find((r) => r.rule_id === id);
}

/** Registrets permanenta länk (DOI eller offentlig publikationssida). */
export function sourceHref(s: EvidenceSource): string {
  return s.public_url;
}

export function sourceLinkLabel(s: EvidenceSource): string {
  if (s.public_url.startsWith('https://doi.org/')) return `doi:${s.public_url.slice('https://doi.org/'.length)}`;
  if (s.public_url.includes('pmc.ncbi.nlm.nih.gov')) return 'PubMed Central';
  return new URL(s.public_url).hostname;
}

/** Fritextsökning över synlig text (gemener, utan diakritiskt beroende för å/ä/ö). */
export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('sv');
  if (!q) return true;
  return q.split(/\s+/).every((w) => text.toLocaleLowerCase('sv').includes(w));
}
