# Återkoppling efter pass – granskning av PR #3

## Bedömning och rättningar

Grundidén är bra: en kort personlig sammanfattning, högst en konkret insikt och den befintliga förklaringen av nästa träningsförslag. Originalet behövde rättningar innan publicering.

- Hela setgruppen används vid jämförelser. Dålig teknik eller okänd belastning får inte filtreras bort så att två olika doser ser jämförbara ut. Det senaste tidigare tillfället för samma övning, utrustningsvariant och sida prövas först; olika setantal eller blandade belastningar ger inget progressionspåstående.
- Repetitionsmål jämförs mot nettot över samtliga set. Underskott räknas med. Belastning måste vara känd och minst lika krävande på båda oberoende viktmagasinen; assistans tolkas i motsatt riktning. Explicit okända sidmål ersätts inte med gemensamma mål.
- Framtida pass, uppvärmning och raderade set ger inga förbättringar. Kontinuitet kräver genomförda pass med registrerat arbete. Att ett enda set matchar räcker inte för att beskriva en hel dos som upprepad.
- Besvär, smärtmarkerad dagsform, återhämtning, reducerad dos, ofullständiga pass och återkomst efter uppehåll prioriteras. Äldre olösta besvär beaktas vid tidpunkten för passet. Förslag om progression beskrivs som försök, inte som redan uppnådda framsteg.
- Ny utrustning eller utförande beskrivs som nytt jämförelseunderlag för en variant, inte som en helt ny övning. Begränsningstexter antar inte att användaren rapporterat smärta.
- Faktainsikten ersätter ett eventuellt skämttillägg för att hålla sammanfattningen kort. Mallar och humor har deterministiskt val och upprepningsspärr.
- Cacheunderlaget omfattar sidmål, oberoende belastningar, dagsform och historiska passdatum. Återöppning validerar sparad text mot aktuella fakta och visar inte en inaktuell planeringsförklaring efter att underlaget ändrats.

Återkopplingspolicy: `WORKOUT-FEEDBACK/3.1.0`. Ingen ändring av träningsmotorns dosregler, databasschema, Dexie-version eller historiska prestationer.

## Verifiering

- Nya regressionstester reproducerade sju fel i originalet innan rättningarna.
- 577 enhets-/UI-tester godkända lokalt med Node 24.19.0, inklusive faktiska träningsförlopp genom applikationslagret, planeringskvitto, historikrättningar, radering och återöppning.
- Typkontroll, ESLint, produktionsbygge och 26 referenskontroller godkända. Beroendegranskning: inga höga/kritiska fynd; fyra låga transienta byggberoendefynd kvarstår. Ingen brytande beroendeuppgradering ingår.
- Nytt webbläsarscenario använder en helt syntetisk historik: 3 × 6 följt av 3 × 8 på 60 kg. Den riktiga byggda appen avslutar passet, visar sex fler repetitioner, behåller formuleringen vid omladdning och tar bort prestationsberöm efter symtomändring. Alla backendanrop fångas i testet; detta är inte ett liveautentiserings- eller synktest.
- Webbläsarscenariot omfattar Android/Chromium, iPhone/WebKit och desktop, ljust/mörkt läge, 320 px utan horisontell överströmning samt axe-kontroller.

Publicering följer `RELEASE_RUNBOOK.md`: grön CI på main, `npm run deploy:staging`, verifierade publicerade filer och separat stagingkontroll av autentisering/synk med tillfälliga syntetiska konton. Releaseutfall och version dokumenteras separat efter utförd publicering. Fysiska telefoner, installerad PWA och VoiceOver/TalkBack är inte verifierade av emuleringen.
