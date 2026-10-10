import type { ExerciseId } from './decision_engine';

/**
 * Övningskatalog. Grundfälten (slug, namn, mönster, lastsemantik, utrustning, steg) motsvarar
 * `db/002_seed_catalog.sql` version 1. Version 1.1.0 kompletterar transparent med tidsprofil,
 * belastade områden (planeringsetikett, INTE medicinsk riskpoäng), återhämtningsgrupp och roll.
 *
 * Områdeslistorna för de åtta övningar som finns i referensmotorns REGIONS är en överuppsättning
 * av referensens (mer konservativ). Övriga är nya produktetiketter (H) som kräver fackgranskning.
 */
export const CATALOG_VERSION = '1.1.0' as const;

export type LoadKind = 'external_kg' | 'assistance_kg' | 'bodyweight_plus_kg' | 'reps_only' | 'duration_sec';
export type EquipmentSlug = 'rack' | 'barbell' | 'plates' | 'bench' | 'cable' | 'pullup-assist' | 'dumbbell' | 'machines' | 'bodyweight';
export type Area = 'knee' | 'hip' | 'lower_back' | 'shoulder' | 'elbow' | 'wrist' | 'neck_upper_back' | 'hamstring' | 'ankle_foot' | 'other';
export type TimeKind = 'barbell_compound' | 'other_compound' | 'isolation';
export type RecoveryGroup = 'lower' | 'press' | 'pull' | 'own';
export type Pattern = 'squat' | 'hinge' | 'horizontal_press' | 'vertical_press' | 'vertical_pull' | 'horizontal_pull' | 'isolation_shoulder' | 'isolation_arm' | 'trunk';

export type CatalogExercise = {
  slug: ExerciseId;
  nameSv: string;
  pattern: Pattern;
  loadKind: LoadKind;
  equipment: EquipmentSlug[];
  defaultIncrementKg: number;
  timeKind: TimeKind;
  areas: Area[];
  recoveryGroup: RecoveryGroup;
  /** Huvudlyft som användaren prioriterar (squat/bench/deadlift). */
  priorityLift: boolean;
  /** Bål/bonus prunas först. */
  bonus: boolean;
};

const E = (x: CatalogExercise) => x;

export const CATALOG: readonly CatalogExercise[] = [
  E({ slug: 'squat', nameSv: 'Knäböj', pattern: 'squat', loadKind: 'external_kg', equipment: ['rack', 'barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['knee', 'hip', 'lower_back', 'ankle_foot'], recoveryGroup: 'lower', priorityLift: true, bonus: false }),
  E({ slug: 'bench_press', nameSv: 'Bänkpress', pattern: 'horizontal_press', loadKind: 'external_kg', equipment: ['bench', 'barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'press', priorityLift: true, bonus: false }),
  E({ slug: 'deadlift', nameSv: 'Marklyft', pattern: 'hinge', loadKind: 'external_kg', equipment: ['barbell', 'plates'], defaultIncrementKg: 5, timeKind: 'barbell_compound', areas: ['knee', 'hip', 'lower_back', 'hamstring', 'neck_upper_back'], recoveryGroup: 'lower', priorityLift: true, bonus: false }),
  E({ slug: 'romanian_deadlift', nameSv: 'Rumänska marklyft', pattern: 'hinge', loadKind: 'external_kg', equipment: ['barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['hip', 'lower_back', 'hamstring'], recoveryGroup: 'lower', priorityLift: false, bonus: false }),
  E({ slug: 'overhead_press', nameSv: 'Militärpress', pattern: 'vertical_press', loadKind: 'external_kg', equipment: ['barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['shoulder', 'elbow', 'wrist', 'neck_upper_back'], recoveryGroup: 'press', priorityLift: false, bonus: false }),
  E({ slug: 'lat_pulldown', nameSv: 'Latsdrag', pattern: 'vertical_pull', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow'], recoveryGroup: 'pull', priorityLift: false, bonus: false }),
  E({ slug: 'assisted_pullup', nameSv: 'Assisterade chins', pattern: 'vertical_pull', loadKind: 'assistance_kg', equipment: ['pullup-assist'], defaultIncrementKg: 5, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'pull', priorityLift: false, bonus: false }),
  E({ slug: 'pullup', nameSv: 'Chins', pattern: 'vertical_pull', loadKind: 'bodyweight_plus_kg', equipment: ['bodyweight'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'pull', priorityLift: false, bonus: false }),
  E({ slug: 'cable_row', nameSv: 'Sittande kabelrodd', pattern: 'horizontal_pull', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'lower_back'], recoveryGroup: 'pull', priorityLift: false, bonus: false }),
  E({ slug: 'chest_supported_row', nameSv: 'Bröststödd rodd', pattern: 'horizontal_pull', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow'], recoveryGroup: 'pull', priorityLift: false, bonus: false }),
  E({ slug: 'cable_lateral_raise', nameSv: 'Sidolyft i kabel', pattern: 'isolation_shoulder', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['shoulder'], recoveryGroup: 'own', priorityLift: false, bonus: false }),
  E({ slug: 'biceps_curl', nameSv: 'Bicepscurl', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'wrist'], recoveryGroup: 'own', priorityLift: false, bonus: false }),
  E({ slug: 'triceps_pushdown', nameSv: 'Triceps pushdown', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'wrist'], recoveryGroup: 'own', priorityLift: false, bonus: false }),
  E({ slug: 'cable_crunch', nameSv: 'Magcrunch i kabel', pattern: 'trunk', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 2.5, timeKind: 'isolation', areas: ['lower_back'], recoveryGroup: 'own', priorityLift: false, bonus: true }),
  E({ slug: 'plank', nameSv: 'Plankan', pattern: 'trunk', loadKind: 'duration_sec', equipment: ['bodyweight'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['lower_back', 'shoulder'], recoveryGroup: 'own', priorityLift: false, bonus: true }),
  E({ slug: 'split_squat', nameSv: 'Split squat', pattern: 'squat', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 1, timeKind: 'other_compound', areas: ['knee', 'hip', 'ankle_foot'], recoveryGroup: 'lower', priorityLift: false, bonus: false }),
  E({ slug: 'leg_press', nameSv: 'Benpress', pattern: 'squat', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 5, timeKind: 'other_compound', areas: ['knee', 'hip', 'lower_back'], recoveryGroup: 'lower', priorityLift: false, bonus: false }),
];

const BY_SLUG = new Map(CATALOG.map((x) => [x.slug, x]));

export function exercise(slug: ExerciseId): CatalogExercise {
  const x = BY_SLUG.get(slug);
  if (!x) throw new Error(`UNKNOWN_EXERCISE_${slug}`);
  return x;
}

export function isExerciseId(s: string): s is ExerciseId {
  return BY_SLUG.has(s as ExerciseId);
}

export const ALL_EQUIPMENT: readonly EquipmentSlug[] = ['rack', 'barbell', 'plates', 'bench', 'cable', 'pullup-assist', 'dumbbell', 'machines', 'bodyweight'];

export const EQUIPMENT_LABEL_SV: Record<EquipmentSlug, string> = {
  rack: 'Ställning/rack',
  barbell: 'Skivstång',
  plates: 'Viktskivor',
  bench: 'Bänk',
  cable: 'Kabelmaskin',
  'pullup-assist': 'Assisterad chinsmaskin',
  dumbbell: 'Hantlar',
  machines: 'Övriga maskiner',
  bodyweight: 'Chinsstång/kroppsvikt',
};

export const AREA_LABEL_SV: Record<Area, string> = {
  knee: 'Knä',
  hip: 'Höft/ljumske',
  lower_back: 'Ländrygg',
  shoulder: 'Axel',
  elbow: 'Armbåge',
  wrist: 'Handled/hand',
  neck_upper_back: 'Nacke/övre rygg',
  hamstring: 'Lår/baksida',
  ankle_foot: 'Fotled/fot',
  other: 'Annat',
};

export const ALL_AREAS = Object.keys(AREA_LABEL_SV) as Area[];

export function isAvailable(slug: ExerciseId, equipment: ReadonlySet<EquipmentSlug>): boolean {
  return exercise(slug).equipment.every((e) => equipment.has(e));
}

export function impactsAreas(slug: ExerciseId, areas: readonly Area[]): boolean {
  return exercise(slug).areas.some((a) => areas.includes(a));
}

/** Samma övning, eller samma återhämtningsgrupp för flerledsövningar (isolation: bara samma övning). */
export function isRelevantFor(target: ExerciseId, performed: ExerciseId): boolean {
  if (target === performed) return true;
  const g = exercise(target).recoveryGroup;
  return g !== 'own' && g === exercise(performed).recoveryGroup;
}
