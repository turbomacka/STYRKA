import { compareSessionRecommendations, type ReplanningFeedback } from '../../application/replanningFeedback';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ALL_AREAS, AREA_LABEL_SV, exercise, type Area } from '../../domain/catalog';
import { SkipExercise } from '../components/SkipExercise';
import { refreshFuturePlan } from '../../application/trainingPlan';
import { savedWorkoutFeedback } from '../../application/workoutFeedback';
import type { Side, SymptomReaction } from '../../domain/model';
import { canOfferCountAsPlanned, countExtraAsPlanned, finishSession, reportSymptom } from '../../application/training';
import { Banner, PageHeader } from '../components/common';
import { useServices } from '../services';
import { REACTION_SV, SIDE_SV } from '../strings';

/** S11 Avsluta: summering, faktisk tid, valfritt symtom; completed/partial automatiskt, avbrott med val om loggade set. */
export function Finish() {
  const { id } = useParams();
  const { ctx } = useServices();
  const nav = useNavigate();
  const session = useLiveQuery(() => ctx.db.sessions.get(id!), [ctx, id]);
  const sets = useLiveQuery(() => ctx.db.sets.where('sessionId').equals(id!).toArray(), [ctx, id]);
  const exs = useLiveQuery(() => ctx.db.sessionExercises.where('sessionId').equals(id!).toArray(), [ctx, id]);
  const consent = useLiveQuery(async () => {
    const c = await ctx.db.consents.get(ctx.userId);
    return !!c?.grantedAt && !c.withdrawnAt;
  }, [ctx]);
  const [abandon, setAbandon] = useState(false);
  const [keep, setKeep] = useState(true);
  const [report, setReport] = useState(false);
  const [area, setArea] = useState<Area>('knee');
  const [side, setSide] = useState<Side>('not_applicable');
  const [reaction, setReaction] = useState<SymptomReaction>('transient');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | { status: string; offer: boolean; text: string }>(null);
  const saving=useRef(false),symptomSaved=useRef(false);
  const [calculating,setCalculating]=useState(false);
  const [steps, setSteps] = useState(0);
  const [comparison, setComparison] = useState<ReplanningFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && ['completed','partial','abandoned'].includes(session.status) && !done && !saving.current) {
      setDone({status:session.status,offer:session.kind==='extra'&&!session.countsAsPlannedAt,text:'Dina registrerade set är sparade.'});
      setErr('Passet finns sparat. Beräkna kommande rekommendationer från dina lokala data.');
    }
  }, [session, done]);

  if (!session || !sets || !exs) return <p className="page" aria-busy="true">Laddar…</p>;
  const active = exs.filter((e) => !e.replacedById);
  const planned = sets.filter((s)=>!s.deleted&&s.kind==='work').length;
  const doneSets = sets.filter((s) => s.status === 'done' && !s.deleted && s.kind === 'work').length;
  const partialSets = sets.filter((s) => s.status === 'partial' && !s.deleted && s.kind === 'work').length;
  const warmups = sets.filter((s) => s.status === 'done' && !s.deleted && s.kind === 'warmup').length;
  const minutes = session.startedAt ? Math.max(1, Math.round((Date.now() - Date.parse(session.startedAt)) / 60000)) : null;

  async function returnToPlan() {
    setCalculating(true);setErr(null);setDone((d)=>d ? {...d,offer:false}:d);
    try {
      setSteps(0);
      await refreshFuturePlan(ctx, { onProgress: (step) => setSteps(step === 'inputs' ? 1 : step === 'computed' ? 2 : 3) });
      setComparison(await compareSessionRecommendations(ctx, id!));
      setSteps(4);
    }
    catch { setErr('Träningen är sparad. Nästa pass kunde inte räknas fram just nu.'); }
    finally { setCalculating(false); }
  }
  async function save() {
    if(saving.current)return;saving.current=true;setBusy(true);setErr(null);
    try {
      // Report first: a failed symptom write must remain visible and retryable.
      if(report&&consent&&!symptomSaved.current){await reportSymptom(ctx,{sessionId:session!.id,area,side,reaction});symptomSaved.current=true;}
      const fin=await finishSession(ctx,session!.id,abandon?{status:'abandoned',keepLoggedSets:keep}:{});
      // The completed session is already committed even if feedback or planning fails.
      setDone({status:fin.status,offer:false,text:'Dina registrerade set är sparade.'});
      const feedback=await savedWorkoutFeedback(ctx,fin.id);
      const offer=fin.kind==='extra'?await canOfferCountAsPlanned(ctx,fin.id):false;
      setDone({status:fin.status,offer,text:feedback.text});
      if(!offer)await returnToPlan();
    } catch {
      const stored=await ctx.db.sessions.get(id!);
      if(stored&&['completed','partial','abandoned'].includes(stored.status)){
        setDone({status:stored.status,offer:stored.kind==='extra',text:'Dina registrerade set är sparade.'});
        setErr('Träningen är sparad. Nästa steg kunde inte förberedas. Försök igen.');
      } else setErr('Kunde inte spara. Dina registrerade set finns kvar. Försök igen.');
    } finally {setBusy(false);saving.current=false;}
  }
  if(done)return <div className="page stack">
    <h1>Passet är sparat</h1><p className="finish-feedback">{done.text}</p>
    <section aria-label="Omplanering" aria-busy={calculating}>
      <ol>{['Genomförd träning', 'Belastning och återhämtning', 'Kommande rekommendationer', 'Uppdaterad plan'].map((label,i) => <li key={label}>{steps > i ? '✓ ' : ''}{label}{calculating && steps === i ? ' …' : ''}</li>)}</ol>
      <p role="status">{calculating ? 'Beräknar från sparade träningsdata…' : comparison ? 'Beräkningen är klar.' : ''}</p>
    </section>
    {comparison && !calculating && <section className="card stack"><h2>Så påverkas nästa pass</h2><ul>{comparison.messages.map((text) => <li key={text}>{text}</li>)}</ul><p className="small muted">Jämförelsen visar nästa pass med och utan passets registrerade träning, vid samma tidpunkt. Förslagen kan ändras när du öppnar nästa pass.</p><button type="button" className="btn primary" onClick={() => nav(`/?klart=${id}`, { replace:true })}>Till planen</button></section>}
    {done.offer&&!calculating&&<div className="card stack"><p>Räkna spontanpasset som ditt ordinarie pass?</p><button type="button" className="btn primary" disabled={busy} onClick={async()=>{setBusy(true);try{await countExtraAsPlanned(ctx,id!);await returnToPlan();}catch{setErr('Passet är sparat. Kunde inte ändra hur det räknas.');}finally{setBusy(false);}}}>Räkna som ordinarie</button><button type="button" className="btn" onClick={()=>void returnToPlan()}>Behåll som spontanpass</button></div>}
    {err&&<><Banner kind="warn">{err}</Banner><button type="button" className="btn" disabled={calculating} onClick={()=>void returnToPlan()}>Försök beräkna igen</button><button type="button" className="btn" onClick={()=>nav(`/?klart=${id}`,{replace:true})}>Till planen</button></>}
  </div>;

  return (
    <div className="page full stack">
      <PageHeader title="Avsluta pass" back={() => nav(-1)} />
      <div className="card">
        <p className="big-num num">
          {doneSets}/{planned} set
        </p>
        <p className="muted num">{minutes !== null ? `Faktisk tid: cirka ${minutes} min` : ''}</p>
        <p>{doneSets >= planned ? 'Alla planerade set är gjorda.' : doneSets > 0 || partialSets > 0 ? 'Sparas som delvis genomfört – det räknas inte som misslyckande.' : 'Inga arbetsset registrerade.'}</p>
        {(partialSets > 0 || warmups > 0) && <p className="small">{partialSets} ofullständiga arbetsset · {warmups} uppvärmningsset. Registrerade sidprestationer sparas även i ofullständiga set.</p>}
      </div>
      <details><summary>Avbryta passet</summary><label className="check card">
        <input type="checkbox" checked={abandon} onChange={(e) => setAbandon(e.target.checked)} />
        <span>Avbryt passet i stället</span>
      </label></details>
      {active.filter((e) => !sets.some((s) => s.sessionExerciseId === e.id && !s.deleted && s.kind === 'work' && s.status === 'done')).length > 0 && <details className="card stack">
        <summary>Övningar du inte gjorde – ange orsak (valfritt)</summary>
        {active.filter((e) => !sets.some((s) => s.sessionExerciseId === e.id && !s.deleted && s.kind === 'work' && s.status === 'done')).map((e) => <SkipExercise key={e.id} exerciseId={e.id} name={exercise(e.exerciseId).nameSv} prompt />)}
      </details>}
      {abandon && doneSets > 0 && (
        <label className="check card">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>Behåll de {doneSets} set jag faktiskt gjorde i historiken</span>
        </label>
      )}
      {consent ? (
        <div className="card stack">
          <label className="check">
            <input type="checkbox" checked={report} onChange={(e) => setReport(e.target.checked)} />
            <span>Rapportera besvär efter passet (valfritt)</span>
          </label>
          {report && (
            <>
              <div className="field">
                <label htmlFor="sym-area">Område</label>
                <select id="sym-area" value={area} onChange={(e) => setArea(e.target.value as Area)}>
                  {ALL_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {AREA_LABEL_SV[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sym-side">Sida</label>
                <select id="sym-side" value={side} onChange={(e) => setSide(e.target.value as Side)}>
                  {(Object.keys(SIDE_SV) as Side[]).map((s) => (
                    <option key={s} value={s}>
                      {SIDE_SV[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sym-r">Hur känns det?</label>
                <select id="sym-r" value={reaction} onChange={(e) => setReaction(e.target.value as SymptomReaction)}>
                  {(Object.keys(REACTION_SV) as SymptomReaction[]).map((r) => (
                    <option key={r} value={r}>
                      {REACTION_SV[r]}
                    </option>
                  ))}
                </select>
              </div>
              {['persistent', 'limping', 'swelling'].includes(reaction) && <Banner kind="warn">Vi pausar automatisk belastningsökning för övningar som belastar området tills du själv markerar besväret som löst. Vid kvarstående eller återkommande besvär bör du kontakta vården.</Banner>}
            </>
          )}
        </div>
      ) : (
        <p className="small muted">Vill du kunna rapportera besvär efter pass? Ge samtycke under Profil → Begränsningar.</p>
      )}
      {err && <Banner kind="danger">{err}</Banner>}
      <div className="bottom-cta">
        <button type="button" className={`btn block big ${abandon ? 'danger' : 'primary'}`} disabled={busy} onClick={save}>
          {abandon ? 'Avbryt passet' : 'Avsluta och spara'}
        </button>
      </div>
    </div>
  );
}
