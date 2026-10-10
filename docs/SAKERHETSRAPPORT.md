# Säkerhetsrapport (teknisk, utvecklingsmiljö)

**Omfattning:** kodens behörighetsmodell, databasfunktioner, klientlagring och kända risker. Ersätter inte extern säkerhetsgranskning (RD06) eller juridisk bedömning.

## 1. Behörighetsmodell

| Lager | Åtgärd | Bevis |
|---|---|---|
| Tabeller | RLS aktiverat på **alla** tabeller i `public`; policys `auth.uid() = user_id` för SELECT/INSERT/UPDATE/DELETE (001) | db › "RLS aktiverat på alla tabeller" (frågar `pg_class.relrowsecurity`) |
| Korskoppling | Sammansatta FK `(parent_id, user_id)` på alla barnposter | db › 34 |
| Katalog | Endast SELECT för anon/authenticated | db › "katalogen är skrivskyddad" |
| Set | Direkt INSERT/UPDATE/DELETE återkallat; skrivning endast via `apply_set_mutation` | db › "direkta tabellskrivningar … nekas" |
| Snapshot/audit | `session_exercises` UPDATE återkallat; `recommendation_audits` UPDATE/DELETE återkallat (append-only) | samma test |
| Kvitton | Ingen klientskrivning; endast RPC | samma test |
| Hälsodata | Symtom och områdesregler kräver aktivt samtycke i RLS (`private.has_active_health_consent()`) | db › 36 |
| Användarmetadata | Ger aldrig behörighet (policys använder enbart `auth.uid()`) | db › "redigerbar användarmetadata" |
| Anon | Ser endast katalogen; RPC nekas | db › "oautentiserad (anon)" |

## 2. `apply_set_mutation` (09)

- Implementerad som `private.apply_set_mutation` (`SECURITY DEFINER`, `SET search_path = ''`, alla objekt schemakvalificerade) bakom ett tunt `public.apply_set_mutation` (`SECURITY INVOKER`). Schemat `private` exponeras inte via PostgREST (testat).
- Ägare härleds **endast** från `auth.uid()`; `user_id` i payload accepteras inte (vitlista av fält).
- Advisory lock per eventId; kvitto och set i samma transaktion; payload-hash beräknas på servern.
- Svar avslöjar inte om främmande resurser finns (`NOT_FOUND` för både saknad och främmande).
- Samma eventId från annan användare ⇒ `EVENT_ID_UNAVAILABLE` utan att visa innehåll.
- Validering via tabellens CHECK-villkor + framtidstid > 24 h avvisas; fel rullar tillbaka allt (testat: varken set eller kvitto skrivs).

`private.delete_my_account()` (SECURITY DEFINER) raderar endast `auth.users` där `id = auth.uid()`; kaskad tar bort all användardata (testat end-to-end). `private.purge_mutation_receipts` kan inte anropas av klienter och vägrar retention < 90 dagar.

**Kräver manuell säkerhetsgranskning före produktion (09 §5):** de tre SECURITY DEFINER-funktionerna, grants på schemat `private`, samt att Supabase-projektets inställningar (exponerade scheman, JWT-utgång, rate limits) motsvarar lokal konfiguration.

## 3. Klient

- Endast anon/publishable-nyckel. `assertPublicKey` vägrar `sb_secret_*` och JWT med annan roll än `anon`. CI skannar bygget efter service_role/secret.
- CSP i `index.html` (`script-src 'self'`, `connect-src` endast egen origin + Supabase-URL, `frame-ancestors 'none'`). Notera: meta-CSP kan inte sätta `frame-ancestors` effektivt – sätt CSP som HTTP-header i hostingen (runbook).
- Service worker cachar **endast statiska resurser** (precache); inga API-svar eller hälsodata i webbcache.
- IndexedDB partitionerad per användare (`styrka_<uuid>`), raderas vid utloggning; varning vid osynkade data; vid kontobyte raderas andra användares databaser utan osynkade data (med osynkade data lämnas de oåtkomliga).
- Inga hälso- eller styrkevärden i URL, loggar eller telemetri (ingen telemetri finns). Auth-token i localStorage (Supabase-standard).
- `npm audit`: 0 sårbarheter; beroenden pinnade exakt, lockfil committad.

## 3b. Staging (verifierat 2026-10-10)

- Schemadump: RLS på alla 13 tabeller, 49 policys, klientroller har endast SELECT på `training_sets`/`mutation_receipts` och SELECT/INSERT/DELETE på `session_exercises`.
- Projektet skapades med "Automatically expose new tables" avstängt: endast uttryckliga grants i migrationerna gäller. Följd: `service_role` saknar SELECT/INSERT på appens tabeller (behövs inte av appen; driftfunktioner körs som funktionsägare).
- "Enable automatic RLS" skapade `public.rls_auto_enable()` (SECURITY DEFINER, event trigger). Den kan inte anropas som RPC; ingen åtgärd krävs, men den ska nämnas vid säkerhetsgranskning.
- Röktest `tests/staging/staging_smoke.test.ts` 5/5. Secret-nyckeln hämtas via CLI inne i testprocessen enbart för att skapa/radera bekräftade testkonton; den skrivs aldrig till fil eller logg.

## 4. Kända risker och begränsningar

| Risk | Bedömning / åtgärd |
|---|---|
| IndexedDB kan rensas av webbläsaren (Safari) | Data som bara finns lokalt visas som osynkat; `navigator.storage.persist()` begärs; servern är backup. |
| Auth-token i localStorage åtkomlig vid XSS | Strikt CSP, ingen `dangerouslySetInnerHTML`, React-escaping. |
| Utrustningssynk är två REST-anrop (upsert + delete) | Ej hälsodata, idempotent; värsta fall tillfälligt för många utrustningsrader. |
| Andra entiteter än set synkas med upsert (sista skrivning vinner per post) | Pass/program/regler ägs av en användare; set och profil har revisionskontroll. Bör granskas om fler enheter blir vanligt. |
| Intermittent statement timeout i parallelltest | Retry med samma eventId; se TESTPROTOKOLL. |
| Rate limits höjda i lokal `config.toml` för tester | Gäller endast lokalt; produktionsgränser sätts i Supabase-projektet. |
