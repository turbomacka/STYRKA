import { buildPlannerInput } from '../../src/application/plannerInput';
/**
 * ÄA-PLAN-001 "Min träningsplan" – acceptanstest på applikationsnivå (lokal IndexedDB, outbox, fake-server).
 * PL21 (RLS) i tests/db/training_plan_db.test.ts; PL02/PL22/PL23/PL26 (UI/utskrift) även i e2e/plan.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { exercise } from '../../src/domain/catalog';
import { hashOf } from '../../src/domain/hash';
import { heavyPairAllowed } from '../../src/domain/heavyPair';
import { templateKeyFor } from '../../src/planner/planner';
import { dbNameFor, openUserDb } from '../../src/storage/db';
import { SyncEngine } from '../../src/application/sync';
import { eraseHealthData, exportJson } from '../../src/application/privacy';
import { patchProfile, saveRestriction } from '../../src/application/profile';
import { activeSession, countExtraAsPlanned, displayOrder, finishSession, logSet, previewExtra, previewNext, startSession, swapExercise } from '../../src/application/training';
import { getFuturePlan, getNote, getWorkoutDetail, getWorkoutHistory, latestRevision, ordinarySequence, planRevisions, refreshFuturePlan, saveNote, type PlanSlot } from '../../src/application/trainingPlan';
import { FakeServer, harness, onboard, TestClock, type Harness } from './appHarness';

async function doSession(h: Harness, opts: { partial?: boolean } = {}) {
  const s = await startSession(h.ctx, await previewNext(h.ctx));
  const exs = displayOrder(await h.db.sessionExercises.where('sessionId').equals(s.id).toArray());
  let n = 0;
  for (const se of exs) {
    for (const set of await h.db.sets.where('sessionExerciseId').equals(se.id).sortBy('ordinal')) {
      if (opts.partial && n >= 2) break;
      h.clock.advanceHours(0.03);
      await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? (exercise(se.exerciseId).loadKind === 'duration_sec' ? null : 20_000), rir: 2 });
      n++;
    }
  }
  const fin = await finishSession(h.ctx, s.id);
  h.clock.advanceHours(72);
  return fin;
}

const shape = (s: PlanSlot) => s.exercises.map((e) => `${e.exerciseId}:${e.mode}:${e.sets}`).join(',');

describe('Min träningsplan – framtidsplan', () => {
  it('PL01: två pass/vecka, 36 pass ⇒ exakt 36 ordinarie pass i A/B/C-ordning utan datum', async () => {
    const h = harness();
    await onboard(h);
    const p = (await getFuturePlan(h.ctx, 36))!;
    expect(p.slots).toHaveLength(36);
    expect(p.slots.map((s) => s.slotSequence)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(p.slots.map((s) => s.templateKey)).toEqual(Array.from({ length: 36 }, (_, i) => templateKeyFor(2, i)));
    expect(new Set(p.slots.map((s) => s.templateKey))).toEqual(new Set(['A', 'B', 'C']));
    // Inga påhittade datum – bara ungefärlig vecka (36 pass ≈ 18 veckor vid två pass/vecka).
    expect(JSON.stringify(p.slots)).not.toMatch(/"(date|scheduledAt|plannedAt|dueAt)"/);
    expect(p.slots[35].approxWeek).toBe(18);
    expect(new Set(p.slots.map((s) => s.plannedSlotId)).size).toBe(36);
  });

  it('PL02/PL26: pass 20 har full struktur och revisionen lagrar preliminära rekommendationer', async () => {
    const h = harness();
    await onboard(h);
    const s20 = (await getFuturePlan(h.ctx, 36))!.slots[19];
    expect(s20).toMatchObject({ slotSequence: 20, status: 'structural' });
    expect(s20.exercises.length).toBeGreaterThan(0);
    for (const e of s20.exercises) {
      expect(e.sets).toBeGreaterThan(0);
      expect(e.bandMax).toBeGreaterThanOrEqual(e.bandMin);
      expect(['heavy', 'moderate', 'light']).toContain(e.mode);
      expect('kg' in e).toBe(true);
    }
    expect(JSON.stringify((await latestRevision(h.ctx))!.slots)).toMatch(/"kg"/);
  });

  it('PL03: nästa pass = befintlig rekommendation med versionsmärkt vikt när underlag finns', async () => {
    const h = harness();
    await onboard(h);
    const p = (await getFuturePlan(h.ctx, 12))!;
    expect(p.slots[0].status).toBe('ready');
    const next = await previewNext(h.ctx);
    expect(next.templateKey).toBe(p.slots[0].templateKey);
    expect(next.exercises.map((e) => e.exerciseId)).toEqual(p.slots[0].exercises.map((e) => e.exerciseId));
    const squat = next.exercises.find((e) => e.exerciseId === 'squat')!;
    expect(squat.kg).toBeGreaterThan(0);
    expect(next).toMatchObject({ engineVersion: p.revision.engineVersion, ruleSetVersion: p.revision.rulesetVersion });
  });

  it('PL04: övning utan styrkeuppskattning ⇒ ingen påhittad vikt, kalibreringsläge', async () => {
    const h = harness();
    await onboard(h, { estimates: [] });
    const next = await previewNext(h.ctx);
    const squat = next.exercises.find((e) => e.exerciseId === 'squat')!;
    expect([squat.kg, squat.calibration]).toEqual([null, true]);
    const p = (await getFuturePlan(h.ctx, 12))!;
    expect(p.slots.flatMap((s) => s.exercises).filter((e) => e.exerciseId === 'squat').every((e) => e.calibration)).toBe(true);
  });

  it('PL16/PL17: att öppna planen upprepat skapar ingen revision; ingen tid gör ett pass "missat"', async () => {
    const h = harness();
    await onboard(h);
    await getFuturePlan(h.ctx, 36);
    const first = await planRevisions(h.ctx);
    expect(first).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      await getFuturePlan(h.ctx, i % 2 ? 72 : 12);
      await refreshFuturePlan(h.ctx);
    }
    h.clock.advanceHours(24 * 60); // två månader utan träning
    const later = (await getFuturePlan(h.ctx, 36))!;
    expect((await planRevisions(h.ctx)).map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(later.slots.every((s) => ['ready', 'provisional', 'structural'].includes(s.status))).toBe(true);
    expect(JSON.stringify(later.slots)).not.toMatch(/missed|missat/i);
  });

  it('PL28: efter 36 genomförda pass fortsätter rotationen (pass 37 och framåt), ingen slutpunkt', { timeout: 120_000 }, async () => {
    const h = harness();
    await onboard(h);
    for (let i = 0; i < 37; i++) await doSession(h);
    const p = (await getFuturePlan(h.ctx, 36))!;
    expect(p.slots[0].slotSequence).toBe(38);
    expect(p.slots).toHaveLength(36);
    expect((await previewNext(h.ctx)).exercises.length).toBeGreaterThan(0);
    expect((await ordinarySequence(h.ctx)).size).toBe(37);
  });
});

describe('Min träningsplan – omplanering och journal', () => {
  it('PL05/PL15: genomfört pass ⇒ verkliga set i Genomförda, ny revision, gamla set och revisioner oförändrade', async () => {
    const h = harness();
    await onboard(h);
    const r1 = (await getFuturePlan(h.ctx, 36))!.revision;
    const fin = await doSession(h);
    const setsBefore = await h.db.sets.where('sessionId').equals(fin.id).toArray();
    const p2 = (await getFuturePlan(h.ctx, 36))!;
    expect(p2.revision).toMatchObject({ changeType: 'SESSION_COMPLETED', previousRevisionId: r1.id, baseSequence: 2 });
    expect(p2.revision.summary).toMatch(/Ordinarie pass genomfört.*pass 2/);
    expect(p2.slots[0].slotSequence).toBe(2);
    const hist = await getWorkoutHistory(h.ctx);
    expect(hist.items[0]).toMatchObject({ sequence: 1, doneWorkSets: setsBefore.filter((s) => s.status === 'done').length });
    expect((await getWorkoutDetail(h.ctx, fin.id)).exercises.flatMap((e) => e.sets)).toEqual(expect.arrayContaining(setsBefore));
    // Andra revisionen.
    await doSession(h);
    await getFuturePlan(h.ctx, 36);
    const revs = await planRevisions(h.ctx);
    expect(revs).toHaveLength(3);
    expect(await h.db.sets.where('sessionId').equals(fin.id).toArray()).toEqual(setsBefore);
    // Äldre versioner kan öppnas oförändrade med ändringsorsak.
    const old = (await getFuturePlan(h.ctx, 36, r1.id))!;
    expect(old.current).toBe(false);
    expect(old.slots[0].slotSequence).toBe(1);
    expect(revs.map((r) => r.changeType)).toEqual(['SESSION_COMPLETED', 'SESSION_COMPLETED', 'INITIAL']);
  });

  it('PL06: delvis genomfört pass ⇒ bara utförda set som utförda, status "delvis"', async () => {
    const h = harness();
    await onboard(h);
    const fin = await doSession(h, { partial: true });
    expect(fin.status).toBe('partial');
    const d = await getWorkoutDetail(h.ctx, fin.id);
    const done = d.exercises.flatMap((e) => e.sets).filter((s) => s.status === 'done');
    expect(done).toHaveLength(2);
    expect((await getWorkoutHistory(h.ctx)).items[0]).toMatchObject({ doneWorkSets: 2, sequence: 1 });
  });

  it('PL07/PL08: spontanpass efter tungt pass påverkar förslaget men flyttar inte rotationen; uttryckligt val räknas en gång', async () => {
    const h = harness();
    await onboard(h);
    await doSession(h);
    await getFuturePlan(h.ctx, 36);
    const before = await latestRevision(h.ctx);
    const nextBefore = await previewNext(h.ctx);
    h.clock.advanceHours(-60); // dagen efter det tunga passet
    const extra = await startSession(h.ctx, await previewExtra(h.ctx, { minutes: 30, readiness: 'good' }));
    for (const set of await h.db.sets.where('sessionId').equals(extra.id).toArray()) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000 });
    await finishSession(h.ctx, extra.id);
    const p = (await getFuturePlan(h.ctx, 36))!;
    expect(p.revision).toMatchObject({ changeType: 'EXTRA_SESSION_COMPLETED', baseSequence: before!.baseSequence });
    expect(p.slots[0].rotationIndex).toBe(before!.slots[0] && (before!.slots[0] as PlanSlot).rotationIndex);
    const hist = await getWorkoutHistory(h.ctx);
    expect(hist.items.find((i) => i.session.id === extra.id)).toMatchObject({ sequence: null });
    // Befintliga återhämtningsregler påverkar nästa rekommendation.
    expect(JSON.stringify((await previewNext(h.ctx)).exercises.map((e) => [e.mode, e.reasons]))).not.toBe(JSON.stringify(nextBefore.exercises.map((e) => [e.mode, e.reasons])));
  });

  it('PL08: uttryckligt val att räkna spontanpass som ordinarie lagras spårbart och räknas inte dubbelt', async () => {
    const h = harness();
    await onboard(h);
    await doSession(h);
    const before = (await getFuturePlan(h.ctx, 36))!.revision;
    // Spontanpass som innehåller nästa ordinarie pass huvudövning med alla set (befintligt krav i motorn).
    const next = await previewNext(h.ctx);
    const extra = await startSession(h.ctx, { ...next, kind: 'extra' });
    expect(extra.kind).toBe('extra');
    for (const set of await h.db.sets.where('sessionId').equals(extra.id).toArray()) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000 });
    await finishSession(h.ctx, extra.id);
    const afterExtra = (await getFuturePlan(h.ctx, 36))!.revision;
    expect(afterExtra).toMatchObject({ changeType: 'EXTRA_SESSION_COMPLETED', baseSequence: before.baseSequence });
    expect(await countExtraAsPlanned(h.ctx, extra.id)).toBe(true);
    const counted = (await getFuturePlan(h.ctx, 36))!.revision;
    expect(counted).toMatchObject({ changeType: 'EXTRA_COUNTED_AS_PLANNED', baseSequence: before.baseSequence + 1 });
    expect(counted.summary).toMatch(/Spontanpass räknat som ordinarie/);
    expect((await getWorkoutHistory(h.ctx)).items.find((i) => i.session.id === extra.id)!.sequence).toBe(before.baseSequence);
    // Inte dubbelt: ett andra försök nekas och numreringen är oförändrad.
    expect(await countExtraAsPlanned(h.ctx, extra.id)).toBe(false);
    expect((await getFuturePlan(h.ctx, 36))!.revision.baseSequence).toBe(before.baseSequence + 1);
    expect((await ordinarySequence(h.ctx)).size).toBe(2);
  });

  it('PL09/PL10: ändrad frekvens och tid planerar om framtiden; genomförda pass, nummer och snapshots bevaras', async () => {
    const h = harness();
    await onboard(h, { minutesPerSession: 40 });
    const done1 = await doSession(h);
    const done2 = await doSession(h);
    const snap = { s1: await h.db.sessions.get(done1.id), s2: await h.db.sessions.get(done2.id), exs: await h.db.sessionExercises.toArray(), sets: await h.db.sets.toArray() };
    const p0 = (await getFuturePlan(h.ctx, 36))!;
    await patchProfile(h.ctx, { plannedSessionsPerWeek: 3 });
    const p1 = (await getFuturePlan(h.ctx, 36))!;
    expect(p1.revision.changeType).toBe('PROFILE_CHANGED');
    expect(p1.slots[0].slotSequence).toBe(3);
    expect(p1.slots.map((s) => s.templateKey)).toEqual(Array.from({ length: 36 }, (_, i) => templateKeyFor(3, i)));
    expect(p1.slots[35].approxWeek).toBe(12);
    await patchProfile(h.ctx, { minutesPerSession: 25 });
    const p2 = (await getFuturePlan(h.ctx, 36))!;
    expect(p2.slots.reduce((n, s) => n + s.estimatedMinutes, 0)).toBeLessThan(p1.slots.reduce((n, s) => n + s.estimatedMinutes, 0));
    const hist = await getWorkoutHistory(h.ctx);
    expect(hist.items.map((i) => [i.session.id, i.sequence])).toEqual([[done2.id, 2], [done1.id, 1]]);
    expect(await h.db.sessions.get(done1.id)).toEqual(snap.s1);
    expect(await h.db.sessions.get(done2.id)).toEqual(snap.s2);
    for (const s of snap.sets) expect(await h.db.sets.get(s.id)).toEqual(s);
    for (const e of snap.exs) expect(await h.db.sessionExercises.get(e.id)).toEqual(e);
    expect(p0.revision.id).not.toBe(p2.revision.id);
  });

  it('PL11: kombinationsregel ⇒ alla framtida pass respekterar förbudet efter omplanering', async () => {
    const h = harness();
    await onboard(h);
    await getFuturePlan(h.ctx, 72);
    await saveRestriction(h.ctx, { kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift', active: true });
    const p = (await getFuturePlan(h.ctx, 72))!;
    expect(p.revision.changeType).toBe('RESTRICTION_CHANGED');
    for (const s of p.slots) {
      const list = s.exercises.map((e) => ({ exerciseId: e.exerciseId, mode: e.mode, sets: e.sets, isMarkedHeavy: e.mode === 'heavy' }));
      expect(heavyPairAllowed(list, 'squat', 'deadlift'), `pass ${s.slotSequence}`).toBe(true);
    }
  });

  it('PL12/PL25: knäböj → frontböj framöver under pågående pass; pågående snapshot och basövningens historik orörda', async () => {
    const h = harness();
    await onboard(h);
    await doSession(h);
    const squatSetsBefore = await h.db.sets.where('exerciseId').equals('squat').toArray();
    const rev0 = (await getFuturePlan(h.ctx, 36))!.revision;
    // Starta nästa pass som innehåller knäböj (C har lätt knäböj).
    let s = await startSession(h.ctx, await previewNext(h.ctx));
    while (!(await h.db.sessionExercises.where('sessionId').equals(s.id).toArray()).some((e) => e.exerciseId === 'squat')) {
      await finishSession(h.ctx, s.id, { status: 'abandoned' });
      await doSession(h);
      s = await startSession(h.ctx, await previewNext(h.ctx));
    }
    const activeBefore = { exs: await h.db.sessionExercises.where('sessionId').equals(s.id).toArray(), sets: await h.db.sets.where('sessionId').equals(s.id).toArray() };
    await saveRestriction(h.ctx, { kind: 'limit_sets', exerciseA: 'bench_press', maxSets: 2, active: true });
    const pDuring = (await getFuturePlan(h.ctx, 36))!;
    expect(pDuring.revision.id).not.toBe(rev0.id);
    expect(await h.db.sessionExercises.where('sessionId').equals(s.id).toArray()).toEqual(activeBefore.exs);
    expect(await h.db.sets.where('sessionId').equals(s.id).toArray()).toEqual(activeBefore.sets);
    expect((await activeSession(h.ctx))?.id).toBe(s.id);
    // Permanent byte (befintligt flöde) ⇒ framtida pass använder frontböj, utan att knäböjens historik skrivs om.
    const squatSe = (await h.db.sessionExercises.where('sessionId').equals(s.id).toArray()).find((e) => e.exerciseId === 'squat')!;
    await swapExercise(h.ctx, squatSe.id, 'front_squat', { scope: 'future', familiarity: 'unfamiliar' });
    const p = (await getFuturePlan(h.ctx, 36))!;
    expect(p.revision.reasonCodes).toContain('SUBSTITUTION_CHANGED');
    const ids = p.slots.flatMap((x) => x.exercises.map((e) => e.exerciseId));
    expect(ids).toContain('front_squat');
    expect(ids).not.toContain('squat');
    expect(p.slots.flatMap((x) => x.exercises).find((e) => e.exerciseId === 'front_squat')).toMatchObject({ substitutionFrom: 'squat', calibration: true });
    for (const old of squatSetsBefore) expect(await h.db.sets.get(old.id)).toEqual(old);
  });

  it('PL13/PL14: anteckning på pass 25 följer passplatsen; anteckning på genomfört pass kan ändras och raderas utan att set påverkas', async () => {
    const h = harness();
    await onboard(h);
    await getFuturePlan(h.ctx, 36);
    await saveNote(h.ctx, { targetType: 'slot', slotSequence: 25 }, 'Testa ny skivstång');
    const fin = await doSession(h);
    const p = (await getFuturePlan(h.ctx, 36))!;
    const slot25 = p.slots.find((s) => s.slotSequence === 25)!;
    expect(slot25).toBeTruthy();
    expect((await getNote(h.ctx, { targetType: 'slot', slotSequence: 25 }))?.body).toBe('Testa ny skivstång');
    const sets = await h.db.sets.where('sessionId').equals(fin.id).toArray();
    await saveNote(h.ctx, { targetType: 'session', sessionId: fin.id }, 'Fungerade bra, men knät trött efteråt');
    expect((await getNote(h.ctx, { targetType: 'session', sessionId: fin.id }))?.body).toMatch(/knät trött/);
    await saveNote(h.ctx, { targetType: 'session', sessionId: fin.id }, 'Fungerade bra');
    await saveNote(h.ctx, { targetType: 'session', sessionId: fin.id }, '');
    expect((await getNote(h.ctx, { targetType: 'session', sessionId: fin.id }))?.body).toBe('');
    expect(await h.db.sets.where('sessionId').equals(fin.id).toArray()).toEqual(sets);
    await expect(saveNote(h.ctx, { targetType: 'slot', slotSequence: 3 }, 'x'.repeat(2001))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    // Anteckningar skapar ingen planrevision.
    const n = (await planRevisions(h.ctx)).length;
    await saveNote(h.ctx, { targetType: 'slot', slotSequence: 7 }, 'Hemmagym');
    await refreshFuturePlan(h.ctx);
    expect((await planRevisions(h.ctx)).length).toBe(n);
    // HTML lagras som ren text (renderas aldrig som markup).
    await saveNote(h.ctx, { targetType: 'slot', slotSequence: 8 }, '<img src=x onerror=alert(1)>');
    expect((await getNote(h.ctx, { targetType: 'slot', slotSequence: 8 }))?.body).toBe('<img src=x onerror=alert(1)>');
  });

  it('PL24: 72 framtida och 500 historiska pass – snabb sidindelning utan dubbletter eller luckor', { timeout: 120_000 }, async () => {
    const h = harness();
    await onboard(h);
    const now = Date.parse(h.clock.now());
    const sessions = Array.from({ length: 500 }, (_, i) => ({
      id: crypto.randomUUID(),
      programId: null,
      kind: 'extra' as const,
      status: 'completed' as const,
      timezone: 'Europe/Stockholm',
      startedAt: new Date(now - (500 - i) * 86_400_000).toISOString(),
      finishedAt: new Date(now - (500 - i) * 86_400_000 + 3_600_000).toISOString(),
      plannedMinutes: 45,
      readiness: null,
      templateKey: null,
      rotationIndex: null,
      countsAsPlannedAt: null,
      isReplacementForPlanned: false,
      clientCreatedAt: new Date(now).toISOString(),
      snapshot: { exercises: [] } as never,
      revision: 1,
      syncState: 'synced' as const,
    }));
    await h.db.sessions.bulkAdd(sessions);
    const t0 = performance.now();
    const p = (await getFuturePlan(h.ctx, 72))!;
    const tFuture = performance.now() - t0;
    expect(p.slots).toHaveLength(72);
    const seen: string[] = [];
    let cursor: string | undefined;
    let maxPage = 0;
    do {
      const t = performance.now();
      const page = await getWorkoutHistory(h.ctx, { before: cursor, limit: 30 });
      maxPage = Math.max(maxPage, performance.now() - t);
      seen.push(...page.items.map((i) => i.session.id));
      cursor = page.next ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(500);
    expect(new Set(seen).size).toBe(500);
    expect(seen[0]).toBe(sessions[499].id); // nyast först
    expect(tFuture).toBeLessThan(5000);
    expect(maxPage).toBeLessThan(1500);
  });
});

describe('Min träningsplan – offline, synk och integritet', () => {
  it('PL18/PL19: offline anteckning + set sparas lokalt; synk senare utan dubbletter, förlorad kvittens ger en uppdatering', async () => {
    const h = harness();
    await onboard(h);
    await h.sync.syncNow();
    h.server.online = false;
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const [set1] = await h.db.sets.where('sessionId').equals(s.id).sortBy('ordinal');
    expect((await logSet(h.ctx, set1.id, {})).syncState).toBe('queued');
    const note = await saveNote(h.ctx, { targetType: 'session', sessionId: s.id }, 'Offlineanteckning');
    expect(note.syncState).toBe('queued');
    await finishSession(h.ctx, s.id);
    await refreshFuturePlan(h.ctx);
    expect((await latestRevision(h.ctx))?.syncState).toBe('queued');
    expect((await h.sync.syncNow()).stoppedBy).toBe('OFFLINE');
    h.server.online = true;
    h.server.dropNextAck = 3;
    for (let i = 0; i < 6; i++) await h.sync.syncNow();
    expect(await h.db.outbox.count()).toBe(0);
    const notes = [...h.server.table('notebook_notes').values()];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ body: 'Offlineanteckning', revision: 1 });
    expect([...h.server.sets.values()].filter((x) => x.status === 'done')).toHaveLength(1);
    const revs = [...h.server.table('plan_revisions').values()];
    expect(new Set(revs.map((r) => r.id)).size).toBe(revs.length);
    expect((await h.db.notes.get(note.id))?.syncState).toBe('synced');
    // Samma mutation igen (t.ex. dubbeltryck) ⇒ ingen ny logisk uppdatering.
    await saveNote(h.ctx, { targetType: 'session', sessionId: s.id }, 'Offlineanteckning');
    await h.sync.syncNow();
    expect(h.server.table('notebook_notes').get(note.id)).toMatchObject({ revision: 1 });
  });

  it('PL20: två enheter ändrar samma anteckning ⇒ konflikt som användaren löser, ingen tyst överskrivning', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const A = harness({ userId, server, clock });
    await onboard(A);
    await saveNote(A.ctx, { targetType: 'slot', slotSequence: 5 }, 'Version 1');
    await A.sync.syncNow();
    const bDb = new (openUserDb(userId).constructor as typeof Dexie)(`${dbNameFor(userId)}_B_${crypto.randomUUID()}`) as unknown as typeof A.db;
    const B = { ...harness({ userId: crypto.randomUUID(), server, clock }) };
    B.ctx.userId = userId;
    B.ctx.db = bDb;
    const bSync = new SyncEngine(B.ctx);
    await bSync.pull();
    expect((await getNote(B.ctx, { targetType: 'slot', slotSequence: 5 }))?.body).toBe('Version 1');
    await saveNote(B.ctx, { targetType: 'slot', slotSequence: 5 }, 'Från B');
    await bSync.syncNow();
    await saveNote(A.ctx, { targetType: 'slot', slotSequence: 5 }, 'Från A');
    const r = await A.sync.syncNow();
    expect(r.conflicts).toBe(1);
    const id = (await getNote(A.ctx, { targetType: 'slot', slotSequence: 5 }))!.id;
    expect(server.table('notebook_notes').get(id)).toMatchObject({ body: 'Från B', revision: 2 });
    const [c] = await A.sync.conflicts();
    expect(c).toMatchObject({ recordType: 'note', local: { body: 'Från A' } });
    expect(c.server.body).toBe('Från B');
    await A.sync.resolveConflict(c.id, 'mine');
    await A.sync.syncNow();
    expect(server.table('notebook_notes').get(id)).toMatchObject({ body: 'Från A', revision: 3 });
  });

  it('PL27: radering av hälsouppgifter tar bort anteckningar lokalt och på servern; träningsset bevaras', async () => {
    const h = harness();
    await onboard(h);
    const fin = await doSession(h);
    await saveNote(h.ctx, { targetType: 'session', sessionId: fin.id }, 'Knät ömt');
    await saveNote(h.ctx, { targetType: 'slot', slotSequence: 4 }, 'Ont i axeln');
    await h.sync.syncNow();
    const sets = await h.db.sets.toArray();
    await eraseHealthData(h.ctx);
    expect(await h.db.notes.count()).toBe(0);
    await h.sync.syncNow();
    expect(h.server.table('notebook_notes').size).toBe(0);
    expect(await h.db.sets.toArray()).toEqual(sets);
    // Revisioner innehåller aldrig anteckningstext.
    expect(JSON.stringify(await planRevisions(h.ctx))).not.toMatch(/Knät ömt|Ont i axeln/);
  });

  it('export: JSON innehåller anteckningar och planrevisioner; exporten skapar ingen revision', async () => {
    const h = harness();
    await onboard(h);
    await getFuturePlan(h.ctx, 36);
    await saveNote(h.ctx, { targetType: 'slot', slotSequence: 2 }, 'Egen notering 60 kg');
    const before = (await planRevisions(h.ctx)).length;
    const json = await exportJson(h.ctx);
    expect(json.notebookNotes).toHaveLength(1);
    expect(json.planRevisions).toHaveLength(before);
    expect((await planRevisions(h.ctx)).length).toBe(before);
  });

  it('deterministiskt: samma indata ⇒ samma revisionsinnehåll och id på två enheter', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const A = harness({ userId, server, clock });
    await onboard(A);
    const ra = (await refreshFuturePlan(A.ctx))!;
    await A.sync.syncNow();
    const bDb = new (openUserDb(userId).constructor as typeof Dexie)(`${dbNameFor(userId)}_C_${crypto.randomUUID()}`) as unknown as typeof A.db;
    const B = { ...harness({ userId: crypto.randomUUID(), server, clock }) };
    B.ctx.userId = userId;
    B.ctx.db = bDb;
    await new SyncEngine(B.ctx).pull();
    const rb = (await refreshFuturePlan(B.ctx))!;
    expect(await buildPlannerInput(B.ctx.db,userId,clock.now())).toEqual(await buildPlannerInput(A.ctx.db,userId,clock.now()));
    expect(rb.id).toBe(ra.id);
    expect(hashOf(rb.slots)).toBe(ra.contentHash);
    expect(shape(rb.slots[0] as PlanSlot)).toBe(shape(ra.slots[0] as PlanSlot));
  });
});
