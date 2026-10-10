# Releasegrindar G0–G5 (status 2026-10-10)

**Staging-databas:** Supabase-projekt `styrka-staging` (ref `zjjlttbwofohyqmklvkf`, eu-north-1 Stockholm). Migrationer 001–003 tillämpade 2026-10-10; röktest mot staging `npm run test:staging` 5/5 godkända (anon, idempotens, revisionskonflikt, A/B-isolering, direktskrivning nekad, samtycke, kontoradering). Testkonton raderade efteråt.

**Staging-app:** https://styrka-staging.homeboard-mh.workers.dev (Cloudflare Workers Static Assets, endast statiska filer, `noindex`). Säkerhetsheaders verifierade (CSP med connect-src endast staging-Supabase, HSTS, nosniff, frame-ancestors/X-Frame-Options, Referrer-Policy, Permissions-Policy). Webbläsarröktest `npx playwright test -c playwright.staging.config.ts` 2/2 (Android/iPhone-emulering): inloggning, intro, pass, synk verifierad i staging-databasen, service worker registrerad, inga CSP-fel.

| Grind | Status | Kommentar |
|---|---|---|
| **G0 Byggbar** | ✅ lokalt | `npm ci`, lint, typecheck, enhetstester, migrationer på lokal Supabase, inga hemligheter i repo/bygge. CI-flöde finns (`.github/workflows/ci.yml`) men har inte körts – repot har ingen fjärr-remote. |
| **G1 Motorn** | ✅ | Deterministiska förslag, property-tester (600+300 profiler), referenssmoke 26/26, korsanvändarkontroll i DB. |
| **G2 UI** | ◐ | Automatiskt på Android-/iPhone-emulering och desktop: start, förifyllt set med ett tryck, paus/återuppta/ångra, axe. **Kvar: riktiga enheter, VoiceOver/TalkBack.** |
| **G3 Offline** | ◐ | Lokal atomisk skrivning, idempotent uppspelning, omstart, helt offlinepass (Chromium med service worker), konflikter mellan två enheter – testat. **Kvar: riktig iOS Safari/Android i flygplansläge.** |
| **G4 Integritet** | ◐ | RLS-, negativa API-, samtyckes-, export- och raderingstester godkända mot riktig Postgres. **Kvar: externa avtal (DPA), juridiskt granskad integritetstext.** |
| **G5 Release** | ❌ | Kräver mänskliga godkännanden – kan inte utföras eller utropas av kodagent. |

## G5 – nödvändiga mänskliga godkännanden (rapporteras, är inte lösta)

| ID | Beslut | Vem |
|---|---|---|
| RD01 | Avsett ändamål (sv/en) och juridisk analys av medicinteknisk gräns enligt MDR/MDCG 2019-11 rev.1 – särskilt att förslag anpassas när besvär rapporteras | Kvalificerad jurist |
| RD02 | Register över datakategorier; rättslig grund art. 6 för träningsdata och art. 9-undantag för frivilliga hälsouppgifter | Jurist / dataskyddsombud |
| RD03 | DPIA-screening och ev. DPIA | Personuppgiftsansvarig |
| RD04 | Biträdesavtal med Supabase och hosting, EU-region, tredjelandsöverföringar | Produktägare + jurist |
| RD05 | Samtyckesflöde och separat radering (text i appen är märkt utkast) | Jurist |
| RD06 | Extern säkerhetsgranskning (SECURITY DEFINER-funktioner, Supabase-konfiguration) och incidentrutin | Säkerhetsgranskare |
| RD07 | Fackgranskning av algoritmens säkerhetsgränser och alla H-värden (se AVVIKELSER) | Idrottsmedicinsk/legitimerad fackperson |
| – | Användartest ≥ 2 personer × 12 pass, staging-pilot, genomförd rollback | Produktägare |
| – | Offentlig driftsättning | **Endast produktägarens uttryckliga beslut** |

## Vad produktägaren konkret behöver göra härnäst

1. ~~Supabase staging och hosting~~ klart. Kvar: sätt Site URL/Redirect URL i Supabase (Authentication → URL Configuration) och egen SMTP om andra än teammedlemmar ska kunna logga in med e-postlänk.
2. Låta fackperson granska H-värdena och områdesmappningen.
3. Beställa juridisk bedömning enligt RD01–RD05.
