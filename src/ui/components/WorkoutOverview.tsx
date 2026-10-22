import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { exercise, type ExerciseId } from '../../domain/catalog';
import { addSet, previewSwap, swapCandidates, swapExercise } from '../../application/training';
import {
  addExercise,
  availableAdditions,
  beginPreparedSession,
  hasPerformed,
  moveExercise,
  removeRemainingExercise,
  removeRemainingSet,
  restorePlannedSet,
  workoutOrder,
} from '../../application/workout';
import type { Familiarity } from '../../domain/model';
import type { LocalSessionExercise } from '../../storage/db';
import { useServices } from '../services';
import { Banner, PageHeader, Sheet, ToastWithUndo } from './common';
import { PerformanceRow, ExecutionControl } from './TrainingFlow';
import { PerformanceHistory } from './TrainingHistory';
import { SubstitutionSheet } from './SubstitutionSheet';

/** One persisted workout, used before its start and throughout training. */
export function WorkoutOverview() {
  const { id } = useParams();
  const { ctx, online } = useServices();
  const nav = useNavigate();
  const location = useLocation();
  const returnTo =
    typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith(`/pass/${id}?`)
      ? (location.state.returnTo as string)
      : `/pass/${id}`;
  const session = useLiveQuery(() => ctx.db.sessions.get(id!), [ctx, id]);
  const exs = useLiveQuery(
    async () =>
      workoutOrder(
        await ctx.db.sessionExercises.where('sessionId').equals(id!).toArray(),
        await ctx.db.workoutOrderEvents.where('sessionId').equals(id!).toArray(),
      ),
    [ctx, id],
  );
  const sets = useLiveQuery(() => ctx.db.sets.where('sessionId').equals(id!).toArray(), [ctx, id]);
  const profile = useLiveQuery(() => ctx.db.profile.get(ctx.userId), [ctx]);
  const [open, setOpen] = useState<string | null>(null);
  const [swap, setSwap] = useState<LocalSessionExercise | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const loadCandidates = useCallback(() => swapCandidates(ctx, swap!.id), [ctx, swap]);
  const preview = useCallback(
    (to: ExerciseId, o: { familiarity?: Familiarity; variantKey?: string }) => previewSwap(ctx, swap!.id, to, o),
    [ctx, swap],
  );
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(
        (e as { field?: string }).field === 'workout_needs_review'
          ? 'Dina begränsningar har ändrats. Byt eller ta bort den berörda övningen innan du startar.'
          : 'Kunde inte spara ändringen. Försök igen.',
      );
    }
  };
  if (!session || !exs || !sets)
    return (
      <p className="page" aria-busy="true">
        Hämtar passet…
      </p>
    );
  const prepared = session.status === 'preview';
  const editable = prepared || session.status === 'in_progress' || session.status === 'paused';
  const visible = exs.filter((e) => sets.some((s) => s.sessionExerciseId === e.id && !s.deleted));
  const work = sets.filter((s) => !s.deleted && s.kind === 'work');
  const current = visible.find((e) => work.some((s) => s.sessionExerciseId === e.id && s.status === 'planned')) ?? visible[0];
  const remove = (ids: string[]) => setRemoved(ids);
  return (
    <div className="page full stack workout-overview">
      <PageHeader title={prepared ? 'Ditt pass' : 'Hela passet'} back={() => nav(prepared ? '/' : returnTo)} />
      <p className="muted">
        {prepared ? 'Ändra fritt inför idag.' : 'Dina genomförda set finns kvar.'} {work.filter((s) => s.status === 'done').length}/
        {work.length} set klara.
      </p>
      <ol className="list stack" aria-label="Passöversikt">
        {visible.map((e, i) => {
          const rows = sets
            .filter((s) => s.sessionExerciseId === e.id && !s.deleted && s.kind === 'work')
            .sort((a, b) => a.ordinal - b.ordinal);
          const remaining = rows.some((s) => s.status !== 'done' && !s.detail?.aborted);
          return (
            <li key={e.id} className="card stack workout-card" data-mode={e.mode}>
              <div className="row spread">
                <button
                  className="btn ghost grow workout-title"
                  type="button"
                  aria-expanded={open === e.id}
                  onClick={() => setOpen(open === e.id ? null : e.id)}
                >
                  <span>
                    <strong>{exercise(e.exerciseId).nameSv}</strong>
                    <span className="block-text small muted">
                      {rows.filter((s) => s.status === 'done').length}/{rows.length} set klara
                    </span>
                  </span>
                </button>
                {editable && remaining && (
                  <button className="btn" type="button" onClick={() => setSwap(e)} aria-label={`Byt ${exercise(e.exerciseId).nameSv}`}>
                    Byt
                  </button>
                )}
              </div>
              {open === e.id && (
                <div className="stack">
                  <ul className="list set-list">
                    {rows.map((s) => (
                      <li key={s.id}>
                        <ul className="list">
                          <PerformanceRow set={s} instance={e} sessionSets={sets} online={online} planning onSaved={() => {}} />
                        </ul>
                        {editable && !hasPerformed(s) && (
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              void act(async () => {
                                await removeRemainingSet(ctx, s.id);
                                remove([s.id]);
                              })
                            }
                          >
                            Ta bort set {s.ordinal}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <>
                      <button className="btn" type="button" onClick={() => void act(() => addSet(ctx, e.id))}>
                        Lägg till set
                      </button>
                      <ExecutionControl instance={e} />
                    </>
                  )}
                  {editable && remaining && (
                    <div className="row wrap">
                      <button
                        type="button"
                        className="btn"
                        disabled={i === 0}
                        onClick={() => void act(() => moveExercise(ctx, e.id, visible[i - 1].id))}
                        aria-label={`Flytta ${exercise(e.exerciseId).nameSv} upp`}
                      >
                        ↑ Upp
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={i === visible.length - 1}
                        onClick={() => void act(() => moveExercise(ctx, e.id, visible[i + 2]?.id ?? null))}
                        aria-label={`Flytta ${exercise(e.exerciseId).nameSv} ned`}
                      >
                        ↓ Ned
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => void act(async () => remove(await removeRemainingExercise(ctx, e.id)))}
                      >
                        Ta bort återstående
                      </button>
                    </div>
                  )}
                  {!prepared && editable && (
                    <button type="button" className="btn primary" onClick={() => nav(`/pass/${id}?ovning=${e.id}`)}>
                      Till övningen
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {sets.some((s) => !s.deleted && hasPerformed(s) && !exs.some((e) => e.id === s.sessionExerciseId)) && (
        <details>
          <summary>Genomfört före övningsbytet</summary>
          <ul className="list">
            {sets
              .filter((s) => !s.deleted && hasPerformed(s) && !exs.some((e) => e.id === s.sessionExerciseId))
              .map((s) => (
                <li key={s.id}>
                  <strong>{exercise(s.exerciseId).nameSv}</strong>
                  <PerformanceHistory set={s} />
                </li>
              ))}
          </ul>
        </details>
      )}
      {editable && (
        <button type="button" className="btn block" onClick={() => setAdding(true)}>
          Lägg till övning
        </button>
      )}
      {error && <Banner kind="danger">{error}</Banner>}
      {editable && (
        <div className="bottom-cta">
          <button
            type="button"
            className="btn primary big block"
            disabled={busy || !work.length}
            onClick={async () => {
              setBusy(true);
              await act(async () => {
                if (prepared) await beginPreparedSession(ctx, id!);
                nav(!prepared && location.state?.returnTo ? returnTo : `/pass/${id}${current ? `?ovning=${current.id}` : ''}`);
              });
              setBusy(false);
            }}
          >
            {prepared ? 'Starta passet' : 'Fortsätt träna'}
          </button>
        </div>
      )}
      {swap && profile && (
        <SubstitutionSheet
          from={swap.snapshot}
          goals={profile.goals}
          loadCandidates={loadCandidates}
          preview={preview}
          onClose={() => setSwap(null)}
          onConfirm={async (to, o) => {
            await swapExercise(ctx, swap.id, to, o);
            setSwap(null);
          }}
        />
      )}
      {adding && (
        <AddExercise
          sessionId={id!}
          onClose={() => setAdding(false)}
          onAdded={(e) => {
            setAdding(false);
            setOpen(e.id);
          }}
        />
      )}
      {removed.length > 0 && (
        <ToastWithUndo
          message="Återstående träning borttagen"
          onDone={() => setRemoved([])}
          onUndo={() =>
            void act(async () => {
              for (const sid of removed) await restorePlannedSet(ctx, sid);
              setRemoved([]);
            })
          }
        />
      )}
    </div>
  );
}

export function AddExercise({
  sessionId,
  onClose,
  onAdded,
}: {
  sessionId: string;
  onClose: () => void;
  onAdded: (e: LocalSessionExercise) => void;
}) {
  const { ctx } = useServices();
  const [list, setList] = useState<Awaited<ReturnType<typeof availableAdditions>> | null>(null);
  const [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void availableAdditions(ctx, sessionId)
      .then((x) => {
        if (alive) setList(x);
      })
      .catch(() => setError('Kunde inte hämta övningar.'));
    return () => {
      alive = false;
    };
  }, [ctx, sessionId]);
  return (
    <Sheet title="Lägg till övning" onClose={onClose}>
      <div className="stack">
        <label className="field">
          Sök övning
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        {!list ? (
          <p aria-busy="true">Hämtar övningar…</p>
        ) : (
          <ul className="list sub-list">
            {list
              .filter((x) => exercise(x.exerciseId).nameSv.toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')))
              .map((x) => (
                <li key={x.exerciseId}>
                  <button
                    type="button"
                    className="sub-option"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        onAdded(await addExercise(ctx, sessionId, x.exerciseId));
                      } catch {
                        setError('Kunde inte lägga till övningen.');
                        setBusy(false);
                      }
                    }}
                  >
                    {exercise(x.exerciseId).nameSv}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
