import { buildPlannerInput } from './plannerInput';
import type { AppContext } from './context';
import { planRegular } from '../planner/planner';
import { exercise } from '../domain/catalog';
import { hashOf } from '../domain/hash';
import type { PlannedExercise } from '../domain/model';

const signature = (e: PlannedExercise) => JSON.stringify([e.kg,e.reps,e.sets,e.targetSeconds,e.targetLoadValue,e.targetSecondLoadValue,e.mode,e.state]);
export type ReplanningFeedback = { version: string; inputsHash: string; before: PlannedExercise[]; after: PlannedExercise[]; messages: string[] };
/** Counterfactual comparison: same clock, rotation, settings and rules, with/without this session.
 * This isolates recorded training from simply advancing to a different template.
 */
export async function compareSessionRecommendations(ctx: AppContext, sessionId: string): Promise<ReplanningFeedback> {
  const input = await buildPlannerInput(ctx.db,ctx.userId,ctx.clock.now());
  const baseline = { ...input, history: input.history.filter((h) => h.sessionId !== sessionId) };
  const before = planRegular(baseline).exercises, after = planRegular(input).exercises;
  const messages: string[] = [], unchanged: string[] = [];
  for (const e of after) {
    const prev = before.find((p) => p.exerciseId === e.exerciseId && (p.variantKey ?? 'default') === (e.variantKey ?? 'default'));
    const name = exercise(e.exerciseId).nameSv;
    if (!prev) { messages.push(name + ' ingår i det omräknade nästa passet.'); continue; }
    if (signature(e) === signature(prev)) { unchanged.push(name); continue; }
    if (e.kg !== null && prev.kg !== null && e.kg !== prev.kg)
      messages.push(name + ': viktförslaget ändras från ' + prev.kg.toLocaleString('sv-SE') + ' till ' + e.kg.toLocaleString('sv-SE') + (e.loadKind === 'assistance_kg' ? ' kg assistans.' : e.loadBasis === 'per_hand_kg' ? ' kg per hantel.' : ' kg.'));
    else if (e.reps !== prev.reps) messages.push(name + ': repetitionsmålet ändras från ' + prev.reps + ' till ' + e.reps + '.');
    else if (e.targetSeconds !== prev.targetSeconds) messages.push(name + ': tidsmålet har uppdaterats till ' + (e.targetSeconds ?? 'kalibrering') + ' sekunder.');
    else messages.push(name + ': set, träningsnivå eller belastningsförslag har uppdaterats enligt dina träningsregler.');
  }
  for(const prev of before)if(!after.some(e=>e.exerciseId===prev.exerciseId && (e.variantKey??'default')===(prev.variantKey??'default'))) messages.push(exercise(prev.exerciseId).nameSv+' ingår inte i det omräknade nästa passet.');
  if(unchanged.length)messages.push('Oförändrade förslag: '+unchanged.join(', ')+'. Passets registrering ändrar inte dessa förslag med nuvarande träningsregler.');
  const extra = input.history.filter((h) => h.sessionId === sessionId).some((h) =>
    h.plan.substitutionReason === 'USER_ADDED' || h.sets.filter((s) => s.kind === 'work' && s.status === 'done').length > h.plan.sets);
  if (extra) messages.unshift('Dina extra arbetsset ingår i underlaget för belastning och återhämtning.');
  if (!messages.length) messages.push('Inget nästa pass kunde föreslås med dina aktuella begränsningar.');
  const result = { version: 'REPLAN-FEEDBACK/1.0.0', inputsHash: hashOf(input), before, after, messages };
  // Immutable comparison keyed by input hash; corrections produce another record.
  await ctx.db.meta.put({ key: 'replanning:' + sessionId + ':' + result.inputsHash, value: result });
  return result;
}
