import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { exercise } from '../../domain/catalog';
import type { PlanSnapshot } from '../../domain/model';
import { activeSession, previewNext } from '../../application/training';
import { EmptyState, Icon, OfflineBanner, Warnings } from '../components/common';
import { prescriptionText } from '../components/widgets';
import { useServices } from '../services';
import { T, TEMPLATE_SV } from '../strings';

export function SyncLink() {
  const { syncStatus, online } = useServices();
  if (!syncStatus) return null;
  const { pending, conflicts, failed } = syncStatus;
  const needsLogin = syncStatus.state === 'auth_required';
  const label = needsLogin ? 'Logga in igen för att synka' : conflicts ? `${conflicts} konflikt${conflicts > 1 ? 'er' : ''}` : failed ? 'Synkfel' : pending ? (online ? `Synkar ${pending}` : `${pending} sparade lokalt`) : 'Synkat';
  const cls = needsLogin || conflicts || failed ? 'warn' : pending ? '' : 'ok';
  const I = needsLogin || conflicts || failed ? Icon.Alert : pending ? (online ? Icon.Sync : Icon.CloudOff) : Icon.Check;
  return (
    <Link to="/synk" className={`chip ${cls}`} aria-label={`Synkstatus: ${label}. Visa detaljer`} style={{ textDecoration: 'none' }}>
      <I /> {label}
    </Link>
  );
}

/** S06 Idag: en stark CTA (starta/fortsätt), sekundärt spontanpass, uppskattad tid och snabb övningslista. */
export function Today() {
  const { ctx, online } = useServices();
  const nav = useNavigate();
  const active = useLiveQuery(() => activeSession(ctx), [ctx]);
  const changeKey = useLiveQuery(async () => `${await ctx.db.sessions.count()}|${await ctx.db.restrictions.count()}|${await ctx.db.symptoms.count()}|${(await ctx.db.programs.toArray()).map((p) => p.rotationIndex).join()}|${(await ctx.db.profile.get(ctx.userId))?.revision}|${JSON.stringify((await ctx.db.profile.get(ctx.userId)) ?? {})}`, [ctx]);
  const [plan, setPlan] = useState<PlanSnapshot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    previewNext(ctx)
      .then((p) => alive && (setPlan(p), setError(false)))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [ctx, changeKey]);

  return (
    <div className="page stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Idag</h1>
        <SyncLink />
      </div>
      <OfflineBanner online={online} />
      {active ? (
        <div className="card hero stack">
          <p className="label">Pågående pass</p>
          <h2>{active.kind === 'extra' ? 'Spontanpass' : (TEMPLATE_SV[active.templateKey ?? ''] ?? T.TITLE_NEXT)}</h2>
          <p className="muted">{active.status === 'paused' ? 'Pausat' : 'Påbörjat'} {new Date(active.startedAt ?? '').toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}. Inget går förlorat om appen stängs.</p>
          <button type="button" className="btn primary block big" onClick={() => nav(`/pass/${active.id}`)}>
            Fortsätt passet
          </button>
        </div>
      ) : error ? (
        <EmptyState title="Kunde inte ta fram ett förslag">
          <p>Försök igen om en stund. Dina sparade uppgifter är kvar.</p>
        </EmptyState>
      ) : plan === null ? (
        <p aria-busy="true">Tar fram förslag…</p>
      ) : plan.exercises.length === 0 ? (
        <>
          <Warnings codes={plan.warnings} />
          <EmptyState title="Inget pass att föreslå i dag" action={<Link to="/profil/begransningar" className="btn block">Visa mina begränsningar</Link>}>
            <p>{T.WARN_EMPTY}</p>
          </EmptyState>
        </>
      ) : (
        <section className="card hero stack" aria-labelledby="next-title">
          <p className="label">{T.TITLE_NEXT}</p>
          <h2 id="next-title">{TEMPLATE_SV[plan.templateKey ?? ''] ?? 'Nästa pass'}</h2>
          <p className="num muted">Cirka {Math.round(plan.estimatedMinutes)} min · {plan.exercises.length} övningar</p>
          <ul className="list" aria-label="Övningar i passet">
            {plan.exercises.map((e) => (
              <li key={e.exerciseId} className="ex-line">
                <span>{exercise(e.exerciseId).nameSv}</span>
                <span className="num muted">{prescriptionText(e)}</span>
              </li>
            ))}
          </ul>
          <Warnings codes={plan.warnings} />
          <button type="button" className="btn primary block big" onClick={() => nav('/forhandsvisning')}>
            {T.CTA_START}
          </button>
        </section>
      )}
      {!active && (
        <button type="button" className="btn block" onClick={() => nav('/spontan')}>
          {T.CTA_EXTRA}
        </button>
      )}
      <p className="small muted">{T.DISCLAIMER}</p>
    </div>
  );
}
