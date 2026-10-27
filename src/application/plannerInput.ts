/** Bygger planerarens indata från lokal, konsistent snapshot av användarens data (02 §10: offline-motor). */
import { exercise, type ExerciseId } from '../domain/catalog';
import type { HistorySet, PerformedExercise, PlannerInput, RestrictionRule, SymptomReport, UserExerciseSettings } from '../domain/model';
import { gramsToKg } from '../domain/units';
import type { LocalExerciseSettings, LocalProfile, StyrkaDB } from '../storage/db';
import { acceptedCatchUp } from './skipState';
import { resolveStrengthInputs } from '../domain/strengthInputs';
import { effectiveRir } from '../domain/effort';

const kg = (g: number | null) => (g === null ? null : gramsToKg(g));

export function toUserSettings(s: LocalExerciseSettings): UserExerciseSettings {
  const estimate =
    s.strengthInputs !== undefined ? resolveStrengthInputs(s.strengthInputs).estimate : s.estimateKind && s.estimateGrams !== null
      ? { kind: s.estimateKind, kg: gramsToKg(s.estimateGrams), reps: s.estimateReps ?? undefined, rir: s.estimateRir, measured: s.estimateMeasured, testedAt: s.estimateTestedAt ?? undefined }
      : null;
  return { exerciseId: s.exerciseId, experience: s.experience, incrementKg: kg(s.incrementGrams) ?? exercise(s.exerciseId).defaultIncrementKg, estimate, maxLoadKg: kg(s.maxLoadGrams), machineMinKg: kg(s.machineMinGrams), machineMaxKg: kg(s.machineMaxGrams) };
}

export async function activeHealthConsent(db: StyrkaDB, userId: string): Promise<boolean> {
  const c = await db.consents.get(userId);
  return !!c && !!c.grantedAt && !c.withdrawnAt;
}

/** All genomförd/pågående historik som PerformedExercise (utan raderade set). */
export async function buildHistory(db: StyrkaDB): Promise<PerformedExercise[]> {
  const sessions = (await db.sessions.toArray()).filter((s) => s.status !== 'preview');
  if (!sessions.length) return [];
  const bySession = new Map(sessions.map((s) => [s.id, s]));
  const exercises = await db.sessionExercises.where('sessionId').anyOf([...bySession.keys()]).toArray();
  const sets = await db.sets.where('sessionId').anyOf([...bySession.keys()]).toArray();
  const setsByEx = new Map<string, typeof sets>();
  for (const s of sets) {
    if (s.deleted) continue;
    const list = setsByEx.get(s.sessionExerciseId) ?? [];
    list.push(s);
    setsByEx.set(s.sessionExerciseId, list);
  }
  const out: PerformedExercise[] = [];
  for (const e of exercises) {
    const sess = bySession.get(e.sessionId)!;
    const own = (setsByEx.get(e.id) ?? []).sort((a, b) => a.ordinal - b.ordinal);
    const hs: HistorySet[] = own.map((s) => ({
      ...(s.detail ? { detail: s.detail } : {}),
      provenance: {
        original: s.detail?.prescriptionOrigin?.original ?? {
          loadValue: e.snapshot.targetLoadValue ?? e.snapshot.kg,
          secondLoadValue: e.snapshot.targetSecondLoadValue ?? null,
          reps: e.snapshot.loadKind === 'duration_sec' ? null : e.snapshot.reps,
          seconds: e.snapshot.targetSeconds,
        },
        source: s.detail?.prescriptionOrigin?.userEditedSides.length ? 'user' : s.detail?.prescriptionOrigin?.source ?? 'unknown',
        role: s.detail?.prescriptionOrigin?.role ?? (s.ordinal > e.snapshot.sets ? 'extra' : 'ordinary'),
      },
      kind: s.kind,
      status: s.status,
      plannedKg: kg(s.targetGrams),
      actualKg: kg(s.actualGrams),
      plannedReps: s.targetReps,
      actualReps: s.actualReps,
      plannedSeconds: s.targetSeconds,
      actualSeconds: s.actualSeconds,
      rir: effectiveRir(s.rir, s.perceivedEffort),
      technique: s.technique,
      occurredAt: s.occurredAt ? new Date(s.occurredAt).toISOString() : null,
      // Endast när svar finns, så att indata (och inputsHash) är oförändrade för befintlig historik.
      ...(s.perceivedEffort ? { perceivedEffort: s.perceivedEffort } : {}),
    }));
    const doneTimes = own.filter((s) => s.kind === 'work' && ['done','partial'].includes(s.status) && s.occurredAt).map((s) => new Date(s.occurredAt!).toISOString());
    if (!doneTimes.length) continue;
    const whenUtc = doneTimes.sort().at(-1)!;
    out.push({ sessionId: sess.id, sessionKind: sess.kind, sessionStatus: sess.status, exerciseId: e.exerciseId, plan: e.snapshot, sets: hs, whenUtc });
  }
  return out;
}

export async function buildPlannerInput(db: StyrkaDB, userId: string, nowUtc: string, minutes?: number): Promise<PlannerInput> {
  const profile = await db.profile.get(userId);
  if (!profile) throw new Error('PROFILE_MISSING');
  const program = (await db.programs.where('active').equals(1).toArray())[0];
  const consent = await activeHealthConsent(db, userId);
  const restrictions: RestrictionRule[] = (await db.restrictions.toArray())
    .map((r) => ({ id: r.id, kind: r.kind, exerciseA: r.exerciseA, exerciseB: r.exerciseB, area: r.area, side: r.side, maxSets: r.maxSets, maxMode: r.maxMode, active: r.active, description: r.description }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const symptoms: SymptomReport[] = consent
    ? (await db.symptoms.toArray()).map((s) => ({ id: s.id, sessionId: s.sessionId, area: s.area, side: s.side, reaction: s.reaction, reportedAt: s.reportedAt, resolvedAt: s.resolvedAt })).sort((a, b) => a.id.localeCompare(b.id))
    : [];
  const settings = (await db.exerciseSettings.toArray()).map(toUserSettings).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
  const history = (await buildHistory(db)).sort((a, b) => a.whenUtc.localeCompare(b.whenUtc) || a.sessionId.localeCompare(b.sessionId) || a.exerciseId.localeCompare(b.exerciseId));
  const catchUp = await acceptedCatchUp(db, program?.id ?? null, program?.rotationIndex ?? 0);
  return {
    ...(catchUp ? { catchUp } : {}),
    nowUtc,
    profile: plannerProfile(profile),
    exerciseSettings: settings,
    restrictions,
    symptoms,
    history,
    rotationIndex: program?.rotationIndex ?? 0,
    minutes: minutes ?? profile.minutesPerSession,
  };
}

export function plannerProfile(p: LocalProfile): PlannerInput['profile'] {
  return {
    ...(p.trainingPreferences ? { trainingPreferences: p.trainingPreferences } : {}),
    plannedSessionsPerWeek: p.plannedSessionsPerWeek,
    minutesPerSession: p.minutesPerSession,
    experience: p.experience,
    goals: p.goals,
    equipment: [...p.equipment].sort(),
    substitutions: p.substitutions,
    favorites: [...p.favorites].sort() as ExerciseId[],
    bodyweightKg: kg(p.bodyweightGrams),
    ...(p.equipmentProfiles && Object.keys(p.equipmentProfiles).length ? { equipmentProfiles: p.equipmentProfiles } : {}),
  };
}
