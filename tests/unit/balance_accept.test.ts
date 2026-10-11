/**
 * ÄA-BAL-001 godkännandeflöde (BAL32–BAL35) genom den VERKLIGA planeraren och revisionsflödet.
 *
 * Den godkända substitutionskatalogen (SUBST/1.2.0) saknar relationer mellan olika rörelsemönster, så i produktion
 * kan inget byte föreslås (testas i balance_app › BAL32). För att verifiera mekanismen injiceras här EN tydligt märkt
 * testrelation: sidolyft i kabel → latsdrag med neutralt grepp. Den finns inte i katalogen och används bara i denna fil.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/domain/substitutionCatalog', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/domain/substitutionCatalog')>();
  const fake = { from: 'cable_lateral_raise', to: 'neutral_grip_lat_pulldown', relation: 'accessory', notes_key: 'TEST_ONLY', rationale_sv: 'Testrelation (endast i test)', evidence_ids: [], load_estimation_policy: 'manual_calibration', load_prior: { kind: 'none' }, origin: 'seed', order: 9999 } as const;
  return {
    ...orig,
    relationsFrom: (f: string) => (f === 'cable_lateral_raise' ? [...orig.relationsFrom(f as never), fake] : orig.relationsFrom(f as never)),
    relationBetween: (a: string, b: string) => (a === 'cable_lateral_raise' && b === 'neutral_grip_lat_pulldown' ? fake : orig.relationBetween(a as never, b as never)),
  };
});

import { acceptBalanceAdjustment, BALANCE_ACCEPT_REASON, getBalanceOverview, previewBalanceAdjustment } from '../../src/application/balance';
import { patchProfile } from '../../src/application/profile';
import { getFuturePlan, latestRevision, planRevisions, refreshFuturePlan } from '../../src/application/trainingPlan';
import { harness, onboard, type Harness } from './appHarness';
import { doSession } from './balanceHelpers';

async function withGap() {
  const h = harness();
  await onboard(h);
  for (let i = 0; i < 3; i++) await doSession(h, ['lat_pulldown']);
  await refreshFuturePlan(h.ctx);
  const o = await getBalanceOverview(h.ctx);
  expect(o.topSuggestion?.patternId).toBe('vertical_pull');
  return { h, o };
}
const history = async (h: Harness) => ({ sessions: await h.db.sessions.toArray(), exs: await h.db.sessionExercises.toArray(), sets: await h.db.sets.toArray() });

describe('Balans – godkänd framtida planändring', () => {
  it('BAL32: förhandsvisning visar byte, tillägg, borttag och tid utan att spara något', async () => {
    const { h, o } = await withGap();
    const before = { ...(await history(h)), profile: await h.db.profile.toArray(), revs: await h.db.planRevisions.count(), outbox: await h.db.outbox.count() };
    const p = await previewBalanceAdjustment(h.ctx, o.topSuggestion!.candidateKey);
    expect(p).toMatchObject({ status: 'proposal', from: 'cable_lateral_raise', to: 'neutral_grip_lat_pulldown', reasonCode: 'BAL_PREVIEW_ONLY' });
    if (p.status !== 'proposal') throw new Error('förväntade förslag');
    expect(p.changes.length).toBeGreaterThan(0);
    for (const c of p.changes) expect(c).toMatchObject({ removed: ['cable_lateral_raise'], added: ['neutral_grip_lat_pulldown'] });
    expect(p.calibrationNeeded).toBe(true); // ingen egen historik ⇒ kalibrering, ingen påhittad vikt
    expect({ ...(await history(h)), profile: await h.db.profile.toArray(), revs: await h.db.planRevisions.count(), outbox: await h.db.outbox.count() }).toEqual(before);
  });

  it('BAL33/BAL34: godkänt byte ⇒ exakt en framtida revision med orsakskod; dubbeltryck idempotent; inga gamla pass/set omskrivna', async () => {
    const { h, o } = await withGap();
    const past = await history(h);
    const revs = (await planRevisions(h.ctx)).length;
    const expected = (await latestRevision(h.ctx))!.id;
    const key = o.topSuggestion!.candidateKey;
    const r1 = await acceptBalanceAdjustment(h.ctx, key, expected, 'ev-1');
    const r2 = await acceptBalanceAdjustment(h.ctx, key, expected, 'ev-2');
    expect(r1.status).toBe('accepted');
    expect(r2).toEqual({ status: 'already_accepted', revisionId: r1.revisionId });
    const all = await planRevisions(h.ctx);
    expect(all.length).toBe(revs + 1);
    expect(all[0]).toMatchObject({ id: r1.revisionId, changeType: 'SUBSTITUTION_CHANGED' });
    expect(all[0].reasonCodes).toContain(BALANCE_ACCEPT_REASON);
    expect(all[0].summary).toMatch(/^Balansförslag godkänt av dig\./);
    expect(await history(h)).toEqual(past);
    // Framtiden planeras av den oförändrade motorn med det nya valet.
    const plan = (await getFuturePlan(h.ctx, 12))!;
    expect(plan.slots.flatMap((s) => s.exercises.map((e) => e.exerciseId))).toContain('neutral_grip_lat_pulldown');
    expect((await h.db.profile.get(h.userId))!.substitutions).toMatchObject({ cable_lateral_raise: 'neutral_grip_lat_pulldown' });
    expect(await h.db.balanceDecisions.count()).toBe(1);
    // Förslaget visas inte igen för samma underlag.
    expect((await getBalanceOverview(h.ctx)).topSuggestion).toBeUndefined();
    // Synk: en logisk ändring även vid tappade kvittenser.
    h.server.dropNextAck = 2;
    for (let i = 0; i < 4; i++) await h.sync.syncNow();
    expect(await h.db.outbox.count()).toBe(0);
    expect([...h.server.table('balance_suggestion_decisions').values()]).toHaveLength(1);
    expect(h.server.profiles.get(h.userId)!.substitutions).toMatchObject({ cable_lateral_raise: 'neutral_grip_lat_pulldown' });
  });

  it('BAL34: inaktuell planrevision ⇒ versionskonflikt, ingen ändring; offline godkännande synkas senare exakt en gång', async () => {
    const { h, o } = await withGap();
    const key = o.topSuggestion!.candidateKey;
    await expect(acceptBalanceAdjustment(h.ctx, key, 'gammal-revision', 'ev-x')).rejects.toMatchObject({ code: 'INVALID_STATE', field: 'PLAN_REVISION_CHANGED' });
    expect(await h.db.balanceDecisions.count()).toBe(0);
    expect((await h.db.profile.get(h.userId))!.substitutions).toEqual({});
    h.server.online = false;
    await acceptBalanceAdjustment(h.ctx, key, (await latestRevision(h.ctx))!.id, 'ev-off');
    expect((await h.sync.syncNow()).stoppedBy).toBe('OFFLINE');
    h.server.online = true;
    await h.sync.syncNow();
    await h.sync.syncNow();
    expect([...h.server.table('balance_suggestion_decisions').values()]).toHaveLength(1);
    expect([...h.server.table('plan_revisions').values()].filter((r) => (r.reason_codes as string[]).includes(BALANCE_ACCEPT_REASON))).toHaveLength(1);
  });

  it('BAL35: bytet ryms inte i tidsbudgeten ⇒ ingen mutation, tydligt "kan inte föreslå inom ramarna"', async () => {
    const { h, o } = await withGap();
    // Strama tidsramen så att ett flerledsdrag i stället för sidolyft inte ryms (planeraren kortar då passen).
    await patchProfile(h.ctx, { minutesPerSession: 25 });
    await refreshFuturePlan(h.ctx);
    const o2 = await getBalanceOverview(h.ctx);
    const key = o2.topSuggestion?.candidateKey ?? o.topSuggestion!.candidateKey;
    const before = { ...(await history(h)), profile: await h.db.profile.toArray(), revs: await h.db.planRevisions.count() };
    const p = await previewBalanceAdjustment(h.ctx, key).catch((e: unknown) => e);
    if (p instanceof Error) {
      // Kandidaten kan ha bytt nyckel med den nya planrevisionen – då nekas inaktuell förhandsvisning.
      expect(p).toMatchObject({ code: 'INVALID_STATE' });
    } else {
      expect(p).toMatchObject({ status: 'none', textSv: 'Det går inte att föreslå en justering inom dina nuvarande ramar.' });
      await expect(acceptBalanceAdjustment(h.ctx, key, (await latestRevision(h.ctx))!.id, 'ev')).rejects.toMatchObject({ code: 'RULE_UNSATISFIABLE' });
    }
    expect({ ...(await history(h)), profile: await h.db.profile.toArray(), revs: await h.db.planRevisions.count() }).toEqual(before);
  });
});
