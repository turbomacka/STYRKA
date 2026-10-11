/**
 * ÄA-BAL-001 – rena domäntester för deriveBalanceOverview (BAL01–BAL06, BAL08–BAL10, BAL12–BAL31 domändel).
 * Applikations-, synk-, RLS- och UI-fall finns i balance_app.test.ts, balance_accept.test.ts, db och e2e.
 */
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../src/domain/catalog';
import { appSlug, SEED } from '../../src/domain/substitutionCatalog';
import { ALL_PATTERNS, balanceWindow, deriveBalanceOverview, localDate, patternOf, PATTERN_POLICY_VERSION, startOfLocalDay, type BalanceInput, type BalanceOverview, type StrengthSeriesInput } from '../../src/domain/balance';
import type { RestrictionRule, SymptomReport } from '../../src/domain/model';

const AS_OF = '2026-10-12T10:00:00.000Z';
const day = (n: number, h = 8) => new Date(Date.parse(AS_OF) - n * 86_400_000 - (10 - h) * 3_600_000).toISOString();

type Ex = { exerciseId: string; order?: number; id?: string; replacedById?: string | null; done?: number; warmup?: number; notDone?: number; skipped?: number };
function builder() {
  const input: BalanceInput = { userId: 'u1', timezone: 'Europe/Stockholm', sessions: [], sessionExercises: [], sets: [], strength: [], restrictions: [], activeSymptoms: [], goals: {}, activePlanRevisionId: 'rev-1', decisions: [] };
  const add = (s: { id: string; kind?: 'planned' | 'extra'; status?: string; startedAt: string; plan?: Array<[string, number]> | null; exs: Ex[] }) => {
    input.sessions.push({ id: s.id, kind: s.kind ?? 'planned', status: s.status ?? 'completed', startedAt: s.startedAt, plannedAtStart: s.plan === undefined ? null : s.plan === null ? null : s.plan.map(([exerciseId, sets]) => ({ exerciseId, sets })), countsAsPlanned: false });
    s.exs.forEach((e, i) => {
      const seId = e.id ?? `${s.id}-se${i}`;
      input.sessionExercises.push({ id: seId, sessionId: s.id, exerciseId: e.exerciseId, orderIndex: e.order ?? i, replacedById: e.replacedById ?? null });
      let k = 0;
      const set = (kind: string, status: string, reps: number | null) => input.sets.push({ id: `${seId}-s${++k}`, sessionId: s.id, sessionExerciseId: seId, exerciseId: e.exerciseId, kind, status, deleted: false, actualReps: reps, actualSeconds: null, occurredAt: status === 'done' ? new Date(Date.parse(s.startedAt) + k * 60_000).toISOString() : null });
      for (let j = 0; j < (e.warmup ?? 0); j++) set('warmup', 'done', 5);
      for (let j = 0; j < (e.done ?? 0); j++) set('work', 'done', 8);
      for (let j = 0; j < (e.notDone ?? 0); j++) set('work', 'planned', null);
      for (let j = 0; j < (e.skipped ?? 0); j++) set('work', 'skipped', null);
    });
  };
  return { input, add };
}
const summary = (o: BalanceOverview, p: string) => o.summaries.find((s) => s.patternId === p)!;
const allText = (o: BalanceOverview) => [o.headlineSv, ...o.insights.map((i) => i.textSv), ...o.progressComparisons.map((i) => i.textSv), o.topSuggestion?.textSv ?? ''].join(' | ');
const FORBIDDEN = /svag|obalanserad|riskzon|onormalt|försummat|du måste|säker träning garanteras|skaderisk|\d+ ?%.*risk|missat/i;

describe('Balans – klassificering och räkning', () => {
  it('BAL01: utan registrerade set ⇒ tomläge, inga fabricerade mängder eller förslag', () => {
    const { input } = builder();
    const o = deriveBalanceOverview(input, AS_OF);
    expect(o).toMatchObject({ hasData: false, summaries: [], sessionCount28d: 0 });
    expect(o.topSuggestion).toBeUndefined();
    expect(o.insights.map((i) => i.reasonCode)).toEqual(['BAL_NO_DATA']);
    expect(o.insights[0].textSv).toBe('När du har genomfört några pass kan du se hur träningen fördelas mellan olika rörelser.');
  });

  it('BAL02/BAL03: ett utfört arbetsset + uppvärmning + ej utfört ⇒ knee_dominant = 1, räknat en gång', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(1), plan: [['squat', 3]], exs: [{ exerciseId: 'squat', done: 1, warmup: 1, notDone: 1, skipped: 1 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'knee_dominant').actualWorkSets28d).toBe(1);
    expect(summary(o, 'hip_dominant').actualWorkSets28d).toBe(0);
    expect(o.summaries.reduce((n, s) => n + s.actualWorkSets28d, 0)).toBe(1);
  });

  it('BAL04: trap bar-marklyft räknas som höftdominant; ingen text påstår att knät är obelastat', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(2), plan: [['trap_bar_deadlift', 2]], exs: [{ exerciseId: 'trap_bar_deadlift', done: 2 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'hip_dominant').actualWorkSets28d).toBe(2);
    expect(allText(o)).not.toMatch(/knä/i);
  });

  it('BAL05: okänt historiskt övnings-id ⇒ övrigt, försvinner inte och ger ingen falsk lucka', () => {
    const { input, add } = builder();
    add({ id: 'a', kind: 'extra', startedAt: day(3), exs: [{ exerciseId: 'gammal_egen_ovning', done: 2 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'other')).toMatchObject({ actualWorkSets28d: 2 });
    expect(o.topSuggestion).toBeUndefined();
  });

  it('BAL06: alias dumbbell_flat_bench → appens id → horizontal_push; id skrivs inte om; policyn täcker alla övningar', () => {
    expect(appSlug('dumbbell_flat_bench')).toBe('dumbbell_bench_press');
    expect(patternOf('dumbbell_bench_press')).toBe('horizontal_push');
    for (const e of SEED.candidate_edges) for (const s of [e.from_slug, e.to_slug]) expect(patternOf(appSlug(s)), s).not.toBe('other');
    for (const c of CATALOG) expect(ALL_PATTERNS, c.slug).toContain(patternOf(c.slug));
    expect(patternOf('lunge')).toBe('other'); // pensionerad och inte i policyn ⇒ uttryckligen "övrigt"
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(1), plan: [['dumbbell_bench_press', 2]], exs: [{ exerciseId: 'dumbbell_bench_press', done: 2 }] });
    const before = JSON.stringify(input);
    expect(summary(deriveBalanceOverview(input, AS_OF), 'horizontal_push').actualWorkSets28d).toBe(2);
    expect(JSON.stringify(input)).toBe(before);
    expect(PATTERN_POLICY_VERSION).toBe('balance-patterns/1.0.0');
  });

  it('BAL08: spontanpass med tre vertikala dragset ⇒ 3 utförda, 0 krediterade som planerade', () => {
    const { input, add } = builder();
    add({ id: 'x', kind: 'extra', startedAt: day(4), exs: [{ exerciseId: 'lat_pulldown', done: 3 }] });
    const s = summary(deriveBalanceOverview(input, AS_OF), 'vertical_pull');
    expect(s).toMatchObject({ actualWorkSets28d: 3, extraWorkSets28d: 3, eligiblePlannedWorkSets: null, matchedCompletedWorkSets: null });
  });

  it('BAL09/BAL19: kalenderlöst program och uppehåll ⇒ inget "missat pass"; framtidsplan ingår aldrig i nämnaren', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(25), plan: [['squat', 2]], exs: [{ exerciseId: 'squat', done: 2 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(allText(o)).not.toMatch(FORBIDDEN);
    expect(summary(o, 'knee_dominant')).toMatchObject({ eligiblePlannedWorkSets: 2, matchedCompletedWorkSets: 2 });
    // Indata innehåller inga framtida passplatser – nämnaren kommer bara från genomförda pass.
    expect(Object.keys(input)).not.toContain('futureSlots');
  });

  it('BAL10: planerat baseras på den historiska accepterade planen vid passets start', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(2), plan: [['cable_row', 3], ['bench_press', 3]], exs: [{ exerciseId: 'cable_row', done: 2 }, { exerciseId: 'bench_press', done: 3 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'horizontal_pull')).toMatchObject({ eligiblePlannedWorkSets: 3, matchedCompletedWorkSets: 2, dataQuality: 'complete' });
    expect(summary(o, 'horizontal_push')).toMatchObject({ eligiblePlannedWorkSets: 3, matchedCompletedWorkSets: 3 });
  });

  it('BAL12: äldre pass utan plansnapshot ⇒ planerat null, bara utförd mängd, tydlig begränsning', () => {
    const { input, add } = builder();
    add({ id: 'old', startedAt: day(10), plan: null, exs: [{ exerciseId: 'cable_row', done: 3 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'horizontal_pull')).toMatchObject({ actualWorkSets28d: 3, eligiblePlannedWorkSets: null, matchedCompletedWorkSets: null, dataQuality: 'partial' });
    expect(o.insights.find((i) => i.reasonCode === 'BAL_NO_PLAN_SNAPSHOT')?.textSv).toBe('Vi kan visa vad du har tränat, men saknar äldre planunderlag för en rättvis jämförelse.');
    expect(o.topSuggestion).toBeUndefined();
  });

  it('BAL13/BAL28: 10 planerade horisontella dragset, 3 matchade, +2 spontana ⇒ 3 av 10, extra 2, ett förslag', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(14), plan: [['cable_row', 5]], exs: [{ exerciseId: 'cable_row', done: 2, notDone: 3 }] });
    add({ id: 'b', startedAt: day(7), plan: [['cable_row', 5]], exs: [{ exerciseId: 'cable_row', done: 1, notDone: 4 }] });
    add({ id: 'x', kind: 'extra', startedAt: day(3), exs: [{ exerciseId: 'one_arm_dumbbell_row', done: 2 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'horizontal_pull')).toMatchObject({ actualWorkSets28d: 5, eligiblePlannedWorkSets: 10, matchedCompletedWorkSets: 3, extraWorkSets28d: 2 });
    expect(o.topSuggestion).toMatchObject({ reasonCode: 'BAL_PLAN_PATTERN_GAP', patternId: 'horizontal_pull', planned: 10, matched: 3, evidenceLevel: 'product_heuristic' });
    expect(o.topSuggestion!.textSv).toContain('3 av 10');
    expect(o.topSuggestion!.textSv).not.toContain('5 av 10');
  });

  it('BAL14: knäböj ersatt med annan knädominant variant ⇒ mönstret krediteras, inga knäböjsset uppstår', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(2), plan: [['squat', 3]], exs: [{ id: 'sq', exerciseId: 'squat', replacedById: 'fs', done: 0, notDone: 0 }, { id: 'fs', exerciseId: 'front_squat', order: 101, done: 3 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'knee_dominant')).toMatchObject({ eligiblePlannedWorkSets: 3, matchedCompletedWorkSets: 3, extraWorkSets28d: 0 });
    expect(input.sets.filter((s) => s.exerciseId === 'squat')).toHaveLength(0);
  });

  it('BAL15: knädominant ersatt med höftdominant ⇒ knä ej krediterat, höft räknas som utförd (utöver plan)', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(2), plan: [['squat', 3]], exs: [{ id: 'sq', exerciseId: 'squat', replacedById: 'rdl' }, { id: 'rdl', exerciseId: 'romanian_deadlift', order: 101, done: 3 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'knee_dominant')).toMatchObject({ eligiblePlannedWorkSets: 3, matchedCompletedWorkSets: 0 });
    expect(summary(o, 'hip_dominant')).toMatchObject({ actualWorkSets28d: 3, extraWorkSets28d: 3, matchedCompletedWorkSets: 0 });
  });

  it('BAL16: fler set än planerat i en planplats ⇒ matchning högst planerat, resten separat, aldrig över 100 %', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(2), plan: [['cable_row', 2]], exs: [{ exerciseId: 'cable_row', done: 4 }] });
    const s = summary(deriveBalanceOverview(input, AS_OF), 'horizontal_pull');
    expect(s).toMatchObject({ eligiblePlannedWorkSets: 2, matchedCompletedWorkSets: 2, extraWorkSets28d: 2 });
    expect(s.matchedCompletedWorkSets!).toBeLessThanOrEqual(s.eligiblePlannedWorkSets!);
  });

  it('BAL17: delvis avslutat pass ⇒ bara verkliga set räknas', () => {
    const { input, add } = builder();
    add({ id: 'a', status: 'partial', startedAt: day(2), plan: [['bench_press', 3], ['lat_pulldown', 2]], exs: [{ exerciseId: 'bench_press', done: 1, notDone: 2 }, { exerciseId: 'lat_pulldown', skipped: 2 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(summary(o, 'horizontal_push')).toMatchObject({ actualWorkSets28d: 1, eligiblePlannedWorkSets: 3, matchedCompletedWorkSets: 1 });
    expect(summary(o, 'vertical_pull')).toMatchObject({ actualWorkSets28d: 0, eligiblePlannedWorkSets: 2, matchedCompletedWorkSets: 0 });
  });

  it('BAL18: lokala 28 dygn i Europe/Stockholm över sommartidsomställning – ingen dubblering eller bortfall', () => {
    // Höst: fönstret 2026-10-14 … 2026-11-10 innehåller omställningen 25 okt (25-timmarsdygn).
    const asOf = '2026-11-10T12:00:00.000Z';
    const w = balanceWindow(asOf, 'Europe/Stockholm');
    expect(w).toMatchObject({ startLocalDate: '2026-10-14', endLocalDate: '2026-11-10', startUtc: '2026-10-13T22:00:00.000Z' });
    expect(startOfLocalDay('2026-10-25', 'Europe/Stockholm')).toBe('2026-10-24T22:00:00.000Z');
    expect(startOfLocalDay('2026-10-26', 'Europe/Stockholm')).toBe('2026-10-25T23:00:00.000Z');
    // Vår: 29 mars 2026 (23-timmarsdygn).
    expect(balanceWindow('2026-04-20T12:00:00.000Z', 'Europe/Stockholm').startUtc).toBe('2026-03-23T23:00:00.000Z');
    expect(startOfLocalDay('2026-03-30', 'Europe/Stockholm')).toBe('2026-03-29T22:00:00.000Z');
    expect(localDate('2026-10-13T22:30:00.000Z', 'Europe/Stockholm')).toBe('2026-10-14');
    const { input, add } = builder();
    add({ id: 'in', kind: 'extra', startedAt: '2026-10-13T22:29:00.000Z', exs: [{ exerciseId: 'squat', done: 1 }] }); // lokal 00:30 den 14:e
    add({ id: 'out', kind: 'extra', startedAt: '2026-10-13T21:29:00.000Z', exs: [{ exerciseId: 'deadlift', done: 1 }] }); // lokal 23:30 den 13:e
    add({ id: 'dst', kind: 'extra', startedAt: '2026-10-25T00:29:00.000Z', exs: [{ exerciseId: 'bench_press', done: 1 }] }); // under omställningsnatten
    const o = deriveBalanceOverview(input, asOf);
    expect(summary(o, 'knee_dominant').actualWorkSets28d).toBe(1);
    expect(summary(o, 'hip_dominant').actualWorkSets28d).toBe(0);
    expect(summary(o, 'horizontal_push').actualWorkSets28d).toBe(1);
  });

  it('BAL20: alla sex mönster med olika setantal enligt egen plan ⇒ ingen varning om ojämlika nivåer', () => {
    const { input, add } = builder();
    add({ id: 'a', startedAt: day(3), plan: [['squat', 4], ['deadlift', 1], ['bench_press', 3], ['overhead_press', 2], ['cable_row', 1], ['lat_pulldown', 5]], exs: [{ exerciseId: 'squat', done: 4 }, { exerciseId: 'deadlift', done: 1 }, { exerciseId: 'bench_press', done: 3 }, { exerciseId: 'overhead_press', done: 2 }, { exerciseId: 'cable_row', done: 1 }, { exerciseId: 'lat_pulldown', done: 5 }] });
    const o = deriveBalanceOverview(input, AS_OF);
    expect(o.topSuggestion).toBeUndefined();
    expect(o.insights.every((i) => i.kind !== 'optional_action')).toBe(true);
    expect(allText(o)).not.toMatch(FORBIDDEN);
    expect(o.headlineSv).toBe('Din träning täcker flera rörelsemönster');
  });
});

/** Två ordinarie pass där knäböj planerats 4 set vardera men bara 1 utförts per pass. */
function kneeGap() {
  const b = builder();
  b.add({ id: 'a', startedAt: day(10), plan: [['squat', 4]], exs: [{ exerciseId: 'squat', done: 1, notDone: 3 }] });
  b.add({ id: 'b', startedAt: day(3), plan: [['squat', 4]], exs: [{ exerciseId: 'squat', done: 1, notDone: 3 }] });
  return b;
}
const rule = (r: Partial<RestrictionRule> & Pick<RestrictionRule, 'kind'>): RestrictionRule => ({ id: 'r1', exerciseA: null, exerciseB: null, area: null, side: null, maxSets: null, maxMode: null, active: true, description: null, ...r });

describe('Balans – förslag, spärrar och användarval', () => {
  it('BAL21: uttryckligt bortprioriterat mönster ⇒ inget förslag som ökar det', () => {
    const b = kneeGap();
    expect(deriveBalanceOverview(b.input, AS_OF).topSuggestion?.patternId).toBe('knee_dominant');
    b.input.goals = { squat: 0, bench_press: 2 };
    const o = deriveBalanceOverview(b.input, AS_OF);
    expect(o.topSuggestion).toBeUndefined();
    expect(o.suppressed).toEqual([{ patternId: 'knee_dominant', reasonCode: 'BAL_USER_DEPRIORITIZED' }]);
  });

  it('BAL22: knäbegränsning eller olöst review_required ⇒ inget förslag om ökad knäbelastning', () => {
    const b = kneeGap();
    b.input.restrictions = [rule({ kind: 'region_note', area: 'knee' })];
    let o = deriveBalanceOverview(b.input, AS_OF);
    expect(o.topSuggestion).toBeUndefined();
    expect(o.suppressed[0].reasonCode).toBe('BAL_RESTRICTION_SUPPRESSED');
    expect(o.recoveryStatus).toBe('limited');
    expect(o.insights.some((i) => i.textSv === 'Det finns en aktuell begränsning. Förslag som påverkar området visas inte som automatiska ökningar.')).toBe(true);
    b.input.restrictions = [];
    b.input.activeSymptoms = [{ id: 's1', sessionId: null, area: 'knee', side: 'left', reaction: 'persistent', reportedAt: day(2), resolvedAt: null } as SymptomReport];
    o = deriveBalanceOverview(b.input, AS_OF);
    expect(o.topSuggestion).toBeUndefined();
    expect(o.suppressed[0].reasonCode).toBe('BAL_REVIEW_REQUIRED');
    expect(o.recoveryStatus).toBe('review_required');
    // Ingen medicinsk detalj (område/sida) i sammanfattningstexten.
    expect(allText(o)).not.toMatch(/vänster|knä/i);
  });

  it('BAL27: 1–2 saknade arbetsset i enstaka pass ⇒ ingen PLAN_PATTERN_GAP', () => {
    const b = builder();
    b.add({ id: 'a', startedAt: day(10), plan: [['cable_row', 3]], exs: [{ exerciseId: 'cable_row', done: 2, notDone: 1 }] });
    b.add({ id: 'b', startedAt: day(3), plan: [['cable_row', 3]], exs: [{ exerciseId: 'cable_row', done: 2, notDone: 1 }] });
    expect(deriveBalanceOverview(b.input, AS_OF).topSuggestion).toBeUndefined();
    const one = builder();
    one.add({ id: 'a', startedAt: day(3), plan: [['cable_row', 6]], exs: [{ exerciseId: 'cable_row', done: 0, notDone: 6 }, { exerciseId: 'bench_press', order: 1, done: 1 }] });
    expect(deriveBalanceOverview(one.input, AS_OF).topSuggestion).toBeUndefined(); // bara ett pass
  });

  it('BAL29: flera luckor ⇒ endast en, störst lucka först, stabil tie-break på mönster-id', () => {
    const b = builder();
    b.add({ id: 'a', startedAt: day(10), plan: [['cable_row', 4], ['lat_pulldown', 4], ['squat', 5]], exs: [{ exerciseId: 'cable_row', done: 0 }, { exerciseId: 'lat_pulldown', done: 0 }, { exerciseId: 'squat', done: 0 }, { exerciseId: 'bench_press', order: 9, done: 1 }] });
    b.add({ id: 'b', startedAt: day(3), plan: [['cable_row', 4], ['lat_pulldown', 4], ['squat', 5]], exs: [{ exerciseId: 'cable_row', done: 1 }, { exerciseId: 'lat_pulldown', done: 1 }, { exerciseId: 'squat', done: 0 }] });
    expect(deriveBalanceOverview(b.input, AS_OF).topSuggestion?.patternId).toBe('knee_dominant'); // lucka 10
    b.input.sessions = b.input.sessions.map((s) => ({ ...s, plannedAtStart: s.plannedAtStart!.filter((t) => t.exerciseId !== 'squat') }));
    const o = deriveBalanceOverview(b.input, AS_OF);
    expect(o.topSuggestion?.patternId).toBe('horizontal_pull'); // lika lucka 7 ⇒ lexikografiskt först
    expect([o.topSuggestion].filter(Boolean)).toHaveLength(1);
  });

  it('BAL30/BAL31: samma underlag ⇒ identisk output och kandidatnyckel; avböjt återkommer inte förrän underlaget ändras', () => {
    const b = kneeGap();
    const o1 = deriveBalanceOverview(b.input, AS_OF);
    const o2 = deriveBalanceOverview(JSON.parse(JSON.stringify(b.input)), AS_OF);
    expect(o2).toEqual(o1);
    // Ett dygn senare med samma set i fönstret ⇒ samma kandidat.
    const later = new Date(Date.parse(AS_OF) + 86_400_000).toISOString();
    expect(deriveBalanceOverview(b.input, later).topSuggestion!.candidateKey).toBe(o1.topSuggestion!.candidateKey);
    b.input.decisions = [{ candidateKey: o1.topSuggestion!.candidateKey, basisKey: o1.topSuggestion!.basisKey, status: 'dismissed' }];
    for (let i = 0; i < 3; i++) {
      const o = deriveBalanceOverview(b.input, AS_OF);
      expect(o.topSuggestion).toBeUndefined();
      expect(o.suppressed).toContainEqual({ patternId: 'knee_dominant', reasonCode: 'BAL_DISMISSED' });
    }
    // Sakligt förändrat underlag (nytt pass) ⇒ ny kandidat får visas.
    b.add({ id: 'c', startedAt: day(1), plan: [['squat', 4]], exs: [{ exerciseId: 'squat', done: 1, notDone: 3 }] });
    const o3 = deriveBalanceOverview(b.input, AS_OF);
    expect(o3.topSuggestion?.candidateKey).not.toBe(o1.topSuggestion!.candidateKey);
    // Ny planrevision ⇒ ny nyckel (enligt kontraktet).
    expect(deriveBalanceOverview({ ...b.input, activePlanRevisionId: 'rev-2' }, AS_OF).topSuggestion!.candidateKey).not.toBe(o3.topSuggestion!.candidateKey);
  });

  it('språkregler: ingen standardåterkoppling använder förbjudna eller hotfulla ord', () => {
    for (const b of [kneeGap(), builder()]) {
      b.add({ id: 'z', kind: 'extra', startedAt: day(5), exs: [{ exerciseId: 'plank', done: 2 }, { exerciseId: 'biceps_curl', done: 2 }] });
      const o = deriveBalanceOverview(b.input, AS_OF);
      expect(allText(o)).not.toMatch(FORBIDDEN);
      expect(JSON.stringify(o)).not.toMatch(/"score"|poäng|betyg/i);
    }
  });
});

describe('Balans – styrkans utveckling (befintliga e1RM-observationer)', () => {
  const series = (exerciseId: string, basis: StrengthSeriesInput['basis'], kgs: Array<[number, number]>, loadKind: StrengthSeriesInput['loadKind'] = 'external_kg'): StrengthSeriesInput => ({
    exerciseId,
    basis,
    loadKind,
    observations: kgs.map(([daysAgo, kg], i) => ({ at: day(daysAgo), kg, source: 'estimated', sessionId: `${exerciseId}-${i}` })),
  });

  it('BAL23: bara två giltiga punkter ⇒ ingen slutsats om utvecklingstakt', () => {
    const { input } = builder();
    input.strength = [series('bench_press', 'total_kg', [[60, 80], [5, 86]])];
    const o = deriveBalanceOverview(input, AS_OF);
    expect(o.progressComparisons.map((i) => i.reasonCode)).toEqual(['BAL_STRENGTH_NOT_COMPARABLE']);
  });

  it('BAL24: olika kg-semantik (total mot per hantel) ⇒ ingen procentjämförelse mellan dem', () => {
    const { input } = builder();
    input.strength = [series('bench_press', 'total_kg', [[70, 80], [40, 84], [5, 88]]), series('dumbbell_bench_press', 'per_hand_kg', [[70, 30], [40, 32], [5, 34]])];
    const o = deriveBalanceOverview(input, AS_OF);
    const texts = o.progressComparisons.map((i) => i.textSv);
    expect(texts.filter((t) => /%/.test(t))).toHaveLength(1);
    expect(texts.join(' ')).not.toMatch(/Bänkpress.*Hantelpress|Hantelpress.*Bänkpress/);
    expect(o.progressComparisons.some((i) => i.reasonCode === 'BAL_STRENGTH_NOT_COMPARABLE')).toBe(true);
  });

  it('BAL25: två jämförbara e1RM-serier (≥3 pass, ≥42 dagar) ⇒ separata, sakliga procentförändringar med datum', () => {
    const { input } = builder();
    input.strength = [series('bench_press', 'total_kg', [[70, 100], [40, 104], [5, 108]]), series('squat', 'total_kg', [[75, 120], [30, 122], [6, 123.6]])];
    const o = deriveBalanceOverview(input, AS_OF);
    const texts = o.progressComparisons.map((i) => i.textSv);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/^Bänkpress \+8 % uppskattad maxstyrka \(\d+ \w+ 2026 → \d+ okt 2026, 3 pass\)$/);
    expect(texts[1]).toMatch(/^Knäböj \+3 %/);
    expect(texts.join(' ')).not.toMatch(FORBIDDEN);
    // Mindre än 42 dagars spann ⇒ ingen jämförelse.
    input.strength = [series('bench_press', 'total_kg', [[30, 100], [20, 104], [5, 108]])];
    expect(deriveBalanceOverview(input, AS_OF).progressComparisons[0].reasonCode).toBe('BAL_STRENGTH_NOT_COMPARABLE');
  });

  it('BAL26: assistansövning med sjunkande assistans förväxlas inte med e1RM eller "negativ utveckling"', () => {
    const { input } = builder();
    input.strength = [series('assisted_pullup', 'assistance_kg', [[70, 40], [40, 35], [5, 30]], 'assistance_kg')];
    const o = deriveBalanceOverview(input, AS_OF);
    expect(o.progressComparisons.map((i) => i.reasonCode)).toEqual(['BAL_STRENGTH_NOT_COMPARABLE']);
    expect(o.progressComparisons.map((i) => i.textSv).join(' ')).not.toMatch(/Assisterade|−/);
  });
});
