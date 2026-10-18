# STYRKA

Svensk, mobilförst PWA (React + TypeScript + Vite) som ger träningsförslag för knäböj, bänkpress och marklyft utifrån användarens registrerade träning, tid, utrustning och egna begränsningar. Byggd enligt utvecklingspaketet v2.0 i [spec/](spec/).

Kodrepository: [turbomacka/STYRKA](https://github.com/turbomacka/STYRKA), huvudgren `main`. GitHub innehåller källkod, tester, specifikationer och versionshistorik. Miljöfiler, lösenord, nycklar och lokala databaser ingår inte. Publicering av appen på Cloudflare görs separat från uppladdning av koden till GitHub.

> **Status:** utvecklingsprodukt för testmiljö. Releasegrind G5 (juridik MDR/GDPR, fackgranskning av träningsregler, staging-pilot) är **inte** godkänd och kan inte godkännas av kod. Se [docs/RELEASEGRINDAR.md](docs/RELEASEGRINDAR.md). Ingen offentlig driftsättning utan produktägarens uttryckliga godkännande.

## Snabbstart (lokal testmiljö)

Krav: Node 22+, Docker Desktop.

```bash
npm ci
npx supabase start                  # lokal Postgres + Auth + REST; migrationer i supabase/migrations körs automatiskt
npx supabase status -o env          # kopiera ANON_KEY
cp .env.example .env.local          # fyll i VITE_SUPABASE_ANON_KEY (endast anon/publishable – aldrig secret/service_role)
npm run dev                         # http://127.0.0.1:5173
```

Byggd PWA med service worker: `npm run build && npm run preview` (http://127.0.0.1:4173). Inloggningslänkar (magic link) i lokal miljö syns i Mailpit på http://127.0.0.1:54324. Lösenordsinloggning finns som alternativ.

## Tester

| Kommando | Vad |
|---|---|
| `npm run test:reference` | Paketets oberoende smoke-kontroll (26 assertions) mot **oförändrad** referensmotor, SHA256 verifieras mot manifestet |
| `npx vitest run --project unit` | Motor, planerare, property-tester, offline/synk med IndexedDB (fake-indexeddb), övningsbyte SUB01–SUB24, evidensregister |
| `npx vitest run --project ui` | Komponentkontrakt + axe i jsdom |
| `npx vitest run --project db` | Kräver `supabase start`. RLS-negativtester, `apply_set_mutation`, samtycke, kontoradering, **demo två konton × 36 pass** |
| `npx playwright test` | E2E mot byggd PWA: Android (Chromium), iPhone (WebKit-emulering), desktop/tangentbord; offline, axe, reflow |
| `node scripts/check-evidence-links.mjs` | Kontrollerar att evidensregistrets DOI/länkar svarar (skriver `docs/evidence/evidence_links.md`; kräver nät) |
| `npm run lint && npm run typecheck` | ESLint (inkl. förbud mot klocka/slump i domänlagret) och strikt TypeScript |

Resultat och bevis: [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md), [docs/evidence/](docs/evidence/).

## Arkitektur (03 §1)

```
src/domain/       rena beräkningar – referensmotor (oförändrad), lastsemantik, katalog, enheter (gram), hash
src/planner/      deterministisk schemagenerator 1–7 pass/vecka, spontanpass, återhämtning, parregler, tidsprunning
src/application/  use cases: profil, träningstillståndsmaskin, synk (outbox), historik, export/radering
src/storage/      Dexie/IndexedDB – en databas per användare, raderas vid utloggning
src/server/       Supabase-transport, mappning, felklassning; endast anon-nyckel
src/ui/           React-vyer S01–S16, komponenter, svenska texter
src/science/      evidensregister (källor, påståenden, metodregler) för den publika vetenskapssidan
supabase/         config + migrationer (001/002 oförändrade från paketet, 003 tillägg + RPC, 004 övningsbyte)
```

Normhierarki enligt paketet: användarspärrar och säkerhetsgränser → numeriska regler i 02 + referensmotorn → UX-kontrakt → fixtures → evidens. Avvikelser och tolkningar: [docs/AVVIKELSER_OCH_BESLUT.md](docs/AVVIKELSER_OCH_BESLUT.md).

## Versioner

| | |
|---|---|
| engineVersion | `1.0.0` (STYRKA-ENGINE, referensmotor) |
| plannerVersion | `STYRKA-PLANNER/1.0.0` |
| ruleSetVersion | `STYRKA-RULES/1.3.0` (inkl. [återhämtning utifrån faktiskt arbete](docs/ATERHAMTNING_2026-10-16.md); äldre H-regler i AVVIKELSER) |
| catalogVersion | `2.0.1` (17 oförändrade + 31 erbjudna varianter enligt produktägarens kandidatmappning; `lunge` inaktiv) |
| substitutionCatalogVersion | `SUBST/1.2.0` (`src/planner/replacement_seed.json`, enda källa; originalet oförändrat i `spec/cr-2026-10-10-01/`) |
| evidensregister / metod | `EVIDENS/2.0.0` / `STYRKA-METOD/1.4.0` (`src/science/evidence.json` ur `spec/cr-2026-10-10-01/STYRKA_evidence_register.json`; publik sida `/vetenskap`) |
| templateVersion | `1.0.0` (`fixtures/planner_templates.json`) |
| privacyNoticeVersion | `PN-2026-10-v1-UTKAST` (ej juridiskt granskad) |
| balans | `balance-patterns/1.0.0`, `balance-decisions/1.0.0`; flaggor `VITE_FLAG_BALANCE` (på), `VITE_FLAG_BALANCE_ADJUSTMENTS` (av) |
| schemaMigration | `20261012000007` (007: beslut om balansförslag); tidigare `20261011000006` (004: kalibrering, revisionsposter, lastbas, upplevd ansträngning; 005: `barbell_row`, `lunge` inaktiv; 006: planrevisioner och anteckningar – "Min träningsplan", `/plan`) |

Feature flags (byggtid): `VITE_FLAG_LOAD_RECOMMENDATIONS=false` stänger av viktförslag utan att påverka historik eller export; `VITE_FLAG_SUBSTITUTION_V2=false` återgår till tidigare bytesvy (S09 v1). Se runbook för snabb rollback.

## Dokument

- [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md) – acceptanstest 1–45, fixturfall, grindar
- [docs/SAKERHETSRAPPORT.md](docs/SAKERHETSRAPPORT.md) – RLS, RPC, hot och bevis
- [docs/AVVIKELSER_OCH_BESLUT.md](docs/AVVIKELSER_OCH_BESLUT.md) – tolkningar, alla H-värden, öppna frågor
- [docs/RELEASEGRINDAR.md](docs/RELEASEGRINDAR.md) – G0–G5 och vad produktägaren behöver godkänna
- [docs/RELEASE_RUNBOOK.md](docs/RELEASE_RUNBOOK.md) – staging, driftsättning, rollback, backup
- [docs/evidence/demo_two_users.md](docs/evidence/demo_two_users.md) – demo två konton, 36 pass, spontanpass
