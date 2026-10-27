# Granskning: begriplig och välgrundad plananpassning i STYRKA

Granskad 24–25 oktober 2026 mot den lokala, ännu inte committade implementationen av träningsmotor 2.0. Uppdraget är granskning och revisionsförslag. Ingen produktionslogik har ändrats i denna granskning. Diagnostik och denna rapport har lagts till.

**Bedömning:** grundmodellen är rimlig, men den nuvarande implementationen uppfyller inte fullt ut målet att användarens input ska få konsekvent, synbar och välgrundad effekt. Det finns både reproducerade kodfel och produktregler som saknar tillräcklig individuell kalibrering. Jag rekommenderar att de konkreta felen nedan åtgärdas före publicering och att återhämtnings-/dosreglerna därefter utvärderas med bredare känslighetstester.

Anpassning behöver inte betyda en ändring efter varje pass. Ett begripligt besked om varför samma nivå behålls är också återkoppling. Appen bör visa vad underlaget faktiskt motiverar; den ska inte skapa variation bara för att uppfattas som intelligent.

## Så används användardata i dag

| Indata | Nuvarande användning | Bedömning |
|---|---|---|
| Initial 1RM/3RM/submax, erfarenhet, utrustning | Startlast, repetitionsintervall, viktsteg och kalibrering. Senare jämförbara prestationer ger uppdaterat kapacitetsunderlag. | Rimlig utgångspunkt. Gruppschabloner ska förlora betydelse när individuella observationer finns. |
| Faktisk vikt, repetitioner och arbetsset | Bekräftad nivå, tillfälliga försök, återgång efter miss och möjlig vald lägre dos. | Bra distinktioner, men faktisk passdos kan felaktigt bli varaktigt setmål. |
| RIR och setkänsla | RIR påverkar progression och kapacitetsuppskattning. Setkänsla påverkar främst återhämtning/vila; ”Maxansträngning” kan ge RIR 0. | Bra att ”Lätt” inte förvandlas till ett påhittat exakt RIR. Enstaka lågt RIR får i dag starkt genomslag. |
| Område, sida, uttryckliga begränsningar | Säkerhet, relevans, dosanpassning och sidmål. | Skydden behöver följa med genom alla lastadaptrar och visas korrekt. |
| Tid och pass/vecka | Mallval, minskning av kompletteringsset vid tre pass, borttagning vid tidsbrist. | Påverkar planen, men tillfälliga minskningar kan fastna och fördelningen är fortfarande huvudsakligen mallstyrd. |
| Träningsprioritet | Påverkar vissa regelkonflikter och spontanpass. | Har liten eller ingen effekt på många ordinarie pass, även vid tidsbrist. |
| Extra, avbruten, korrigerad och raderad träning | Aktuell historik används; faktiskt arbete räknas, raderat arbete filtreras bort. | Viktig styrka att bevara. Planerade framtida prestationer används inte som uppnådd kapacitet. |
| Vilopreferens och observerad vila | Vilotimer, tidsbudget och viss försiktighet vid tolkning av prestationstapp. | Rimligt, men delar av anpassningen kräver RIR och blir mindre responsiva utan det. |

Kedjan är `plannerInput` → jämförbar historik och säkerhetsgrind → kapacitet/dos/progression → veckodos och tidsbudget → planrevision och visad föreskrift. Problemen ligger framför allt i övergångarna mellan dessa led.

## Reproducerade brister och föreslagna revideringar

### 1. Dosval och återhämtning följer inte konsekvent med till maskinnivåer

**Hög prioritet, logiska fel.** I ett benpressfall med registrerad knänotering minskar användaren från planerat nivå 9, 3 × 10 till nivå 5, 3 × 6. Medellägets adapter bevarar dosen. Nästa tunga pass använder däremot äldre prestationer på nivå 9 och föreslår nivå 16, 3 × 5. Nivåerna är ordinala etiketter; detta är inte en uppmätt procentuell viktökning.

Ett annat fall ger nivå 5 × 10 vid 47 h 59 min men nivå 6 × 6 exakt vid 48 h. Återhämtningsindikatorn ändras endast från 0,908922 till 0,908484 och är fortfarande begränsande. Kilogramvägen behåller nivån i båda fallen.

**Orsak:** `configuredPrescription.ts:22` väljer historik för samma läge innan dosval analyseras. Adaptern saknar också det fullständiga återhämtningsunderlaget och använder `plan.state` som spärr vid rad 47. Den gamla tidsgrinden kan därmed styra ett beslut som borde använda den kontinuerliga bedömningen.

**Revidering:** analysera relevant dosval före uppdelningen i lätt/medel/tungt. Skicka ett gemensamt beslut om begränsningar och återhämtning till samtliga lastadaptrar. Adaptrarnas uppgift ska vara att hitta genomförbara belastningssteg, utan att återtolka eller tappa överordnade beslut. Behåll variant- och sidavgränsning; överför inte nivånummer mellan olika maskiner.

Underlag och kodrader: [algoritmgranskning](evidence/adaptation-review-2026-10-25/algorithm-audit.md), [reproduktioner](evidence/adaptation-review-2026-10-25/algorithm-audit.json).

### 2. En tillfällig tidsminskning kan bli ett bestående lägre setmål

**Hög prioritet, logiskt fel i dosens livscykel.** Ett 30-minuterspass minskar latsdrag från två till ett set. Åtta senare planer med 90 minuters tillgänglig tid behåller ett set, trots god marginal, sju dygn mellan exponeringarna och inga begränsningar. Repetitionsprogression fortsätter, men setantalet återställs inte.

`adaptiveProgression.ts:129` tar faktiskt setantal som nästa nivå. `prescription.ts:277` tar sedan det lägsta av mallens setantal och historikens förslag. Det saknas en väg tillbaka när orsaken till den tillfälliga minskningen har upphört.

**Revidering:** skilj på bekräftad prestationsförmåga, hållbar/vald dos och tillfällig passdos. Använd redan sparade skäl, exempelvis tidsbrist eller återhämtning. En tidsminskning ska kunna upphöra när mer tid finns; en problemrelaterad vald minskning ska inte återställas av samma regel. Återinför ordinarie rimlig dos försiktigt, utan att kompensera för tidigare missade set.

### 3. Träningsprioriteringar påverkar inte ordinarie pass tillräckligt

**Hög produktprioritet, verifierad funktionslucka.** Jag jämförde hög knäböjsprioritet/låg bänkprioritet med motsatsen vid 20, 30, 45, 60 och 90 minuter, för mall A, B och C. Alla **15 av 15** jämförelser gav identiska övningar, ordning, set, repetitioner och vikter. Vid 20 minuter i A återstod endast knäböj även när bänkpress hade högsta prioritet.

`planner.ts:182` använder prioritet vid vissa konflikter. Den ordinarie ordningen är mallstyrd och tidsborttagningen vid rad 337 går huvudsakligen bakifrån. En användare kan därför lämna relevant input utan att se den avsedda effekten.

**Revidering:** låt prioritet styra ordning och fördelning över de närmaste passen, särskilt vid tidsbrist. Behåll ett rimligt utrymme för övriga rörelser. Högre prioritet behöver inte alltid ge fler set; det kan ge tidigare placering eller jämnare återkommande exponering. En nollprioritet ska inte utan vidare tolkas som förbud mot övningen.

Underlag: [kontrollerade indatajämförelser](evidence/adaptation-review-2026-10-25/input-sensitivity.json).

### 4. Verkliga anpassningar kan döljas eller beskrivas fel

**Hög prioritet, visnings- och återkopplingsfel.** Följande är reproducerat:

- Efter knäböj 60 kg, planerat 3 × 10 men genomfört 3 × 6, säger slutåterkopplingen endast att nästa pass är oförändrat. Nästa mall saknar knäböj. En senare knäböj är faktiskt anpassad till 3 × 6.
- En framtida bänkpress med problemrelaterad anpassning har sparat mål 3 × 4, men planvyn visar mallintervallet 3 × 6–10.
- Vänster sida kan ha 20 kg × 6 och höger sida 21 kg × 5, samtidigt som sammanfattningen visar 20 kg och sex repetitioner ”per sida”. Ändringen av höger sida saknas också i jämförelsens signatur.

Kod: `replanningFeedback.ts:8,14–22`, `trainingPlan.ts:165–179,219`, `Plan.tsx:283` och `widgets.tsx:14–29`.

**Revidering:** skapa en gemensam ändringsbeskrivning som följer med från beslut till visning. Den bör omfatta övning/variant/sida, ändrad dimension, före/efter, beslutsskäl, tillförlitlighet och när den gäller. Slutåterkopplingen ska kunna beskriva nästa förekomst av den tränade övningen, även när den inte finns i nästa mall. Närliggande preliminära pass ska visa det faktiskt anpassade målet; senare struktur kan visas utan precisa vikter. Ett mallintervall får inte motsäga en aktiv dosanpassning.

Underlag: [synbarhetsprober](evidence/adaptation-review-2026-10-25/visible-feedback-results.json). Uppgifterna om framtidsintervall bygger på sparad planslot och den granskade renderingskoden; detta är inte en ny full webbläsarverifiering.

### 5. Återkopplingen använder olika tidsperspektiv

**Medelhög prioritet, begriplighet och beslutsmodell.** Slutjämförelsen räknas vid aktuell tid direkt efter passet. Framtidsplanen använder senaste arbete + 72 timmar, och samtliga framtida rotationsplatser får samma klockslag. Att en rekommendation ändras med tiden kan vara rätt, men återkopplingen riskerar att främst beskriva ”om du tränar nu”, medan användaren tänker på nästa planerade tillfälle.

**Revidering:** skilj dagens träningsberedskap från den preliminära ordinarie planen och från mer långsiktig utveckling. Använd samma deklarerade planeringshorisont för den synliga före-/efterjämförelsen och den berörda framtidsplatsen. Härled ungefärliga mellanrum från befintlig frekvens där kalenderdatum saknas. Anta inte att framtida pass redan är genomförda och tillskriv dem inte framtida styrkeökning.

### 6. Återhämtnings- och veckodosreglerna är för generella för att kallas individuellt validerade

**Medelhög prioritet, policy som behöver prövas.** Tre set med åtta repetitioner, RIR 2 och 75 kg mot ett uppskattat max på 100 kg ger återhämtningspoäng 0,75 efter 48 timmar. Det passerar spärren 0,7 för tungt arbete. Äldre arbete adderas. I veckoplaneringen kan 10 viktade set, eller sex set och 100 repetitioner, begränsa nästa övning till två set.

Det är inte i sig bevis för att just dessa rekommendationer är fel. Problemet är att trösklarna saknar individuell validering och kan fortsätta begränsa trots en historik av tolererade liknande pass. Samma överlappningsmodell används dessutom för både möjlig trötthet och veckodos, fast de beskriver olika saker.

**Revidering:** använd poängen som ett osäkert försiktighetsunderlag, tillsammans med upprepade jämförbara prestationer, faktisk dos och ansträngningstrend. Återkommande större sänkningar bör ha mer stöd än en generell poänggräns. Skilj övningsspecifik styrkeexponering, muskelarbete och trötthetsöverlappning. Utgå från tidigare tolererad dos när sådan finns; bygg inte ett krav på att fylla en missad volymkvot. Hårda gränser och allvarliga symtom ska fortsatt överordnas.

## Forskningsbedömning

Detta är en granskning av hur väl principerna stämmer med litteraturen, inte en klinisk validering av STYRKA. De exakta reglerna om två lyckade exponeringar, 20-procentig dosminskning, 24 timmars halveringstid och givna poänggränser är produktantaganden. Resultat i träningsstudier identifierar inte automatiskt en optimal algoritm för varje person.

| Källa och underlag | Princip som stöds | Konsekvens för STYRKA |
|---|---|---|
| [ACSM 2026](https://pubmed.ncbi.nlm.nih.gov/41843416/): 137 översikter, över 30 000 friska vuxna, mycket underlag från ovana. | Regelbunden styrketräning och målberoende dosering; tyngre belastning, flera set och placering tidigt i passet kan gynna maximal styrka. Failure är inget generellt krav. | Behåll gradvis progression och enkelhet. Låt prioriterade lyft påverka verklig passordning. Underlaget är svagare för exakt individualisering av mycket erfarna personer med besvär. |
| [Pelland 2026](https://link.springer.com/article/10.1007/s40279-025-02344-w): 67 studier, 2 058 deltagare, övervägande unga män; utgivarens abstract granskat. | Volym och frekvens har målberoende samband med utveckling och avtagande utbyte. Direkt/indirekt arbete bör skiljas. | Varken fast gemensamt veckotak eller lika totaldos vid två/tre pass är individuellt bevisat optimalt. En fraktionell dosmodell för anpassning validerar inte samma viktning för återhämtning. |
| [Nuzzo 2024](https://link.springer.com/article/10.1007/s40279-023-01937-7): 7 289 deltagare, både tränade och otränade. | Repetitionsförmåga vid en viss relativ vikt varierar mellan individer och övningar. | Behåll begränsade uppskattningar och lär från jämförbara prestationer. Undvik skenbart exakta omräkningar. |
| [Plotkin 2022](https://pubmed.ncbi.nlm.nih.gov/36199287/): 43 tränade personer, åtta veckors underkroppsträning. | Både repetitions- och viktprogression gav användbara anpassningar. | Stöd för flera progressionsvägar, men inget bevis för obegränsat fler repetitioner eller optimal långsiktig dos för mycket erfarna. |
| [Refalo 2024](https://pubmed.ncbi.nlm.nih.gov/37967832/): 24 tränade personer, bänkpress vid 75 procent av 1RM. | RIR 1 och 3 bedömdes relativt träffsäkert i denna situation. | Behandla RIR som användbar, osäker information. Saknad RIR får inte blockera lärande; källan motiverar inte generell misstro mot svaren. |
| [Robinson 2024](https://link.springer.com/article/10.1007/s40279-024-02069-2): explorativa meta-regressioner med uppskattat RIR; abstract granskat. | Styrkeutfall visar inte samma samband med närhet till failure som muskeltillväxt; exakta samband är osäkra. | Regeln att ett enda set med RIR ≤1 stoppar progression bör känslighetstestas. Väg in hela övningen och trenden, utan att rutinmässigt forcera nästa viktsteg. |
| [Morán-Navarro 2017](https://pubmed.ncbi.nlm.nih.gov/28965198/): tio tränade män, akut återhämtning efter knäböj/bänkpress. | Failure gav långsammare återhämtning även vid jämförelse med samma totalantal repetitioner. | Ansträngning spelar roll utöver reps/set. Studien validerar inte STYRKA:s halveringstid eller poängtrösklar. |
| [Helms 2018](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00247/full): 21 tränade män, åtta veckor. | RPE- och procentstyrd last gav båda utveckling, utan statistiskt säker mellan­gruppsskillnad. | Individuell återkoppling är ett rimligt arbetssätt; undvik löfte om att varje automatisk anpassning ger större styrkeökning. |

Kliniska studier ska inte omvandlas till allmänna diagnos- eller rehabiliteringsregler. [de Wit 2025](https://pubmed.ncbi.nlm.nih.gov/40320557/) analyserar heterogena knäartrosstudier och föreskriven dos. [START 2021](https://pubmed.ncbi.nlm.nih.gov/33591346/) visar att hög intensitet inte var överlägsen för de primära smärt-/ledkraftsutfallen vid knäartros. Dessa resultat stödjer försiktig tolkning, men bevisar inte användarens avsikt när ett set kortas.

För balanserad styrkeökning föreslår jag en rullande översikt över prioriterade lyft och större rörelsemönster. Två-/trepassmallarna saknar exempelvis horisontellt drag i grundrotationen, medan andra frekvenser innehåller det. Det motiverar en översyn av täckningen; det bevisar inte skaderisk eller att ett visst press/drag-förhållande krävs. Fördela efter mål, faktisk tolerans och tillgänglig tid. Ingen universell ”perfekt balanskvot” bör införas.

## Föreslagen upplevelse utan fler obligatoriska frågor

Använd befintlig slutåterkoppling och föreskriftsrad. Visa högst ett par relevanta ändringar enligt **observation → nästa konkreta förslag → kort skäl**. Exemplen nedan är produktförslag som behöver begriplighetstestas:

| Underlag | Exempel på kort återkoppling |
|---|---|
| Upprepad prestation ger stöd för högre vikt. | ”Du har klarat 80 kg med sju repetitioner två gånger. Nästa bänkpass föreslås 82,5 kg × 5.” |
| Jämnt lägre dos i relevant övning. | ”Du genomförde 60 kg, 3 × 6. Nästa knäböjspass utgår tills vidare från den dosen.” |
| Försöket klarades inte, basnivån är etablerad. | ”Nästa gång återgår förslaget till 80 kg × 7, som du tidigare har klarat.” |
| Underlaget är ännu osäkert. | ”Samma nivå nästa gång. Vi behåller den tills fler jämförbara pass ger stöd för en ändring.” |
| Tillfälligt kort pass, nu mer tid. | ”Det senaste passet kortades för tiden. Nu finns plats för det andra ordinarie setet.” |
| Endast en sida har ändrats. | Visa vänster och höger på föreskriftsraden när målen skiljer sig; säg inte samma antal ”per sida”. |

Meddelandet ska ange nästa relevanta övning, inte lova att just nästa kalenderpass innehåller ändringen. Förklaringen ska genereras från det beslut som faktiskt tillämpades, inklusive eventuella överordnade gränser. Skriv ”färre genomförda repetitioner” när avsikten är osäker, och dra ingen slutsats om läkning.

En omräkningsindikator får visa att beräkning sker. Ett besked om ändrad plan ska däremot kräva en faktisk relevant skillnad. När nivån behålls ska skälet vara begripligt, utan att användaren behöver läsa regelkoder eller återhämtningspoäng.

## Genomförandeordning och godkännandekriterier

1. **Samordna beslutsunderlaget före lastadaptrarna.** Återhämtningsbegränsning och vald dos ska ge likvärdigt skydd för kg, nivåer, assistans och oberoende staplar; testa även lägesbyten och 47:59/48:00.
2. **Separera varaktig och tillfällig dos.** Testa 30→90 minuter, frekvensbyte och återhämtning→normal. Samma återställningsregel får inte upphäva uttrycklig eller väl underbyggd problemrelaterad anpassning.
3. **Gör föreskrift, framtidsvy och återkoppling konsekventa.** Exakta sidmål och anpassade reps ska återges; nästa förekomst av övningen ska kunna förklaras. Samma jämförelsehorisont ska användas.
4. **Låt prioritet påverka ordning/fördelning över flera pass.** Testa enbart ändrat mål vid olika tidsbudgetar och kontrollera att övriga rörelser inte trängs undan permanent.
5. **Pröva mer individuell återhämtning och dos.** Jämför alternativ mot nuvarande policy med stabil/förbättrad/försämrad prestation, saknad RIR och avvikande pass. Mäta både uteblivna rimliga steg och omotiverade ökningar/sänkningar; optimera inte endast viktökning.

Utöka regressionerna med ”en ändrad indata i taget” och kombinationer av läge, lastrepresentation, sida, tidsbudget och vald dos. Testa även vilket mål användaren faktiskt ser. De tidigare simuleringarna har en i förväg bestämd kapacitetsutveckling; de kan påvisa logiska problem men inte visa att en träningspolicy orsakar bättre fysiologiska resultat.

I verklig användning bör man följa: genomförbarhet, planerad/faktisk dos och tid, återkommande manuella korrigeringar, upprepat misslyckade försök, rimlig progression och om användaren förstår varför planen ändrades. Gör separata jämförelser för erfarenhet och utrustning. Använd befintlig data och aggregerade utfall; ingen extra insamling av hälsouppgifter behövs för denna första utvärdering.

## Verifiering i denna granskning

- Den befintliga fokuserade acceptanssviten kördes på nytt: **37/37 godkända**. [Resultat](evidence/adaptation-review-2026-10-25/acceptance-current.json).
- Tre diagnostikskript anropar den aktuella domän-/applikationskoden med syntetiska indata: [indatakänslighet](evidence/adaptation-review-2026-10-25/input-probe.mjs), [algoritmvägar](evidence/adaptation-review-2026-10-25/algorithm-audit.mjs), [återkoppling](evidence/adaptation-review-2026-10-25/visible-feedback-probe.mjs).
- De nya reproduktionerna visar luckor som den befintliga acceptanssviten inte fångar. En lyckad diagnostikkörning betyder inte att de observerade felen är åtgärdade.
- Källkodsgranskning och forskningsjämförelse är genomförda. Ingen ny full CI-/webbläsarkörning eller klinisk effektstudie ingår. Ingen produktionskod, historisk användardata eller driftsättning har ändrats.

**Rekommenderat nästa arbete:** rätta de reproducerade adapter-, dos- och visningsfelen först. Förbättra sedan målprioritering och utvärdera de individuella dos-/återhämtningsreglerna. Det ger en anpassning som är både verklig och begriplig utan en mer komplicerad träningsvy.
