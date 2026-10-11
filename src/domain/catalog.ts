import type { ExerciseId as RefExerciseId } from './decision_engine';

/**
 * Övningskatalog.
 *
 * Version 1 (17 övningar) motsvarar `db/002_seed_catalog.sql`; 1.1.0 kompletterade med tidsprofil, belastade
 * områden (planeringsetikett, INTE medicinsk riskpoäng), återhämtningsgrupp och roll. Dessa poster är OFÖRÄNDRADE.
 *
 * Version 2.0.0 (STYRKA-CR-2026-10-10-01) lägger ADDITIVT till:
 *  - variantmetadata för alla övningar (`exercise_variant_metadata`): lastbas för visning (totalt / per hantel /
 *    assistans / kroppsvikt+kg / sekunder), redskapsklass, unilateral, krav på maskinprofil, tidsfaktor;
 *  - 31 nya övningar som behövs för substitutionskatalogen (§2.2).
 *
 * Referensmotorns typ `ExerciseId` omfattar bara de 17 ursprungliga övningarna och får inte ändras (SHA256-kontroll).
 * Appen använder därför den utökade typen nedan; referensfunktionerna anropas med typomvandling vid gränsen
 * (deras logik är oberoende av slug utom för assisted_pullup/pullup/plank, som hanteras före anrop).
 */
export const CATALOG_VERSION = '2.0.1' as const;

export type { RefExerciseId };
export type ExtraExerciseId =
  | 'front_squat'
  | 'safety_bar_squat'
  | 'smith_squat'
  | 'hack_squat'
  | 'goblet_squat'
  | 'sumo_deadlift'
  | 'trap_bar_deadlift'
  | 'dumbbell_romanian_deadlift'
  | 'stiff_leg_deadlift'
  | 'dumbbell_bench_press'
  | 'smith_bench_press'
  | 'chest_press_machine'
  | 'incline_bench_press'
  | 'dumbbell_shoulder_press'
  | 'seated_barbell_press'
  | 'shoulder_press_machine'
  | 'neutral_grip_lat_pulldown'
  | 'seated_machine_row'
  | 'one_arm_dumbbell_row'
  | 'barbell_row'
  | 'dumbbell_lateral_raise'
  | 'lateral_raise_machine'
  | 'dumbbell_curl'
  | 'cable_curl'
  | 'incline_dumbbell_curl'
  | 'rope_pushdown'
  | 'overhead_triceps_extension'
  | 'machine_crunch'
  | 'weighted_crunch'
  | 'bulgarian_split_squat'
  | 'lunge'
  | 'step_up';
/** Alla övningar i appens katalog (referensmotorns 17 + version 2.0.0). */
export type ExerciseId = RefExerciseId | ExtraExerciseId;

export type LoadKind = 'external_kg' | 'assistance_kg' | 'bodyweight_plus_kg' | 'reps_only' | 'duration_sec';
/** Hur ett kg-värde ska förstås och visas (§2.3, §4.2 `load_display_basis`). */
export type LoadDisplayBasis = 'total_kg' | 'per_hand_kg' | 'assistance_kg' | 'bodyweight_plus_kg' | 'reps_only' | 'seconds';
export type EquipmentClass = 'barbell' | 'specialty_bar' | 'smith' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'plate';
export type EquipmentSlug = 'rack' | 'barbell' | 'plates' | 'bench' | 'cable' | 'pullup-assist' | 'dumbbell' | 'machines' | 'bodyweight' | 'trap_bar' | 'safety_bar' | 'smith_machine';
export type Area = 'knee' | 'hip' | 'lower_back' | 'shoulder' | 'elbow' | 'wrist' | 'neck_upper_back' | 'hamstring' | 'ankle_foot' | 'other';
export type TimeKind = 'barbell_compound' | 'other_compound' | 'isolation';
export type RecoveryGroup = 'lower' | 'press' | 'pull' | 'own';
export type Pattern = 'squat' | 'hinge' | 'horizontal_press' | 'vertical_press' | 'vertical_pull' | 'horizontal_pull' | 'isolation_shoulder' | 'isolation_arm' | 'trunk';

type CatalogExerciseV1 = {
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

export type VariantMetadata = {
  loadDisplayBasis: LoadDisplayBasis;
  equipmentClass: EquipmentClass;
  /** Maskin/kabel/smith: visade kg är inte jämförbara mellan maskiner med okänd utväxling (§2.3). */
  requiresEquipmentProfile: boolean;
  unilateral: boolean;
  /** Tidsmodellens faktor för arbetsset (unilateral: båda sidor). Befintliga övningar: 1 (oförändrat). */
  timeMultiplier: number;
  /** Katalog 1.x angav inte om hantelvikt är per hand; befintlig semantik bevaras oförändrad. */
  legacyUnspecifiedBasis?: boolean;
  catalogSince: '1.0.0' | '2.0.0' | '2.0.1';
};

export type CatalogExercise = CatalogExerciseV1 & VariantMetadata;

const E = (x: CatalogExerciseV1) => x;

/** Version 1 – oförändrad. */
const CATALOG_V1: readonly CatalogExerciseV1[] = [
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

const M = (loadDisplayBasis: LoadDisplayBasis, equipmentClass: EquipmentClass, requiresEquipmentProfile: boolean, unilateral = false, extra: Partial<VariantMetadata> = {}): VariantMetadata => ({
  loadDisplayBasis,
  equipmentClass,
  requiresEquipmentProfile,
  unilateral,
  timeMultiplier: 1,
  catalogSince: '1.0.0',
  ...extra,
});

/** Variantmetadata för version 1-övningarna. Ändrar inga befintliga regler eller värden (tidsfaktor 1). */
const META_V1: Record<RefExerciseId, VariantMetadata> = {
  squat: M('total_kg', 'barbell', false),
  bench_press: M('total_kg', 'barbell', false),
  deadlift: M('total_kg', 'barbell', false),
  romanian_deadlift: M('total_kg', 'barbell', false),
  overhead_press: M('total_kg', 'barbell', false),
  lat_pulldown: M('total_kg', 'cable', true),
  assisted_pullup: M('assistance_kg', 'machine', true),
  pullup: M('bodyweight_plus_kg', 'bodyweight', false),
  cable_row: M('total_kg', 'cable', true),
  chest_supported_row: M('total_kg', 'machine', true),
  cable_lateral_raise: M('total_kg', 'cable', true),
  biceps_curl: M('total_kg', 'dumbbell', false, false, { legacyUnspecifiedBasis: true }),
  triceps_pushdown: M('total_kg', 'cable', true),
  cable_crunch: M('total_kg', 'cable', true),
  plank: M('seconds', 'bodyweight', false),
  // Unilateral men tidsfaktor 1: befintlig tidsmodell för version 1 ändras inte (se AVVIKELSER).
  split_squat: M('total_kg', 'dumbbell', false, true, { legacyUnspecifiedBasis: true }),
  leg_press: M('total_kg', 'machine', true),
};

type NewExercise = CatalogExerciseV1 & { slug: ExtraExerciseId };
const N = (base: Omit<NewExercise, 'priorityLift' | 'bonus'> & { bonus?: boolean }, meta: Omit<VariantMetadata, 'catalogSince' | 'timeMultiplier'>, since: '2.0.0' | '2.0.1' = '2.0.0'): CatalogExercise => ({
  priorityLift: false,
  bonus: false,
  ...base,
  ...meta,
  // H: unilateral övning räknas för båda sidor i tidsmodellen (§3.4).
  timeMultiplier: meta.unilateral ? 2 : 1,
  catalogSince: since,
});
const meta = (loadDisplayBasis: LoadDisplayBasis, equipmentClass: EquipmentClass, requiresEquipmentProfile = false, unilateral = false) => ({ loadDisplayBasis, equipmentClass, requiresEquipmentProfile, unilateral });

/** Version 2.0.0 – nya övningar för substitutionskatalogen. Områden är planeringsetiketter (H), inte riskbedömning. */
const CATALOG_V2_NEW: readonly CatalogExercise[] = [
  N({ slug: 'front_squat', nameSv: 'Frontböj', pattern: 'squat', loadKind: 'external_kg', equipment: ['rack', 'barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['knee', 'hip', 'lower_back', 'ankle_foot', 'wrist'], recoveryGroup: 'lower' }, meta('total_kg', 'barbell')),
  N({ slug: 'safety_bar_squat', nameSv: 'Safety bar-knäböj', pattern: 'squat', loadKind: 'external_kg', equipment: ['rack', 'safety_bar', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['knee', 'hip', 'lower_back', 'ankle_foot'], recoveryGroup: 'lower' }, meta('total_kg', 'specialty_bar')),
  N({ slug: 'smith_squat', nameSv: 'Smithknäböj', pattern: 'squat', loadKind: 'external_kg', equipment: ['smith_machine', 'plates'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['knee', 'hip', 'lower_back'], recoveryGroup: 'lower' }, meta('total_kg', 'smith', true)),
  N({ slug: 'hack_squat', nameSv: 'Hack squat', pattern: 'squat', loadKind: 'external_kg', equipment: ['machines', 'plates'], defaultIncrementKg: 5, timeKind: 'other_compound', areas: ['knee', 'hip', 'lower_back'], recoveryGroup: 'lower' }, meta('total_kg', 'machine', true)),
  N({ slug: 'goblet_squat', nameSv: 'Gobletknäböj', pattern: 'squat', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['knee', 'hip', 'lower_back', 'ankle_foot'], recoveryGroup: 'lower' }, meta('total_kg', 'dumbbell')),
  N({ slug: 'sumo_deadlift', nameSv: 'Sumomarklyft', pattern: 'hinge', loadKind: 'external_kg', equipment: ['barbell', 'plates'], defaultIncrementKg: 5, timeKind: 'barbell_compound', areas: ['knee', 'hip', 'lower_back', 'hamstring', 'neck_upper_back'], recoveryGroup: 'lower' }, meta('total_kg', 'barbell')),
  N({ slug: 'trap_bar_deadlift', nameSv: 'Trap bar-marklyft', pattern: 'hinge', loadKind: 'external_kg', equipment: ['trap_bar', 'plates'], defaultIncrementKg: 5, timeKind: 'barbell_compound', areas: ['knee', 'hip', 'lower_back', 'hamstring'], recoveryGroup: 'lower' }, meta('total_kg', 'specialty_bar')),
  N({ slug: 'dumbbell_romanian_deadlift', nameSv: 'Rumänska marklyft med hantlar', pattern: 'hinge', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['hip', 'lower_back', 'hamstring'], recoveryGroup: 'lower' }, meta('per_hand_kg', 'dumbbell')),
  N({ slug: 'stiff_leg_deadlift', nameSv: 'Stiff leg-marklyft', pattern: 'hinge', loadKind: 'external_kg', equipment: ['barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['hip', 'lower_back', 'hamstring'], recoveryGroup: 'lower' }, meta('total_kg', 'barbell')),
  N({ slug: 'dumbbell_bench_press', nameSv: 'Hantelpress liggande', pattern: 'horizontal_press', loadKind: 'external_kg', equipment: ['bench', 'dumbbell'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'press' }, meta('per_hand_kg', 'dumbbell')),
  N({ slug: 'smith_bench_press', nameSv: 'Smithbänkpress', pattern: 'horizontal_press', loadKind: 'external_kg', equipment: ['smith_machine', 'bench', 'plates'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'press' }, meta('total_kg', 'smith', true)),
  N({ slug: 'chest_press_machine', nameSv: 'Bröstpressmaskin', pattern: 'horizontal_press', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'press' }, meta('total_kg', 'machine', true)),
  N({ slug: 'incline_bench_press', nameSv: 'Lutande bänkpress', pattern: 'horizontal_press', loadKind: 'external_kg', equipment: ['bench', 'barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'press' }, meta('total_kg', 'barbell')),
  N({ slug: 'dumbbell_shoulder_press', nameSv: 'Hantelpress över huvudet', pattern: 'vertical_press', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist', 'neck_upper_back'], recoveryGroup: 'press' }, meta('per_hand_kg', 'dumbbell')),
  N({ slug: 'seated_barbell_press', nameSv: 'Sittande stångpress', pattern: 'vertical_press', loadKind: 'external_kg', equipment: ['bench', 'barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['shoulder', 'elbow', 'wrist', 'neck_upper_back'], recoveryGroup: 'press' }, meta('total_kg', 'barbell')),
  N({ slug: 'shoulder_press_machine', nameSv: 'Axelpressmaskin', pattern: 'vertical_press', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'wrist'], recoveryGroup: 'press' }, meta('total_kg', 'machine', true)),
  N({ slug: 'neutral_grip_lat_pulldown', nameSv: 'Latsdrag med neutralt grepp', pattern: 'vertical_pull', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow'], recoveryGroup: 'pull' }, meta('total_kg', 'cable', true)),
  N({ slug: 'seated_machine_row', nameSv: 'Sittande maskinrodd', pattern: 'horizontal_pull', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 2.5, timeKind: 'other_compound', areas: ['shoulder', 'elbow'], recoveryGroup: 'pull' }, meta('total_kg', 'machine', true)),
  N({ slug: 'one_arm_dumbbell_row', nameSv: 'Enarms hantelrodd', pattern: 'horizontal_pull', loadKind: 'external_kg', equipment: ['dumbbell', 'bench'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['shoulder', 'elbow', 'lower_back'], recoveryGroup: 'pull' }, meta('per_hand_kg', 'dumbbell', false, true)),
  N({ slug: 'dumbbell_lateral_raise', nameSv: 'Sidolyft med hantlar', pattern: 'isolation_shoulder', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['shoulder'], recoveryGroup: 'own' }, meta('per_hand_kg', 'dumbbell')),
  N({ slug: 'lateral_raise_machine', nameSv: 'Sidolyft i maskin', pattern: 'isolation_shoulder', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['shoulder'], recoveryGroup: 'own' }, meta('total_kg', 'machine', true)),
  N({ slug: 'dumbbell_curl', nameSv: 'Hantelcurl', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'wrist'], recoveryGroup: 'own' }, meta('per_hand_kg', 'dumbbell')),
  N({ slug: 'cable_curl', nameSv: 'Kabelcurl', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'wrist'], recoveryGroup: 'own' }, meta('total_kg', 'cable', true)),
  N({ slug: 'incline_dumbbell_curl', nameSv: 'Lutande hantelcurl', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['dumbbell', 'bench'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'wrist', 'shoulder'], recoveryGroup: 'own' }, meta('per_hand_kg', 'dumbbell')),
  N({ slug: 'rope_pushdown', nameSv: 'Triceps pushdown med rep', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['cable'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'wrist'], recoveryGroup: 'own' }, meta('total_kg', 'cable', true)),
  N({ slug: 'overhead_triceps_extension', nameSv: 'Triceps extension över huvudet', pattern: 'isolation_arm', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 1, timeKind: 'isolation', areas: ['elbow', 'shoulder'], recoveryGroup: 'own' }, meta('total_kg', 'dumbbell')),
  N({ slug: 'machine_crunch', nameSv: 'Magcrunch i maskin', pattern: 'trunk', loadKind: 'external_kg', equipment: ['machines'], defaultIncrementKg: 2.5, timeKind: 'isolation', areas: ['lower_back'], recoveryGroup: 'own', bonus: true }, meta('total_kg', 'machine', true)),
  N({ slug: 'weighted_crunch', nameSv: 'Viktad crunch', pattern: 'trunk', loadKind: 'external_kg', equipment: ['plates'], defaultIncrementKg: 2.5, timeKind: 'isolation', areas: ['lower_back', 'neck_upper_back'], recoveryGroup: 'own', bonus: true }, meta('total_kg', 'plate')),
  N({ slug: 'bulgarian_split_squat', nameSv: 'Bulgarisk split squat', pattern: 'squat', loadKind: 'external_kg', equipment: ['dumbbell', 'bench'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['knee', 'hip', 'ankle_foot'], recoveryGroup: 'lower' }, meta('per_hand_kg', 'dumbbell', false, true)),
  N({ slug: 'lunge', nameSv: 'Utfall', pattern: 'squat', loadKind: 'external_kg', equipment: ['dumbbell'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['knee', 'hip', 'ankle_foot'], recoveryGroup: 'lower' }, meta('per_hand_kg', 'dumbbell', false, true)),
  N({ slug: 'step_up', nameSv: 'Step up', pattern: 'squat', loadKind: 'external_kg', equipment: ['dumbbell', 'bench'], defaultIncrementKg: 2, timeKind: 'other_compound', areas: ['knee', 'hip', 'ankle_foot'], recoveryGroup: 'lower' }, meta('per_hand_kg', 'dumbbell', false, true)),
  // Katalog 2.0.1: krävs av seed-filens par cable_row → barbell_row.
  N({ slug: 'barbell_row', nameSv: 'Skivstångsrodd', pattern: 'horizontal_pull', loadKind: 'external_kg', equipment: ['barbell', 'plates'], defaultIncrementKg: 2.5, timeKind: 'barbell_compound', areas: ['shoulder', 'elbow', 'lower_back'], recoveryGroup: 'pull' }, meta('total_kg', 'barbell'), '2.0.1'),
];

export const CATALOG: readonly CatalogExercise[] = [...CATALOG_V1.map((x) => ({ ...x, ...META_V1[x.slug as RefExerciseId] })), ...CATALOG_V2_NEW];

/**
 * Övningar som inte längre erbjuds (katalog 2.0.1): finns kvar så att eventuell historik kan visas,
 * men föreslås aldrig och visas inte i val. `lunge` saknas i produktägarens kandidatmappning.
 */
export const RETIRED_SLUGS: ReadonlySet<ExerciseId> = new Set<ExerciseId>(['lunge']);

/** Katalogen som erbjuds i val och listor (utan pensionerade övningar). */
export const OFFERED_CATALOG: readonly CatalogExercise[] = CATALOG.filter((x) => !RETIRED_SLUGS.has(x.slug));

/** Övningar som fanns i version 1 (programmallarnas och spontanpassets ursprungliga urval). */
export const V1_SLUGS: ReadonlySet<ExerciseId> = new Set(CATALOG_V1.map((x) => x.slug));

const BY_SLUG = new Map(CATALOG.map((x) => [x.slug, x]));

export function exercise(slug: ExerciseId): CatalogExercise {
  const x = BY_SLUG.get(slug);
  if (!x) throw new Error(`UNKNOWN_EXERCISE_${slug}`);
  return x;
}

export function isExerciseId(s: string): s is ExerciseId {
  return BY_SLUG.has(s as ExerciseId);
}

/** Övning som finns i referensmotorns typ (de 17 ursprungliga). */
export function isRefExerciseId(s: ExerciseId): s is RefExerciseId {
  return V1_SLUGS.has(s);
}

export const ALL_EQUIPMENT: readonly EquipmentSlug[] = ['rack', 'barbell', 'plates', 'bench', 'cable', 'pullup-assist', 'dumbbell', 'machines', 'bodyweight', 'trap_bar', 'safety_bar', 'smith_machine'];

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
  trap_bar: 'Trap bar (hexstång)',
  safety_bar: 'Safety squat bar',
  smith_machine: 'Smithmaskin',
};

export const LOAD_BASIS_SV: Record<LoadDisplayBasis, string> = {
  total_kg: 'kg totalt',
  per_hand_kg: 'kg per hantel',
  assistance_kg: 'kg assistans',
  bodyweight_plus_kg: 'kg extra vikt',
  reps_only: 'repetitioner',
  seconds: 'sekunder',
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
