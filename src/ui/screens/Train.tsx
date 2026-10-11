import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExerciseId } from '../../domain/catalog';
import { exercise } from '../../domain/catalog';
import { formatKg } from '../../domain/units';
import { addSet, displayOrder, editSet, logSet, pauseSession, previewSwap, rateSet, resumeSession, swapCandidates, swapExercise, swapExerciseLegacy, undoSet, type SetValues, type SwapOptions } from '../../application/training';
import type { Familiarity } from '../../domain/model';
import { estimatedMinutesFor } from '../../planner/planner';
import { Banner, Icon, OfflineBanner, ReasonPopover, ToastWithUndo } from '../components/common';
import { SetRow } from '../components/SetRow';
import { SubstitutionSheet } from '../components/SubstitutionSheet';
import { ExerciseSwapSheet, RestTimer, prescriptionText, restSecondsFor } from '../components/widgets';
import { FLAGS, useServices } from '../services';
import { MODE_SV, SUB, T } from '../strings';

/** S08 Träna: helskärm, en övning i fokus, Pausa/Avsluta alltid synligt. */
export function Train() {
  const { id } = useParams();
  const { ctx, online } = useServices();
  const nav = useNavigate();
  const session = useLiveQuery(() => ctx.db.sessions.get(id!), [ctx, id]);
  // Ersättare visas på originalets plats (v2); tidigare byten (v1) hamnar sist som förut.
  const exs = useLiveQuery(async () => displayOrder(await ctx.db.sessionExercises.where('sessionId').equals(id!).toArray()), [ctx, id]);
  const sets = useLiveQuery(() => ctx.db.sets.where('sessionId').equals(id!).toArray(), [ctx, id]);
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const settings = useLiveQuery(() => ctx.db.exerciseSettings.toArray(), [ctx]);
  const restrictions = useLiveQuery(() => ctx.db.restrictions.toArray(), [ctx]);
  const [focus, setFocus] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [rest, setRest] = useState<{ seconds: number; key: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; setId: string } | null>(null);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [swap, setSwap] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const current = exs?.[Math.min(focus, (exs?.length ?? 1) - 1)];
  const currentId = current?.id;
  const currentExercise = current?.exerciseId;
  const machineProfiles = useLiveQuery(async () => (currentExercise ? [...new Set((await ctx.db.sessionExercises.where('exerciseId').equals(currentExercise).toArray()).map((e) => e.variantKey))] : []), [ctx, currentExercise]);
  const loadCandidates = useCallback(() => swapCandidates(ctx, currentId!), [ctx, currentId]);
  const previewFor = useCallback((to: ExerciseId, o: { familiarity?: Familiarity; variantKey?: string }) => previewSwap(ctx, currentId!, to, o), [ctx, currentId]);

  // "Senast": föregående resultat för övningen (utanför detta pass).
  useEffect(() => {
    if (!current) return;
    let alive = true;
    (async () => {
      const all = (await ctx.db.sets.where('exerciseId').equals(current.exerciseId).toArray()).filter((s) => s.sessionId !== id && s.status === 'done' && !s.deleted && s.kind === 'work' && s.occurredAt);
      all.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
      const last = all[0];
      if (!alive) return;
      if (!last) return setPrevious(null);
      const same = all.filter((s) => s.sessionId === last.sessionId).sort((a, b) => a.ordinal - b.ordinal);
      const lk = exercise(current.exerciseId).loadKind;
      setPrevious(`${new Date(last.occurredAt!).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}: ${same.map((s) => (lk === 'duration_sec' ? `${s.actualSeconds} s` : `${s.actualGrams !== null && lk !== 'reps_only' ? `${formatKg(s.actualGrams)}×` : ''}${s.actualReps}`)).join(', ')}`);
    })();
    return () => {
      alive = false;
    };
  }, [ctx, current, id]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [focus]);

  const say = useCallback((m: string) => {
    setAnnounce('');
    setTimeout(() => setAnnounce(m), 30);
  }, []);

  if (!session || !exs || !sets) return <p className="page" aria-busy="true">Laddar pass…</p>;
  if (!['in_progress', 'paused'].includes(session.status)) {
    return (
      <div className="page stack">
        <Banner kind="info">Passet är avslutat.</Banner>
        <button type="button" className="btn block" onClick={() => nav('/')}>
          Till Idag
        </button>
      </div>
    );
  }
  if (!current) return null;
  const lk = current.snapshot.loadKind;
  const mySets = sets.filter((s) => s.sessionExerciseId === current.id && !s.deleted).sort((a, b) => a.ordinal - b.ordinal);
  const allWork = sets.filter((s) => !s.deleted && s.kind === 'work' && exs.some((e) => e.id === s.sessionExerciseId));
  const doneCount = allWork.filter((s) => s.status === 'done').length;
  const stepGrams = Math.round(((settings?.find((s) => s.exerciseId === current.exerciseId)?.incrementGrams ?? null) ?? exercise(current.exerciseId).defaultIncrementKg * 1000));
  const showRir = profile?.experience !== 'novice';
  const paused = session.status === 'paused';
  const v2 = FLAGS.substitutionV2;
  const remainingMin = estimatedMinutesFor(exs.map((e) => ({ ...e.snapshot, sets: sets.filter((s) => s.sessionExerciseId === e.id && s.kind === 'work' && s.status === 'planned' && !s.deleted).length })));
  const swappedFrom = v2 && current.snapshot.substitution && current.snapshot.substitutionFrom ? current.snapshot.substitutionFrom : null;
  const perSide = exercise(current.exerciseId).unilateral && exercise(current.exerciseId).catalogSince === '2.0.0';
  const effortPrompt = v2 && current.snapshot.calibration && !showRir && (lk === 'external_kg' || lk === 'assistance_kg');

  const wrap = async (setId: string, label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setFailed((f) => {
        const n = new Set(f);
        n.delete(setId);
        return n;
      });
      say(label);
    } catch (e) {
      setFailed((f) => new Set(f).add(setId));
      say(T.WARN_UNSAVED);
      throw e;
    }
  };

  const blockedReason = (to: ExerciseId): string | null => {
    const r = restrictions?.find((x) => x.active && x.kind === 'block_exercise' && (x.exerciseA === to || (!x.exerciseA && x.area && exercise(to).areas.includes(x.area))));
    if (r) return 'Blockerad av din regel';
    if (exs.some((e) => e.exerciseId === to)) return 'Finns redan i passet';
    return null;
  };

  return (
    <div className="shell">
      <header className="train-head">
        <div className="grow">
          <div className="small muted num">
            Övning {focus + 1} av {exs.length} · {doneCount}/{allWork.length} set{v2 && remainingMin > 0 ? ` · cirka ${Math.round(remainingMin)} min kvar` : ''}
          </div>
          <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 22, margin: 0 }}>
            {exercise(current.exerciseId).nameSv}
          </h1>
        </div>
        <button type="button" className="btn" onClick={() => (paused ? resumeSession(ctx, session.id) : pauseSession(ctx, session.id))} aria-label={paused ? 'Återuppta pass' : 'Pausa pass'}>
          {paused ? 'Fortsätt' : <><Icon.Pause /> Pausa</>}
        </button>
        <button type="button" className="btn" onClick={() => nav(`/pass/${session.id}/avsluta`)}>
          Avsluta
        </button>
      </header>
      <main className="page full stack">
        <div aria-live="polite" className="visually-hidden">
          {announce}
        </div>
        <OfflineBanner online={online} />
        {paused && <Banner kind="info">Passet är pausat. Dina set är sparade.</Banner>}
        <div className="row wrap small">
          <span className="chip">{MODE_SV[current.mode]}</span>
          <span className="muted num">
            {T.INFO_RECOMMEND}: {prescriptionText(current.snapshot)}
          </span>
        </div>
        {swappedFrom && (
          <Banner kind="info">
            {SUB.SWAPPED(exercise(swappedFrom).nameSv, exercise(current.exerciseId).nameSv)}{' '}
            {current.snapshot.loadEstimationKind === 'population_prior_low_confidence' ? SUB.SWAPPED_PRIOR : current.snapshot.loadEstimationKind === 'none' ? SUB.SWAPPED_NONE : ''}
          </Banner>
        )}
        {current.snapshot.calibration && (
          <Banner kind="info">
            {T.WARN_CAL}
            {v2 && <span className="block-text">{SUB.CAL_INSTRUCTIONS}</span>}
          </Banner>
        )}
        {lk === 'assistance_kg' && <p className="small muted">Assistans: lägre siffra betyder tyngre för dig.</p>}
        {v2 && current.snapshot.loadBasis === 'per_hand_kg' && <p className="small muted">{SUB.PER_HAND}</p>}
        {v2 && perSide && <p className="small muted">{SUB.PER_SIDE}</p>}
        {previous && (
          <p className="small">
            <span className="label">{T.INFO_PREVIOUS}:</span> <span className="num">{previous}</span>
          </p>
        )}
        <ul className="card list" aria-label={`Set för ${exercise(current.exerciseId).nameSv}`}>
          {mySets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              displayNo={i + 1}
              loadKind={lk}
              loadBasis={current.snapshot.loadBasis}
              stepGrams={stepGrams}
              effortPrompt={effortPrompt && s.kind === 'work'}
              onRate={(e) => wrap(s.id, `${SUB.EFFORT[e]} sparat`, () => rateSet(ctx, s.id, e))}
              online={online}
              showRir={showRir}
              failed={failed.has(s.id)}
              onLog={(v: SetValues) =>
                wrap(s.id, `Set ${i + 1} ${online ? 'sparat' : 'sparat på enheten'}`, async () => {
                  await logSet(ctx, s.id, v);
                  setRest({ seconds: restSecondsFor(current.snapshot), key: Date.now() });
                  setToast({ msg: `Set ${i + 1} sparat`, setId: s.id });
                })
              }
              onEdit={(v: SetValues) => wrap(s.id, `Set ${i + 1} ändrat`, () => editSet(ctx, s.id, v))}
              onUndo={() => wrap(s.id, `Set ${i + 1} ångrat`, () => undoSet(ctx, s.id))}
            />
          ))}
        </ul>
        {rest && <RestTimer key={rest.key} seconds={rest.seconds} onClose={() => setRest(null)} />}
        <div className="row wrap">
          <button type="button" className="btn grow" onClick={() => addSet(ctx, current.id).catch(() => say('Kunde inte lägga till set'))}>
            <Icon.Plus /> Lägg till set
          </button>
          <button type="button" className="btn grow" onClick={() => setSwap(true)}>
            <Icon.Swap /> Byt övning
          </button>
        </div>
        <ReasonPopover reasons={current.snapshot.reasons} />
        <nav className="row" aria-label="Övningar">
          <button type="button" className="btn grow" disabled={focus === 0} onClick={() => setFocus(focus - 1)}>
            Föregående
          </button>
          {focus < exs.length - 1 ? (
            <button type="button" className="btn primary grow" onClick={() => setFocus(focus + 1)}>
              Nästa övning
            </button>
          ) : (
            <button type="button" className="btn primary grow" onClick={() => nav(`/pass/${session.id}/avsluta`)}>
              Avsluta passet
            </button>
          )}
        </nav>
        {exs.length > 1 && (
          <details>
            <summary>Alla övningar</summary>
            <ul className="list">
              {exs.map((e, i) => (
                <li key={e.id}>
                  <button type="button" className="btn ghost block" style={{ justifyContent: 'space-between' }} onClick={() => setFocus(i)} aria-current={i === focus ? 'step' : undefined}>
                    <span>{exercise(e.exerciseId).nameSv}</span>
                    <span className="num muted">
                      {sets.filter((s) => s.sessionExerciseId === e.id && s.status === 'done' && !s.deleted).length}/{e.snapshot.sets}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
      {toast && <ToastWithUndo message={toast.msg} onUndo={() => { const sid = toast.setId; setToast(null); void wrap(sid, 'Set ångrat', () => undoSet(ctx, sid)).catch(() => undefined); }} onDone={() => setToast(null)} />}
      {swap && profile && v2 && (
        <SubstitutionSheet
          from={current.snapshot}
          loadCandidates={loadCandidates}
          preview={previewFor}
          goals={profile.goals}
          machineProfiles={machineProfiles ?? []}
          onClose={() => setSwap(false)}
          onConfirm={async (to: ExerciseId, o: SwapOptions) => {
            await swapExercise(ctx, current.id, to, o);
            setSwap(false);
            say(to === current.exerciseId ? `Bytt maskin för ${exercise(to).nameSv}` : `Bytt till ${exercise(to).nameSv}`);
          }}
        />
      )}
      {swap && profile && !v2 && (
        <ExerciseSwapSheet
          current={current.exerciseId}
          equipment={profile.equipment}
          blocked={blockedReason}
          onClose={() => setSwap(false)}
          onPick={async (to) => {
            try {
              await swapExerciseLegacy(ctx, current.id, to);
              setSwap(false);
              say(`Bytt till ${exercise(to).nameSv}`);
            } catch (e) {
              const f = (e as { field?: string }).field;
              say(f === 'SYMPTOM_REVIEW_REQUIRED' ? 'Övningen belastar ett område med rapporterade besvär.' : f === 'PAIR_RULE' ? 'Bytet bryter din kombinationsregel.' : 'Bytet kunde inte göras.');
              setSwap(false);
            }
          }}
        />
      )}
    </div>
  );
}
