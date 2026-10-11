import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Familiarity, PlanSnapshot } from '../../domain/model';
import type { ExerciseId } from '../../domain/catalog';
import { previewExtra, previewNext, previewReplacement, previewSwapCandidates, startSession, swapInPreview, type SwapOptions } from '../../application/training';
import { SubstitutionSheet } from '../components/SubstitutionSheet';
import { Banner, EmptyState, PageHeader, Stepper, Warnings } from '../components/common';
import { LiftCard } from '../components/widgets';
import { FLAGS, useServices } from '../services';
import { T, TEMPLATE_SV, reasonText } from '../strings';
import { exercise } from '../../domain/catalog';

export type PreviewState = { kind: 'extra'; minutes: number; readiness: 'good' | 'normal' | 'tired' | 'pain'; painAreas?: string[] } | null;

/** Viktförslag kan stängas av med feature flag utan att historik påverkas (04 §4). */
export function applyLoadFlag(p: PlanSnapshot): PlanSnapshot {
  if (FLAGS.loadRecommendationsEnabled) return p;
  return { ...p, exercises: p.exercises.map((e) => (e.reasons.includes('LOAD_RECOMMENDATIONS_DISABLED') ? e : { ...e, kg: null, calibrationSuggestionKg: null, calibration: e.loadKind === 'external_kg' || e.loadKind === 'assistance_kg', reasons: [...e.reasons, 'LOAD_RECOMMENDATIONS_DISABLED'] })) };
}

/** S07 Passförhandsvisning: ordning, set/reps/kg, tidsestimat, kort varför; ändra tid; starta. */
export function Preview() {
  const { ctx } = useServices();
  const nav = useNavigate();
  const loc = useLocation();
  const extra = (loc.state as PreviewState) ?? null;
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const [minutes, setMinutes] = useState<number | null>(extra?.minutes ?? null);
  const [plan, setPlan] = useState<PlanSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  // "Bara idag"-byten i förhandsvisningen återskapas om förslaget räknas om (t.ex. ny tid).
  const todaySwaps = useRef<Array<{ from: ExerciseId; to: ExerciseId; opts: SwapOptions }>>([]);

  useEffect(() => {
    if (minutes === null && profile) setMinutes(profile.minutesPerSession);
  }, [profile, minutes]);

  useEffect(() => {
    if (minutes === null) return;
    let alive = true;
    const p = extra ? previewExtra(ctx, { minutes, readiness: extra.readiness, painAreas: extra.painAreas as never }) : previewNext(ctx, minutes);
    p.then(async (x) => {
      let snap = x;
      for (const sw of todaySwaps.current) {
        const i = snap.exercises.findIndex((e) => e.exerciseId === sw.from);
        if (i < 0) continue;
        snap = await swapInPreview(ctx, snap, i, sw.to, sw.opts).catch(() => snap);
      }
      if (alive) setPlan(applyLoadFlag(snap));
    }).catch(() => alive && setErr('Kunde inte ta fram förslag.'));
    return () => {
      alive = false;
    };
  }, [ctx, minutes, extra]);

  async function start() {
    if (!plan) return;
    setBusy(true);
    setErr(null);
    try {
      const s = await startSession(ctx, plan);
      nav(`/pass/${s.id}`, { replace: true });
    } catch (e) {
      const code = (e as { code?: string }).code;
      setErr(code === 'INVALID_STATE' ? 'Du har redan ett pågående pass.' : code === 'LOCAL_SAVE_FAILED' ? 'Kunde inte spara på enheten. Kontrollera lagringsutrymmet och försök igen.' : 'Passet kunde inte startas.');
    } finally {
      setBusy(false);
    }
  }

  const showRir = profile?.experience !== 'novice';
  const swapFrom = plan && swapIdx !== null ? plan.exercises[swapIdx] : null;
  const loadCandidates = useCallback(() => previewSwapCandidates(ctx, plan!, swapIdx!), [ctx, plan, swapIdx]);
  const previewFor = useCallback((to: ExerciseId, o: { familiarity?: Familiarity; variantKey?: string }) => previewReplacement(ctx, plan!.exercises[swapIdx!], plan!.exercises.filter((_, i) => i !== swapIdx), to, o), [ctx, plan, swapIdx]);
  return (
    <div className="page full stack">
      <PageHeader title={extra ? 'Spontanpass' : TEMPLATE_SV[plan?.templateKey ?? ''] ?? T.TITLE_NEXT} back={() => nav(-1)} />
      {!FLAGS.loadRecommendationsEnabled && <Banner kind="info">Viktförslag är tillfälligt avstängda. Välj själv vikt för varje övning.</Banner>}
      {minutes !== null && <div className="card"><Stepper label="Tid för passet" value={minutes} min={15} max={120} step={5} onChange={setMinutes} format={(v) => `${v} min`} /></div>}
      {plan && (
        <>
          <p className="num muted">Uppskattad tid: cirka {Math.round(plan.estimatedMinutes)} min inklusive uppvärmning och vila.</p>
          <Warnings codes={plan.warnings} />
          {plan.exercises.length === 0 ? (
            <EmptyState title="Inget pass att föreslå">
              <p>{T.WARN_EMPTY}</p>
            </EmptyState>
          ) : (
            <ol className="list" style={{ display: 'grid', gap: 12 }} aria-label="Övningsordning">
              {plan.exercises.map((p, i) => (
                <LiftCard key={`${p.exerciseId}|${p.variantKey ?? ''}`} p={p} showRir={showRir} onSwap={FLAGS.substitutionV2 ? () => setSwapIdx(i) : undefined} />
              ))}
            </ol>
          )}
          {plan.removed.length > 0 && (
            <details>
              <summary>Därför saknas vissa övningar</summary>
              <ul className="list small">
                {plan.removed.map((r, i) => (
                  <li key={i}>
                    {exercise(r.exerciseId).nameSv}: {reasonText(r.reason)?.text ?? 'utesluten av regel eller tid'}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="small muted">{T.DISCLAIMER}</p>
        </>
      )}
      {err && <Banner kind="danger">{err}</Banner>}
      {swapFrom && profile && plan && (
        <SubstitutionSheet
          from={swapFrom}
          loadCandidates={loadCandidates}
          preview={previewFor}
          goals={profile.goals}
          onClose={() => setSwapIdx(null)}
          onConfirm={async (to: ExerciseId, o: SwapOptions) => {
            const original = (plan.substitutions ?? []).find((x) => x.replacementExerciseId === swapFrom.exerciseId)?.original.exerciseId ?? swapFrom.exerciseId;
            const next = await swapInPreview(ctx, plan, swapIdx!, to, o);
            // Ny tid räknar om förslaget: "Bara idag"-byten återskapas, "Använd framöver" finns redan i profilen.
            const { familiarity: _f, scope: _s, ...keep } = o;
            todaySwaps.current = [...todaySwaps.current.filter((x) => x.from !== original), ...((o.scope ?? 'today') === 'today' && to !== original ? [{ from: original, to, opts: keep }] : [])];
            setPlan(applyLoadFlag(next));
            setSwapIdx(null);
          }}
        />
      )}
      <div className="bottom-cta">
        <button type="button" className="btn primary block big" disabled={!plan || plan.exercises.length === 0 || busy} onClick={start}>
          Starta
        </button>
      </div>
    </div>
  );
}
