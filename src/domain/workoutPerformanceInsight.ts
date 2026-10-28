import { exercise, type ExerciseId } from './catalog';
import type { PerformanceSide, SetPerformance } from './trainingFlow';
import type { LocalSession, LocalSet } from '../storage/db';

export type PerformanceInsightKind = 'reps' | 'load' | 'assistance' | 'target' | 'consistency';
export type PerformanceInsight = {
  kind: PerformanceInsightKind;
  text: string;
  exerciseId?: ExerciseId;
  difference?: number;
  previousSessionId?: string;
};
type Observation = {
  sessionId: string; exerciseId: ExerciseId; key: string; side: PerformanceSide;
  reps: number; load: number | null; secondLoad: number | null;
  unit: SetPerformance['equipment']['unit'];
  measurement: SetPerformance['equipment']['measurement'];
};
type Group = Observation & { count: number; consistent: boolean };
const validNumber = (n: number | null): boolean => n === null || (Number.isFinite(n) && n >= 0);
const validReps = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0;

function observations(sets: LocalSet[]): Observation[] {
  return sets.flatMap(set => {
    if (set.deleted || set.kind !== 'work' || !set.detail) return [];
    return set.detail.performances.filter(p =>
      p.status === 'done' && p.technique !== 'poor' && validReps(p.repetitions)
      && validNumber(p.loadValue) && validNumber(p.secondLoadValue)
      && (p.equipment.unit !== 'kg' || p.loadValue !== null || p.equipment.measurement === 'bodyweight')
    ).map(p => ({
      sessionId: set.sessionId, exerciseId: set.exerciseId, key: p.comparisonKey,
      side: p.side, reps: p.repetitions!, load: p.loadValue, secondLoad: p.secondLoadValue,
      unit: p.equipment.unit, measurement: p.equipment.measurement,
    }));
  });
}
function groups(sets: LocalSet[]): Group[] {
  const grouped = new Map<string, Group>();
  for (const p of observations(sets)) {
    const id = JSON.stringify([p.sessionId, p.key, p.side]);
    const previous = grouped.get(id);
    if (!previous) grouped.set(id, { ...p, count: 1, consistent: true });
    else {
      previous.reps += p.reps;
      previous.count++;
      previous.consistent &&= p.load === previous.load && p.secondLoad === previous.secondLoad
        && p.unit === previous.unit && p.measurement === previous.measurement;
    }
  }
  return [...grouped.values()].filter(g => g.consistent);
}
const number = (n: number): string =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(Number(n.toFixed(2)));
const sideText = (s: PerformanceSide): string =>
  s === 'both' ? '' : s === 'left' ? ' på vänster sida' : ' på höger sida';
const templates: Record<PerformanceInsightKind, string[]> = {
  reps: [
    '%n%s: %v fler repetitioner på samma belastning och lika många set som vid senaste jämförbara passet. Snyggt.',
    'Där finns progression. %v fler repetitioner i %n%s, med oförändrad belastning och antal set.',
    'Du ökade antalet repetitioner i %n%s med %v på samma belastning. Bra arbete.',
    'Samma belastning, samma antal set, %v fler repetitioner i %n%s. Det är ett konkret framsteg.',
    'Titta på %n%s: %v fler repetitioner på samma belastning som vid förra jämförbara tillfället.',
    'I %n%s samlade du ihop %v extra repetitioner på samma belastning och setantal.',
    'Små siffror kan vara stora nyheter. %n%s fick %v fler repetitioner med samma belastning.',
    'Repetitionerna gick upp i %n%s: %v fler utan att belastningen eller setantalet ändrades.',
  ],
  load: [
    '%n%s: %v högre belastning med minst lika många repetitioner över samma antal set. Starkt jobbat.',
    'Du höjde vikten med %v i %n%s och behöll minst samma repetitionsantal. Snyggt.',
    'Mer vikt, minst lika många repetitioner. %n%s ökade med %v jämfört med senaste jämförbara passet.',
    'Där var ett tydligt steg. %v mer i %n%s, utan tapp i antal set eller repetitioner.',
    'I %n%s blev belastningen %v högre medan repetitionerna hölls uppe. Bra utfört.',
    'Du flyttade upp vikten i %n%s med %v och genomförde minst lika många repetitioner.',
  ],
  assistance: [
    '%n%s: %v mindre assistans med minst lika många repetitioner. Bra utveckling.',
    'Du använde %v mindre assistans i %n%s och behöll minst samma repetitionsantal.',
    'Mer arbete på egen hand i %n%s. %v mindre assistans vid samma setantal.',
    'I %n%s minskade assistansen med %v, utan att repetitionerna blev färre.',
  ],
  target: [
    'I %n%s gjorde du %v repetitioner utöver det registrerade målet med minst planerad belastning.',
    'Dagens mål i %n%s fick se sig passerat med %v repetitioner. Belastningen sänktes inte.',
    '%n%s: %v repetitioner fler än registrerat mål, utan att gå ner från den planerade belastningen.',
    'Du hade mer att ge i %n%s. %v repetitioner över målet på planerad eller högre belastning.',
    'Repetitionsmålet i %n%s överträffades med %v repetitioner, och vikten hölls minst på planerad nivå.',
    'Det stod ett mål för %n%s. Du genomförde %v fler repetitioner med minst samma belastning.',
  ],
  consistency: [
    '%v pass registrerade under de senaste två veckorna. Du ger träningsplanen något att arbeta med.',
    'Du har %v genomförda pass i loggen på två veckor. Snygg kontinuitet.',
    'Det här blev ditt %v:e registrerade pass på 14 dagar. Bra rytm.',
    'Träningsloggen visar %v pass på två veckor. Det är en vana värd att vårda.',
    '%v pass inom 14 dagar. Inga stora ord behövs. Bara nästa pass när det passar.',
  ],
};
function render(kind: PerformanceInsightKind, seed: number, exerciseId: ExerciseId | undefined,
  change: number, side: PerformanceSide = 'both'): string {
  const list = templates[kind];
  const name = exerciseId ? exercise(exerciseId).nameSv : '';
  const value = kind === 'load' || kind === 'assistance' ? number(change) + ' kg' : number(change);
  return list[Math.abs(seed) % list.length].replaceAll('%n', name).replaceAll('%s', sideText(side)).replaceAll('%v', value);
}

/** A descriptive comparison is never interpreted as a personal best or a physiological claim. */
export function workoutPerformanceInsight(args: {
  sessionId: string; at: string; currentSets: LocalSet[]; historySets: LocalSet[];
  sessions: LocalSession[]; seed: number;
}): PerformanceInsight | null {
  const now = groups(args.currentSets).filter(g => g.sessionId === args.sessionId);
  const earlier = groups(args.historySets).filter(g => g.sessionId !== args.sessionId);
  const historyOrder = new Map(args.sessions.filter(s => s.id !== args.sessionId)
    .sort((a,b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '') || b.id.localeCompare(a.id))
    .map((s,index) => [s.id,index] as const));
  const candidates: Array<PerformanceInsight & { priority: number }> = [];
  for (const current of now) {
    const matching = earlier.filter(p => p.key === current.key && p.side === current.side
      && p.unit === current.unit && p.measurement === current.measurement
      && p.count === current.count && historyOrder.has(p.sessionId))
      .sort((a,b) => (historyOrder.get(a.sessionId) ?? Infinity) - (historyOrder.get(b.sessionId) ?? Infinity));
    const previous = matching[0];
    if (!previous || (current.load === null && current.unit === 'kg' && current.measurement !== 'bodyweight')) continue;
    const sameLoad = current.load === previous.load && current.secondLoad === previous.secondLoad;
    if (sameLoad && current.reps > previous.reps) {
      const difference = current.reps - previous.reps;
      candidates.push({kind:'reps',priority:100 + difference,exerciseId:current.exerciseId,
        difference,previousSessionId:previous.sessionId,
        text:render('reps',args.seed,current.exerciseId,difference,current.side)});
    } else if (current.load !== null && previous.load !== null
      && current.secondLoad === previous.secondLoad && current.reps >= previous.reps && current.unit === 'kg') {
      const assistance = current.measurement === 'bodyweight_assistance';
      const difference = assistance ? previous.load - current.load : current.load - previous.load;
      if (difference > 0) candidates.push({kind:assistance?'assistance':'load',
        priority:90 + difference,exerciseId:current.exerciseId,difference,
        previousSessionId:previous.sessionId,
        text:render(assistance?'assistance':'load',args.seed,current.exerciseId,difference,current.side)});
    }
  }
  // A repetition goal is beaten only if the load is at least as demanding as prescribed.
  const overTargets = new Map<string,{exerciseId:ExerciseId;side:PerformanceSide;extra:number}>();
  for (const set of args.currentSets) {
    if (set.deleted || set.kind !== 'work' || set.status !== 'done' || !set.detail) continue;
    for (const p of set.detail.performances) {
      if (p.status !== 'done' || p.technique === 'poor' || !validReps(p.repetitions)) continue;
      const planned = set.detail.plannedSides?.[p.side];
      const goal = planned?.reps ?? set.targetReps;
      const grams = planned?.grams ?? set.targetGrams;
      if (goal === null || goal === undefined || p.repetitions <= goal) continue;
      if (grams !== null && grams !== undefined) {
        if (p.loadValue === null || p.equipment.unit !== 'kg') continue;
        const goalLoad = grams / 1000;
        if (p.equipment.measurement === 'bodyweight_assistance' ? p.loadValue > goalLoad : p.loadValue < goalLoad) continue;
      } else if (p.equipment.unit === 'kg' && p.equipment.measurement !== 'bodyweight') continue;
      const key = p.comparisonKey + ':' + p.side;
      const value = overTargets.get(key) ?? {exerciseId:set.exerciseId,side:p.side,extra:0};
      value.extra += p.repetitions - goal;
      overTargets.set(key,value);
    }
  }
  for (const target of overTargets.values()) if (target.extra > 0)
    candidates.push({kind:'target',priority:50 + target.extra,exerciseId:target.exerciseId,
      difference:target.extra,text:render('target',args.seed,target.exerciseId,target.extra,target.side)});
  const latest = Date.parse(args.at);
  if (Number.isFinite(latest)) {
    const twoWeeks = 14 * 86400000;
    const recent = new Set(args.sessions.filter(s => {
      const finished = Date.parse(s.finishedAt ?? '');
      return (s.status === 'completed' || s.status === 'partial')
        && Number.isFinite(finished) && finished <= latest && latest - finished <= twoWeeks
        && (s.id === args.sessionId || args.historySets.some(x => x.sessionId === s.id
          && !x.deleted && x.kind === 'work' && x.status === 'done'));
    }).map(s => s.id));
    if (recent.size >= 3) candidates.push({kind:'consistency',priority:10,
      text:render('consistency',args.seed,undefined,recent.size)});
  }
  candidates.sort((a,b) => b.priority - a.priority || a.text.localeCompare(b.text));
  return candidates[0] ?? null;
}
