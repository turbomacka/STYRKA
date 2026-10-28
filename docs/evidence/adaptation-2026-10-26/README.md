# Verifiering av adaptiv planering 2.1

Katalogdatumet anger när verifieringen började. Appens senaste funktionsändring finns i `4ccce3b19515e566280c49bbd943def591b3e18b`. Exakt verifierad publiceringsversion anges i `deployment.json` och `release-verification.md` när publiceringen är färdig.

## Aktuell verifiering

- `all-tests.json`: samlad enhets-, UI- och lokal databaskörning, 606 godkända tester.
- `properties.json`: 10 000 genererade scenarier ingår i fem godkända simulerings-/egenskapstester.
- `simulation.json`, `simulation-alternative-curve.json`: 24 veckor, 16 profiler, tre kapacitetsförlopp, två motorer. Alternativkurvan är en känslighetskontroll.
- `planning-simulation.json`: 36 kompletta 24-veckorsförlopp genom planeraren, inklusive två/tre pass per vecka.
- `differential.json`: 2 100 planer mot fryst tidigare källversion. Ändringar är granskade, inte automatiskt godkända bara för att en referensfil har uppdaterats.
- `browser-final.json`: lokal fullständig diagnostikkörning, 134 godkända, elva avsiktligt överhoppade och två fel (kontobekräftelse respektive navigering). Den är inte ensam ett godkänt releasebevis. Slutlig fullständig CI-körning redovisas separat. Emulering ersätter inte fysisk enhetsprovning.
- `browser-sync-navigation.json`: tolv godkända inloggnings-/synktester på tre webbläsarprofiler. Tre navigeringstester hade ett felaktigt adressantagande i testet och ersätts av körningen nedan.
- `browser-navigation-auth-final.json`: riktad slutkontroll av passradering och återställningslänk i annan webbläsare, på tre webbläsarprofiler.
- `browser-auth-retry.json`: fyra riktade Android-flöden för inloggning, första hämtning och bevarade träningsdata vid återinloggning.
- `dependency-audit.json`: beroendekontroll.
- `staging-db.json`: kontroller mot den befintliga testdatabasen med tillfälliga syntetiska konton.
- `ci.json`, `deployment.json`, `staging-browser.json`: slutlig extern byggkontroll, publicerade filhashar och tester mot publicerad app, när dessa slutförts.

## Historik och diagnostik

`baseline-engine-2/` tillhör den tidigare lokala motorn 2.0 och är inte verifiering av publicerad 2.1. `properties-before-dose-review.json` bevarar ett identifierat och därefter åtgärdat simuleringsfel. `browser-corrected-fixtures.json` innehåller den riktade körning där tre gamla positionsantaganden i återhämtningstestet ännu återstod; `browser-recovery.json` verifierar korrigeringen. Dessa filer ska inte räknas som godkända fullständiga releasekörningar.

Två breda webbläsarkörningar avbröts efter att de hade identifierat gamla testantaganden respektive ett reproducerat kortvarigt autentiseringsfel. De ersätts av den fullständiga slutkörningen. Inga automatiska omförsök av hela tester är aktiverade.

## Reproduktion

Använd Node 24 LTS och projektets låsta beroenden. Kör lokal Supabase och därefter `npm test`, `npm run test:adaptive:comparison` och `npx playwright test`. För redan godkänd publicering till befintlig staging används projektets release-runbook. `node scripts/verify-adaptation-deployment.mjs` läser publicerade filer och kräver att deras hash stämmer med det lokala stagingbygget.

Simulerad kapacitet är förutbestämd och oberoende av rekommendationerna. Resultaten visar logiskt beteende och säkerhetsinvarianter, inte kliniskt bevisad återhämtning eller bättre faktisk styrkeutveckling.
