import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Experience } from '../../domain/decision_engine';
import { ALL_EQUIPMENT, EQUIPMENT_LABEL_SV, exercise } from '../../domain/catalog';
import { completeOnboarding, GYM_STANDARD } from '../../application/profile';
import { INTRO_LIFTS, loadOnboardingDraft, saveOnboardingDraft, validIntroPage, type IntroPage, type IntroStrengthDraft, type OnboardingDraft } from '../../application/onboardingDraft';
import { readStrengthDrafts, STRENGTH_LABELS } from '../components/StrengthInputs';
import { IntroStrengthEntry } from '../components/IntroStrengthEntry';
import { LoadSourceChoice } from '../components/LoadSourceChoice';
import { Banner, Segmented, Stepper } from '../components/common';
import { ConsentPanel, RestrictionPicker } from '../components/widgets';
import { useServices } from '../services';
import { EXPERIENCE_SV } from '../strings';
import '../onboarding.css';

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { ctx } = useServices();
  const [draft, setDraft] = useState<OnboardingDraft>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadOnboardingDraft(ctx).then((d) => { if (active) { setDraft(d); setError(false); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [ctx, attempt]);
  if (!draft) return <main className="shell"><div className="page stack">{error ? <><Banner kind="danger">Kunde inte läsa ditt utkast. Dina uppgifter har inte ändrats.</Banner><button className="btn" onClick={() => setAttempt(attempt + 1)}>Försök igen</button></> : <p role="status">Öppnar introduktionen…</p>}</div></main>;
  return <IntroWizard key={ctx.userId} initial={draft} onDone={onDone} />;
}

function IntroWizard({ initial, onDone }: { initial: OnboardingDraft; onDone: () => void }) {
  const { ctx } = useServices();
  const [draft, setDraft] = useState(initial);
  const current = useRef(initial);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const lock = useRef(false);
  const [search, setSearch] = useSearchParams();
  const rawPage = search.get('intro');
  const page = validIntroPage(rawPage) ? rawPage : initial.page;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [customEquipment, setCustomEquipment] = useState(!GYM_STANDARD.every((e) => initial.equipment.includes(e)) || initial.equipment.length !== GYM_STANDARD.length);
  const heading = useRef<HTMLHeadingElement>(null);
  const today = ctx.clock.now().slice(0, 10);
  const entryPage = page.startsWith('entry-');
  const liftPage = page.startsWith('lift-') || entryPage;
  const liftIndex = liftPage ? Number(page.split('-')[1]) : 0;
  const lift = INTRO_LIFTS[liftIndex];
  const kind = entryPage ? page.split('-')[2] as IntroStrengthDraft['kind'] : null;
  const entry: IntroStrengthDraft | null = kind ? draft.entries[lift]?.[kind] ?? { kind, kg: '', reps: '', rir: '', testedAt: '', measured: false } : null;
  const chapter = page === 'training' ? 1 : page === 'equipment' ? 2 : page === 'adaptation' ? 4 : 3;
  const standardEquipment = GYM_STANDARD.every((e) => draft.equipment.includes(e)) && draft.equipment.length === GYM_STANDARD.length;

  useEffect(() => {
    if (!validIntroPage(rawPage)) setSearch({ intro: initial.page }, { replace: true });
  }, [initial.page, rawPage, setSearch]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);

  function persist(next: OnboardingDraft): Promise<void> {
    // Serialize typing and navigation: stale writes cannot overwrite newer fields.
    const task = writes.current.catch(() => undefined).then(() => saveOnboardingDraft(ctx, next));
    writes.current = task;
    task.catch(() => setError('Kunde inte spara på enheten. Behåll sidan öppen och försök igen.'));
    return task;
  }
  function change(patch: Partial<OnboardingDraft>) {
    const next = { ...current.current, ...patch, page };
    current.current = next; setDraft(next);
    void persist(next).catch(() => undefined);
  }
  async function go(nextPage: IntroPage, patch: Partial<OnboardingDraft> = {}) {
    const previousLocation = window.location.href;
    const next = { ...current.current, ...patch, page: nextPage };
    await persist(next);
    current.current = next; setDraft(next); setAttempted(false);
    // A browser back action during a pending disk write takes precedence over our navigation.
    if (window.location.href === previousLocation) setSearch({ intro: nextPage });
  }
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await fn(); } catch { setError('Kunde inte spara på enheten. Dina uppgifter finns kvar här. Försök igen.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function nextLift(): IntroPage { return liftIndex < 2 ? `lift-${liftIndex + 1}` : 'summary'; }
  async function saveEntry(addMore = false) {
    if (!entry || readStrengthDrafts([entry], today).error) {
      setAttempted(true);
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.intro-entry input[aria-invalid="true"]')?.focus());
      return;
    }
    const saved = [...(draft.saved[lift] ?? []).filter((d) => d.kind !== entry.kind), entry];
    await go(addMore ? `lift-${liftIndex}` : nextLift(), { saved: { ...draft.saved, [lift]: saved }, visited: [...new Set([...draft.visited, lift])] });
  }
  async function finish() {
    await persist(current.current);
    const strengthInputs = INTRO_LIFTS.map((exerciseId) => {
      const result = readStrengthDrafts(draft.saved[exerciseId] ?? [], today);
      if (result.error) throw new Error(result.error);
      return { exerciseId, inputs: result.inputs };
    });
    await completeOnboarding(ctx, { adultConfirmed: draft.adult, plannedSessionsPerWeek: draft.frequency, minutesPerSession: draft.minutes,
      experience: draft.experience, equipment: draft.equipment, goals: draft.goals,
      substitutions: draft.pull === 'lat_pulldown' ? {} : { lat_pulldown: draft.pull }, estimates: [], strengthInputs,
      loadRecommendationSource: draft.source, healthConsent: draft.consent, restrictions: draft.rules.filter((r) => draft.consent || !r.area),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm' });
    onDone();
  }
  function back(): IntroPage {
    if (page === 'equipment') return 'training';
    if (page === 'source') return 'equipment';
    if (entryPage) return `lift-${liftIndex}`;
    if (liftPage) return liftIndex ? `lift-${liftIndex - 1}` : 'source';
    if (page === 'summary') return 'lift-2';
    return draft.source === 'performed_sets' ? 'source' : 'summary';
  }
  async function next() {
    if (page === 'training') return go('equipment');
    if (page === 'equipment') return go('source');
    if (page === 'source') return go(draft.source === 'performed_sets' ? 'adaptation' : 'lift-0');
    if (entryPage) return saveEntry();
    if (liftPage) return go(nextLift(), { visited: [...new Set([...draft.visited, lift])] });
    if (page === 'summary') return go('adaptation');
    return finish();
  }
  const title = page === 'training' ? 'Hur vill du träna?' : page === 'equipment' ? 'Var tränar du?' : page === 'source' ? 'Hur vill du hitta dina startvikter?' : page === 'summary' ? 'Din startpunkt' : page === 'adaptation' ? 'Något att anpassa?' : exercise(lift).nameSv;
  const canContinue = page === 'training' ? draft.adult : page === 'equipment' ? draft.equipment.length > 0 : page === 'adaptation' ? draft.adult && draft.equipment.length > 0 && !adding : true;
  return <main className="shell intro-shell">
    <div className="page full stack intro-page" aria-busy={busy}>
      <header className="intro-progress">
        <p className="label">Intro {chapter}/4</p>
        <ol aria-label="Introduktionens steg">{['Träning', 'Utrustning', 'Styrka', 'Anpassning'].map((label, i) => <li key={label} aria-current={chapter === i + 1 ? 'step' : undefined} className={chapter > i + 1 ? 'past' : ''}><span aria-hidden="true" /><span>{label}</span></li>)}</ol>
      </header>
      <section className="stack intro-content" aria-labelledby="intro-title" inert={busy}>
        {liftPage && <ol className="intro-lifts" aria-label="Styrkeuppgifter">{INTRO_LIFTS.map((id, i) => <li key={id} aria-current={i === liftIndex ? 'step' : undefined}><span aria-hidden="true">{draft.saved[id]?.length ? '✓' : draft.visited.includes(id) ? '–' : i + 1}</span><span>{exercise(id).nameSv}<span className="visually-hidden">{draft.saved[id]?.length ? ', sparad uppgift' : draft.visited.includes(id) ? ', kan fyllas i senare' : ''}</span></span></li>)}</ol>}
        <h1 ref={heading} id="intro-title" tabIndex={-1}>{title}</h1>
        {page === 'training' && <>
          <div className="card stack">
            <Stepper label="Pass per vecka" value={draft.frequency} min={1} max={7} onChange={(frequency) => change({ frequency })} />
            <Stepper label="Minuter per pass" value={draft.minutes} min={15} max={120} step={5} onChange={(minutes) => change({ minutes })} format={(v) => `${v} min`} />
            <Segmented label="Erfarenhet av styrketräning" value={draft.experience} onChange={(experience: Experience) => change({ experience })} options={(Object.keys(EXPERIENCE_SV) as Experience[]).map((v) => ({ value: v, label: EXPERIENCE_SV[v] }))} />
          </div>
          <label className="check"><input type="checkbox" checked={draft.adult} onChange={(e) => change({ adult: e.target.checked })} /><span>Jag bekräftar att jag är vuxen (18 år eller äldre).</span></label>
        </>}
        {page === 'equipment' && <>
          <div className="card row spread wrap"><div><strong>{standardEquipment ? 'Standardgym' : 'Min utrustning'}</strong><p className="small muted">{standardEquipment ? 'Skivstång, hantlar, kabel och maskiner' : `${draft.equipment.length} typer valda`}</p></div><button className="btn" onClick={() => setCustomEquipment(!customEquipment)}>{customEquipment ? 'Dölj val' : 'Ändra utrustning'}</button></div>
          {customEquipment && <fieldset className="card"><legend>Tillgänglig utrustning</legend>{ALL_EQUIPMENT.map((e) => <label key={e} className="check"><input type="checkbox" checked={draft.equipment.includes(e)} onChange={(ev) => change({ equipment: ev.target.checked ? [...draft.equipment, e] : draft.equipment.filter((x) => x !== e) })} /><span>{EQUIPMENT_LABEL_SV[e]}</span></label>)}</fieldset>}
          <details className="intro-details"><summary>Anpassa upplägget <span className="muted">· valfritt</span></summary><div className="stack">
            <p className="small muted">Prioritet: 0 = ingen, 3 = högst.</p>
            {INTRO_LIFTS.map((l) => <Stepper key={l} label={exercise(l).nameSv} value={draft.goals[l]} min={0} max={3} onChange={(v) => change({ goals: { ...draft.goals, [l]: v } })} />)}
            <Segmented label="Vertikalt drag" value={draft.pull} onChange={(pull: OnboardingDraft['pull']) => change({ pull })} options={[{ value: 'lat_pulldown', label: 'Latsdrag' }, { value: 'assisted_pullup', label: 'Assisterade chins' }, { value: 'pullup', label: 'Chins' }]} />
          </div></details>
        </>}
        {page === 'source' && <><p className="muted">Det här är en startpunkt. Du kan ändra senare.</p><LoadSourceChoice value={draft.source} onChange={(source) => change({ source })} /></>}
        {liftPage && !entryPage && <>
          <p className="muted">Välj en uppgift du känner till. En räcker.</p>
          <div className="stack">{(['submax', '1rm', '3rm'] as const).map((k) => {
            const saved = draft.saved[lift]?.find((d) => d.kind === k);
            return <button key={k} className="btn intro-kind" disabled={busy} onClick={() => run(() => go(`entry-${liftIndex}-${k}`))}><span>{STRENGTH_LABELS[k]}{saved && <span className="small muted">{saved.kg.replace('.', ',')} kg{saved.kind === 'submax' ? ` × ${saved.reps}` : ''} · sparat på enheten</span>}</span><span aria-hidden="true">{saved ? '✓' : '›'}</span></button>;
          })}</div>
        </>}
        {entry && <><h2>{STRENGTH_LABELS[entry.kind]}</h2><IntroStrengthEntry key={page} draft={entry} onChange={(value) => change({ entries: { ...draft.entries, [lift]: { ...draft.entries[lift], [value.kind]: value } } })} today={today} attempted={attempted} /></>}
        {page === 'summary' && <><p className="muted">Du kan ändra uppgifterna senare i Profil.</p><ul className="list card">{INTRO_LIFTS.map((id, i) => <li key={id} className="row spread"><span><strong>{exercise(id).nameSv}</strong><span className="small muted intro-line">{draft.saved[id]?.length ? `✓ ${draft.saved[id]!.length} ${draft.saved[id]!.length === 1 ? 'uppgift sparad' : 'uppgifter sparade'}` : 'Kan fyllas i senare'}</span></span><button className="btn ghost" aria-label={`Ändra ${exercise(id).nameSv}`} onClick={() => run(() => go(`lift-${i}`))}>Ändra</button></li>)}</ul></>}
        {page === 'adaptation' && <>
          <p className="muted">Valfritt. Du kan alltid ändra i Profil.</p>
          {draft.rules.length > 0 && <ul className="list card">{draft.rules.map((r, i) => <li key={i} className="row spread"><span>{r.kind === 'block_exercise' ? 'Undvik' : r.kind === 'limit_sets' ? `Högst ${r.maxSets} set` : r.kind === 'limit_mode' ? `Högst ${r.maxMode === 'light' ? 'lätt' : 'medel'}` : r.kind === 'block_pair_heavy' ? 'Inte tungt tillsammans:' : 'Notering:'} {r.exerciseA ? exercise(r.exerciseA).nameSv : 'valt område'}{r.exerciseB ? ` + ${exercise(r.exerciseB).nameSv}` : ''}</span><button className="btn ghost" onClick={() => change({ rules: draft.rules.filter((_, j) => j !== i) })}>Ta bort</button></li>)}</ul>}
          {(adding || draft.consent) && <ConsentPanel granted={draft.consent} onChange={(consent) => change({ consent, rules: consent ? draft.rules : draft.rules.filter((r) => !r.area) })} />}
          {adding ? <RestrictionPicker consent={draft.consent} onCancel={() => setAdding(false)} onSave={async (r) => {
            if (r.area && !draft.consent) throw new Error('PRIVACY_CONSENT_REQUIRED');
            if (r.kind === 'block_pair_heavy' && (!r.exerciseA || !r.exerciseB || r.exerciseA === r.exerciseB)) throw new Error('VALIDATION_ERROR');
            if (['block_exercise', 'limit_sets', 'limit_mode'].includes(r.kind) && !r.exerciseA && !r.area) throw new Error('VALIDATION_ERROR');
            const next = { ...current.current, rules: [...draft.rules, r] };
            await persist(next); current.current = next; setDraft(next); setAdding(false);
          }} /> : <button className="btn block" onClick={() => setAdding(true)}>Lägg till anpassning</button>}
          <div className="intro-plan-note"><strong>{draft.frequency} pass i veckan · {draft.minutes} min</strong><p className="small muted">{draft.source === 'performed_sets' ? 'Din plan är redo att skapas. Välj startvikter på gymmet.' : 'Din plan utgår från dina val och tillgängliga styrkeuppgifter.'}</p></div>
        </>}
      </section>
      {error && <Banner kind="danger">{error}</Banner>}
      <footer className="intro-footer stack">
        {entryPage && <button className="btn block" disabled={busy} onClick={() => run(() => saveEntry(true))}>Spara och lägg till en uppgift</button>}
        <div className="row">
          {page !== 'training' && <button className="btn big" disabled={busy} onClick={() => run(() => go(back()))}>Tillbaka</button>}
          <button className="btn primary big grow" disabled={busy || !canContinue} onClick={() => run(next)}>{busy ? 'Sparar…' : page === 'adaptation' ? 'Skapa min plan' : liftPage && !entryPage && !draft.saved[lift]?.length ? 'Fyll i senare' : 'Fortsätt'}</button>
        </div>
        {entryPage && <button className="btn ghost block" disabled={busy} onClick={() => run(() => go(nextLift(), { visited: [...new Set([...draft.visited, lift])] }))}>Fyll i senare</button>}
      </footer>
    </div>
  </main>;
}
