# Domänrevision 2.1 – manuella dosval, försök och gemensamma lastregler

Slutkontroll 27 oktober 2026. Denna rapport avser lokal källkod; den är inte ett publiceringsintyg.

## Ändrad logik

- Ursprungligt appmål, redigerat setmål och faktiskt resultat hålls isär. Rå setkänsla följer med till progressionen, även per sida. Lätt/Lagom omvandlas inte till ett numeriskt RIR.
- En samstämmigt genomförd manuell vikt blir ett preliminärt arbetsmål. Exempelvis appens 80 kg × 7 följt av faktiskt 82,5 kg × 5 och Lagom kan ge arbetsmålet 82,5 kg × 5 utan att tidigare bekräftad kapacitet skrivs över.
- En representativ sänkning med Lagom behålls som utgångspunkt. Lätt/För lätt kan motivera ett försök redan nästa pass. Den gamla högre appvikten är inget återställningsmål.
- Bekräftad nivå, aktuellt arbetsmål, vald dos och försökets utgångsdos sparas som separata härledda uppgifter. Ett missat försök återgår till sin giltiga utgångsdos; registreringar som raderats kan inte hålla ett gammalt ankare vid liv genom plansnapshoten ensam.
- Blandade topp-/avslutningsset omdefinierar inte hela övningen. Extra set räknas i faktiskt arbete men blir inte automatiskt ordinarie setmål.
- Enstaka hårt sista set är inte samma signal som övervägande maximal ansträngning. En uttrycklig konflikt mellan Lätt och RIR 0–1 ger däremot inget progressionspåslag.
- Relevant problemrelaterad dos analyseras före uppdelning i passlägen. Samma kontinuerliga återhämtningsbedömning förs genom kilogram-, nivå- och oberoende stapeladaptrar. Symtomspärrar och återstart behåller egen prioritet.
- Bekräftad repetitionsomprövning upphäver bara repetitionsdimensionen, inte ett separat valt vikt-/setskydd. Den nya dosen behöver nytt stöd innan nästa omprövning.
- Tillfälligt borttagna set kan återinföras ett i taget, utan samtidig vikt-/repetitionsprogression och utan att upphäva separat valt dosmål.
- Båda oberoende staplarnas gränser och giltiga steg kontrolleras efter återställningen. Regressionen 100/100 kg historiskt, nytt maximum 81 kg och återinfört set ger högst 80/80 kg med steg 2,5 kg.

## Testbara produkttrösklar

1. Normalt två jämförbara lyckade exponeringar för bekräftelse; ett ordinarie arbetsset kräver tre. Den befintliga snabbare initiala bekräftelsen för ovana med tydlig RIR-information kvarstår.
2. Direkt försök från en manuell dos kräver fullständiga ordinarie arbetsset och Lätt/För lätt på minst två tredjedelar, minst två svar när flera set finns. Saknade svar räknas inte positivt. Motstridiga hårda svar, RIR ≤1, dålig teknik och gällande begränsningar stoppar denna snabbare väg. Ett enda ordinarie set kräver också jämförbart tidigare stöd.
3. Problemrelaterad omprövning kräver minst två senare samstämmiga lyckade exponeringar på vald dos och antingen representativ Lätt eller RIR ≥2 genom hela senaste övningen. Alternativt krävs minst tre senare lyckade exponeringar och positiva/passande svar genom hela senaste övningen.
4. Återförsök kräver nya positiva exponeringar efter miss: två initialt, därefter successivt upp till sex. Samma avböjda försök får inte omtolkas som ett nytt dosval för att nollställa väntan. Förhandsvisningar och omräkningar ger ingen ny evidens.
5. Befintlig begränsad repetitionsbrygga behålls: högst två reps över ordinarie intervall och aldrig över 15 i denna väg. Stora tillgängliga viktsteg forceras inte. Nivåmaskiner använder ordnade tillåtna nivåer och inga e1RM-/procentberäkningar.

## Versions- och kompatibilitetsgräns

`ENGINE_VERSION` och `ADAPTIVE_POLICY.version` har höjts från 2.0 till 2.1. Observations- och beslutsfält är valfria tillägg. Äldre historik utan proveniens kan läsas; okänt ursprung förblir okänt. Oföränderliga historiska planer och prestationer skrivs inte om. Härledda statusvärden räknas om från aktuell giltig historik.

Berörda domänfiler: `adaptiveProgression.ts`, `decision_engine.ts`, `prescription.ts`, `configuredPrescription.ts`, `comparableTraining.ts`. Applikationens metadata/synk, planerare, återhämtning och feedback samordnas av övriga delar av revisionen.

## Verifiering

Senaste fokuserade körning: **111/111 godkända tester**:

- `manual_dose_revision.test.ts`: 28 tester, inklusive verklig registrering genom båda redigeringsvägarna, stegvis omprövning och gränskontroll efter återställning.
- `adaptive_engine.test.ts`: 37 tester. Ett tidigare test som krävde permanent bibehållen lägre repsdos har uttryckligen reviderats till att verifiera ett förankrat omprövningsförsök efter nytt positivt underlag.
- `adaptive_simulation.test.ts`: 5 tester, med de ursprungliga 24-veckorsförloppen, alternativ repetitionskurva och sammanlagt 10 000 genererade egenskapsfall.
- `adaptation_planning_revision.test.ts`: 20 tester.
- `recovery_policy.test.ts`: 21 tester.

Applikationens TypeScript-kontroll och ESLint för dessa fem domänfiler samt de två ändrade domäntestfilerna passerade efter sista produktändringen. Helhetsverifiering och eventuell publicering redovisas separat av huvudleveransen.

## Kvarvarande osäkerhet

Trösklarna är versionsmärkta algoritm-/produktantaganden, inte individuellt kliniskt validerade mått. Kategoriska känslor är användbar men ofullständig information. En samstämmig dos kan vara vald utan att appen säkert vet varför.

Upprepade omprövningsförsök kan förekomma efter nytt positivt underlag; modellen lovar inte att ett visst antal exponeringar gör nästa steg möjligt. Simuleringarna skiljer nu uttryckligt understödda, förankrade omprövningar från bortglömda dosval och kontrollerar prestationerna oberoende av beslutskoden. Det behöver följas upp hur människor upplever återförsök och hur ofta förslagen faktiskt accepteras.

Simulerad kapacitetsutveckling är förutbestämd och visar logisk stabilitet, inte att denna policy orsakar bättre fysiologisk utveckling. Verklig styrkeutveckling, genomförbarhet, upplevd lyhördhet och återkommande manuella korrigeringar behöver följas upp med befintlig minimerad data.
