/**
 * Evidensregistret (STYRKA-CR-2026-10-10-01 §1.3) som versionsstyrd, statisk data.
 * Innehåller ENDAST publikt innehåll – inga personuppgifter. Påståenden kartläggs till källor,
 * regler har metodbeskrivning och märks som produktregel när siffran saknar direkt empiriskt stöd.
 */
import registry from './evidence.json';

export type EvidenceKind = 'E1' | 'E2' | 'H' | 'U' | 'R';
export type Section = 'A' | 'B' | 'C' | 'D';

export type EvidenceSource = {
  source_id: string;
  authors: string;
  year: number;
  title: string;
  publication: string;
  doi: string | null;
  public_url: string;
  design: string;
  population: string;
  notes: string;
  last_checked_at: string;
};

export type EvidenceClaim = {
  claim_id: string;
  section: Section;
  title_sv: string;
  plain_language_sv: string;
  evidence_kind: EvidenceKind;
  population_scope: string;
  caveats_sv: string;
  source_ids: string[];
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
  methodVersion: string;
  ruleSetVersion: string;
  engineVersion: string;
  substitutionCatalogVersion: string;
  lastSubstantiveUpdate: string;
  verificationNote: string;
  sources: EvidenceSource[];
  claims: EvidenceClaim[];
  rules: MethodRule[];
};

export const EVIDENCE = registry as EvidenceRegistry;

export const EVIDENCE_KIND_SV: Record<EvidenceKind, string> = {
  E1: 'Stöd i systematiska översikter (gruppnivå)',
  E2: 'Indirekt eller begränsat stöd',
  H: 'Produktregel – ännu inte validerad tröskel',
  U: 'Ditt eget val',
  R: 'Regulatorisk vägledning',
};

export const HEURISTIC_LABEL = 'Produktregel / ännu inte validerad tröskel';

export const ruleAnchor = (ruleId: string) => `regel-${ruleId}`;
export const claimAnchor = (claimId: string) => `pastaende-${claimId}`;
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

export function sourceHref(s: EvidenceSource): string {
  return s.doi ? `https://doi.org/${s.doi}` : s.public_url;
}

/** Fritextsökning över synlig text (gemener, utan diakritiskt beroende för å/ä/ö). */
export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('sv');
  if (!q) return true;
  return q.split(/\s+/).every((w) => text.toLocaleLowerCase('sv').includes(w));
}
