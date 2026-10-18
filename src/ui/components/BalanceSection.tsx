/**
 * ÄA-BAL-001 "Balans" under Utveckling: lugn, sammanfällbar sektion. Visar beskrivande fördelning, försiktiga
 * styrkejämförelser och befintlig belastningsstatus. Högst ett frivilligt förslag; förhandsvisning sparar inget.
 * Att öppna/stänga sektionen är sidoeffektsfritt (ingen revision, ingen omplanering).
 */
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { exercise } from '../../domain/catalog';
import { MAIN_PATTERNS, PATTERN_SV, type BalanceOverview, type BalancePatternSummary } from '../../domain/balance';
import { acceptBalanceAdjustment, dismissBalanceSuggestion, getBalanceOverview, previewBalanceAdjustment, type AdjustmentPreview } from '../../application/balance';
import { latestRevision } from '../../application/trainingPlan';
import { FLAGS, useServices } from '../services';
import { BAL, TEMPLATE_SV } from '../strings';
import { Banner, Expandable, Icon } from './common';

const store = {
  get: () => {
    try {
      return sessionStorage.getItem('balance.open') === '1';
    } catch {
      return false;
    }
  },
  set: (v: boolean) => {
    try {
      sessionStorage.setItem('balance.open', v ? '1' : '0');
    } catch {
      /* lagring kan saknas */
    }
  },
};

const dateSv = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][m - 1]} ${y}`;
};

export function BalanceSection() {
  const { ctx, online } = useServices();
  const id = useId();
  const [open, setOpen] = useState(store.get);
  const key = useLiveQuery(async () => {
    const sets = await ctx.db.sets.toArray();
    const latestSet = sets.reduce((m, s) => (s.updatedAt > m ? s.updatedAt : m), '');
    return [sets.length, latestSet, await ctx.db.sessions.count(), (await ctx.db.balanceDecisions.toArray()).map((d) => `${d.id}:${d.status}`).join(), await ctx.db.restrictions.count(), await ctx.db.symptoms.count(), await ctx.db.planRevisions.count(), JSON.stringify((await ctx.db.profile.get(ctx.userId)) ?? {})].join('|');
  }, [ctx]);
  const [o, setO] = useState<BalanceOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    void getBalanceOverview(ctx)
      .then((r) => alive && (setO(r), setError(false)))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [ctx, key]);

  if (!FLAGS.balance) return null;
  const toggle = () => {
    setOpen(!open);
    store.set(!open);
  };
  return (
    <section className="card stack balance" aria-labelledby={`${id}-h`}>
      <button type="button" className="balance-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle}>
        <span className="balance-head-text">
          <span id={`${id}-h`} className="balance-title">
            {BAL.TITLE}
          </span>
          <span className="small muted">{BAL.SUBTITLE}</span>
          <span className="small">{error ? BAL.FAILED : o ? (o.hasData ? o.headlineSv : 'Se hur din träning är fördelad') : 'Hämtar…'}</span>
        </span>
        <Icon.Chevron className={`balance-chevron ${open ? 'is-open' : ''}`} />
      </button>
      <Expandable open={open && !!o} id={`${id}-body`}>
        {o && <div className="stack">
          <p className="small">{BAL.INTRO}</p>
          <Allsidighet o={o} />
          {!!o.partialWorkSets && <p className="small muted">Dessutom finns {o.partialWorkSets} ofullständiga arbetsset. Utförda sidprestationer finns kvar i historiken; diagrammets arbetsset räknar kompletta set.</p>}
          {!!o.sidePerformances && <p className="small muted">{o.sidePerformances} separata sidprestationer är registrerade i perioden. Ett komplett sidpar räknas som ett arbetsset.</p>}
          <Styrka o={o} />
          <Belastning o={o} />
          <NastaSteg o={o} online={online} />
          <p className="small muted">
            {BAL.FOOTNOTE} <Link to="/vetenskap#balans">{BAL.METHOD_LINK}</Link>
          </p>
        </div>}
      </Expandable>
    </section>
  );
}

function Allsidighet({ o }: { o: BalanceOverview }) {
  if (!o.hasData)
    return (
      <div className="stack">
        <h3 className="h-small">{BAL.A}</h3>
        <p>{BAL.EMPTY}</p>
      </div>
    );
  const main = o.summaries.filter((s) => (MAIN_PATTERNS as readonly string[]).includes(s.patternId));
  const extra = o.summaries.filter((s) => !(MAIN_PATTERNS as readonly string[]).includes(s.patternId) && s.actualWorkSets28d > 0);
  const max = Math.max(1, ...o.summaries.map((s) => s.actualWorkSets28d));
  const row = (s: BalancePatternSummary) => (
    <li key={s.patternId} className="balance-row">
      <span className="balance-name">{PATTERN_SV[s.patternId]}</span>
      <span className="balance-bar" aria-hidden="true">
        <span style={{ width: `${(100 * s.actualWorkSets28d) / max}%` }} />
      </span>
      <span className="small balance-text">
        {BAL.SETS(s.actualWorkSets28d)}
        {s.eligiblePlannedWorkSets !== null && s.eligiblePlannedWorkSets > 0 ? ` · ${BAL.PLANNED(s.matchedCompletedWorkSets ?? 0, s.eligiblePlannedWorkSets)}` : ''}
        {s.extraWorkSets28d > 0 ? ` · ${BAL.EXTRA(s.extraWorkSets28d)}` : ''}
      </span>
    </li>
  );
  const info = o.insights.filter((i) => i.kind !== 'optional_action');
  return (
    <div className="stack">
      <h3 className="h-small">{BAL.A}</h3>
      <p className="small muted">
        {BAL.A_WINDOW} ({dateSv(o.windowStartLocalDate)} – {dateSv(o.windowEndLocalDate)}). {BAL.A_METHOD}
      </p>
      <ul className="list balance-list" aria-label={BAL.A}>
        {main.map(row)}
        {extra.map(row)}
      </ul>
      <p className="small muted">{BAL.A_FOOT}</p>
      {info.length > 0 && (
        <ul className="list small">
          {info.map((i) => (
            <li key={`${i.reasonCode}|${i.textSv}`}>{i.textSv}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Styrka({ o }: { o: BalanceOverview }) {
  return (
    <div className="stack">
      <h3 className="h-small">{BAL.B}</h3>
      <ul className="list small">
        {o.progressComparisons.map((i) => (
          <li key={i.textSv}>{i.textSv}</li>
        ))}
      </ul>
      <p className="small muted">{BAL.B_NOTE}</p>
    </div>
  );
}

function Belastning({ o }: { o: BalanceOverview }) {
  const text = o.recoveryStatus === 'review_required' ? BAL.C_REVIEW : o.recoveryStatus === 'limited' ? BAL.C_LIMITED : BAL.C_NONE;
  return (
    <div className="stack">
      <h3 className="h-small">{BAL.C}</h3>
      <p className="small">
        {text} {o.recoveryStatus === 'review_required' ? BAL.C_CARE : ''}
      </p>
      {o.recoveryStatus !== 'no_block' && (
        <Link to="/profil/begransningar" className="small">
          {BAL.C_LINK}
        </Link>
      )}
    </div>
  );
}

function NastaSteg({ o, online }: { o: BalanceOverview; online: boolean }) {
  const { ctx } = useServices();
  const [preview, setPreview] = useState<AdjustmentPreview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const s = o.topSuggestion;
  useEffect(() => setPreview(null), [s?.candidateKey]);
  const showPreview = async () => {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      setPreview(await previewBalanceAdjustment(ctx, s.candidateKey, { basisKey: s.basisKey }));
    } catch (e) {
      setMsg((e as { field?: string }).field === 'BAL_CANDIDATE_CHANGED' ? BAL.CONFLICT : BAL.FAILED);
    } finally {
      setBusy(false);
    }
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setMsg(ok);
      setPreview(null);
    } catch (e) {
      setMsg((e as { field?: string }).field === 'PLAN_REVISION_CHANGED' || (e as { field?: string }).field === 'BAL_CANDIDATE_CHANGED' ? BAL.CONFLICT : BAL.FAILED);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack" aria-live="polite">
      <h3 className="h-small">{BAL.D}</h3>
      {msg && <Banner kind="info">{msg}</Banner>}
      {!s ? (
        <p className="small">{BAL.D_NONE}</p>
      ) : (
        <div className="stack">
          <p>{s.textSv}</p>
          {!preview ? (
            <div className="row wrap">
              <button type="button" className="btn primary grow" disabled={busy} onClick={() => void showPreview()}>
                {BAL.CTA}
              </button>
              <button type="button" className="btn grow" disabled={busy} onClick={() => void run(() => dismissBalanceSuggestion(ctx, s.candidateKey, crypto.randomUUID(), s.basisKey), BAL.DISMISSED)}>
                {BAL.NOT_NOW}
              </button>
            </div>
          ) : preview.status === 'none' ? (
            <div className="stack">
              <p>{preview.textSv}</p>
              <button type="button" className="btn" disabled={busy} onClick={() => void run(() => dismissBalanceSuggestion(ctx, s.candidateKey, crypto.randomUUID(), s.basisKey), BAL.DISMISSED)}>
                {BAL.NOT_NOW}
              </button>
            </div>
          ) : (
            <div className="card stack balance-preview">
              <p className="label">{BAL.PREVIEW_TITLE}</p>
              <ul className="list small">
                {preview.changes.map((c) => (
                  <li key={c.slotSequence}>
                    Pass {c.slotSequence} ({(TEMPLATE_SV[c.templateKey ?? ''] ?? 'Pass').replace(/^Pass /, '')}): {c.removed.map((x) => exercise(x).nameSv).join(', ')} → {c.added.map((x) => exercise(x).nameSv).join(', ')} · ca {c.minutesBefore} → {c.minutesAfter} min
                  </li>
                ))}
              </ul>
              {preview.calibrationNeeded && <p className="small">{BAL.PREVIEW_CAL}</p>}
              <p className="small muted">{BAL.PREVIEW_ENGINE}</p>
              {!FLAGS.balanceAdjustments && <p className="small">{BAL.ACCEPT_DISABLED}</p>}
              {!online && FLAGS.balanceAdjustments && <p className="small">{BAL.OFFLINE_ACCEPT}</p>}
              <div className="row wrap">
                {FLAGS.balanceAdjustments && (
                  <button type="button" className="btn primary grow" disabled={busy} onClick={() => void run(async () => acceptBalanceAdjustment(ctx, s.candidateKey, (await latestRevision(ctx))?.id ?? null, crypto.randomUUID()), BAL.ACCEPTED)}>
                    {BAL.ACCEPT}
                  </button>
                )}
                <button type="button" className="btn grow" disabled={busy} onClick={() => void run(() => dismissBalanceSuggestion(ctx, s.candidateKey, crypto.randomUUID(), s.basisKey), BAL.DISMISSED)}>
                  {BAL.KEEP}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
