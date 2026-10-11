# Release-runbook

Gäller **staging**. Produktion kräver att G5 är godkänd och ett separat, uttryckligt beslut av produktägaren.

## 1. Engångsuppsättning av staging

Status: steg 1, 3, 4 och 5 utförda. Databas `styrka-staging` (ref `zjjlttbwofohyqmklvkf`), app https://styrka-staging.homeboard-mh.workers.dev via Cloudflare Workers Static Assets (`wrangler.jsonc`; Pages-kommandot i wrangler 4.149 delegerar till Workers). Publicera: `npm run deploy:staging` (läser `.env.staging` som inte versionshanteras och skriver `dist/_headers`). Röktest: `npm run test:staging` och `npx playwright test -c playwright.staging.config.ts`. Steg 2 (auth-URL:er, SMTP) görs i Supabase-dashboarden.

**Rollback av app:** `npx wrangler rollback` (föregående version) eller `npx wrangler versions list` + `npx wrangler versions deploy <id>`.

1. Supabase: skapa projekt `styrka-staging` i EU-region. Notera projekt-URL och **anon/publishable**-nyckel (aldrig secret/service_role i klient eller CI-loggar).
2. Auth: aktivera e-post (magic link), sätt Site URL till staging-domänen, redirect-URL:er, rimliga rate limits (lokala testvärden i `supabase/config.toml` gäller inte här), e-postbekräftelse på.
3. Kör migrationer: `npx supabase link --project-ref <ref>` och `npx supabase db push`. Verifiera med `npx vitest run --project db` mot staging endast med syntetiska testkonton (justera `tests/db/dbHelpers.ts` att läsa URL/nyckel från miljövariabler).
4. Hosting (Cloudflare Pages eller likvärdig EU-vänlig statisk hosting): bygg `npm ci && npm run build` med `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` som miljövariabler; publicera `dist/`. SPA-fallback till `index.html`.
5. HTTP-headers i hostingen: `Content-Security-Policy` (som i `index.html` + `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. `sw.js` och `index.html` med `Cache-Control: no-cache`.
6. Separat projekt för produktion senare; deploy previews får aldrig produktionsnycklar.

## 2. Release

1. Grön CI på huvudgren (lint, typecheck, unit, db, e2e, audit, hemlighetsskanning).
2. Migrationer mot staging först (`npx supabase db push`), **alltid före** frontend som förutsätter dem (t.ex. migration 004 före övningsbyte v2); kontrollera RLS-testerna.
3. Versionshöj relevanta versioner (engine, catalog, schemaMigration, privacyNotice, ui) och uppdatera AVVIKELSER/TESTPROTOKOLL vid regeländring (07 Ändringskontroll).
4. Deploy till staging; manuell röktest på iPhone och Android (se TESTPROTOKOLL "Kvar att testa manuellt").
5. Manuellt release-godkännande.

## 3. Rollback och incident (04 §3)

- **Stoppa viktförslag omedelbart:** bygg med `VITE_FLAG_LOAD_RECOMMENDATIONS=false` och redeploya. Historik, loggning och export fungerar; användaren väljer vikt själv.
- **Frontend-rollback:** återpublicera föregående `dist`-bygge (Pages håller tidigare deployment). Service worker-uppdatering sker först när användaren väljer "Uppdatera"; IndexedDB bevaras.
- **Stäng av övningsbyte v2 (CR 2026-10-10-01):** bygg med `VITE_FLAG_SUBSTITUTION_V2=false` och redeploya – tidigare bytesvy används, vetenskapssidan finns kvar. Föredra detta framför rollback till ett bygge före katalog 2.0.0 när användare redan loggat nya övningar (t.ex. frontböj): äldre klienter känner inte igen de nya övningarna i hämtad historik. Migration 004 behöver inte backas (additiv och bakåtkompatibel med äldre klienter).
- **Databas:** migrationer är framåtriktade; skriv kompenserande migration och testa lokalt först. Inga ändringar av historiska snapshots.
- **P0** (åtkomst över kontogräns, försvunna pass, tung rekommendation trots spärr): sätt flaggan ovan, vid behov läsläge genom att återkalla `execute` på `public.apply_set_mutation`, informera enligt dataskyddsrutin.

## 4. Backup och drift

- Schemalagd PostgreSQL-backup (Supabase), återläsningstest i isolerad miljö minst kvartalsvis.
- Kvittoretention: kör `select private.purge_mutation_receipts(120);` som service role enligt beslutad policy (minst 90 dagar).
- Observability: endast tekniska mätvärden (synkfel, konflikter, `RULE_UNSATISFIABLE`), aldrig hälso- eller styrkedata. Ingen telemetri finns i v1.
