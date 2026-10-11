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

## 3c. Inloggning (uppdaterad 2026-10-10)

- Klassisk inloggning med e-post och lösenord (minst 8 tecken i klienten; lokalt även i Auth), bekräftelse av e-post krävs (lokalt och i staging), glömt lösenord, byt lösenord, samt inloggning via e-post utan lösenord för befintliga konton (`shouldCreateUser: false`).
- **Flöde: implicit (supabase-js standard för SPA) i stället för PKCE.** Skäl: PKCE kräver att e-postlänken öppnas i samma webbläsare som begärde den; i staging gjorde det att länkar öppnade i e-postappens webbläsare tyst misslyckades. Avvägning: med implicit flöde levereras token i URL-fragmentet (skickas aldrig till server, rensas direkt av klienten). Bör omprövas vid säkerhetsgranskning; med egen SMTP kan mallar med `token_hash` + `verifyOtp` ge samma robusthet utan token i URL.
- **Kontouppräkning:** "Skapa konto" med befintlig e-post ger beskedet att kontot finns (efterfrågad tydlig återkoppling). "Glömt lösenordet" svarar neutralt. Begränsas av Supabase rate limits. Produktbeslut att bekräfta.
- Staging (gratisnivå + Supabase standardmejl): e-postmallar kan inte ändras ⇒ mejlen innehåller bara länkar (ingen kod), och mejl går endast till projektets teammedlemmar. Minsta lösenordslängd i staging-Auth är 6 (klienten kräver 8) eftersom `config push` avvisas när mallarna ingår. Båda löses med egen SMTP.

## 3d. STYRKA-CR-2026-10-10-01 (migration 004, 2026-10-11)

| Del | Åtgärd | Bevis |
|---|---|---|
| `user_exercise_calibrations` | RLS, ägarpolicys för SELECT/INSERT/UPDATE/DELETE, en rad per (användare, övning, maskinprofil), observationer är set-id (referenser, inga kopior av hälsodata) | db › `substitution_db` › RLS, unik rad, ogiltiga värden |
| `session_exercise_substitution_events` | RLS; klienten har endast SELECT/INSERT (append-only), sammansatta FK `(session_id, user_id)` och `(…_session_exercise_id, user_id)` | db › append-only, FK mot annan användares pass/övning nekas |
| `training_sets.perceived_effort` | Ny vitlistad nyckel `perceivedEffort` i `private.apply_set_mutation` (övrig logik identisk med 003); CHECK-villkor; fel rullar tillbaka allt | db › perceived_effort via RPC |
| `session_exercises.load_basis`, `profiles.equipment_profiles`, katalogkolumner | Additiva kolumner med CHECK; inga befintliga rader, set eller rekommendationer ändras | db › katalog 2.0.0, lastbas |
| Kontoradering | Nya tabeller raderas via kaskad | db › appflöde mot riktig server |
| Vetenskapssidan `/vetenskap` | Publik, statiskt innehåll ur versionsstyrd JSON i bygget; inga API-anrop, inga persondata, inga tredjepartsskript; externa källor öppnas som vanliga länkar (`rel="noopener noreferrer"`) | unit › evidensregister utan persondata; E2E utloggad |

**Kräver manuell säkerhetsgranskning före produktion:** den ersatta `private.apply_set_mutation` (SECURITY DEFINER) i migration 004. **Ordning vid driftsättning:** migration 004 måste tillämpas innan ny frontend publiceras. Annars avvisar en äldre server `perceivedEffort` (VALIDATION_ERROR) och de nya tabellerna saknas; klienten tål tomma svar vid hämtning men köposter avvisas.

## 4. Kända risker och begränsningar

| Risk | Bedömning / åtgärd |
|---|---|
| IndexedDB kan rensas av webbläsaren (Safari) | Data som bara finns lokalt visas som osynkat; `navigator.storage.persist()` begärs; servern är backup. |
| Auth-token i localStorage åtkomlig vid XSS | Strikt CSP, ingen `dangerouslySetInnerHTML`, React-escaping. |
| Utrustningssynk är två REST-anrop (upsert + delete) | Ej hälsodata, idempotent; värsta fall tillfälligt för många utrustningsrader. |
| Andra entiteter än set synkas med upsert (sista skrivning vinner per post) | Pass/program/regler ägs av en användare; set och profil har revisionskontroll. Bör granskas om fler enheter blir vanligt. |
| Intermittent statement timeout i parallelltest | Retry med samma eventId; se TESTPROTOKOLL. |
| Rate limits höjda i lokal `config.toml` för tester | Gäller endast lokalt; produktionsgränser sätts i Supabase-projektet. |
| Olika byten av samma övning i samma pass på två enheter (CR) | Serverns unika ordning avvisar den senare ersättaren, som visas som ej synkad; ingen tyst överskrivning. Se AVVIKELSER S8. |
| Populationsbaserad hjälpskattning (två par) | Visas endast som lågkonfidensförslag med bekräftelse, aldrig vid symtomflagga eller över maxtak; invariant i kod och test (SUB19). |
