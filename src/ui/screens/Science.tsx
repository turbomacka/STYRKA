import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  CLASSIFICATION_SV,
  EVIDENCE,
  HEURISTIC_LABEL,
  claimAnchor,
  matchesQuery,
  ruleAnchor,
  ruleById,
  sourceAnchor,
  sourceById,
  sourceHref,
  sourceLinkLabel,
  type EvidenceClaim,
  type MethodRule,
  type Section,
} from '../../science/registry';

const SECTIONS: Array<{ id: string; key: Section | 'E'; title: string }> = [
  { id: 'a-forskningen', key: 'A', title: 'A. Vad forskningen ger stöd för' },
  { id: 'b-rekommendationer', key: 'B', title: 'B. Hur rekommendationerna fungerar' },
  { id: 'c-produktregler', key: 'C', title: 'C. Appens egna antaganden' },
  { id: 'd-begransningar', key: 'D', title: 'D. Begränsningar och säkerhet' },
  { id: 'balans', key: 'E', title: 'Så fungerar Balans' },
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
        {c.rule_is_heuristic ? <HeuristicBadge /> : <span className="chip science-badge">{CLASSIFICATION_SV[c.evidence_kind]}</span>}
      </p>
      <dl className="science-dl small">
        <dt>Population</dt>
        <dd>{c.population_scope}</dd>
        <dt>Begränsningar</dt>
        <dd>{c.caveats_sv}</dd>
        <dt>Källor</dt>
        <dd>
          {c.source_ids.length === 0 ? (
            'Ingen direkt forskningskälla – ett antagande i appen'
          ) : (
            <ul className="science-inline">
              {c.source_ids.map((id) => {
                const s = sourceById(id)!;
                return (
                  <li key={id}>
                    <a href={`#${sourceAnchor(id)}`}>
                      {s.authors.split(',')[0]} ({s.year})
                    </a>{' '}
                    –{' '}
                    <a href={sourceHref(s)} target="_blank" rel="noopener noreferrer">
                      {sourceLinkLabel(s)}
                      <span className="visually-hidden"> (öppnas i nytt fönster)</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
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
  const sources = useMemo(() => EVIDENCE.sources.filter((s) => matchesQuery([s.authors, s.title, s.publication, s.supported_claim_sv, s.limitations_sv, s.design, s.population].join(' '), query)), [query]);
  const hits = claims.length + rules.length + sources.length;
  const by = (s: Section) => claims.filter((c) => c.section === s);
  const rulesBy = (s: Section) => rules.filter((r) => r.group === s && !r.rule_id.startsWith('balans-'));
  const balanceRules = rules.filter((r) => r.rule_id.startsWith('balans-'));

  return (
    <main className="shell science" id="vetenskap">
      <div className="page stack">
        <p className="no-print">
          <Link to={backTo}>← {backLabel}</Link>
        </p>
        <header className="stack">
          <h1>Vetenskapen bakom STYRKA</h1>
          <p>
            Här kan du läsa om forskningen bakom träningsförslagen och hur STYRKA använder dina uppgifter. Du ser också vilka beräkningar som bygger på antaganden och vad appen inte kan bedöma.
          </p>
          <dl className="science-dl small card">
            <dt>Senast uppdaterad</dt>
            <dd>{EVIDENCE.lastSubstantiveUpdate}</dd>
          </dl>
          <p className="small">
            <strong>Forskningen ger vägledning, men visar inte att STYRKA:s förslag är optimala eller medicinskt säkra för just dig.</strong>
          </p>
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

        <Section
          id="a-forskningen"
          title={SECTIONS[0].title}
          intro={
            <p className="muted">
              Resultaten beskriver grupper och kan inte förutsäga exakt vad som passar dig. Du kan öppna källan till varje påstående. Appens exakta vilotider och antal timmar mellan pass bygger på egna antaganden, inte direkt på de här studierna.
            </p>
          }
        >
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
            <h3 className="h-small">Produktens begränsningar</h3>
            <ul>
              {EVIDENCE.limitations
                .filter((l) => matchesQuery(l, query))
                .map((l) => (
                  <li key={l}>{l}</li>
                ))}
            </ul>
          </div>
          {by('D').map((c) => (
            <ClaimCard key={c.claim_id} c={c} />
          ))}
          {rulesBy('D').map((r) => (
            <RuleCard key={r.rule_id} r={r} />
          ))}
        </Section>

        <Section
          id="balans"
          title="Så fungerar Balans"
          intro={
            <p className="muted">
              Balans under Utveckling beskriver hur din träning är fördelad. Den är ingen diagnos, inget betyg och ingen skaderiskberäkning.
            </p>
          }
        >
          <div className="card stack">
            <ol>
              {EVIDENCE.balanceMethod.points.filter((p) => matchesQuery(p, query)).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
            <p className="small">
              Källor:{' '}
              {EVIDENCE.balanceMethod.source_ids.map((id, i) => (
                <span key={id}>
                  {i > 0 ? ', ' : ''}
                  <a href={`#${sourceAnchor(id)}`}>
                    {sourceById(id)!.authors.split(',')[0]} ({sourceById(id)!.year})
                  </a>
                </span>
              ))}
              . Ingen av dem validerar STYRKA:s balansgränser eller förslag.
            </p>
          </div>
          {balanceRules.map((r) => (
            <RuleCard key={r.rule_id} r={r} />
          ))}
        </Section>

        <Section id="e-kallor" title={SECTIONS[5].title}>
          <ol className="list science-sources">
            {sources.map((s) => (
              <li key={s.source_id} id={sourceAnchor(s.source_id)} className="stack">
                <p>
                  {s.authors} ({s.year}). <cite>{s.title}</cite>. {s.publication}.{' '}
                  <a href={sourceHref(s)} target="_blank" rel="noopener noreferrer">
                    {s.public_url}
                    <span className="visually-hidden"> (öppnas i nytt fönster)</span>
                  </a>
                  {s.doi && !s.public_url.includes(s.doi) ? <> (DOI {s.doi})</> : null}
                </p>
                <dl className="science-dl small">
                  <dt>Studietyp</dt>
                  <dd>{s.design}</dd>
                  <dt>Population</dt>
                  <dd>{s.population}</dd>
                  <dt>Vad källan stöder</dt>
                  <dd>{s.supported_claim_sv}</dd>
                  <dt>Begränsningar</dt>
                  <dd>{s.limitations_sv}</dd>
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
