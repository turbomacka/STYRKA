import { exercise, type ExerciseId } from './catalog';
import type { Mode } from './decision_engine';
import type { HistorySet, PerceivedEffort, PerformedExercise } from './model';
import type { ExerciseConfiguration } from './trainingFlow';

/** Product heuristics, not measured recovery or clinical thresholds. No kg comparison across equipment. */
export const RECOVERY_POLICY = {
  version: 'RECOVERY/2.0.0',
  normalHours: 24,
  demandingHours: 48,
  demandingHardSets: 2,
  demandingWorkSets: 3,
  demandingTotalSets: 6,
  lightWorkSets: 3,
} as const;

export type RecoveryAssessment = {
  version: typeof RECOVERY_POLICY.version;
  modeCap: 'moderate' | 'light' | null;
  activeHours: number | null;
  reason: 'RECOVERY_MATCHED_WORK' | 'RECOVERY_OVERLAPPING_WORK' | null;
};

type Effort = 'easy' | 'normal' | 'hard' | 'maximal';
type Work = { side: 'left' | 'right'; age: number; effort: Effort; direct: boolean };
const CURLS = new Set<ExerciseId>(['biceps_curl', 'dumbbell_curl', 'cable_curl', 'incline_dumbbell_curl']);
const EXTENSIONS = new Set<ExerciseId>(['triceps_pushdown', 'rope_pushdown', 'overhead_triceps_extension']);

/** Movement families are distinct from the old broad lower/press/pull recovery groups. */
export function recoveryFamily(id: ExerciseId): string {
  if (CURLS.has(id)) return 'elbow_flexion';
  if (EXTENSIONS.has(id)) return 'elbow_extension';
  return exercise(id).pattern;
}

function effortOf(rir: number | null, feeling?: PerceivedEffort | null): Effort {
  if (feeling === 'maximal' || rir === 0) return 'maximal';
  if (feeling === 'hard' || feeling === 'too_heavy' || rir === 1) return 'hard';
  if (rir !== null) return rir >= 4 ? 'easy' : 'normal';
  if (feeling === 'easy' || feeling === 'too_easy') return 'easy';
  // Missing answers remain ordinary/unknown work; never silently assume low effort.
  return 'normal';
}

function demanding(work: Work[]): boolean {
  const p = RECOVERY_POLICY;
  return work.some((w) => w.effort === 'maximal')
    || work.filter((w) => w.effort === 'hard').length >= p.demandingHardSets
    || work.filter((w) => w.effort !== 'easy').length >= p.demandingWorkSets
    || work.length >= p.demandingTotalSets;
}

/** Rolling windows use each actual performance, so a newer easy set cannot hide older demanding work.
 * Each side is assessed separately: three unilateral pairs are three sets per side, not six.
 * Unfinished sets contribute only their completed sides. Opposite-only work does not limit a single-side target.
 */
export function assessRecovery(id: ExerciseId, history: PerformedExercise[], nowUtc: string, configuration?: ExerciseConfiguration): RecoveryAssessment {
  const now = Date.parse(nowUtc);
  if (!Number.isFinite(now)) throw new Error('INVALID_TIMESTAMP');
  const target = exercise(id), family = recoveryFamily(id), work: Work[] = [], seen = new Set<string>();
  for (const h of history) {
    if (h.sessionStatus === 'preview') continue;
    const direct = recoveryFamily(h.exerciseId) === family;
    const overlap = target.recoveryGroup !== 'own' && target.recoveryGroup === exercise(h.exerciseId).recoveryGroup;
    if (!direct && !overlap) continue;
    const add = (key: string, side: 'left' | 'right' | 'both', when: string | null, rir: number | null, feeling: PerceivedEffort | null | undefined, reps: number | null, seconds: number | null) => {
      if (seen.has(key) || !((reps ?? 0) > 0 || (seconds ?? 0) > 0)) return;
      seen.add(key);
      const age = (now - Date.parse(when ?? h.whenUtc)) / 3_600_000;
      if (!Number.isFinite(age) || age < 0 || age >= RECOVERY_POLICY.demandingHours) return;
      for (const s of side === 'both' ? ['left', 'right'] as const : [side]) {
        if (configuration?.executionMode === 'single_side' && configuration.startingSide !== s) continue;
        work.push({ side: s, age, effort: effortOf(rir, feeling), direct });
      }
    };
    h.sets.forEach((s: HistorySet, index) => {
      if (s.kind !== 'work') return;
      if (s.detail) {
        for (const p of s.detail.performances.filter((p) => p.status === 'done')) {
          add(`${h.sessionId}:${h.exerciseId}:${p.id}`, p.side, p.completedAt ?? s.occurredAt, p.rir, p.effort, p.repetitions, p.seconds);
        }
      } else if (s.status === 'done') {
        add(`${h.sessionId}:${h.exerciseId}:${index}`, 'both', s.occurredAt, s.rir, s.perceivedEffort, s.actualReps, s.actualSeconds);
      }
    });
  }
  const result: RecoveryAssessment = { version: RECOVERY_POLICY.version, modeCap: null, activeHours: null, reason: null };
  const retain = (cap: 'moderate' | 'light', relevant: Work[], direct: boolean) => {
    const age = Math.min(...relevant.map((w) => w.age));
    if (result.modeCap === 'light' && cap === 'moderate') return;
    if (result.modeCap === cap && result.activeHours! <= age) return;
    result.modeCap = cap;
    result.activeHours = age;
    result.reason = direct ? 'RECOVERY_MATCHED_WORK' : 'RECOVERY_OVERLAPPING_WORK';
  };
  for (const side of ['left', 'right'] as const) {
    const direct = work.filter((w) => w.side === side && w.direct);
    const recent = direct.filter((w) => w.age < RECOVERY_POLICY.normalHours);
    const overlap = work.filter((w) => w.side === side && !w.direct && w.age < RECOVERY_POLICY.normalHours);
    if (demanding(direct)) retain('light', direct, true);
    else if (recent.some((w) => w.effort !== 'easy') || recent.length >= RECOVERY_POLICY.lightWorkSets) retain('moderate', recent, true);
    if (demanding(overlap)) retain('moderate', overlap, false);
  }
  return result;
}

export function recoveryMode(mode: Mode, assessment: RecoveryAssessment): Mode {
  if (assessment.modeCap === 'light') return 'light';
  return mode === 'heavy' && assessment.modeCap === 'moderate' ? 'moderate' : mode;
}
