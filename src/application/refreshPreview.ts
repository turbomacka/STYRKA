import type { AppContext } from './context';
import { outbox } from './context';
import { buildPlannerInput } from './plannerInput';
import { planRegular } from '../planner/planner';
import { comparisonKey } from '../domain/trainingFlow';
import { ENGINE_VERSION } from '../domain/decision_engine';
import { hashOf, uuidFromSeed } from '../domain/hash';
import type { PlannedExercise } from '../domain/model';
import type { LocalSessionExercise, LocalSet, StyrkaDB } from '../storage/db';
import { sessionExerciseRow } from '../server/mapping';
import { detailFor, displayOrder, initialConfiguration, mutateSet, plannedSetsFor, trainingTransaction } from './training';

const running = new WeakMap<StyrkaDB, Map<string, Promise<boolean>>>();

/** Refresh recommendations only before training. Keep session identity, edits and exercise order. */
export function refreshPreparedSession(ctx: AppContext, id: string): Promise<boolean> {
  let tasks = running.get(ctx.db);
  if (!tasks) { tasks = new Map(); running.set(ctx.db, tasks); }
  const current = tasks.get(id);
  if (current) return current;
  const task = refresh(ctx, id).finally(() => tasks!.delete(id));
  tasks.set(id, task);
  return task;
}

function edited(s: LocalSet, e: LocalSessionExercise): boolean {
  if (s.detail?.prescriptionOrigin?.userEditedSides.length) return true;
  if (s.detail?.plannedSides && !e.snapshot.sideTargets) return true;
  return s.targetGrams !== (e.snapshot.kg === null ? null : Math.round(e.snapshot.kg * 1000)) ||
    s.targetReps !== (e.snapshot.loadKind === 'duration_sec' ? null : e.snapshot.reps) || s.targetSeconds !== e.snapshot.targetSeconds;
}

const signature = (p: PlannedExercise) => JSON.stringify([p.kg,p.reps,p.sets,p.mode,p.bandMin,p.bandMax,p.engineVersion,p.reasons,p.sideTargets,p.doseContext,p.targetSeconds,p.calibration]);

async function refresh(ctx: AppContext, id: string): Promise<boolean> {
  const session = await ctx.db.sessions.get(id);
  if (!session || session.status !== 'preview' || session.kind !== 'planned') return false;
  const input = await buildPlannerInput(ctx.db, ctx.userId, ctx.clock.now(), session.plannedMinutes);
  const fresh = planRegular(input);
  // A different selected workout must never be silently replaced with another template.
  if (fresh.templateKey !== session.templateKey || fresh.rotationIndex !== session.rotationIndex) return false;
  const profile = await ctx.db.profile.get(ctx.userId);
  const exercises = displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(id).toArray());
  const before = await ctx.db.sets.where('sessionId').equals(id).toArray();
  if (before.some(s => s.status !== 'planned' || s.detail?.performances.length)) return false;
  const changes: Array<{ old: LocalSessionExercise; next: PlannedExercise; rows: LocalSet[] }> = [];
  const settings = await ctx.db.exerciseSettings.toArray();
  for (const old of exercises) {
    const changedInput = input.history.some(h => h.whenUtc > old.createdAt) || settings.some(s => s.updatedAt > old.createdAt);
    if (old.snapshot.engineVersion === ENGINE_VERSION && old.createdAt.slice(0,13) === ctx.clock.now().slice(0,13) && !changedInput) continue;
    const next = fresh.exercises.find(p => p.exerciseId === old.exerciseId && (p.variantKey ?? 'default') === old.variantKey);
    const rows = before.filter(s => s.sessionExerciseId === old.id);
    if (!next || !rows.some(s => !s.deleted && s.kind === 'work')) continue;
    const configuration = initialConfiguration(next, profile, id);
    if (old.configuration && comparisonKey(old.exerciseId,old.configuration) !== comparisonKey(next.exerciseId,configuration)) continue;
    if (signature(old.snapshot) !== signature(next)) changes.push({ old, next, rows });
  }
  if (!changes.length) return false;
  return trainingTransaction(ctx, async () => {
    if ((await ctx.db.sessions.get(id))?.status !== 'preview') return false;
    // A concurrent edit, recording or sync wins over the proposal computed above.
    if (JSON.stringify(await ctx.db.sets.where('sessionId').equals(id).toArray()) !== JSON.stringify(before)) return false;
    for (const {old} of changes) if ((await ctx.db.sessionExercises.get(old.id))?.replacedById) return false;
    const now = ctx.clock.now();
    for (const {old,next,rows} of changes) {
      const work = rows.filter(s => s.kind === 'work');
      const keepCount = work.length !== old.snapshot.sets || work.some(s => s.deleted || edited(s,old));
      const ne: LocalSessionExercise = {...old,id:uuidFromSeed(`refresh|${old.id}|${hashOf(next)}`),createdAt:now,syncState:'queued',replacesId:old.id,replacedById:null,
        mode:next.mode,bandMin:next.bandMin,bandMax:next.bandMax,targetSets:next.sets,
        snapshot:{...next,refreshOfSessionExerciseId:old.id},configuration:old.configuration??initialConfiguration(next,profile,id)};
      let replacements = plannedSetsFor(ctx,id,ne,now,{deterministic:true});
      if (keepCount) replacements = work.map(s => ({...plannedSetsFor(ctx,id,{...ne,snapshot:{...ne.snapshot,sets:1}},now)[0],id:uuidFromSeed(`${ne.id}|set|${s.ordinal}|work`),ordinal:s.ordinal,deleted:s.deleted}));
      replacements = replacements.map(s => {
        const previous = work.find(w => w.ordinal === s.ordinal);
        if (!previous || !edited(previous,old)) return s;
        const detail = detailFor(s,ne);
        const saved = previous.detail;
        detail.prescriptionOrigin!.userEditedSides = saved?.prescriptionOrigin?.userEditedSides.length ? [...saved.prescriptionOrigin.userEditedSides] : ['both'];
        const sides=detail.prescriptionOrigin!.userEditedSides;
        if (!sides.includes('both') && saved?.plannedSides) {
          const plannedSides={...detail.plannedSides};
          for(const side of sides) if(saved.plannedSides[side]) plannedSides[side]=structuredClone(saved.plannedSides[side]);
          return {...s,detail:{...detail,plannedSides}};
        }
        return {...s,targetGrams:previous.targetGrams,targetReps:previous.targetReps,targetSeconds:previous.targetSeconds,
          detail:{...detail,targetLoadValue:saved?.targetLoadValue ?? (previous.targetGrams===null?null:previous.targetGrams/1000),
            targetSecondLoadValue:saved?.targetSecondLoadValue,plannedSides:structuredClone(saved?.plannedSides)}};
      });
      // Explicit warmup edits are kept; automatic warmups are generated from the new work dose.
      const warmups = rows.filter(s => s.kind === 'warmup' && !s.detail?.warmupProposal?.managed).map(s => ({...s,id:uuidFromSeed(`${ne.id}|warmup|${s.ordinal}`),sessionExerciseId:ne.id,serverRevision:null,createQueued:false,syncState:'local' as const,updatedAt:now}));
      await ctx.db.sessionExercises.put({...old,replacedById:ne.id});
      await ctx.db.sessionExercises.add(ne);
      await ctx.db.outbox.add(outbox(ctx,ne.id,{type:'upsert',table:'session_exercises',row:sessionExerciseRow(ctx.userId,ne),immutable:true}));
      for (const s of rows.filter(s => !s.deleted)) await mutateSet(ctx,s.id,x=>({...x,deleted:true}));
      for (const s of [...replacements,...warmups]) { await ctx.db.sets.add(s); await mutateSet(ctx,s.id,x=>x); }
    }
    return true;
  });
}
