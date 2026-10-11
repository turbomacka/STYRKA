import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  EVIDENCE,
  EVIDENCE_KIND_SV,
  HEURISTIC_LABEL,
  claimAnchor,
  matchesQuery,
  ruleAnchor,
  ruleById,
  sourceAnchor,
  sourceById,
  sourceHref,
  type EvidenceClaim,
  type MethodRule,
  type Section,
} from '../../science/registry';

const SECTIONS: Array<{ id: string; key: Section | 'E'; title: string }> = [
  { id: 'a-forskningen', key: 'A', title: 'A. Vad forskningen ger stöd för' },
  { id: 'b-rekommendationer', key: 'B', title: 'B. Hur rekommendationerna fungerar' },
  { id: 'c-produktregler', key: 'C', title: 'C. Var forskningen upphör och produktval börjar' },
  { id: 'd-begransningar', key: 'D', title: 'D. Begränsningar och säkerhet' },
  { id: 'e-kallor', key: 'E', title: 'E. Källförteckning' },
];

function claimText(c: EvidenceClaim): string {
  return [c.title_sv, c.plain_language_sv, c.caveats_sv, c.population_scope, ...c.source_ids.map((s) => sourceById(s)?.authors ?? '')].join(' ');
}
function ruleText(r: MethodRule): string {
  return [r.title_sv, r.method_sv, r.value_sv, r.rationale_sv].join(' ');
}

function HeuristicBadge() {
  return <span className="chip warn science-badge">{HEURISTIC_LABEL}</span>;
}

function ClaimCard({ c }: { c: EvidenceClaim }) {
  return (
    <article id={claimAnchor(c.claim_id)} className="card stack science-item" aria-labelledby={`${claimAnchor(c.claim_id)}-t`}>
      <h3 id={`${claimAnchor(c.claim_id)}-t`}>{c.title_sv}</h3>
      <p>{c.plain_language_sv}</p>
      <p className="small">
        <span className="chip">{EVIDENCE_KIND_SV[c.evidence_kind]}</span> {c.rule_is_heuristic && <HeuristicBadge />}
      </p>
      <dl className="science-dl small">
        <dt>Population</dt>
        <dd>{c.population_scope}</dd>
        <dt>Begränsningar</dt>
        <dd>{c.caveats_sv}</dd>
        <dt>Källor</dt>
        <dd>
          <ul className="science-inline">
            {c.source_ids.map((id) => {
              const s = sourceById(id)!;
              return (
                <li key={id}>
                  <a href={`#${sourceAnchor(id)}`}>
                    {s.authors.split(',')[0]} m.fl. ({s.year})
                  </a>{' '}
                  – <a href={sourceHref(s)} target="_blank" rel="noopener noreferrer">{s.doi ? `doi:${s.doi}` : 'källsida'}<span className="visually-hidden"> (öppnas i nytt fönster)</span></a>
                </li>
              );
            })}
          </ul>
        </dd>
        {c.rule_ids.length > 0 && (
          <>
            <dt>Används i regler</dt>
            <dd>
              <ul className="science-inline">
                {c.rule_ids.map((id) => (
                  <li key={id}>
                    <a href={`#${ruleAnchor(id)}`}>{ruleById(id)?.title_sv ?? id}</a>
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <dt>Senast granskad</dt>
        <dd>{c.last_reviewed_at}</dd>
      </dl>
    </article>
  );
}

function RuleCard({ r }: { r: MethodRule }) {
  return (
    <article id={ruleAnchor(r.rule_id)} className="card stack science-item" aria-labelledby={`${ruleAnchor(r.rule_id)}-t`}>
      <h3 id={`${ruleAnchor(r.rule_id)}-t`}>{r.title_sv}</h3>
      {r.heuristic ? (
        <p>
          <HeuristicBadge />
        </p>
      ) : null}
      <p>{r.method_sv}</p>
      <dl className="science-dl small">
        <dt>Värde</dt>
        <dd>{r.value_sv}</dd>
        <dt>Skäl</dt>
        <dd>{r.rationale_sv}</dd>
        <dt>Regelversion</dt>
        <dd>{EVIDENCE.ruleSetVersion}</dd>
      </dl>
    </article>
  );
}

function Section({ id, title, children, intro }: { id: string; title: string; children: ReactNode; intro?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="stack science-section">
      <h2 id={`${id}-h`} tabIndex={-1}>
        {title}
      </h2>
      {intro}
      {children}
    </section>
  );
}

/**
 * /vetenskap – publik, direktlänkbar, utan konto, cookies eller personliga data.
 * Läsbar, sökbar (fritext), skärmläsarvänlig (rubrikstruktur, landmärken) och skrivaranpassad.
 */
export function Science({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  const loc = useLocation();
  const [query, setQuery] = useState('');
  const searchId = useId();

  useEffect(() => {
    document.title = 'Vetenskapen bakom STYRKA';
    return () => {
      document.title = 'STYRKA';
    };
  }, []);

  // Stabila ankarlänkar (t.ex. från "Varför?"): scrolla och flytta fokus till målet.
  useEffect(() => {
    const id = decodeURIComponent(loc.hash.replace(/^#/, ''));
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      const focusTarget = el.querySelector<HTMLElement>('h2, h3') ?? el;
      if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }
  }, [loc.hash]);

  const claims = useMemo(() => EVIDENCE.claims.filter((c) => matchesQuery(claimText(c), query)), [query]);
  const rules = useMemo(() => EVIDENCE.rules.filter((r) => matchesQuery(ruleText(r), query)), [query]);
  const sources = useMemo(() => EVIDENCE.sources.filter((s) => matchesQuery([s.authors, s.title, s.publication, s.notes, s.design, s.population].join(' '), query)), [query]);
  const hits = claims.length + rules.length + sources.length;
  const by = (s: Section) => claims.filter((c) => c.section === s);
  const rulesBy = (s: Section) => rules.filter((r) => r.group === s);

  return (
    <main className="shell science" id="vetenskap">
      <div className="page stack">
        <p className="no-print">
          <Link to={backTo}>← {backLabel}</Link>
        </p>
        <header className="stack">
          <h1>Vetenskapen bakom STYRKA</h1>
          <p>
            Här ser du vilka källor, forskningsresultat, produktregler och antaganden som STYRKA:s träningsförslag bygger på. STYRKA är regelstyrt: samma uppgifter och samma regelversion ger alltid samma förslag. Dina egna data påverkar förslagen, men att träningen är fullständigt optimerad för just dig är inte bevisat.
          </p>
          <dl className="science-dl small card">
            <dt>Algoritmversion</dt>
            <dd>STYRKA-ENGINE {EVIDENCE.engineVersion}</dd>
            <dt>Metodversion</dt>
            <dd>{EVIDENCE.methodVersion}</dd>
            <dt>Regelversion</dt>
            <dd>{EVIDENCE.ruleSetVersion}</dd>
            <dt>Substitutionskatalog</dt>
            <dd>{EVIDENCE.substitutionCatalogVersion}</dd>
            <dt>Senaste sakliga uppdatering</dt>
            <dd>{EVIDENCE.lastSubstantiveUpdate}</dd>
            <dt>Kontroll</dt>
            <dd>{EVIDENCE.verificationNote}</dd>
          </dl>
        </header>

        <nav aria-label="Innehåll på sidan" className="card no-print">
          <h2 className="h-small">Innehåll</h2>
          <ul className="list">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="field no-print" role="search">
          <label htmlFor={searchId}>Sök bland påståenden, regler och källor</label>
          <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          <span className="small muted" aria-live="polite">
            {query.trim() ? `${hits} träffar` : ''}
          </span>
        </div>

        <Section id="a-forskningen" title={SECTIONS[0].title} intro={<p className="muted">Forskningsresultat på gruppnivå, med klickbar källa per påstående.</p>}>
          {by('A').map((c) => (
            <ClaimCard key={c.claim_id} c={c} />
          ))}
        </Section>

        <Section
          id="b-rekommendationer"
          title={SECTIONS[1].title}
          intro={
            <p className="muted">
              Så räknar STYRKA fram uppskattad maxstyrka, första arbetsvikt, progression, reps i reserv, set, vila, spontanpass och hur dina egna begränsningar tillämpas. Regler med siffror som saknar direkt empiriskt stöd är märkta <strong>{HEURISTIC_LABEL}</strong>.
            </p>
          }
        >
          {rulesBy('B').map((r) => (
            <RuleCard key={r.rule_id} r={r} />
          ))}
        </Section>

        <Section
          id="c-produktregler"
          title={SECTIONS[2].title}
          intro={
            <p className="muted">
              Här skiljer vi på vad studierna faktiskt visar och vilka siffror vi själva har valt. Ingen övningsspecifik omräkningsfaktor är kliniskt validerad. Två försiktiga hjälpskattningar används, bara med låg säkerhet och din bekräftelse.
            </p>
          }
        >
          {by('C').map((c) => (
            <ClaimCard key={c.claim_id} c={c} />
          ))}
          {rulesBy('C').map((r) => (
            <RuleCard key={r.rule_id} r={r} />
          ))}
        </Section>

        <Section id="d-begransningar" title={SECTIONS[3].title}>
          <div className="card stack">
            <ul>
              <li>STYRKA kan inte garantera optimal utveckling eller att träningen är skadefri.</li>
              <li>Resultat från friska försökspersoner gäller inte automatiskt personer med besvär.</li>
              <li>Att registrera besvär är ingen diagnos eller behandling, och STYRKA påstår aldrig att en viss övning är medicinskt säkrare.</li>
              <li>Dina egna blockeringsregler respekteras alltid, även när du byter övning.</li>
            </ul>
          </div>
          {by('D').map((c) => (
            <ClaimCard key={c.claim_id} c={c} />
          ))}
          {rulesBy('D').map((r) => (
            <RuleCard key={r.rule_id} r={r} />
          ))}
        </Section>

        <Section id="e-kallor" title={SECTIONS[4].title}>
          <ol className="list science-sources">
            {sources.map((s) => (
              <li key={s.source_id} id={sourceAnchor(s.source_id)} className="stack">
                <p>
                  {s.authors} ({s.year}). <cite>{s.title}</cite>. {s.publication}.{' '}
                  <a href={sourceHref(s)} target="_blank" rel="noopener noreferrer">
                    {s.doi ? `https://doi.org/${s.doi}` : s.public_url}
                    <span className="visually-hidden"> (öppnas i nytt fönster)</span>
                  </a>
                </p>
                <dl className="science-dl small">
                  <dt>Studietyp</dt>
                  <dd>{s.design}</dd>
                  <dt>Population</dt>
                  <dd>{s.population}</dd>
                  <dt>Relevanta resultat och begränsningar</dt>
                  <dd>{s.notes}</dd>
                  <dt>Senast kontrollerad</dt>
                  <dd>{s.last_checked_at}</dd>
                </dl>
              </li>
            ))}
          </ol>
        </Section>
        <p className="no-print">
          <Link to={backTo}>← {backLabel}</Link>
        </p>
      </div>
    </main>
  );
}

export default Science;
