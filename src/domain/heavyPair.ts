import { isHeavy, validateHeavyPair, type Mode, type SessionExercise } from './decision_engine';
import type { ExerciseId, RefExerciseId } from './catalog';

export type HeavyCheckItem = { exerciseId: ExerciseId; mode: Mode; sets: number; plannedKg?: number | null; estimatedOneRM?: number | null; isMarkedHeavy?: boolean };

/**
 * Referensmotorns parregel (`validateHeavyPair`) för appens utökade katalog. Referensens logik jämför bara
 * id-likhet och tyngd, så typomvandlingen ändrar inte beteendet (se catalog.ts).
 */
export function heavyPairAllowed(list: HeavyCheckItem[], a: ExerciseId, b: ExerciseId): boolean {
  return validateHeavyPair(list as unknown as SessionExercise[], a as RefExerciseId, b as RefExerciseId);
}

export function isHeavyItem(x: HeavyCheckItem): boolean {
  return isHeavy(x as unknown as SessionExercise);
}
