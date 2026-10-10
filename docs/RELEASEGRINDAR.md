# Releasegrindar G0–G5 (status 2026-10-10)

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

1. Skapa (eller ge åtkomst till) ett **staging**-projekt i Supabase (EU-region) och ett Cloudflare Pages-projekt (eller likvärdig hosting). Detta kräver konto/betalning och har därför inte gjorts.
2. Låta fackperson granska H-värdena och områdesmappningen.
3. Beställa juridisk bedömning enligt RD01–RD05.
