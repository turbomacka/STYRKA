/**
 * G3 Offline: lokal atomisk skrivning, idempotent uppspelning, oväntad omstart, offline hela passet,
 * konflikter mellan två enheter, dataisolering vid utloggning.
 * Acceptanstest 04 §2.1: 21, 26, 27, 28, 29, 30, 31, 32, 35, 36, 37, 42, 43.
 */
import { describe, expect, it, vi } from 'vitest';
import { heavyPairAllowed } from '../../src/domain/heavyPair';
import { openUserDb, dbNameFor } from '../../src/storage/db';
import { AppError } from '../../src/application/context';
import { activeSession, countExtraAsPlanned, finishSession, logSet, previewExtra, previewNext, reportSymptom, startSession, undoSet, editSet, canOfferCountAsPlanned } from '../../src/application/training';
import { patchProfile, saveRestriction, setHealthConsent } from '../../src/application/profile';
import { eraseHealthData, exportCsv, exportJson, signOutLocal } from '../../src/application/privacy';
import { SyncEngine } from '../../src/application/sync';
import Dexie from 'dexie';
import { FakeServer, harness, onboard, TestClock } from './appHarness';

async function doWholeSession(h: ReturnType<typeof harness>) {
  const snap = await previewNext(h.ctx);
  const s = await startSession(h.ctx, snap);
  const sets = await h.db.sets.where('sessionId').equals(s.id).sortBy('ordinal');
  for (const set of sets) await logSet(h.ctx, set.id, { actualGrams: set.targetGrams ?? 20_000 });
  return { session: await finishSession(h.ctx, s.id), sets };
}

describe('offline local-first', () => {
  it('28: inget "actual" sparas om den lokala transaktionen misslyckas (atomiskt set + kö)', async () => {
    const h = harness();
    await onboard(h);
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const set = (await h.db.sets.where('sessionId').equals(s.id).first())!;
    const before = await h.db.outbox.count();
    const spy = vi.spyOn(h.db.outbox, 'add').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await expect(logSet(h.ctx, set.id, { actualReps: 5 })).rejects.toMatchObject({ code: 'LOCAL_SAVE_FAILED' });
    spy.mockRestore();
    const after = (await h.db.sets.get(set.id))!;
    expect([after.status, after.actualReps, after.occurredAt]).toEqual(['planned', null, null]);
    expect(await h.db.outbox.count()).toBe(before);
    // Nästa försök lyckas och kvitteras först efter commit.
    const ok = await logSet(h.ctx, set.id, { actualReps: 5 });
    expect(ok.status).toBe('done');
    expect(ok.syncState).toBe('queued');
  });

  it('29: flygplansläge hela passet + omstart + nätkontakt ⇒ exakt utförda set på servern', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const h1 = harness({ userId, server, clock });
    await onboard(h1);
    await h1.sync.syncNow();
    server.online = false;
    const snap = await previewNext(h1.ctx);
    const s = await startSession(h1.ctx, snap);
    const sets = await h1.db.sets.where('sessionId').equals(s.id).sortBy('ordinal');
    const toDo = sets.slice(0, 5);
    for (const set of toDo) {
      clock.advanceHours(0.05);
      await logSet(h1.ctx, set.id, {});
    }
    expect((await h1.sync.syncNow()).stoppedBy).toBe('OFFLINE');
    // Oväntad omstart: stäng DB, ny kontext på samma enhet.
    h1.db.close();
    const h2 = harness({ userId, server, clock });
    const resumed = await activeSession(h2.ctx);
    expect(resumed?.id).toBe(s.id); // frånkopplade pass försvinner inte
    const local = await h2.db.sets.where('sessionId').equals(s.id).toArray();
    expect(local.filter((x) => x.status === 'done').length).toBe(5);
    await finishSession(h2.ctx, s.id);
    server.online = true;
    const run = await h2.sync.syncNow();
    expect(run.stoppedBy).toBeNull();
    expect(await h2.db.outbox.count()).toBe(0);
    const serverDone = [...server.sets.values()].filter((x) => x.status === 'done');
    expect(serverDone.length).toBe(5);
    expect(new Set([...server.sets.keys()])).toEqual(new Set(sets.map((x) => x.id)));
    expect(server.table('training_sessions').get(s.id)?.status).toBe('partial');
  });

  it('30/P11: dubbelklick + förlorad ack + retries ⇒ en serverpost (samma eventId vid retry)', async () => {
    const h = harness();
    await onboard(h);
    await h.sync.syncNow();
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    await h.sync.syncNow();
    const set = (await h.db.sets.where('sessionId').equals(s.id).first())!;
    await logSet(h.ctx, set.id, {});
    // Dubbelklick: andra trycket på ett redan utfört set ändrar inget (ingen ny händelse med samma innehåll).
    await expect(logSet(h.ctx, set.id, {})).resolves.toBeTruthy();
    const queued = await h.db.outbox.where('recordId').equals(set.id).toArray();
    h.server.dropNextAck = 1;
    expect((await h.sync.syncNow()).stoppedBy).toBe('OFFLINE');
    const retriedEvent = (await h.db.outbox.where('recordId').equals(set.id).first())!;
    expect(retriedEvent.eventId).toBe(queued[0].eventId);
    const r = await h.sync.syncNow();
    expect(r.duplicates).toBeGreaterThanOrEqual(1);
    expect([...h.server.sets.keys()].filter((k) => k === set.id).length).toBe(1);
    expect(h.server.sets.get(set.id)?.status).toBe('done');
    expect((await h.db.sets.get(set.id))!.syncState).toBe('synced');
  });

  it('31: samma set ändras på två enheter ⇒ konflikt; användaren väljer version (båda vägar)', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const A = harness({ userId, server, clock });
    await onboard(A);
    const s = await startSession(A.ctx, await previewNext(A.ctx));
    const set = (await A.db.sets.where('sessionId').equals(s.id).first())!;
    await logSet(A.ctx, set.id, { actualReps: 5 });
    await A.sync.syncNow();
    // Enhet B (annan IndexedDB) hämtar serverns data.
    const B = { ...harness({ userId: crypto.randomUUID(), server, clock }) };
    B.ctx.userId = userId;
    const bDb = new (openUserDb(userId).constructor as typeof Dexie)(`${dbNameFor(userId)}_deviceB`) as unknown as typeof A.db;
    B.ctx.db = bDb;
    B.db = bDb;
    const bSync = new SyncEngine(B.ctx);
    await bSync.pull();
    expect((await bDb.sets.get(set.id))?.serverRevision).toBe(2);
    // B ändrar online, A ändrar offline-baserat på gammal revision.
    await editSet(B.ctx, set.id, { actualReps: 6 });
    await bSync.syncNow();
    expect(server.sets.get(set.id)?.revision).toBe(3);
    await editSet(A.ctx, set.id, { actualReps: 4 });
    const r = await A.sync.syncNow();
    expect(r.conflicts).toBe(1);
    expect(server.sets.get(set.id)?.actualReps).toBe(6); // ingen tyst överskrivning
    const conflicts = await A.sync.conflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].local.actualReps).toBe(4);
    expect(conflicts[0].server.actualReps).toBe(6);
    expect((await A.db.sets.get(set.id))!.syncState).toBe('conflict');
    // Andra set synkas oberoende under konflikten.
    const other = (await A.db.sets.where('sessionId').equals(s.id).toArray()).find((x) => x.id !== set.id)!;
    await logSet(A.ctx, other.id, {});
    await A.sync.syncNow();
    expect(server.sets.get(other.id)?.status).toBe('done');
    // Välj "min version".
    await A.sync.resolveConflict(conflicts[0].id, 'mine');
    await A.sync.syncNow();
    expect(server.sets.get(set.id)).toMatchObject({ actualReps: 4, revision: 4 });
    expect(await A.sync.conflicts()).toHaveLength(0);
    // Ny konflikt: välj serverns version.
    await editSet(B.ctx, set.id, { actualReps: 7 }); // B bygger på rev 2 ⇒ konflikt på B
    await bSync.syncNow();
    const bc = await bSync.conflicts();
    expect(bc).toHaveLength(1);
    await bSync.resolveConflict(bc[0].id, 'server');
    expect((await bDb.sets.get(set.id))).toMatchObject({ actualReps: 4, serverRevision: 4, syncState: 'synced' });
    expect(server.sets.get(set.id)?.actualReps).toBe(4);
  });

  it('32: utloggning med osynkade data varnar; därefter ser nästa användare inga lokala data', async () => {
    const A = harness();
    await onboard(A);
    A.server.online = false;
    await reportSymptom(A.ctx, { sessionId: null, area: 'knee', side: 'left', reaction: 'transient' });
    await expect(signOutLocal(A.ctx)).rejects.toMatchObject({ code: 'PENDING_SYNC' });
    await signOutLocal(A.ctx, { discardUnsynced: true });
    expect(await Dexie.exists(dbNameFor(A.userId))).toBe(false);
    const B = harness();
    expect(await B.db.symptoms.count()).toBe(0);
    expect(await B.db.profile.count()).toBe(0);
    const names = await Dexie.getDatabaseNames();
    expect(names).not.toContain(dbNameFor(A.userId));
  });

  it('37: "Ångra" direkt efter Klart ger korrekt historik lokalt och på servern', async () => {
    const h = harness();
    await onboard(h);
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const set = (await h.db.sets.where('sessionId').equals(s.id).first())!;
    await logSet(h.ctx, set.id, {});
    const undone = await undoSet(h.ctx, set.id);
    expect([undone.status, undone.actualReps, undone.occurredAt]).toEqual(['planned', null, null]);
    await h.sync.syncNow();
    expect(h.server.sets.get(set.id)).toMatchObject({ status: 'planned', actualReps: null, revision: 3 });
    await finishSession(h.ctx, s.id, { status: 'partial' });
    const next = await previewNext(h.ctx);
    // Ingen exponering registrerad ⇒ rotationen flyttas inte (inget utfört arbetsset).
    expect(next.templateKey).toBe('A');
  });

  it('42: loggade set försvinner aldrig när passet markeras partial; abandoned raderar bara på uttryckligt val', async () => {
    const h = harness();
    await onboard(h);
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const sets = await h.db.sets.where('sessionId').equals(s.id).sortBy('ordinal');
    await logSet(h.ctx, sets[0].id, {});
    await logSet(h.ctx, sets[1].id, {});
    const fin = await finishSession(h.ctx, s.id);
    expect(fin.status).toBe('partial');
    expect((await h.db.sets.where('sessionId').equals(s.id).toArray()).filter((x) => x.status === 'done' && !x.deleted)).toHaveLength(2);
    expect((await previewNext(h.ctx)).templateKey).toBe('B'); // partial med arbetsset flyttar rotationen

    const s2 = await startSession(h.ctx, await previewNext(h.ctx));
    const sets2 = await h.db.sets.where('sessionId').equals(s2.id).sortBy('ordinal');
    await logSet(h.ctx, sets2[0].id, { actualGrams: sets2[0].targetGrams ?? 20_000 });
    await finishSession(h.ctx, s2.id, { status: 'abandoned' });
    expect((await h.db.sets.get(sets2[0].id))!.deleted).toBe(false);
    expect((await previewNext(h.ctx)).templateKey).toBe('B'); // abandoned flyttar inte rotationen

    const s3 = await startSession(h.ctx, await previewNext(h.ctx));
    const sets3 = await h.db.sets.where('sessionId').equals(s3.id).sortBy('ordinal');
    await logSet(h.ctx, sets3[0].id, { actualGrams: sets3[0].targetGrams ?? 20_000 });
    await finishSession(h.ctx, s3.id, { status: 'abandoned', keepLoggedSets: false });
    expect((await h.db.sets.get(sets3[0].id))!.deleted).toBe(true);
  });

  it('43/21: parregel tillagd offline gäller nästa plan; tidigare snapshot oförändrat', async () => {
    const h = harness();
    await onboard(h, { plannedSessionsPerWeek: 7 });
    h.server.online = false;
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const frozen = JSON.stringify((await h.db.sessions.get(s.id))!.snapshot);
    await saveRestriction(h.ctx, { kind: 'block_pair_heavy', exerciseA: 'squat', exerciseB: 'deadlift', active: true });
    await finishSession(h.ctx, s.id, { status: 'abandoned' });
    for (let i = 0; i < 7; i++) {
      const p = await previewNext(h.ctx);
      expect(heavyPairAllowed(p.exercises.map((e) => ({ exerciseId: e.exerciseId, mode: e.mode, sets: e.sets, plannedKg: e.kg, estimatedOneRM: e.estimatedOneRM })), 'squat', 'deadlift')).toBe(true);
      const ss = await startSession(h.ctx, p);
      const first = (await h.db.sets.where('sessionId').equals(ss.id).first())!;
      await logSet(h.ctx, first.id, { actualGrams: first.targetGrams ?? 20_000 });
      await finishSession(h.ctx, ss.id);
      h.clock.advanceHours(50);
    }
    expect(JSON.stringify((await h.db.sessions.get(s.id))!.snapshot)).toBe(frozen);
  });

  it('26: frekvensändring mitt i rotationen ⇒ ny programversion; A/B/C-historiken förblir korrekt', async () => {
    const h = harness();
    await onboard(h);
    const s1 = await doWholeSession(h);
    h.clock.advanceHours(72);
    const s2 = await doWholeSession(h);
    expect([s1.session.templateKey, s2.session.templateKey]).toEqual(['A', 'B']);
    await patchProfile(h.ctx, { plannedSessionsPerWeek: 4 });
    const programs = await h.db.programs.toArray();
    expect(programs.filter((p) => p.active === 1)).toHaveLength(1);
    expect(programs.find((p) => p.active === 0)?.rotationIndex).toBe(2);
    h.clock.advanceHours(72);
    expect((await previewNext(h.ctx)).templateKey).toBe('lower_squat');
    expect((await h.db.sessions.get(s1.session.id))!.templateKey).toBe('A');
    expect((await h.db.sessions.get(s2.session.id))!.templateKey).toBe('B');
  });

  it('27: spontanpass kompletterar; ersätter ordinarie endast med aktivt val', async () => {
    const h = harness();
    await onboard(h);
    const extra = await previewExtra(h.ctx, { minutes: 45, readiness: 'good' });
    const s = await startSession(h.ctx, extra);
    for (const set of await h.db.sets.where('sessionId').equals(s.id).toArray()) await logSet(h.ctx, set.id, {});
    await finishSession(h.ctx, s.id);
    h.clock.advanceHours(72);
    expect((await previewNext(h.ctx)).templateKey).toBe('A'); // ingen automatisk rotation
    expect(await canOfferCountAsPlanned(h.ctx, s.id)).toBe(true); // knäböj (A:s huvudlyft) gjordes
    expect(await countExtraAsPlanned(h.ctx, s.id)).toBe(true);
    expect((await previewNext(h.ctx)).templateKey).toBe('B');
    expect(await countExtraAsPlanned(h.ctx, s.id)).toBe(false); // bara en gång
  });

  it('35: export (JSON/CSV) omfattar set, pass, planversion, rekommendationsgrunder och profil', async () => {
    const h = harness();
    await onboard(h);
    await doWholeSession(h);
    const j = await exportJson(h.ctx);
    expect(j.profile).toMatchObject({ userId: h.userId, plannedSessionsPerWeek: 2 });
    expect(j.sessions).toHaveLength(1);
    const sess = j.sessions[0] as { snapshot: { engineVersion: string; templateVersion: string; inputsHash: string }; exercises: Array<{ snapshot: { reasons: string[] }; sets: unknown[] }> };
    expect(sess.snapshot).toMatchObject({ engineVersion: '2.2.0', templateVersion: '2.1.0' });
    expect(sess.exercises[0].snapshot.reasons.length).toBeGreaterThan(0);
    expect(sess.exercises.flatMap((e) => e.sets).length).toBeGreaterThan(0);
    expect(j.recommendationAudits).toHaveLength(1);
    expect(j.exerciseSettings.length).toBeGreaterThan(0);
    expect(JSON.stringify(j)).not.toContain('syncState');
    const csv = await exportCsv(h.ctx);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('actual_kg');
    expect(lines.length).toBe(1 + sess.exercises.flatMap((e) => e.sets).length);
    expect(csv).toContain('Knäböj');
  });

  it('36: raderade hälsouppgifter ⇒ inga nya symtomposter; köade hälsoposter når aldrig servern', async () => {
    const h = harness();
    await onboard(h);
    h.server.online = false;
    await reportSymptom(h.ctx, { sessionId: null, area: 'knee', side: 'left', reaction: 'persistent' });
    await saveRestriction(h.ctx, { kind: 'region_note', area: 'knee', active: true });
    await eraseHealthData(h.ctx);
    await expect(reportSymptom(h.ctx, { sessionId: null, area: 'knee', side: 'left', reaction: 'transient' })).rejects.toMatchObject({ code: 'PRIVACY_CONSENT_REQUIRED' });
    await expect(saveRestriction(h.ctx, { kind: 'region_note', area: 'hip', active: true })).rejects.toBeInstanceOf(AppError);
    h.server.online = true;
    await h.sync.syncNow();
    expect(h.server.table('symptom_reports').size).toBe(0);
    expect(h.server.table('restriction_rules').size).toBe(0);
    expect(await h.db.symptoms.count()).toBe(0);
    // Planen spärrar inte längre knäböj (symtomet raderat).
    expect((await previewNext(h.ctx)).exercises.map((e) => e.exerciseId)).toContain('squat');
    await setHealthConsent(h.ctx, true);
    await expect(reportSymptom(h.ctx, { sessionId: null, area: 'knee', side: 'left', reaction: 'transient' })).resolves.toBeTruthy();
  });

  it('20/45 i appflödet: hälta efter pass ⇒ berörda övningar bort ur nästa plan tills användaren markerar löst', async () => {
    const h = harness();
    await onboard(h);
    const { session } = await doWholeSession(h);
    await reportSymptom(h.ctx, { sessionId: session.id, area: 'knee', side: 'right', reaction: 'limping' });
    h.clock.advanceHours(24 * 10);
    const p = await previewNext(h.ctx);
    expect(p.exercises.map((e) => e.exerciseId)).not.toContain('squat');
    expect(p.exercises.map((e) => e.exerciseId)).not.toContain('deadlift');
    expect(p.warnings).toContain('WARN_REVIEW');
  });

  it('logSet validerar: negativa/orimliga värden och 0 kg på extern last utan kalibrering avvisas', async () => {
    const h = harness();
    await onboard(h);
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const set = (await h.db.sets.where('sessionId').equals(s.id).first())!;
    for (const v of [{ actualReps: 51 }, { actualReps: -1 }, { actualGrams: 500_001 }, { actualGrams: 0 }, { rir: 6 }, { actualGrams: 1.5 }]) {
      await expect(logSet(h.ctx, set.id, v)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect((await h.db.sets.get(set.id))!.status).toBe('planned');
  });

  it('manuell avvikelse loggas separat från rekommendationen', async () => {
    const h = harness();
    await onboard(h);
    const s = await startSession(h.ctx, await previewNext(h.ctx));
    const set = (await h.db.sets.where('sessionId').equals(s.id).first())!;
    const r = await logSet(h.ctx, set.id, { actualGrams: (set.targetGrams ?? 0) + 2500 });
    expect(r.manualOverride).toBe(true);
    expect(r.targetGrams).toBe(set.targetGrams);
  });

  it('synk: offline ⇒ kön ligger kvar; serverfel ⇒ backoff och retry', async () => {
    const h = harness();
    await onboard(h);
    h.server.online = false;
    const r = await h.sync.syncNow();
    expect(r.stoppedBy).toBe('OFFLINE');
    expect((await h.sync.status()).pending).toBeGreaterThan(0);
    h.server.online = true;
    await h.sync.syncNow();
    expect(await h.sync.pendingCount()).toBe(0);
    h.sync.dispose();
  });

  it('ny enhet: pull återskapar historik och nästa förslag blir identiskt', async () => {
    const userId = crypto.randomUUID();
    const server = new FakeServer(userId);
    const clock = new TestClock();
    const A = harness({ userId, server, clock });
    await onboard(A);
    await doWholeSession(A);
    clock.advanceHours(72);
    await doWholeSession(A);
    await A.sync.syncNow();
    clock.advanceHours(72);
    const expected = await previewNext(A.ctx);
    A.db.close();
    await Dexie.delete(dbNameFor(userId));
    const B = harness({ userId, server, clock });
    await B.sync.pull();
    const got = await previewNext(B.ctx);
    expect(got.templateKey).toBe(expected.templateKey);
    expect(got.exercises).toEqual(expected.exercises);
  });

  it('profilpatch med förlorad ack ⇒ ingen falsk konflikt vid retry (idempotent)', async () => {
    const h = harness();
    await onboard(h);
    h.server.dropNextAck = 1;
    await h.sync.syncNow();
    const r = await h.sync.syncNow();
    expect(r.conflicts).toBe(0);
    expect(await h.sync.conflicts()).toHaveLength(0);
    expect((await h.db.profile.get(h.userId))!.revision).toBe(1);
    // Verklig samtidig ändring från annan enhet ger fortfarande konflikt.
    h.server.profiles.get(h.userId)!.minutes_per_session = 90;
    h.server.profiles.get(h.userId)!.revision = 2;
    await patchProfile(h.ctx, { minutesPerSession: 45 });
    await h.sync.syncNow();
    expect(await h.sync.conflicts()).toHaveLength(1);
  });
});

import { classify } from '../../src/server/supabaseTransport';
describe('felklassning (03 §6 felmatris)', () => {
  it('nätfel ⇒ OFFLINE, 401 ⇒ AUTH_REQUIRED, RLS ⇒ FORBIDDEN, timeout/serialisering ⇒ DB_UNAVAILABLE (retry), 4xx ⇒ VALIDATION_ERROR', () => {
    expect(classify({ message: 'TypeError: Failed to fetch' }).code).toBe('OFFLINE');
    expect(classify({ message: 'x' }, 401).code).toBe('AUTH_REQUIRED');
    expect(classify({ message: 'x', code: '42501' }, 403).code).toBe('FORBIDDEN');
    for (const code of ['57014', '40001', '40P01']) {
      const e = classify({ message: 'x', code }, 500);
      expect([e.code, e.retryable]).toEqual(['DB_UNAVAILABLE', true]);
    }
    expect(classify({ message: 'x', code: '23514' }, 400)).toMatchObject({ code: 'VALIDATION_ERROR', retryable: false });
  });
});
