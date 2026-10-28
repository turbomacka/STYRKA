import { exercise, type ExerciseId } from './catalog';
import { comparisonKey, requiredSides, type PerformanceSide, type SetPerformance } from './trainingFlow';
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
  valid: boolean;
};
type Group = Observation & { count: number; consistent: boolean };
const validNumber = (n: number | null): boolean => n === null || (Number.isFinite(n) && n >= 0);
const validReps = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0;
const validPerformance = (p: SetPerformance): boolean => p.technique !== 'poor'
  && validReps(p.repetitions) && validNumber(p.loadValue) && validNumber(p.secondLoadValue)
  && p.equipment.unit !== 's'
  && (p.loadValue !== null || p.equipment.measurement === 'bodyweight')
  && (p.equipment.basis !== 'independent' || p.secondLoadValue !== null);

function observations(sets: LocalSet[]): Observation[] {
  return sets.flatMap(set => {
    if (set.deleted || set.kind !== 'work' || !set.detail) return [];
    return set.detail.performances.filter(p => p.status === 'done').map(p => ({
      sessionId: set.sessionId, exerciseId: set.exerciseId, key: p.comparisonKey,
      side: p.side, reps: p.repetitions!, load: p.loadValue, secondLoad: p.secondLoadValue,
      unit: p.equipment.unit, measurement: p.equipment.measurement,
      valid: validPerformance(p),
    }));
  });
}
function groups(sets: LocalSet[]): Group[] {
  const grouped = new Map<string, Group>();
  for (const p of observations(sets)) {
    const id = JSON.stringify([p.sessionId, p.exerciseId, p.key, p.side]);
    const previous = grouped.get(id);
    if (!previous) grouped.set(id, { ...p, count: 1, consistent: true });
    else {
      previous.reps += p.reps;
      previous.count++;
      previous.valid &&= p.valid;
      previous.consistent &&= p.load === previous.load && p.secondLoad === previous.secondLoad
        && p.unit === previous.unit && p.measurement === previous.measurement;
    }
  }
  // Keep unusable groups: dropping them could cherry-pick an older, weaker baseline.
  return [...grouped.values()].map(g => ({...g, valid:g.valid && !sets.some(s =>
    s.sessionId===g.sessionId && s.exerciseId===g.exerciseId && !s.deleted
    && s.kind==='work' && s.status==='done' && !s.detail)}));
}
type InsightInput = {sessionId:string;at:string;currentSets:LocalSet[];historySets:LocalSet[];sessions:LocalSession[];seed:number};
function comparisons(args:InsightInput): Array<{current:Group;previous:Group}> {
  const at=Date.parse(args.at);
  const order=new Map(args.sessions.filter(s=>s.id!==args.sessionId && !!s.finishedAt
    && (Date.parse(s.finishedAt)<at || Date.parse(s.finishedAt)===at && s.id<args.sessionId))
    .sort((a,b)=>Date.parse(b.finishedAt!)-Date.parse(a.finishedAt!)||b.id.localeCompare(a.id))
    .map((s,i)=>[s.id,i]));
  const earlier=groups(args.historySets);
  return groups(args.currentSets).filter(g=>g.sessionId===args.sessionId && g.valid && g.consistent).flatMap(current=>{
    const previous=earlier.filter(p=>p.exerciseId===current.exerciseId && p.key===current.key
      && p.side===current.side && p.unit===current.unit && p.measurement===current.measurement && order.has(p.sessionId))
      .sort((a,b)=>order.get(a.sessionId)!-order.get(b.sessionId)!)[0];
    return previous?.valid && previous.consistent && previous.count===current.count ? [{current,previous}] : [];
  });
}
export function hasRepeatedPerformance(args:InsightInput): boolean {
  return comparisons(args).some(({current,previous})=>current.reps===previous.reps
    && current.load===previous.load && current.secondLoad===previous.secondLoad);
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
    'I %n%s gjorde du totalt %v repetitioner utöver de registrerade målen, utan lättare belastning än planerat.',
    'Dagens repetitionsmål i %n%s passerades med totalt %v repetitioner, utan att göra belastningen lättare.',
    '%n%s: totalt %v repetitioner fler än registrerade mål, med minst lika krävande belastning som planerat.',
    'Du genomförde totalt %v repetitioner över målen i %n%s, utan lättare belastning än planerat.',
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
export function workoutPerformanceInsight(args: InsightInput): PerformanceInsight | null {
  const currentSets=args.currentSets.filter(s=>s.sessionId===args.sessionId);
  if(!currentSets.some(s=>!s.deleted && s.kind==='work' && (s.detail
    ?s.detail.performances.some(p=>p.status==='done'):s.status==='done')))return null;
  const candidates: Array<PerformanceInsight & { priority: number }> = [];
  for (const {current,previous} of comparisons(args)) {
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
  const overTargets = new Map<string,{exerciseId:ExerciseId;side:PerformanceSide;extra:number;valid:boolean}>();
  for (const set of currentSets) {
    if (set.deleted || set.kind !== 'work' || !set.detail) continue;
    const detail=set.detail;
    for (const side of requiredSides(detail.configuration)) {
      const p=detail.performances.find(p=>p.side===side);
      const key=JSON.stringify([set.exerciseId,p?.comparisonKey??comparisonKey(set.exerciseId,detail.configuration),side]);
      const value=overTargets.get(key)??{exerciseId:set.exerciseId,side,extra:0,valid:true};
      overTargets.set(key,value);
      const planned=detail.plannedSides?.[side];
      const goal=planned?planned.reps:set.targetReps;
      const load=planned?(planned.grams===null?null:planned.grams/1000)
        :detail.targetLoadValue!==undefined?detail.targetLoadValue:set.targetGrams===null?null:set.targetGrams/1000;
      const second=planned?planned.secondLoad:detail.targetSecondLoadValue??null;
      const enough=(actual:number|null,target:number|null)=>actual!==null && target!==null
        && validNumber(target) && (p?.equipment.measurement==='bodyweight_assistance'?actual<=target:actual>=target);
      if(!p || p.status!=='done' || !validPerformance(p) || !validReps(goal)
        || (p.equipment.measurement!=='bodyweight' && !enough(p.loadValue,load))
        || (p.equipment.basis==='independent' && !enough(p.secondLoadValue,second))){value.valid=false;continue;}
      value.extra+=p.repetitions!-goal;
    }
  }
  for (const target of overTargets.values()) if (target.valid && target.extra > 0)
    candidates.push({kind:'target',priority:50 + target.extra,exerciseId:target.exerciseId,
      difference:target.extra,text:render('target',args.seed,target.exerciseId,target.extra,target.side)});
  const latest = Date.parse(args.at);
  if (Number.isFinite(latest)) {
    const twoWeeks = 14 * 86400000;
    const work=[...currentSets,...args.historySets];
    const recent = new Set(args.sessions.filter(s => {
      const finished = Date.parse(s.finishedAt ?? '');
      return s.status === 'completed'
        && Number.isFinite(finished) && finished <= latest && latest - finished <= twoWeeks
        && work.some(x => x.sessionId === s.id && !x.deleted && x.kind === 'work'
          && (x.detail?x.detail.performances.some(p=>p.status==='done'):x.status==='done'));
    }).map(s => s.id));
    if (recent.size >= 3) candidates.push({kind:'consistency',priority:10,
      text:render('consistency',args.seed,undefined,recent.size)});
  }
  candidates.sort((a,b) => b.priority - a.priority || a.text.localeCompare(b.text));
  return candidates[0] ?? null;
}
