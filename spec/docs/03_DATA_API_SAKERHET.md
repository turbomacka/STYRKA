# 03 · Data, integrationer, säkerhet och offline

## 1. Teknikbeslut
**Frontend:** React + TypeScript + Vite; routing med ren SPA. Zustand eller motsvarande lokalt state får väljas av kodagent men återkoppling och sync ska inte kopplas till komponenter. **DB:** Supabase Postgres med Supabase Auth och RLS. **PWA:** manifest + service worker endast för statiska resurser; IndexedDB för lokala aktiva pass och kö. **Hosting:** Cloudflare Pages (eller likvärdig statisk EU-vänlig hosting). **Tester:** Vitest, Playwright, SQL/RLS tester. **Versionshantering:** Git med skyddad huvudgren; lås beroendeversioner, committa lockfil.

**Arkitekturgräns:** `domain` (rena beräkningar utan fetch/Date.now), `planner` (schema och constraints), `application` (use cases och state machine), `storage` (Dexie/IndexedDB), `server` (Supabase adapters), `ui` (React). Referensmotor i `src/decision_engine.ts` anger normativt beteende för de funktioner den implementerar.

## 2. Domänmodell
Se `db/001_schema.sql` för typad relationsmodell.

- `profiles`: preferenser, obligatorisk vuxenbekräftelse och grundläge, ingen känslig journaltext.
- `user_exercise_profiles`: nivå, övningsvariant, viktssteg, uppskattad maximal styrka, kalibreringsstatus.
- `user_equipment`: tillgänglig utrustning.
- `exercise_catalog`: publicerad systemkatalog med övningsslug, lastsemantik och kategori; skrivskyddad i klient.
- `health_consents`: samtycke + datum + version och återkallelse; valfria hälsorelaterade funktioner aktiveras efter uttryckligt opt-in.
- `restriction_rules`: egna begränsningar, övningspar och problemområden; behandlas som potentiella hälsouppgifter.
- `symptom_reports`: frivillig rapport om besvär efter pass; borttagbar separat.
- `programs`: val av program och roterande mall; version och status.
- `sessions`: snapshot per planerat/spontant pass, faktiska tider och typ.
- `session_exercises`: ordning, övningsvariant, mode, rep-band, snapshot av föreskrift.
- `training_sets`: planerade och faktiska arbets-/uppvärmningsset med unika ID, en rad per set.
- `recommendation_audits`: snapshot av motorversion, anledning och källtyp utan fri journaltext.
- `mutation_receipts`: idempotensnyckel för synkstatus, minst möjliga tekniska metadata.

**Ägarskap:** varje användardatatabell har `user_id` och RLS. Familjemedlemmar får separata konton. Frivillig delning av planer är inte med i V1. Alla foreign keys från barnposter använder även `user_id` för att blockera korskoppling över konton.

## 3. Datakvalitet och validering
- `kg` lagras i numerisk decimal med 3 decimaler, UI konverterar svensk komma/punkt. Ogiltigt negativa eller orimligt höga värden nekas, men noll används för kroppsviktsövning när `loadKind` medger detta.
- `assistance_kg` måste vara en egen lastkategori; inget universellt effektivt kroppsviktsmått beräknas utan korrekt modell och frivilliga uppgifter.
- `sets` separeras i `warmup` och `work`. Endast faktiskt slutförda `work` räknas som träningsvolym.
- `target` (kg, reps eller sekunder beroende på övning) lagras separat från `actual` samt planens `recommendation_id`. Om plan senare ändras påverkas inte historikens rekommendationer.
- `occurred_at` sparas UTC timestamp, tidszon för presentation sparas i profil. `client_created_at` och `server_received_at` får skilja sig; framtidstider eller felinställda klockor valideras.
- `deleted_at` för kontoradering och symtom/planer vid behov, men policy för fysisk radering och backupretention måste vara offentlig innan lansering.

## 4. Säkerhet och GDPR
**Innan extern pilot och allmän lansering:** dokumentera personuppgiftsansvarig, artikel 6 rättslig grund för träningshistorik, artikel 9 undantag för frivilliga hälso-/skadeuppgifter, databehandlingsavtal, mottagare, plats för lagring, tredjelandsöverföringar, lagringsbegränsning, användarnas rättigheter och eventuell DPIA. Uttryckligt, separat, återkalleligt samtycke kan vara relevant för den frivilliga hälsomodulen men måste verifieras juridiskt; vanlig avtalshantering är inte ett artikel 9 undantag.

**Minimering:** diagnos och medicinska dokument efterfrågas inte. Vid aktivt nej till frivilliga hälsouppgifter lagras inte symptomrapporter; användaren kan ändå blockera övningar. Sådana blockeringar kan avslöja hälsodata och bör omfattas av likvärdigt skydd.

**Regulatorisk grind:** avsett ändamål får i V1 inte beskrivas som diagnostik, behandling, övervakning av sjukdom eller rehabilitering. Eftersom appen justerar råd när hälsoproblem rapporteras måste kvalificerad jurist bedöma om funktionerna ligger inom wellnessområdet enligt MDR/MDCG 2019-11 rev.1. Ett gränssnittstextpåstående om 'inte medicinsk app' räcker inte i sig.

**Säkerhetsregler:** HTTPS, CSP, lockade beroenden, rate limit och abuse-kontroll, kontobaserat OAuth/magic link via Supabase Auth, RLS på alla exponerade datatabeller, servernära validering, aldrig Supabase secret key i klienten, användarmetadata som är redigerbar får aldrig ge behörighet, tekniska loggar får inte skriva ut hälso- eller styrkedata, backup- och återläsningstester, retentionpolicy.

**Risk vid delad mobil:** användaren måste aktivt logga ut; lokal IndexedDB partitioneras per autentiserad `user_id` och töms eller låses vid logout/account switch. Om osynkade data finns visas säkerhetsdialog före utloggning. Privat hälsodata får inte ligga i ofiltrerat webbcache.

## 5. Exakt synkroniseringsprotokoll
### 5.1 Offline local-first
1. Vid tryck `Klart` skapas stabilt UUID v4 för `training_set` och en `mutation_receipt`/outboxpost med stabilt eventId.
2. **En lokal IndexedDB transaktion** skriver set + köpost atomärt. UI visar lokalt sparad endast vid commit success. Vid QuotaExceeded eller IndexedDB fel: visa explicit ”Kunde inte spara” och erbjud kopiering av data, ingen falsk kvittens.
3. När autentisering och nätverk är tillgängliga skickas idempotent upsert med `id`, `user_id`, `baseRevision`, `changedFields`, eventId.
4. Server verifierar ägare och revision. Samma eventId två gånger ger samma logiska resultat. `server_received_at` och `revision` uppdateras vid godkänd ändring.
5. Server returnerar ack först efter DB commit. Därefter markeras outbox event synkat lokalt.
6. Vid 5xx/offline används exponentiell backoff och retry när appen öppnas. Background sync API används enbart som opportunistisk förbättring, inte som garanti på iOS.
7. Vid parallell redigering av samma set och mismatch i revision -> explicit konfliktvy med både versioner; ingen silent last-write-wins. Ändringar i olika set kan syncas oberoende.
8. Append-only rekommendationssnapshot redigeras aldrig efter skapande. Radering hanteras som auktoriserad deleteoperation med spårbar status.

### 5.2 Väsentlig serveratomaritet
Klienten får inte anta att upprepade separata Supabase REST anrop är transaktionella. Implementera **en auth-skyddad, idempotent serverfunktion/DB RPC** `apply_set_mutation` som atomärt kontrollerar ägarskap, eventId, revision och skriver set + kvittens; den får inte använda blint `SECURITY DEFINER` i exponerat schema. Rekommenderad implementation: privat schema, noggrann `auth.uid()` och RLS-säkerhet eller edge function som kontrollerar claims och använder transaktion med minsta privilegier. Kodagent ska skriva test som bevisar både atomaritet och nekad korsanvändaråtkomst.

**Hantering av install/offline:** IndexedDB kan raderas av webbläsare (kvoter, Safari). Offlinehistorik är därför en temporär cache/kö; synk till server är enda pålitliga långsiktiga backup. Visa om data ännu enbart finns lokalt. Vid PWA uppdatering bevara IndexedDB schema genom migrering.

## 6. Logiskt API och kontrakt
V1 kan implementeras med Supabase SDK + auktoriserade RPC, men domänservicen ska exponera följande gränssnitt mot UI:

```
AuthService.signIn(email), signOut(), currentUser()
ProfileService.get(), patch(expectedRevision, changes)
ExerciseService.list(equipmentFilter), userSettings(exerciseId)
RecommendationService.preview(kind, minutes, nowUtc)
TrainingService.startSession(snapshot), appendSet(eventId, set), editSet(eventId, baseRevision, patch), finishSession(status)
HistoryService.listSessions(cursor, limit), strengthSeries(exerciseId)
PrivacyService.exportAll(format), eraseHealthData(), eraseAccount()
SyncService.pendingCount(), syncNow(), conflicts()
```

Response envelope för skrivoperationer: `{id, status: "applied" | "duplicate" | "conflict" | "rejected", revision, serverTime, errorCode?}`. Rejectioner ska ha maskinläsbar kod, säker användarmening och inte läcka andra användares identiteter.

**Specifik API-felmatris:** `AUTH_REQUIRED`→login; `FORBIDDEN`→stoppa; `VALIDATION_ERROR`→redigera; `REVISION_CONFLICT`→konfliktvy; `OFFLINE`→kö; `DB_UNAVAILABLE`→behåll kö; `LOCAL_SAVE_FAILED`→tydligt osparat; `PRIVACY_CONSENT_REQUIRED`→be om val separat; `RULE_UNSATISFIABLE`→kort säkert pass eller ändra restriktion själv.

## 7. Säkerhetstester krävs
- Användare A får inte läsa, skapa, ändra, radera objekt som ägs av B, inklusive barnobjekt via främmande ID.
- Oautentiserad publik användare får endast se katalogen, aldrig historik/restriktion.
- Samma mutation twice => ett set och en kvittens; annan payload med samma UUID => konflikt.
- Logout på telefon med pending data varnar och hindrar att B ser A:s lokalt sparade hälsodata.
- Restriktionsregler kan inte kringgås genom att ändra UI status.
- Export omfattar källregistreringar och historiska rekommendationer, inte andra användares data.
- Radera konto tar bort identifierbara personuppgifter enligt dokumenterad rutin och sekretesshänsyn till lagliga backupkrav; funktion verifieras end-to-end.

## 8. Drift
Staging och produktion ska vara separata Supabaseprojekt och deploymentmiljöer; aldrig verklig användardata i CI. GitHub Actions eller motsvarande: lint + typecheck + unit + browser smoke + RLS DB tests + migrations + scanner. Versionssätt engine, katalog, databas och privacy notice separat. Tillbakadragande av osäker algoritm måste gå att göra med feature flag eller rollback utan att användarhistorik ändras.
