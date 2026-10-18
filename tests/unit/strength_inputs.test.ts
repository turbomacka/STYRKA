import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { StyrkaDB } from '../../src/storage/db';
import { SyncEngine } from '../../src/application/sync';
import { resolveStrengthInputs, validStrengthInput, type StrengthInput } from '../../src/domain/strengthInputs';
import { completeOnboarding, setEstimate, setStrengthInputs, strengthInputsFromSettings, updateExerciseSettings } from '../../src/application/profile';
import { toUserSettings } from '../../src/application/plannerInput';
import { previewNext } from '../../src/application/training';
import { exportJson } from '../../src/application/privacy';
import { harness, onboard, ONBOARDING, type Harness } from './appHarness';

const observation = (kind: StrengthInput['kind'], grams: number, extra: Partial<StrengthInput> = {}): StrengthInput => ({ kind, grams, reps: kind === 'submax' ? 5 : null, rir: kind === 'submax' ? 2 : null, measured: false, testedAt: null, ...extra });
const inputs = [observation('1rm', 100_000), observation('3rm', 90_000), observation('submax', 80_000)];
const hs: Harness[] = [];
const make = () => { const h = harness(); hs.push(h); return h; };
afterEach(async () => { for (const h of hs.splice(0)) { h.sync.dispose(); await h.db.delete(); } });

describe('independent strength observations', () => {
  it('combines comparable evidence deterministically, never above a reported 1RM', () => {
    const r = resolveStrengthInputs(inputs);
    expect(r.used).toBe(3);
    expect(r.estimate!.kg).toBeCloseTo(99.333, 3);
    expect(r.estimate?.inputReason).toBe('MULTIPLE_STRENGTH_INPUTS');
    expect(resolveStrengthInputs([...inputs].reverse())).toEqual(r);
    expect(resolveStrengthInputs([observation('1rm', 100_000), observation('3rm', 100_000)]).estimate?.kg).toBe(100);
  });
  it('retains old and undated observations but prefers current dated evidence', () => {
    const r = resolveStrengthInputs([observation('1rm', 180_000, { testedAt: '2025-10-01' }), observation('3rm', 100_000, { testedAt: '2026-10-01' }), observation('submax', 140_000)]);
    expect(r).toMatchObject({ used: 1, excluded: 2, disagreement: false, estimate: { kind: '3rm', kg: 100 } });
  });
  it('conflicting comparable inputs lower the estimate and its confidence', () => {
    expect(resolveStrengthInputs([observation('1rm', 150_000), observation('3rm', 90_000)])).toMatchObject({ disagreement: true, estimate: { kg: 99, confidence: 'low', inputReason: 'STRENGTH_INPUTS_DISAGREE' } });
  });
  it('unknown RIR is not invented; empty and single input remain supported', () => {
    expect(resolveStrengthInputs([observation('submax', 70_000, { rir: null })]).used).toBe(0);
    expect(resolveStrengthInputs([]).estimate).toBeNull();
    expect(resolveStrengthInputs([inputs[1]]).estimate).toMatchObject({ kind: '3rm', kg: 90 });
    expect(resolveStrengthInputs([inputs[0], observation('submax', 200_000, { rir: null })])).toMatchObject({ used: 1, excluded: 1, estimate: { kind: '1rm', kg: 100 } });
  });
  it('validates dates, integers and independent set requirements', () => {
    for (const extra of [{ testedAt: '2026-02-30' }, { testedAt: '2027-01-01' }, { grams: 0 }, { grams: 100.1 }]) expect(validStrengthInput(observation('1rm', 100_000, extra), '2026-10-12')).toBe(false);
    expect(validStrengthInput(observation('submax', 70_000, { rir: null }), '2026-10-12')).toBe(true);
    expect(validStrengthInput(observation('submax', 70_000, { reps: 8.5 }), '2026-10-12')).toBe(false);
  });
  it('onboarding stores all independent inputs and uses them in the first prescription', async () => {
    const h = make();
    await completeOnboarding(h.ctx, { ...ONBOARDING, estimates: [], strengthInputs: [{ exerciseId: 'squat', inputs }] });
    const s = (await h.db.exerciseSettings.toArray())[0];
    expect(s.strengthInputs).toEqual(inputs);
    expect(toUserSettings(s).estimate?.kg).toBeCloseTo(99.333, 3);
    expect((await previewNext(h.ctx)).exercises.find((e) => e.exerciseId === 'squat')).toMatchObject({ kg: 75, reasons: expect.arrayContaining(['MULTIPLE_STRENGTH_INPUTS']) });
    expect((await exportJson(h.ctx)).exerciseSettings).toEqual(expect.arrayContaining([expect.objectContaining({ strengthInputs: inputs })]));
  });
  it('legacy single estimate survives editing and one-field updates retain other observations', async () => {
    const h = make(); await onboard(h);
    let s = (await h.db.exerciseSettings.where('exerciseId').equals('squat').first())!;
    expect(s.strengthInputs).toBeUndefined();
    await setStrengthInputs(h.ctx, 'squat', [...strengthInputsFromSettings(s), inputs[1]]);
    await setEstimate(h.ctx, { exerciseId: 'squat', kind: '3rm', grams: 95_000 });
    await updateExerciseSettings(h.ctx, 'squat', { incrementGrams: 1250 });
    s = (await h.db.exerciseSettings.get(s.id))!;
    expect(s.strengthInputs?.map((x) => [x.kind, x.grams])).toEqual([['1rm', 120_000], ['3rm', 95_000]]);
  });
  it('offline sync and another device preserve independent values; clearing cannot revive legacy data', async () => {
    const h = make(); await onboard(h); h.server.online = false;
    await setStrengthInputs(h.ctx, 'squat', inputs);
    expect(await h.db.outbox.count()).toBeGreaterThan(0);
    h.server.online = true; expect(await h.sync.syncNow()).toMatchObject({ rejected: 0 });
    const db = new StyrkaDB(`test-strength-${randomUUID()}`);
    const ctx = { ...h.ctx, db };
    const other = { ...h, db, ctx, sync: new SyncEngine(ctx) }; hs.push(other);
    await other.sync.pull();
    expect((await other.db.exerciseSettings.where('exerciseId').equals('squat').first())?.strengthInputs).toEqual(inputs);
    await setStrengthInputs(other.ctx, 'squat', []); await other.sync.syncNow(); await h.sync.pull();
    const s = (await h.db.exerciseSettings.where('exerciseId').equals('squat').first())!;
    expect(s.strengthInputs).toEqual([]); expect(toUserSettings(s).estimate).toBeNull();
  });
  it('invalid or duplicate observations reject atomically', async () => {
    const h = make(); await onboard(h);
    const before = await h.db.exerciseSettings.toArray();
    await expect(setStrengthInputs(h.ctx, 'squat', [inputs[0], inputs[0]])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(setStrengthInputs(h.ctx, 'squat', [observation('submax', 70_000, { reps: 0 })])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await h.db.exerciseSettings.toArray()).toEqual(before);
  });
  it('all strength fields may be omitted without fabricating a weight', async () => {
    const h = make(); await onboard(h, { estimates: [], strengthInputs: [] });
    expect((await previewNext(h.ctx)).exercises.find((e) => e.exerciseId === 'squat')).toMatchObject({ kg: null, calibration: true });
  });
});
