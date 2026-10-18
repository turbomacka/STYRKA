# STYRKA – ensidigt arbete, utrustning, vila och uppvärmning

Implementationsanmodan 14 oktober 2026. Rapport 15 oktober 2026.

## Publicering och kontroll av publicerad version

Publicerad den 15 oktober 2026 kl. 15:25 svensk tid på [STYRKA](https://styrka-staging.homeboard-mh.workers.dev/). Cloudflare-version `76739015-3025-4447-999f-41adc5bd0b5c` tar 100 procent av trafiken, deployment `c7023ce3-452d-49ed-b5e5-0d915c46466b`.

- Migration `20261014182747_integrated_training_flow.sql` installerades före klienten. Tidigare migreringar var redan applicerade. Inga historiska set fylldes med fabricerade siduppgifter eller duplicerades.
- Antalet befintliga profiler, pass, övningsinstanser och set var oförändrat efter migration och efter teststädning. RLS är aktiverat och den ursprungliga övningsspecifikationen är fortsatt skyddad mot direkt uppdatering.
- **8/8 stagingtester mot databasen och 6/6 tester mot den publicerade webbappen passerade direkt.** Webbläsartesterna kördes i Chromium med Android-emulering och WebKit med iPhone-emulering.
- Det integrerade testet verifierade uppvärmning av/på, separat arbetsseträkning, 30 kg × 10 på höger och 30 kg × 8 på vänster, ångring av endast vänster sida, gemensam vila, manuell förlängning, offlineomladdning och observerad start av nästa set. Efter synk kontrollerades de faktiska serverposterna via testanvändarens egen inloggning: exakt två sidprestationer, bevarad maskinprofil, separat uppvärmning och vila med ursprunglig rekommendation, justering och faktisk tid.
- Befintliga inloggnings-, introduktions-, synk-, raderings-, tema-, diagram- och vetenskapssidans flöden passerade också. Inga CSP-fel eller JavaScript-undantag noterades i det integrerade scenariot. Tillfälliga testkonton och deras data raderades efteråt.
- Startsida, JavaScript, CSS, service worker och manifest svarar HTTP 200 och är identiska med det lokala stagingbygget. [Kontrollsummor och publiceringsuppgifter](evidence/training-flow/deployment.json).
- TypeScript, ESLint och diffkontroll passerade efter tillägget av publiceringstesterna. Det återanvändbara scenariot finns i `e2e/trainingFlowScenario.ts`, med lokalt test och `e2e-staging/training_flow.spec.ts` som använder samma handlingar. Bilder från den publicerade versionen finns i `evidence/training-flow/staging/`; sidregistrering i ljust tema och historik i mörkt tema har granskats visuellt.
- Supabases rådgivarkontroll visade samma tre befintliga varningar före och efter migrationen: två anropsbehörigheter för plattformens `public.rls_auto_enable()` samt avstängt skydd mot läckta lösenord. Inga nya varningar tillkom. Dessa befintliga inställningar ändrades inte vid publiceringen.

Fysisk iPhone/Android och installerad PWA har fortfarande inte verifierats. WebKit-emulering ska inte tolkas som sådan provning. Befintliga PWA-installationer visar **Ny version finns.** med knappen **Uppdatera** när uppdateringen upptäcks.

## Levererad funktion

Funktionerna är integrerade i den befintliga appen, dess lokala lagring, synkkö, träningshistorik och planering. Ingen separat prototyp eller ny körningsdependency har införts.

### Ensidiga övningar

- Utförande väljs i **Utförande och utrustning**: båda samtidigt, en sida i taget, växelvis eller en enda sida där övningen stöder detta. Startsida kan ändras.
- Ett set innehåller separata sidprestationer med stabila ID:n. Tre kompletta ensidiga set blir tre arbetsset och sex sidprestationer. Hantlarnas massa multipliceras inte en extra gång när en sida arbetar.
- Efter första sidan visas nästa sida automatiskt. Varje sidas belastning, reps, RIR, teknik och tidpunkter bevaras. Växelvis utförande kan spara båda sidor med ett tryck eller olika resultat per sida.
- En sida kan hoppas över, korrigeras eller ångras utan att den andra raderas. Ofullständiga set kan avbrytas och återupptas. En avslutad prestation bevaras även om övningen senare hoppas över eller byts ut.
- Gemensam progression använder ett konservativt underlag från båda sidor. Uppnått mål på endast en sida ger inte automatiskt högre gemensam belastning. Sidornas utveckling visas i separata jämförelseserier.

### Utrustning och maskinbelastning

- Normal registrering använder den synliga inställningen. Ingen profil behövs för att logga ett set.
- Sparade profiler innehåller namn, typ, tillverkare, modell, enhet, utväxling, viktstaplar, handtag, belastningssteg, lägsta kända belastning och särskilda inställningar.
- Stöd finns för kilogram, maskinnivå, hantelvikt, total skivstångsvikt, kabel med känd/okänd utväxling, kroppsvikt/tillägg/assistans och tid enligt övningens lasttyp. Två oberoende staplar behåller två värden.
- Känd och uttryckligen verifierad kabelutväxling kan visa en **nominell** handtagsbelastning. Okänd utväxling konverteras inte. Friktion eller verklig kraft skattas inte.
- Varje prestation innehåller en kopia av utrustningen. Senare profiländringar skriver inte om historiken. En namnlös maskin jämförs inte automatiskt mellan olika pass. En frivillig jämförelsegrupp är användarens uttryckliga bedömning av likvärdighet; enheter och belastningsdefinition måste fortfarande stämma.
- Maskinnivåer och oberoende staplar får egna progressionsförslag och diagram, utan att nivåerna omvandlas till kilogram eller bilateralt 1RM.

### Vila

- `recommendRest` är en ren, deterministisk funktion utan nätverk eller språkmodell. Reglerna returnerar tid, orsakskoder och version `REST/1.0.0`.
- Normal vila börjar efter sidparet. Valfri vila mellan sidor sparas separat. Efter sista arbetssetet startas ingen ny timer för en ogjord uppvärmning.
- Rekommendation, manuell justering och faktisk vila lagras separat. Timern räknas om från starttid även efter omladdning, offlinearbete eller bakgrundsläge.
- Knappen **Börja nästa set/sida** registrerar en verklig starttid. Det vanliga loggningsflödet kräver fortfarande bara ett tryck. Utan observerad start är faktisk vila **okänd**; intervallet mellan två avslut presenteras inte som vila.
- Användaren kan förkorta, förlänga, dölja eller ignorera timern. Upprepade justeringar i jämförbara pass kan ge ett förslag på ny standard efter minst tre observationer. Ändringen kräver ett aktivt val.
- Befintlig frivillig haptikadapter används för diskret återkoppling när appen är synlig. Ingen bakgrundssignal på låst iPhone utlovas. Inga ljud har lagts till.

### Uppvärmning

- Avstängd som standard. **Visa uppvärmningsset** finns i Profil och kan ändras direkt under passet. En övning kan ha eget visa/dölj-val.
- Förslagen visas före arbetsseten och bygger på arbetsbelastning, övningstyp, repetitionsmål, träningsvana, tidigare arbete i samma rörelsemönster och utrustningens steg.
- Skivstångens vikt antas aldrig vara 20 kg. Utan känd stångvikt eller angivna möjliga belastningar skapas inga automatiska skivstångsförslag. Kroppsvikt, osäkra nivåskalor eller okänd arbetsvikt ger också noll automatiska förslag; egna set kan läggas till.
- Set kan ändras, registreras, hoppas över, läggas till och tas bort. Arbetsseten är alltid tillgängliga. Dold uppvärmning markeras aldrig som utförd och redan registrerad uppvärmning finns kvar i historiken.
- Samma sido- och utrustningsmodell används, även för två oberoende staplar. Uppvärmning påverkar inte arbetsseträkning, normal progression, arbetsmål eller e1RM.

## Datamodell och migration

Migration: `supabase/migrations/20261014182747_integrated_training_flow.sql`.

| Ändring | Innehåll |
|---|---|
| `profiles.training_preferences` | Frivilliga uppvärmnings-/viloval, startsida, återanvändbara utrustningsprofiler och övningsval |
| `session_exercises.configuration` | Vald utförandeform och utrustning, separat från den oföränderliga ursprungliga rekommendationen |
| `training_sets.detail` | Version 1: sidprestationer, utrustningskopior, viloposter, avbrottsstatus och eventuella mål för maskinnivå/andra stapel |
| Setstatus `partial` | Påbörjat eller delvis genomfört set |
| Validering och RPC | Storleksgränser, typer, värdeintervall, unika sidor/ID:n, statuskonsistens och tidsstämplar; befintlig idempotens och revisionskontroll återanvänds |

Gamla rader får `NULL` i de nya kolumnerna. **Ingen backfill, duplicering eller omskrivning av historiska set görs.** Saknad sidinformation representeras som okänd. Dexies befintliga schema behöver ingen ny indexversion för de valfria objekten.

Set och köpost skrivs i samma lokala transaktion. Sidbyte eller sparbekräftelse sker först efter att transaktionen lyckats. Snabba upprepningar med samma sida registrerar inte en ny prestation. Synk använder det befintliga event-ID:t och serverrevisionen. Konflikter bevaras i befintligt konfliktflöde.

Äldre klienter får fortsätta hantera äldre set. Försök att skriva över ett nytt detaljerat set med ett gammalt aggregat avvisas med `UPGRADE_REQUIRED`, så att siddata inte tyst förstörs. Ägarnas RLS gäller fortfarande; endast konfigurationskolumnen kan ändras på övningsinstansen.

Migrationen är applicerad och provad **lokalt och på staging**. Servermigrationen installerades före den nya klienten. Efter att nya detaljerade set har skapats bör klienten inte återställas till en version som saknar sidstöd; serverns skydd bevarar då data men äldre klienten kan inte redigera dessa set. Den tidigare publicerade klientversionen är `27653f8a-3b72-4b64-bfcc-8ce95e7caba7`. En eventuell klientåterställning får inte kombineras med att de nya datakolumnerna raderas.

## Beräkningsregler och produktvärden

| Regel | Första versionens värden |
|---|---|
| Tung flerledsövning med styrkefokus | 180 s |
| Vanlig flerledsövning | 120 s |
| Isolationsövning | 90 s |
| Lätt teknikarbete | 60 s |
| Hög ansträngning, RIR 0–1 | +30 s |
| Tillförlitlig jämförbar relativ belastning ≥85 %, tungt arbete | +60 s |
| Repetitionstapp | Minst 20 % och minst 2 reps; samma belastning, mål, sida, utrustning, teknik och jämförbar känd RIR |
| Korrelerade tillägg | Största tillägget används; signalerna summeras inte blint |
| Personlig standard | Uttryckligt val går före anpassningen; normal vila begränsas till 30–300 s |
| Uppvärmningsvila | 60 s mellan uppvärmningsset, 150 s inför tungt arbetsset, annars 90 s |
| Tung uppvärmning | 50 % × 6, 70 % × 3, 85 % × 2 av arbetsbelastningen |
| Vanlig uppvärmning | 55 % × 6, 80 % × 3; färre eller noll steg när det är motiverat |

Uppvärmningsvikter avrundas till genomförbara inställningar, dubbletter tas bort och förslag måste understiga arbetsbelastningen. Inga universellt optimala vilotider eller individuellt exakta uppvärmningsprotokoll utlovas.

Jämförbarhet kräver övning, utförandeform, belastningsdefinition, enhet och samma utrustningskonfiguration eller användarbekräftad jämförelsegrupp. Gemensam progression använder den svagare prestationen och den lägre registrerade repetitionsreserven. Endast arbetsset används. Den ursprungliga referensmotorn är oförändrad och kontrollsumman verifieras separat.

e1RM används endast där massdefinitionen tillåter det och underlag finns nära maximal ansträngning enligt befintliga regler (submaximalt 1–8 reps, RIR 0–3). Nya detaljerade prestationer kräver också kontrollerad teknik. Maskinbaserat e1RM är en indikator för den utrustningen. Höger och vänster adderas aldrig till bilateralt max.

## Filer och ansvar

Nya domänfiler: `trainingFlow.ts`, `comparableTraining.ts`, `configuredPrescription.ts`, `restPolicy.ts`, `warmupPolicy.ts` i `src/domain/`.

Integrerade ändringar: `domain/model.ts`, `domain/prescription.ts`, `planner/planner.ts`, `storage/db.ts`, `server/{mapping,supabaseTransport,transport}.ts`, `application/{training,trainingPlan,plannerInput,history,balance,privacy,sync,skippedExercises}.ts` och profilens befintliga inställningsflöde.

Gränssnitt: nya `ui/components/TrainingFlow.tsx` och `TrainingHistory.tsx`; återanvända `SetRow.tsx` och `widgets.tsx`; integration i `Train`, `Finish`, `Profile`, `Plan`, `Progress`, `BalanceSection` och befintliga stilfiler.

Nya tester: `tests/unit/training_flow.test.ts`, `tests/db/training_flow_db.test.ts`, `e2e/training_flow.spec.ts`. Befintlig testservertransport i `tests/unit/appHarness.ts` hanterar också konfigurationen. Detta är ändringarna för denna leverans; arbetskopian innehåller även tidigare ocommittade projektändringar.

## Verifiering

| Kontroll | Resultat |
|---|---|
| Vitest enhet + UI | **340/340 godkända**, 26 testfiler. Därav 19 nya integrerade träningsmodelltester. |
| Vitest lokal databas | **56/56 godkända**, 10 testfiler. Verklig Supabase/RLS/RPC med två användare och två lokala enhetsdatabaser. |
| Referensmotor | **26/26 kontrollfall godkända**, båda SHA256-kontrollerna oförändrade. |
| TypeScript | App- och Node-konfiguration utan fel. |
| ESLint och whitespace | Utan fel. |
| Produktionsbygge | Godkänt. Befintlig varning för huvudchunk över 500 kB kvarstår (cirka 1,04 MB minifierad JS). |
| Hela Playwright-sviten | 120 fall: 95 godkända direkt, 14 underkända, 11 uttryckligen överhoppade. **Samtliga 14 godkända vid omkörning** efter rättningarna nedan; därmed har alla 109 aktiva fall passerat. Detta är inte en enda obruten grön körning. |
| Integrerat nytt flöde | Separat omkört i alla tre miljöer efter rättningarna: uppvärmning, olika sidresultat, ångra en sida, adaptiv vila, offlineomladdning, historik och diagram. |

Rättade regressioner: ny kryssrads träffyta, dubbel sparannonsering för skärmläsare, saknad ursprunglig rekommendation i historiken och återanvänt värde som dolde kalibreringens lättare vikt. Kontroll av ”Ångra” omfattar både sidans redigeringskontroll och sparbekräftelsen. Separata fel för lokal JWT-tid och e-postbegränsning försvann vid isolerad omkörning utan ändringar av appens autentisering; den lokala Docker-klockan låg efter värddatorns klocka. Ingen säkerhetskontroll eller produktionsgräns stängdes av för att få testerna gröna.

De 11 överhoppade fallen gäller sex explicita före/efter-bildkörningar, tre särskilda klassiskt-tema-körningar samt två äldre WebKit-begränsningar (tangentbordsstandard och ett Service Worker-scenario). Det nya offline-/omladdningsflödet körs även i WebKit. Ingen överhoppad kontroll räknas som godkänd.

| Acceptans | Verifiering |
|---|---|
| 1–4: sidor, seträkning, vila, olika belastningar | Domäntester, lagrings-/RPC-test med två enheter och mobilt sidflöde |
| 5–6: maskinbelastning och jämförbarhet | Känd/okänd utväxling, två staplar, nivåprogression, separata diagram och oföränderliga kopior |
| 7–8: förklarbar vila och eget nästa startval | Deterministiska regeltester, observerad/okänd faktisk vila, manuell justering, offlineomladdning |
| 9–13: frivillig uppvärmning och separat statistik | Standard av, ändring under pass, generering/avrundning, tillägg/ändring/överhopp, dold historik, inga arbets-/e1RM-signaler |
| 14–16: integration och historikkontinuitet | Integrerat bilateralt + uppvärmning + ensidigt kabelpass; RPC, ägarisolering, gamla rader och befintliga regressionstester |
| 17–18: mobil och stabilitet | Chromium/Pixel 7-emulering, WebKit/iPhone 14-emulering, desktop, axe, 320 px, 200 % text, mörkt/ljust och reducerad rörelse |

Bilder från de integrerade scenarierna ligger i `docs/evidence/training-flow/`, uppdelade per emulerad miljö. Dessa är lokala testbilder med testdata.

Visuellt granskade bilder omfattar uppvärmning i ljust tema samt sidregistrering, vila och historik i ljust/mörkt tema. Browserkörningar använder testdata; riktig träningshistorik har inte ändrats för provningen.

**Leveransbedömning:** publicerad och automatiskt verifierad på staging, inklusive de nya funktionernas verkliga fjärrlagring. Full verifiering på verkliga mobiltelefoner och installerad iOS-PWA återstår före ett påstående om fullständig mobilacceptans.

## Begränsningar och fortsatt verifiering

- **Fysisk iPhone/Safari, installerad iOS-PWA och fysisk Android har inte testats.** Emulering bevisar inte skärmlåsbeteende, verklig haptik, VoiceOver/TalkBack eller batteripåverkan. Tidpunktsbaserad återställning provas automatiskt; en låst webbapp kan inte lova en signal i bakgrunden.
- Ingen verklig INP p75 eller fysiologisk återhämtning mäts av dessa tester. Resultaten visar lokal funktion och tillgänglighetskontroller, inte upplevd kvalitet på alla enheter.
- För okända belastningar och kroppsviktsövningar väljs den enkla lösningen: inga automatiska viktförslag för uppvärmning. Manuella uppvärmningsset är tillgängliga.
- Varje sida och utrustningskonfiguration kan analyseras separat. Modellen är förberedd för upprepade jämförbara sidoskillnader över tid; ingen medicinsk asymmetrigräns, balanspoäng eller skaderiskvarning har införts.
- Faktisk vila kräver observerad start. Den som enbart använder en-trycksregistrering får rekommenderad vila och timer, men inte en påhittad uppgift om faktisk vila.

## Forskningsgrund

Produktvärdena ovan är konfigurerbara heuristiker. Stöd för de övergripande principerna, och deras begränsningar:

- [Grgic et al. 2018](https://pubmed.ncbi.nlm.nih.gov/28933024/): vilointervall och styrkeutveckling.
- [Singer et al. 2024](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full): vilointervall och hypertrofi, med osäkerheter.
- [Scoping review om uppvärmning 2026](https://link.springer.com/article/10.1007/s42978-025-00361-9): övnings- och protokollberoende resultat; inget universellt optimalt upplägg.
- [Parkinson et al. 2021](https://doi.org/10.52082/jssm.2021.594): mätmetod och kontext vid sidoskillnader.

Anmodans Enes et al.-referens har inte använts som ensam grund för någon algoritmparameter eftersom fulltext inte kunde granskas här.
