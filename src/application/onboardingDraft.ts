import type { Experience } from '../domain/decision_engine';
import type { EquipmentSlug } from '../domain/catalog';
import type { StrengthInput } from '../domain/strengthInputs';
import type { AppContext } from './context';
import { DEFAULT_PROFILE, GYM_STANDARD, type NewRestriction } from './profile';

export type IntroStrengthDraft = { kind: StrengthInput['kind']; kg: string; reps: string; rir: string; testedAt: string; measured: boolean };
export const INTRO_LIFTS = ['squat', 'bench_press', 'deadlift'] as const;
export type IntroLift = typeof INTRO_LIFTS[number];
export type IntroPage = 'training' | 'equipment' | 'source' | 'summary' | 'adaptation' | `lift-${number}` | `entry-${number}-${StrengthInput['kind']}`;
export const validIntroPage = (v: string | null): v is IntroPage => !!v && /^(training|equipment|source|summary|adaptation|lift-[0-2]|entry-[0-2]-(1rm|3rm|submax))$/.test(v);
export type OnboardingDraft = {
  version: 1; userId: string; page: IntroPage;
  adult: boolean; frequency: number; minutes: number; experience: Experience;
  equipment: EquipmentSlug[]; goals: Record<IntroLift, number>;
  pull: 'lat_pulldown' | 'assisted_pullup' | 'pullup';
  source: 'performed_sets' | 'strength_inputs';
  entries: Partial<Record<IntroLift, Partial<Record<StrengthInput['kind'], IntroStrengthDraft>>>>;
  saved: Partial<Record<IntroLift, IntroStrengthDraft[]>>;
  visited: IntroLift[]; consent: boolean; rules: NewRestriction[];
};
export const ONBOARDING_DRAFT_KEY = 'onboarding-draft-v1';
export function newOnboardingDraft(userId: string): OnboardingDraft {
  return { version: 1, userId, page: 'training', adult: false, frequency: DEFAULT_PROFILE.plannedSessionsPerWeek,
    minutes: DEFAULT_PROFILE.minutesPerSession, experience: DEFAULT_PROFILE.experience,
    equipment: [...GYM_STANDARD], goals: { squat: 1, bench_press: 1, deadlift: 1 }, pull: 'lat_pulldown',
    source: 'performed_sets', entries: {}, saved: {}, visited: [], consent: false, rules: [] };
}
/** Private per-account Dexie metadata. Never shared localStorage and never a fabricated training result. */
export async function loadOnboardingDraft(ctx: AppContext): Promise<OnboardingDraft> {
  const value = (await ctx.db.meta.get(ONBOARDING_DRAFT_KEY))?.value as OnboardingDraft | undefined;
  if (!value || value.version !== 1 || value.userId !== ctx.userId || !validIntroPage(value.page)) return newOnboardingDraft(ctx.userId);
  return value;
}
export async function saveOnboardingDraft(ctx: AppContext, draft: OnboardingDraft): Promise<void> {
  if (draft.userId !== ctx.userId) throw new Error('DRAFT_ACCOUNT_MISMATCH');
  await ctx.db.meta.put({ key: ONBOARDING_DRAFT_KEY, value: draft });
}
