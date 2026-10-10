import type { ExerciseId, Mode } from '../../src/domain/decision_engine';
import { ALL_EQUIPMENT } from '../../src/domain/catalog';
import type { HistorySet, PerformedExercise, PlannedExercise, PlannerInput, RestrictionRule, SessionStatus, SymptomReport, UserExerciseSettings } from '../../src/domain/model';

export const NOW = '2026-10-10T08:00:00.000Z';

export function hoursBefore(iso: string, h: number): string {
  return new Date(Date.parse(iso) - h * 3_600_000).toISOString();
}

export function input(over: Partial<Omit<PlannerInput, 'profile'>> & { profile?: Partial<PlannerInput['profile']> } = {}): PlannerInput {
  const { profile, ...rest } = over;
  return {
    nowUtc: NOW,
    profile: {
      plannedSessionsPerWeek: 2,
      minutesPerSession: 60,
      experience: 'intermediate',
      goals: { squat: 1, bench_press: 1, deadlift: 1 },
      equipment: [...ALL_EQUIPMENT],
      substitutions: {},
      favorites: [],
      bodyweightKg: null,
      ...profile,
    },
    exerciseSettings: [],
    restrictions: [],
    symptoms: [],
    history: [],
    rotationIndex: 0,
    ...rest,
  };
}

export function est(exerciseId: ExerciseId, kg: number, extra: Partial<UserExerciseSettings> = {}): UserExerciseSettings {
  return { exerciseId, experience: null, incrementKg: null, estimate: { kind: '1rm', kg }, maxLoadKg: null, machineMinKg: null, machineMaxKg: null, ...extra };
}

export const ALL_ESTIMATES: UserExerciseSettings[] = [
  est('squat', 120),
  est('bench_press', 100),
  est('deadlift', 150),
  est('romanian_deadlift', 110),
  est('overhead_press', 60),
  est('lat_pulldown', 80),
  est('cable_row', 80),
  est('chest_supported_row', 80),
  est('cable_lateral_raise', 20),
  est('biceps_curl', 30),
  est('triceps_pushdown', 40),
  est('cable_crunch', 60),
  est('split_squat', 60),
  est('leg_press', 200),
];

let ruleSeq = 0;
export function rule(r: Partial<RestrictionRule> & Pick<RestrictionRule, 'kind'>): RestrictionRule {
  return { id: `rule-${++ruleSeq}`, exerciseA: null, exerciseB: null, area: null, side: null, maxSets: null, maxMode: null, active: true, description: null, ...r };
}

export function symptom(s: Partial<SymptomReport> & Pick<SymptomReport, 'area' | 'reaction'>): SymptomReport {
  return { id: `sym-${++ruleSeq}`, sessionId: null, side: 'both', reportedAt: hoursBefore(NOW, 30), resolvedAt: null, ...s };
}

export function plan(exerciseId: ExerciseId, over: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId,
    loadKind: 'external_kg',
    role: 'main',
    mode: 'heavy',
    sets: 3,
    reps: 5,
    bandMin: 5,
    bandMax: 7,
    kg: 80,
    targetSeconds: null,
    state: 'normal',
    reasons: [],
    confidence: 'low',
    engineVersion: '1.0.0',
    calibration: false,
    incrementKg: 2.5,
    estimatedOneRM: 100,
    substitutionFrom: null,
    substitutionReason: null,
    acceptedByUserAt: null,
    ...over,
  };
}

export function sets(n: number, s: Partial<HistorySet> & { kg?: number | null; reps?: number }): HistorySet[] {
  return Array.from({ length: n }, () => ({
    kind: 'work',
    status: 'done',
    plannedKg: s.kg ?? null,
    actualKg: s.kg ?? null,
    plannedReps: s.reps ?? null,
    actualReps: s.reps ?? null,
    plannedSeconds: null,
    actualSeconds: null,
    rir: null,
    technique: 'controlled',
    occurredAt: null,
    ...s,
  }));
}

let sessSeq = 0;
export function performed(exerciseId: ExerciseId, whenUtc: string, p: Partial<PlannedExercise>, setList: HistorySet[], status: SessionStatus = 'completed', mode?: Mode): PerformedExercise {
  const pl = plan(exerciseId, { ...p, mode: mode ?? p.mode ?? 'heavy' });
  return { sessionId: `s-${String(++sessSeq).padStart(4, '0')}`, sessionKind: 'planned', sessionStatus: status, exerciseId, plan: pl, sets: setList.map((x) => ({ ...x, occurredAt: x.occurredAt ?? whenUtc })), whenUtc };
}
