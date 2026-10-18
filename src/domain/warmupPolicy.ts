import type { Experience, Mode } from './decision_engine';
import type { TimeKind } from './catalog';
import type { EquipmentProfile } from './trainingFlow';

export const WARMUP_POLICY = { version: 'WARMUP/1.0.0', heavy: [{ fraction: .5, reps: 6 }, { fraction: .7, reps: 3 }, { fraction: .85, reps: 2 }], normal: [{ fraction: .55, reps: 6 }, { fraction: .8, reps: 3 }] } as const;
export type WarmupProposal = { load: number; reps: number; policyVersion: string };
export function warmupSuggestions(i: { workingLoad: number | null; targetReps: number; mode: Mode; category: TimeKind; equipment: EquipmentProfile; experience: Experience; samePatternWorkDone: number; reliableMax?: number | null }): WarmupProposal[] {
  const e = i.equipment;
  if (i.workingLoad === null || i.workingLoad <= 0 || e.unit !== 'kg' || ['bodyweight', 'bodyweight_added', 'bodyweight_assistance', 'duration'].includes(e.measurement)) return [];
  // Unknown empty bar mass: don't invent a 20 kg bar or promise an achievable loading.
  if (e.measurement === 'barbell_total' && e.minimum === null && !e.increments.length) return [];
  const heavy = i.category !== 'isolation' && (i.mode === 'heavy' || (i.reliableMax != null && i.workingLoad / i.reliableMax >= .8));
  if (!heavy && i.category === 'isolation' && i.samePatternWorkDone >= 2) return [];
  let steps: readonly { fraction: number; reps: number }[] = heavy ? WARMUP_POLICY.heavy : WARMUP_POLICY.normal;
  if (i.category === 'isolation' || i.mode === 'light') steps = steps.slice(0, 1);
  else if (i.samePatternWorkDone >= 2 || (i.experience === 'novice' && i.targetReps >= 10)) steps = steps.slice(1);
  const out: WarmupProposal[] = [];
  for (const s of steps) {
    const raw = i.workingLoad * s.fraction;
    const minimum = e.minimum ?? e.step;
    const values = e.increments.filter((n) => n >= minimum && n <= raw);
    const load = e.increments.length ? (values.length ? Math.max(...values) : null) : Math.max(minimum, Math.floor((raw - minimum) / e.step) * e.step + minimum);
    if (load === null || load <= 0 || load >= i.workingLoad || out.some((x) => x.load === load)) continue;
    out.push({ load: +load.toFixed(3), reps: s.reps, policyVersion: WARMUP_POLICY.version });
  }
  return out;
}
