# Setkänsla och tydligare maxkurva

## Användarflöde

Efter ett sparat arbetsset visas **Hur kändes setet?** med fem frivilliga svar:

- För lätt
- Lätt
- Lagom
- Tungt
- Maxansträngning – ”Jag hade inte klarat en repetition till med god teknik.”

Inget svar är förvalt. Setet är redan registrerat och vilan fortsätter. Användaren kan välja Senare, ändra eller ta bort ett svar. Vid ensidiga övningar gäller svaret enbart den registrerade sidan, även när den andra sidan återstår. Uppvärmningsset får inte denna fråga.

Svaren sparas lokalt i samma transaktion som synkkön uppdateras. Misslyckad lagring visar ett fel utan att förlora setets vikt eller repetitioner. Upprepade identiska svar skapar ingen extra mutation. Redigering av vikt eller repetitioner rensar det gamla svaret, så att det inte felaktigt följer med till en annan prestation. Tangentbordsfokus återställs efter att frågan stängs, utan att ta fokus från ett annat fält som användaren redan gått vidare till.

## Beräkningar och presentation

De beskrivande svaren översätts **inte** till gissade RIR-värden. Tungt innebär inte misslyckat set och sänker inte automatiskt kalibreringsvikten.

Det uttryckliga svaret Maxansträngning motsvarar noll repetitioner kvar i beräkningsunderlaget. Själva svaret lagras separat; det presenteras inte som ett användarinmatat numeriskt RIR. Ett tidigare numeriskt RIR tas bort om användaren därefter anger maxansträngning. Ett nytt positivt numeriskt RIR ersätter en tidigare maxbekräftelse.

Befintliga villkor för maxskattning gäller fortfarande: kontrollerad teknik, lämplig belastningsdefinition, 1–8 repetitioner och RIR 0–3. Uppvärmning, osäkra belastningsenheter och olika utrustningsserier blandas inte ihop. Ett set med exempelvis 12 repetitioner blir ingen ny maxskattning enbart för att det anges som maxansträngning. En gemensam progressionsrekommendation tar hänsyn till maxansträngning på den ena sidan även om den andra saknar RIR.

Utvecklingsvyn visar den senaste giltiga maxpunkten från träningen med dess ursprungliga datum, även om ingen ny punkt finns i den valda perioden. Startuppgiften används som reserv när träningspassen ännu inte gett något giltigt maxvärde. Den angivna startstyrkan visas som en separat referens, utan linje till första träningspasset. Faktisk arbetsvikt och uppskattad maxstyrka är fortfarande skilda mått. När flera set ger olika maxvärden kommer etiketten uppmätt/uppskattad från det set som faktiskt gav den valda punkten.

En känslobedömning ändrar inte i efterhand en redan startad vilotimers sparade rekommendation eller tidsstämplar. Svar på tidigare prestationer finns tillgängliga för efterföljande beräkningar. Inga nya fysiologiska formler eller automatiska RIR-standardvärden införs.

## Lagring och kompatibilitet

Migration: `supabase/migrations/20261015161006_set_effort_feedback.sql`.

- Utvidgar kontrollen av befintligt `training_sets.perceived_effort` till fem nya alternativ och äldre `too_heavy`.
- Validerar frivilligt `effort` på varje sidprestation i befintlig JSON-struktur.
- Avvisar motsägelsen maxansträngning och positivt RIR.
- Behåller saknade fält, äldre svar och äldre set utan detaljstruktur.
- Inga nya tabeller, kolumner eller omskrivningar av träningshistoriken.
- Befintliga RPC:er, ägarskapsregler och idempotenta synkflöden används.
- Explicit `null` från servern tar bort ett lokalt svar även vid konflikthantering.

Migrationen är applicerad och kontrollerad både lokalt och i länkad staging-Supabase. Den applicerades där före klientpubliceringen. Migrationshistorik, ny validering och fortsatt RLS på träningsset är verifierade. Vid klientåterställning kan den additiva databasvalideringen behållas; befintliga träningsvärden behöver inte migreras tillbaka.

## Ändrade delar

- Domän: `model.ts`, `trainingFlow.ts`, nya `effort.ts`, `comparableTraining.ts`, `configuredPrescription.ts`.
- Applikation: `training.ts`, `plannerInput.ts`, `history.ts`.
- Synkning: `server/mapping.ts`, `application/sync.ts`; fältkommentar uppdaterad i `storage/db.ts`.
- UI: nya `EffortFeedback.tsx`, `SetRow.tsx`, `TrainingFlow.tsx`, `TrainingHistory.tsx`, `ProgressChart.tsx`, skärmarna `Train.tsx` och `Progress.tsx`, samt `styles.css`.
- Tester: nya `tests/unit/effort.test.ts`, `tests/ui/effort.test.tsx`, `tests/db/effort_db.test.ts`, `e2e/effort.spec.ts`; kalibreringsscenariot i `e2e/substitution.spec.ts` anpassat till betydelsen Tungt.

## Verifiering

Nya tester täcker bland annat enskilda set/sidor, ingen påhittad repetitionsreserv, redigering/ångra, atomisk felhantering, servervalidering, två enheters synkning och borttagna svar, offlineomladdning samt separata referenspunkter i diagrammet.

| Kontroll | Resultat |
| --- | --- |
| Enhetstester och komponenttester | 352/352 godkända, inklusive regressionstest för fördröjda serverbilder |
| Databas-/integrationstester | Slutlig separat körning: 58/58 godkända |
| Referensmotorns smoke checks | 26/26 godkända; SHA256 oförändrad |
| Riktade webbläsarscenarier | 21 unika scenarier godkända efter rättning/omkörning, se avvikelser nedan |
| Nytt känsloflöde + integrerat träningsflöde | Slutlig körning: 6/6 godkända, tre webbläsarprojekt |
| Tillgänglighet | Axe utan överträdelser i testade lägen; 48 px svarsknappar, tangentbordsfokus, reducerad rörelse och 200 % text kontrollerade |
| Typkontroll, lint och produktionsbygge | Godkända |
| Lokal databasrådgivare | Inga varningar |
| Visuell granskning | Mobilbilder i ljust/mörkt tema samt maxkurva/historik granskade |

Avvikelser under arbetet: två felaktiga testsökningar rättades (knappens namn och historikens nästlade element). Vid kombinerade körningar uppstod enstaka `AUTH_REQUIRED` i äldre databastester och en lokal konto-start i desktoptestet. Berörda tester passerade vid separata omkörningar utan ändring av appens autentisering. Grundorsaken är inte fastställd; detta redovisas som lokal testmiljöosäkerhet. Den färdiga känsloregistreringen och dess riktiga tvåklientssynkning passerar. Bygget ger fortsatt varning om stor huvudbundle, cirka 304 kB gzip; inget nytt UI- eller animationsbibliotek har lagts till.

Webbläsartesterna använder Chromium och WebKit med mobila skärmstorlekar samt desktop. De ersätter inte provning på en fysisk iPhone, installerad iOS-PWA eller Androidtelefon. Sådan enhetsprovning och INP vid verklig användning är inte genomförda för denna ändring.

Skärmbilder: `docs/evidence/effort/<webbläsarprojekt>/`.

## Publicering

Publicerad 16 oktober 2026 på https://styrka-staging.homeboard-mh.workers.dev/.

- Version: `eb321258-011e-4b38-ab22-5770e7f1a59e`.
- Deployment: `abc8a0f0-3e92-402f-89a0-b7d5f4c1fc8f`, 100 % trafik.
- Föregående version för eventuell återställning: `76739015-3025-4447-999f-41adc5bd0b5c`.
- Sju publicerade filer, inklusive huvudskript, CSS och Service Worker, matchar byggets SHA256. CSP finns och tillåter rätt backend.
- Åtta tester mot stagingdatabasen och samtliga åtta unika webbläsarscenarier mot den publicerade appen är godkända, det sista efter en separat omkörning (se nedan). Tillfälliga testkonton är borttagna och noll kvarvarande testkonton har verifierats.
- Databasrådgivaren visar samma tre tidigare noterade varningar: exekveringsrättigheter för `public.rls_auto_enable()` samt avstängt skydd mot läckta lösenord. Inga nya varningar från ändringen.

Publiceringsbevis och slutliga testresultat sparas i `docs/evidence/effort/deployment.json`. Den nya livekontrollen finns i `e2e-staging/effort.spec.ts`; den använder och raderar enbart egna tillfälliga testkonton.

Livekontrollen upptäckte en kapplöpning mellan bakgrundshämtning och sparning: servern hade revision 4 med det nya svaret, men en fördröjd hämtning ersatte den lokala raden med revision 3 utan svaret. `SyncEngine` avvisar nu serverbilder vars setrevision är äldre än den redan kvitterade lokala revisionen. Ett deterministiskt regressionstest återskapar förloppet för både angivna och borttagna svar. Liveprovet jämför också lokalt svar och revision med serverns efter flera skärmbyten.

Valet av senaste maxvärde har dessutom säkrats mot ändrade tidsstämplar på styrkeinställningarna: giltiga träningspunkter prioriteras och startreferensen används endast som reserv. Ett separat test reproducerar en senare inställningstidsstämpel och verifierar både det registrerade maxvärdet och återgången till referensen om svaret tas bort. Ingen registrerad vikt eller repetition skrivs om av dessa korrigeringar.

Två automatiseringsdetaljer rättades också: offlineomladdningen inväntar bekräftad lokal lagring, och sidbyte i diagrammet inväntar den nya seriens innehåll innan punktvalet görs.

I den sista publiceringskörningen passerade 7/8 webbläsartester direkt. WebKit rapporterade ett access-control-nätverksfel 32 ms efter testets avsiktliga avstängning av nätverket; samtliga kontroller av sparade träningsdata hade passerat. Det integrerade scenariot passerade oförändrat vid separat omkörning. Inga appändringar eller undantag från felkontroller gjordes för att få det godkänt. Detta redovisas som en kvarvarande osäkerhet i WebKits simulerade nätverksavbrott.
