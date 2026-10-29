import type { Confidence } from './model';

/** Provenance for max strength, separate from confidence in a working prescription.
 * Absent metadata on old snapshots is unknown, not proof of a reliable denominator. */
export type MaxEvidence = { source: 'input' | 'reported_set'; confidence: Confidence; at?: string };
export function reliableOneRM(plan: { estimatedOneRM?: number | null; maxEvidence?: MaxEvidence }): number | null {
  return plan.estimatedOneRM != null && plan.estimatedOneRM > 0 && plan.maxEvidence && ['medium','high'].includes(plan.maxEvidence.confidence) ? plan.estimatedOneRM : null;
}
