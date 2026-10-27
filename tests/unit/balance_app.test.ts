/**
 * ÄA-BAL-001 i applikationslagret (lokal databas per användare, verklig planerare): BAL07, BAL11, BAL19, BAL31,
 * BAL32 (godkänd katalog ⇒ ingen tillåten justering), BAL36 och BAL38. Godkännande (BAL33–BAL35) i balance_accept.
 */
import { describe, expect, it } from 'vitest';
import type { ExerciseId } from '../../src/domain/catalog';
import { patchProfile } from '../../src/application/profile';
import { displayOrder, finishSession, logSet, previewExtra, previewNext, startSession, undoSet } from '../../src/application/training';
import { getFuturePlan, planRevisions, refreshFuturePlan } from '../../src/application/trainingPlan';
import { dismissBalanceSuggestion, getBalanceOverview, previewBalanceAdjustment } from '../../src/application/balance';
import { harness, onboard, TestClock, type Harness } from './appHarness';
import { doSession } from './balanceHelpers';

async function dump(h: Harness) {
  const { db } = h;
  return { sessions: await db.sessions.toArray(), exs: await db.sessionExercises.toArray(), sets: await db.sets.toArray(), profile: await db.profile.toArray(), revs: await db.planRevisions.toArray(), notes: await db.notes.toArray(), outbox: await db.outbox.count(), decisions: await db.balanceDecisions.toArray() };
}

describe('Balans i appen', () => {
  it('BAL07/BAL36: två konton ⇒ helt åtskilda resultat; kontobyte och rättade set invaliderar korrekt', async () => {
    const clock = new TestClock();
    const A = harness({ clock });
    const B = harness({ clock });
    await onboard(A);
    await onboard(B);
    await doSession(A);
    const a = await getBalanceOverview(A.ctx);
    const b = await getBalanceOverview(B.ctx);
    expect(a.hasData).toBe(true);
    expect(b).toMatchObject({ hasData: false, summaries: [] });
    const aSets = new Set(a.summaries.flatMap((s) => s.supportingSetIds));
    expect((await B.db.sets.toArray()).some((s) => aSets.has(s.id))).toBe(false);
    // Rättat (ångrat) set ⇒ ny beräkning, ingen inaktuell siffra.
    const knee = a.summaries.find((s) => s.patternId === 'knee_dominant')!.actualWorkSets28d;
    const someSquatSet = (await A.db.sets.where('exerciseId').equals('squat').toArray()).find((s) => s.status === 'done')!;
    await undoSet(A.ctx, someSquatSet.id);
    const a2 = await getBalanceOverview(A.ctx);
    expect(a2.summaries.find((s) => s.patternId === 'knee_dominant')!.actualWorkSets28d).toBe(knee - 1);
    expect(a2.historyRevisionOrHash).not.toBe(a.historyRevisionOrHash);
  });

  it('BAL11/BAL19: planrevision efter genomförda pass ändrar inte historisk planjämförelse; framtidsplanen ingår aldrig', async () => {
    const h = harness();
    await onboard(h);
    await getFuturePlan(h.ctx, 36);
    await doSession(h, ['lat_pulldown']);
    await doSession(h, ['lat_pulldown']);
    await refreshFuturePlan(h.ctx);
    const before = await getBalanceOverview(h.ctx);
    await patchProfile(h.ctx, { minutesPerSession: 30, plannedSessionsPerWeek: 3 });
    await refreshFuturePlan(h.ctx);
    const after = await getBalanceOverview(h.ctx);
    expect(after.summaries).toEqual(before.summaries);
    const vp = after.summaries.find((s) => s.patternId === 'vertical_pull')!;
    expect(vp).toMatchObject({ eligiblePlannedWorkSets: 2, matchedCompletedWorkSets: 0 }); // A has two vertical-pull sets; B now has horizontal pulling.
    // Användare med bara spontanpass: 36 framtida platser ger ingen nämnare.
    const x = harness();
    await onboard(x);
    await getFuturePlan(x.ctx, 36);
    const extra = await startSession(x.ctx, await previewExtra(x.ctx, { minutes: 30, readiness: 'good' }));
    for (const set of await x.db.sets.where('sessionId').equals(extra.id).toArray()) await logSet(x.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000 });
    await finishSession(x.ctx, extra.id);
    const ox = await getBalanceOverview(x.ctx);
    expect(ox.summaries.every((s) => s.eligiblePlannedWorkSets === null && s.matchedCompletedWorkSets === null)).toBe(true);
  });

  it('BAL31/BAL32: läsning och förhandsvisning har inga sidoeffekter; avböjt förslag återkommer inte vid nya öppningar', async () => {
    const h = harness();
    await onboard(h);
    // A/B/C/A provides three vertical-pull exposures; B contains a horizontal row.
    for (let i = 0; i < 4; i++) await doSession(h, ['lat_pulldown']);
    await refreshFuturePlan(h.ctx);
    const snap = await dump(h);
    const revCount = (await planRevisions(h.ctx)).length;
    let o = await getBalanceOverview(h.ctx);
    for (let i = 0; i < 4; i++) o = await getBalanceOverview(h.ctx);
    expect(o.topSuggestion).toMatchObject({ patternId: 'vertical_pull', planned: 6, matched: 0 });
    expect(o.topSuggestion!.textSv).toContain('0 av 6');
    // Förhandsvisning med den godkända katalogen: ingen tillåten justering, inga ändringar.
    const p = await previewBalanceAdjustment(h.ctx, o.topSuggestion!.candidateKey);
    expect(p).toMatchObject({ status: 'none', reasonCode: 'BAL_NO_SAFE_PLAN_ADJUSTMENT', textSv: 'Det går inte att föreslå en justering inom dina nuvarande ramar.' });
    expect(await dump(h)).toEqual(snap);
    expect((await planRevisions(h.ctx)).length).toBe(revCount);
    // Avböj – idempotent – och öppna igen.
    await dismissBalanceSuggestion(h.ctx, o.topSuggestion!.candidateKey, crypto.randomUUID());
    await dismissBalanceSuggestion(h.ctx, o.topSuggestion!.candidateKey, crypto.randomUUID());
    expect(await h.db.balanceDecisions.count()).toBe(1);
    for (let i = 0; i < 3; i++) {
      const again = await getBalanceOverview(h.ctx);
      expect(again.topSuggestion).toBeUndefined();
      expect(again.suppressed).toContainEqual({ patternId: 'vertical_pull', reasonCode: 'BAL_DISMISSED' });
    }
    // Träningsdata oförändrade av avböjandet.
    const now = await dump(h);
    expect(now.sets).toEqual(snap.sets);
    expect(now.sessions).toEqual(snap.sessions);
    expect(now.revs).toEqual(snap.revs);
    // Beslutet synkas och kan exporteras.
    await h.sync.syncNow();
    expect([...h.server.table('balance_suggestion_decisions').values()]).toHaveLength(1);
  });

  it('BAL38: två konton × 36 pass – samma rekommendationer med och utan att Balans läses och förhandsvisas', { timeout: 300_000 }, async () => {
    const clock = new TestClock();
    const A = harness({ clock });
    const B = harness({ clock });
    await onboard(A);
    await onboard(B);
    const shape = (p: Awaited<ReturnType<typeof previewNext>>) => p.exercises.map((e) => [e.exerciseId, e.mode, e.sets, e.reps, e.kg, e.targetSeconds, e.calibration, [...e.reasons].sort().join()]);
    for (let i = 0; i < 36; i++) {
      const o = await getBalanceOverview(A.ctx);
      if (o.topSuggestion) await previewBalanceAdjustment(A.ctx, o.topSuggestion.candidateKey);
      expect(shape(await previewNext(A.ctx)), `pass ${i + 1}`).toEqual(shape(await previewNext(B.ctx)));
      const skip: ExerciseId[] = i % 3 === 0 ? ['lat_pulldown'] : [];
      const sa = await startSession(A.ctx, await previewNext(A.ctx));
      const sb = await startSession(B.ctx, await previewNext(B.ctx));
      for (const [h, s] of [[A, sa], [B, sb]] as const) {
        for (const se of displayOrder(await h.db.sessionExercises.where('sessionId').equals(s.id).toArray())) {
          if (skip.includes(se.exerciseId)) continue;
          for (const set of await h.db.sets.where('sessionExerciseId').equals(se.id).sortBy('ordinal')) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000, rir: 2 });
        }
        await finishSession(h.ctx, s.id);
      }
      clock.advanceHours(72);
    }
    expect(shape(await previewNext(A.ctx))).toEqual(shape(await previewNext(B.ctx)));
    expect(await A.db.balanceDecisions.count()).toBe(0);
  });
});
