import { afterEach, describe, expect, it } from 'vitest';
import { prescribe } from '../../src/domain/prescription';
import { trainingPreferences } from '../../src/domain/trainingFlow';
import { planRegular, planExtra, planReplacement } from '../../src/planner/planner';
import { completeOnboarding, patchProfile } from '../../src/application/profile';
import { loadOnboardingDraft, newOnboardingDraft, saveOnboardingDraft } from '../../src/application/onboardingDraft';
import { previewNext } from '../../src/application/training';
import { ALL_ESTIMATES, est, hoursBefore, input, NOW, performed, plan, sets } from './helpers';
import { harness, ONBOARDING, type Harness } from './appHarness';

const strict = trainingPreferences({ loadRecommendationSource: 'performed_sets' });
const hs: Harness[] = [];
const make = () => { const h = harness(); hs.push(h); return h; };
afterEach(async () => { for (const h of hs.splice(0)) { h.sync.dispose(); await h.db.delete(); } });

describe('explicit performed-set source', () => {
  it('ignores manual estimates in regular and extra sessions, preserving the exercise plan', () => {
    const a = input({ exerciseSettings: ALL_ESTIMATES, profile: { trainingPreferences: strict } });
    const b = { ...a, exerciseSettings: [] };
    expect(planRegular(a).exercises).toEqual(planRegular(b).exercises);
    expect(planExtra(a, { minutes: 40, readiness: 'good' }).exercises).toEqual(planExtra(b, { minutes: 40, readiness: 'good' }).exercises);
    expect(planRegular(a).exercises.filter((e) => e.loadKind === 'external_kg').every((e) => e.kg === null)).toBe(true);
    expect(planRegular(input({ exerciseSettings: ALL_ESTIMATES })).exercises.some((e) => e.kg !== null)).toBe(true);
  });
  it('does not obtain a population prior or a target estimate through replacements', () => {
    const a = input({ exerciseSettings: [...ALL_ESTIMATES, est('front_squat', 200)], profile: { trainingPreferences: strict } });
    const result = planReplacement(a, { from: plan('squat'), to: 'front_squat', others: [], familiarity: 'familiar' });
    expect(result.planned).toMatchObject({ kg: null, calibration: true });
    expect(result.planned?.calibrationSuggestionKg ?? null).toBeNull();
    expect(result.planned?.substitution?.prior).toBeUndefined();
  });
  it('bases the next load on actual working sets, without RIR or an estimated maximum', () => {
    const h = performed('squat', hoursBefore(NOW, 100), { kg: 150, estimatedOneRM: 220 }, sets(3, { kg: 150, actualKg: 60, reps: 5 }));
    const before = structuredClone(h);
    const result = prescribe({ performedSetsOnly: true, exerciseId: 'squat', mode: 'heavy', sets: 3, role: 'main', experience: 'intermediate', settings: est('squat', 220), history: [h], bodyweightKg: null, gate: { hoursSinceRelevant: 100, impactedRegion: false, relevantSymptoms: 'none' } });
    expect(result.kg).toBe(60); expect(result.estimatedOneRM).toBeNull();
    expect(h).toEqual(before);
  });
  it('derives a lighter-mode weight from performed calibration load, never from old planned load', () => {
    const args = { performedSetsOnly: true, exerciseId: 'squat' as const, mode: 'light' as const, sets: 3, role: 'main' as const, experience: 'intermediate' as const, settings: null, bodyweightKg: null, gate: { hoursSinceRelevant: 100, impactedRegion: false, relevantSymptoms: 'none' as const } };
    const h = performed('squat', hoursBefore(NOW, 100), { kg: null }, sets(3, { kg: 60, reps: 5 }));
    expect(prescribe({ ...args, history: [h] }).kg).toBe(45);
    h.plan.kg = 250;
    expect(prescribe({ ...args, history: [h] }).kg).toBe(45);
    h.sets.forEach((s) => s.kind = 'warmup');
    expect(prescribe({ ...args, history: [h] }).kg).toBeNull();
  });
  it('source persists through sync and changing it never erases manual entries', async () => {
    const h = make();
    await completeOnboarding(h.ctx, { ...ONBOARDING, loadRecommendationSource: 'performed_sets' });
    const saved = await h.db.exerciseSettings.toArray();
    expect((await previewNext(h.ctx)).exercises.find((e) => e.exerciseId === 'squat')?.kg).toBeNull();
    expect(await h.sync.syncNow()).toMatchObject({ rejected: 0, conflicts: 0 });
    expect(h.server.profiles.get(h.ctx.userId)?.training_preferences).toMatchObject({ loadRecommendationSource: 'performed_sets' });
    await patchProfile(h.ctx, { trainingPreferences: trainingPreferences({ loadRecommendationSource: 'strength_inputs' }) });
    expect((await previewNext(h.ctx)).exercises.find((e) => e.exerciseId === 'squat')?.kg).toBeGreaterThan(0);
    expect(await h.db.exerciseSettings.toArray()).toEqual(saved.map((s) => ({ ...s, syncState: 'synced' })));
  });
});

describe('account-scoped onboarding checkpoints', () => {
  it('restores unfinished fields separately from confirmed entries, and clears only on completion', async () => {
    const h = make();
    const d = newOnboardingDraft(h.ctx.userId);
    expect(d.source).toBe('performed_sets'); expect(d.consent).toBe(false);
    d.page = 'entry-0-submax'; d.entries.squat = { submax: { kind: 'submax', kg: '82,5', reps: '', rir: '', testedAt: '', measured: false } };
    await saveOnboardingDraft(h.ctx, d);
    expect(await loadOnboardingDraft(h.ctx)).toEqual(d);
    expect(await h.db.profile.count()).toBe(0);
    await expect(completeOnboarding(h.ctx, { ...ONBOARDING, adultConfirmed: false })).rejects.toThrow();
    expect(await loadOnboardingDraft(h.ctx)).toEqual(d);
    await completeOnboarding(h.ctx, ONBOARDING);
    expect(await h.db.meta.get('onboarding-draft-v1')).toBeUndefined();
  });
  it('cannot load or write another account’s draft', async () => {
    const a = make(), b = make();
    const d = newOnboardingDraft(a.ctx.userId);
    await expect(saveOnboardingDraft(b.ctx, d)).rejects.toThrow('DRAFT_ACCOUNT_MISMATCH');
    await b.db.meta.put({ key: 'onboarding-draft-v1', value: d });
    expect((await loadOnboardingDraft(b.ctx)).userId).toBe(b.ctx.userId);
  });
});
