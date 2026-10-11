# Releasegrindar G0–G5 (status 2026-10-11)

**Senaste rättning, publicerad 2026-10-11:** F1–F6 och mobilinloggningen har reviderats ovanpå `97ee461` och publicerats på staging, Cloudflare-version `ebc500b9-c515-48b7-8086-ab0f177c4693`. Se [rättningsrapporten](RATTNINGAR_2026-10-11.md) för aktuell verifiering. Nedanstående äldre stagingresultat är historik. Inga nya databasändringar krävdes för rättningen.

**Staging-databas:** Supabase-projekt `styrka-staging` (ref `zjjlttbwofohyqmklvkf`, eu-north-1 Stockholm). Migrationer 001–003 tillämpade 2026-10-10; röktest mot staging `npm run test:staging` 5/5 godkända (anon, idempotens, revisionskonflikt, A/B-isolering, direktskrivning nekad, samtycke, kontoradering). Testkonton raderade efteråt.

**Staging-app:** https://styrka-staging.homeboard-mh.workers.dev (Cloudflare Workers Static Assets, endast statiska filer, `noindex`). Säkerhetsheaders verifierade (CSP med connect-src endast staging-Supabase, HSTS, nosniff, frame-ancestors/X-Frame-Options, Referrer-Policy, Permissions-Policy). Webbläsarröktest `npx playwright test -c playwright.staging.config.ts` 2/2 (Android/iPhone-emulering): inloggning, intro, pass, synk verifierad i staging-databasen, service worker registrerad, inga CSP-fel.

**STYRKA-CR-2026-10-10-01 (vetenskapssida + övningsbyte):** implementerad och testad lokalt (se TESTPROTOKOLL, SUB01–SUB24). Migration `20261011000004_substitution.sql` (additiv). Feature flag `VITE_FLAG_SUBSTITUTION_V2` (standard på efter godkända tester; `false` ⇒ tidigare bytesvy). Staging: migration 004 ska tillämpas **före** ny frontend (`npx supabase db push`, sedan `npm run deploy:staging`). **Staging 2026-10-11:** migration 004 tillämpad (`supabase db push`), därefter frontend publicerad (version `fd37860a`). Röktest API `npm run test:staging` **6/6** (inkl. nya tabeller: RLS, append-only revisionsposter, `perceived_effort` via RPC, katalog = appens 48 övningar). Webbläsarröktest **4/4** (Android/iPhone: inloggning–pass–synk samt `/vetenskap` utan konto, utan CSP-/konsolfel). Inga syntetiska testkonton kvar i staging.

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
| RD08 | Källgranskning av vetenskapssidan (påståenden, sammanfattningar, evidensklasser) och substitutionskatalogens relationer; godkännande av H-S1–H-S8. Automatiskt kontrollerat är endast att DOI/länkar svarar (`docs/evidence/evidence_links.md`) | Fackperson med metodkunskap |
| RD09 | Om vetenskapssidans text om medicinteknisk gräns (MDCG 2019-11) får publiceras – texten är ingen juridisk bedömning | Jurist (del av RD01) |
| – | Användartest ≥ 2 personer × 12 pass, staging-pilot, genomförd rollback | Produktägare |
| – | Offentlig driftsättning | **Endast produktägarens uttryckliga beslut** |

## Vad produktägaren konkret behöver göra härnäst

1. ~~Supabase staging, hosting, Site URL/Redirect URL~~ klart. Kvar: **egen SMTP** (t.ex. Resend/Brevo) om andra än teammedlemmar ska kunna skapa konto/återställa lösenord, och för svenska mejl med kod. Därefter: `npx supabase config push` (mallar + minsta lösenordslängd 8) – konfigurationen finns redan i `supabase/config.toml` under `[remotes.staging]`.
2. Låta fackperson granska H-värdena och områdesmappningen.
3. Beställa juridisk bedömning enligt RD01–RD05.
