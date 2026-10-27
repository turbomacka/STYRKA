# STYRKA: adaptiv träningsmotor 2.0

Arbete påbörjat 23 oktober 2026, slutverifiering 24 oktober. Lokal implementation; ingen produktionspublicering har gjorts. Befintliga ändringar i arbetskatalogen har bevarats.

## Resultat i korthet

Motorn skiljer nu mellan uppskattad kapacitet, faktiskt vald dos, bekräftad nivå och ett ännu obekräftat progressionsförsök. Samma beslutsfunktion används för ordinarie planering, extraarbete och övningsbyten. Lastadaptrar hanterar kilogram, assistans, oberoende viktstaplar, repetitioner och sekunder.

- Två lyckade exponeringar på 80 kg × 7 kan ge ett försök på 82,5 kg × 5. Den tidigare 3-procentsgränsen blockerar inte detta.
- Ett misslyckat högre försök återgår till bekräftad vikt, repetitionsnivå och setantal. Misslyckade försök hålls åtskilda från svårigheter på den etablerade nivån.
- En tydlig dosminskning i en problemrelaterad övning kan bevaras i den ändrade dimensionen. Exempelvis blir 60 kg, 3 × 6 en möjlig utgångspunkt efter planerade 3 × 10, utan kompensationsökning av vikten.
- Återhämtningsunderlaget bygger på faktiskt arbete, repetitioner, ansträngning, osäker relativ intensitet, sida, överlappning och gradvis avtagande exponering.
- Befintlig träningsvy och registrering används. Inga nya inställningar, obligatoriska frågor eller paneler har tillkommit.

De numeriska reglerna är versionssatta produktheuristiker. Simuleringarna verifierar programbeteende under uttryckliga antaganden; de validerar inte fysiologisk återhämtning, skaderisk eller framtida styrkeutveckling.

## Bekräftade brister och åtgärder

| Tidigare beteende | Ändring |
|---|---|
| Generella procenttak kunde blockera nästa faktiska viktsteg permanent. | Nästa tillgängliga steg prövas mot genomförda repetitioner, begränsat RIR-stöd och ett lägre repetitionsmål. |
| Två missar kunde ge viktsänkning även när missarna avsåg en ny, svårare nivå. | Bekräftad nivå och försök är separata. Misslyckade försök räknas inte som missar på basnivån. |
| Lägre repetitioner kunde ge lägre vikt men oförändrat repetitionsmål. | Relevant, jämn dosminskning bevarar vikt/repetitioner/set var för sig. 10/10/6 behandlas annorlunda än 6/6/6. |
| Problemområdesnoteringar nådde inte konsekvent alla föreskriftsvägar. | Område och sida ingår i den gemensamma grinden. Även det äldre bytesflödet använder samma planerare. |
| Återhämtning byggde främst på set och ansträngningsklasser, med skarpa tidsgränser. | Kontinuerlig avklingning av en flerdimensionell, intern dosindikator. |
| Planeringens vilotider kunde skilja sig från passets timer. | Tidsbudgeten anropar samma vilopolicy och inkluderar repetitioner, uppvärmningsschablon, byten och sidarbete. |
| Maskinnivåer kunde behandlas med kilogramliknande omstartsaritmetik. | Ordinala nivåer flyttas till ett tillgängligt föregående steg. Ingen procent eller e1RM beräknas för nivåer. |
| Maxlast kontrollerades inte vid alla manuella planändringar. | Gemensam kontroll omfattar start, förberett pass, byte, planändring, sidmål och andra oberoende viktstapeln. Faktiska registreringar förblir fakta. |
| Ett avslutat, delvis genomfört pass kunde dölja bortvalda arbetsset. | Borttagna planerade set kan ge en explicit mindre dos. Två konsekvent mindre avslutade exponeringar kan också ge stöd; ett enstaka avbrott räcker inte. |

## Gemensam beslutsmodell

`src/domain/adaptiveProgression.ts` är den gemensamma, rena beslutsfunktionen. `decision_engine.ts` lägger säkerhet och omstart runt den. `prescription.ts` och `configuredPrescription.ts` översätter lastrepresentationer. `comparableTraining.ts` avgränsar jämförbar övning, variant, utrustning och sida. `planner.ts` tillämpar program, frekvens, veckodos, mål, parregler och tidsbudget. Application-lagret hanterar transaktioner, aktuella gränser och registreringar.

Indata omfattar ursprungliga och ändrade mål, faktiskt genomförda arbetsset, repetitioner och last per set, frivilligt RIR/ansträngningssvar, teknik, status, tid, relevant problemområde och utrustning. Uppvärmning och förhandsvisningar ger ingen prestations- eller arbetsdos. Pågående, avbrutet, genomfört och raderat hålls åtskilda.

Beslutsordningen är:

1. Blockeringar, allvarliga symtom och uttryckliga gränser.
2. Relevant område/sida och tydligt observerade dosval.
3. Ofullständighet, misslyckat försök och osäker jämförbarhet.
4. Återhämtning, omstart och samlad exponering.
5. Bekräftelse och eventuellt nästa stimulus.
6. Genomförbar utrustning, programprioritering och tid, med slutlig säkerhetskontroll.

Tid och utrustning är även genomförbarhetskrav: en föreslagen progression får inte skapa ett omöjligt viktsteg eller kringgå tidsbudgeten. Ett försök som misslyckas kan återgå till bekräftad nivå även om den senaste tekniken var dålig; det får inte lämna den högre försöksvikten som standard.

### Fyra separata storheter

**Kapacitet:** en försiktig sammanvägning av jämförbara, kontrollerade arbetsset. Median inom exponering och nedre median av högst fem senaste exponeringar begränsar påverkan från enstaka extremvärden. Minst två exponeringar krävs för en uppdaterad maxuppskattning. Set över tio repetitioner används inte för denna uppskattning. RIR ger begränsat stöd och är inte ett exakt mätvärde. Faktiska observationer ersätter gradvis den initiala styrkeuppgiften.

**Vald dos:** vikt, repetitioner och set analyseras separat. En jämn repetitionsminskning på minst 20 procent kan ge en preliminär anpassning i en berörd övning; mindre minskningar behöver upprepas. Ett enskilt trött sista set sätter inte målet för alla set. Minskad last eller antal set kan ge en annan anpassning. Två senare högre, genomförda doser kan uppdatera utgångspunkten, utan att problemområdet antas ha läkt.

**Bekräftad nivå:** etableras genom jämförbara, genomförda exponeringar. Erfarna användare och underlag utan RIR behöver normalt två. En initial nivå med god rapporterad marginal kan bekräftas snabbare för mindre erfarna. En högre nivå än den redan bekräftade behöver två exponeringar.

**Nästa förslag:** kan vara en repetition, ett tillgängligt viktsteg med lägre repetitionsmål, samma nivå, återgång efter försök eller lägre dos efter upprepade svårigheter på basnivån. Motorn höjer inte setantalet för att ersätta en problemrelaterad minskning.

Bekräftad nivå, försök, vald dos, kapacitetsunderlag och beslutsskäl sparas som separata fält i rekommendationens `adaptive`-metadata. De återskapas från aktuella observationer vid varje beräkning. Äldre metadata används inte som sanning efter att en observation korrigerats eller raderats. Misslyckade försök koms ihåg per mål under denna återläsning, så ett repetitionsförsök inte raderar väntetiden för en tidigare misslyckad viktökning.

### Trösklar och övervägda alternativ

| Regel | Val och motiv | Begränsning/alternativ |
|---|---|---|
| Bekräftelse | Normalt två exponeringar; större krav vid högre nivå. | En exponering är snabbare men känsligare för brus; tre fördröjer lärandet. Inte en kliniskt validerad gräns. |
| Nytt viktsteg | Konservativt repetitions-/laststöd, högst en extra repetitions kredit från RIR. | Ersätter procenttak. Formeln är ett osäkert stöd, ingen individuell tabell över procent av 1RM. |
| Repetitionsbrygga | Högst två över bandets övre gräns och aldrig över 15, ingen sådan kompensation vid problemområde. | Ett grovt 20→25-steg kan fortfarande behöva avvaktas eller annan befintlig utrustning väljas. |
| Nytt försök efter miss | Minst två nya positiva exponeringar; upprepade missar kan kräva sex eller starkare prestationsinformation. | Den första varianten glömde ett viktförsök efter en repetitionsmiss. Separat minne per mål minskade pendlingen i stresstestet. |
| Basnivåsvårigheter | Två konsekutiva missar, exklusive försök och tydligt kort registrerad vila. | En enstaka miss behåller nivån. Kort vila: tillförlitligt registrerat intervall under halva rekommendationen, som var minst 60 sekunder. |
| Återhämtning | Halvering av intern indikator över 24 timmar, 14 dygns avgränsning. | Vald för gradvis planering; inte uppmätt biologisk halveringstid. |
| Repetitionsbidrag | `.35 + .65 × sqrt(min(30,reps)/8)`; separat begränsad faktor för ansträngning och relativ intensitet. | Varken rena setantal eller tonnage räcker. Alla koefficienter är heuristiska. |
| Överlappning | Samma rörelsefamilj direkt; partiell anatomisk överlappning högst 0,5. | Grov modell. En bred gruppetikett ensam räcker inte. |
| Återhämtningsnivå | Indikator ≥0,7 begränsar tungt till medel; ≥1,6 ger lätt. | Nivåerna är diskreta även om underlaget är kontinuerligt. Små hopp kan fortfarande ske precis vid dessa poänggränser. |
| Veckodos | Sju dygns faktiskt arbete; kompletteringsset fördelas vid tre pass/vecka. Högt redan genomfört arbete kan begränsa set. | Ingen kompensation för en missad volymkvot. Tak på 10 viktade set, alternativt 6 set och 100 repetitioner, är en försiktig produktpolicy. |
| Omstart | Befintlig försiktigare återstart efter längre uppehåll, men korrekt lastrepresentation och bibehållen historisk kapacitet. | Detta är fortfarande kategoriserat vid 13/28 dygn; omstart är inte en mätning av förlorad styrka. |

Vila kan inte säkert härledas när appen bara vet att ett set loggades. Endast tillförlitliga timerintervall får påverka jämförbarheten. Tidpunkterna för faktiskt arbete används i exponeringen. Ingen osäker vilotid omvandlas till ett exakt fysiologiskt återhämtningsvärde.

## Forskningsanknytning

| Källa och population | Princip som används | Vad den inte validerar |
|---|---|---|
| [ACSM 2026, översikt av systematiska översikter](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/), friska vuxna med varierande träningsbakgrund. | Styrketräningens dos, belastning och fördelning behöver ses tillsammans; program kan anpassas efter mål och genomförbarhet. | STYRKA:s individuella viktsteg, tvåpassregel eller återhämtningspoäng. Underlaget är inte specifikt en modell för mycket erfarna individer med problemområden. |
| [Nuzzo 2024](https://link.springer.com/article/10.1007/s40279-023-01937-7), meta-regression av repetitionsförmåga vid olika relativa belastningar, huvudsakligen friska personer, både tränade och otränade. | Stor variation mellan personer och övningar motiverar försiktiga uppskattningar och faktiskt prestationsunderlag. | Exakt omräkning mellan benpress, knäböj och andra varianter eller ett universellt antal repetitioner vid en given procent. |
| [Pelland m.fl., 2026; publicerad online 2025](https://link.springer.com/article/10.1007/s40279-025-02344-w), meta-regression av volym/frekvens och anpassning. | Samlad dos, avtagande utbyte och indirekt arbete bör beaktas. | De valda sju-dygnstaken eller den enskildes optimala veckodos. Granskningen här omfattade utgivarens abstract, inte fulltext. |
| [Refalo m.fl., 2024](https://pubmed.ncbi.nlm.nih.gov/37967832/), 24 tränade personer, bänkpress vid 75 procent av 1RM. | RIR kan vara användbart men har individ- och uppgiftsspecifik osäkerhet. Motorn fungerar även utan RIR. | Att RIR generellt är oanvändbart, eller att en exakt RIR-kredit gäller alla övningar, erfarenhetsnivåer och repetitioner. |
| [de Wit m.fl., 2025](https://pubmed.ncbi.nlm.nih.gov/40320557/), systematisk analys av 14 studier vid knäartros, DOI 10.1002/msc.70110. | Skilj föreskriven från genomförd dos och undvik antagandet att högre dos alltid ger bättre symtomutfall. | Automatisk rehabiliteringsdos, slutsatser om läkning eller överföring till alla användare med knänotering. Heterogent och begränsat kliniskt underlag. |
| [START, 2021](https://jamanetwork.com/journals/jama/fullarticle/2776330), randomiserad studie vid knäartros. | Högre intensitet ska inte automatiskt antas ge bättre smärt- eller ledbelastningsutfall. | Generella medicinska råd för friska styrketränande, eller STYRKA:s dosdetektion. |

Generella träningsprinciper har forskningsstöd. Individens faktiska val, uttryckliga gränser och tillgänglig utrustning styr produktbesluten. Ingen av studierna validerar den kompletta algoritmen. Kliniska resultat används som skäl för återhållsam tolkning, inte som diagnosregler.

## Simuleringar före och efter

`adaptive_simulation.test.ts` kör 16 profiler × tre oberoende kapacitetsförlopp × två motorversioner över 24 veckor: 96 körningar. Den frysta ENGINE/1-motorn är oförändrad. Båda versionerna möter samma latenta kapacitetskurva och samma deterministiska brus, men deras rekommendationer ger olika genomförda förlopp. Separata identiska historikåterspelningar isolerar regressionsfallen.

Antaganden: startkapaciteten är arbetsvikten multiplicerad med `1 + (startrepetitioner + 3)/30`. Den förändras linjärt per vecka med +2,5 procent för nybörjare, +1,2 procent för medelvana och +0,6 procent för erfarna i förbättringsförloppet; stabilt förlopp är oförändrat och nedgång är −0,4 procent av startkapaciteten per vecka. Dagsformsprofilen får deterministiskt sinusbrus på ±4,5 procent. Uppehåll ligger vecka 8–10 och 18; självvald dosminskning vecka 4–18; profilen med framtvingade misslyckanden missar högre försök under de första tolv veckorna. Dessa antaganden beskriver testdata och är inga prognoser om träningseffekt.

| Mått i 24-veckorssimuleringen | Före | Efter |
|---|---:|---:|
| Observationer med långvarigt oförändrat förslag trots syntetiskt stöd för nästa viktsteg | 1 734 | 924 |
| Därav uttryckligen blockerade av generellt procenttak | 1 374 | 0 |
| Feltolkningar under simulerad självvald problemrelaterad dosminskning | 405 | 0 |
| Överskridanden av angivet viktmaximum i dessa förlopp | 0 | 0 |
| Extra sänkningar under bekräftad vikt direkt efter misslyckat försök i dessa förlopp | 0 | 0 |
| Riktningsbyten i föreslagen vikt | 0 | 69 |

De 924 kvarvarande oförändrade förslagen är **inte 924 konstaterade fel**: 718 har låg rapporterad RIR, 104 bevarar ett tidigare dosval, 100 saknar stöd för ett tillgängligt steg och två väntar på bekräftelse. Räknaren jämför med simulatorns dolda kapacitet, som motorn inte känner till. Den skiljer inte ensam motiverad försiktighet från ett omotiverat stopp.

Riktningsbyten ökade från en modell som ofta stod stilla. De inträffar framför allt vid avsiktligt misslyckade försök, kapacitetsnedgång, dagsformsbrus och återstart. En tidig variant gav 93 byten; separat väntetid per misslyckat mål minskade det till 69. Detta mått ska följas upp, inte beskrivas som ett bevis på optimal stabilitet.

I de identiska återspelningarna gav två misslyckade 82,5-kilosförsök tidigare **77,5 × 5**, nu **80 × 7**. Ett misslyckat åttonde repetitionsförsök utan RIR gav tidigare **37,5 × 8**, nu **40 × 7**. Återgången sker vid nästa beräkning. Efter senare positiva belägg återupptogs progression i samtliga tre kapacitetsförlopp för profilen med återkommande misslyckade försök. Ett separat motorfall med manuellt registrerade 100 kg och maximum 81 kg gav nu högst 80 kg; detta prövar även säkerheten vid motorgränsen, inte bara planerarens tidigare efterkontroll.

För den stabila, erfarna massprofilen med tre pass/vecka var genomsnittet 63 planerade/genomförda arbetsrepetitioner per vecka före och 62,25 efter; slutvikten var 80 respektive 82,5 kg. Vid två pass var motsvarande 42 och 41,25 repetitioner. Dessa är syntetiska jämförelser av en övning, inte rekommenderad total veckovolym.

Hela den nya planeraren testas dessutom i 36 förlopp över 24 veckor, med två/tre pass, utveckling/stabilitet/nedgång, saknad RIR, brus, vald mindre dos, överhoppade och extra övningar. Veckovis planerade/genomförda set och repetitioner redovisas per rörelsemönster. I det stabila standardfallet blev genomsnittet 21,33 arbetsset/vecka vid två pass och 21 vid tre; total planerad tid var 79 respektive 95 minuter/vecka. Fler pass gav alltså inte okritiskt 50 procent fler set. Alla dessa pass hölls inom budgetens tolerans.

Vid **47:59 respektive 48:00** sedan samma träningsarbete gick den tidigare återhämtningsmodellen från lätt-begränsning till ingen begränsning. Den nya gav medel i båda fallen, med intern indikator **0,996820 respektive 0,996340**. Indikatorerna saknar klinisk enhet och ska inte visas som procent återhämtad.

Ett separat känslighetstest kör samma 96 förlopp med en annan repetitionskurva, Brzyckis invers i stället för Epleys. Där minskar stoppmåttet från 1 838 till 930 och feltolkningar av dosval från 405 till en. Den enda kvarvarande avvikelsen inträffar innan önskade sex repetitioner kan urskiljas från det redan föreskrivna målet. Upprepade lägre prestationer identifieras även när återgång till basnivån ligger mellan försöken. Inga maxöverskridanden eller extra viktsänkningar efter misslyckade försök inträffar; viktens riktningsbyten är 58. Båda simulatorerna är förenklade algebraiska modeller och saknar fysiologisk validering. Se [alternativ repetitionskurva](evidence/adaptive-engine-2026-10-23/simulation-alternative-curve.json).

Underlag: [massimulering](evidence/adaptive-engine-2026-10-23/simulation.json), [hela planeraren](evidence/adaptive-engine-2026-10-23/planning-simulation.json), [2 100 planer och återhämtningsjämförelse](evidence/adaptive-engine-2026-10-23/differential.json).

## Automatiserad kvalitetssäkring

- **526/526** enhets-, gränssnitts- och databastester godkända: 426 unit, 38 UI och 62 mot lokal Supabase.
- Acceptansfall A–P samt ytterligare regressionsfall finns i `tests/unit/adaptive_engine.test.ts`. Bland annat provas verklig borttagning, dosminskning i delvis genomfört pass, vänster/höger, maxlast och oberoende staplar.
- **7 000** deterministiskt genererade egenskapsfall: 6 000 för masslast, dos, maxlast, återgång och saknad RIR; 1 000 för oregelbundna ordinala nivåer och omstart.
- **2 100** planer jämförs med den tidigare checkoutens kod. 1 955 ändras och 145 är identiska. Tid, frekvens och återhämtning förklarar avsedda ändringar. Nya 90-minutersplaner utan historik och utan ändrad frekvensfördelning har oförändrade övningsföreskrifter. De tidigare golden-filerna är kvar; en ny versionssatt referens används.
- Den frysta referensmotorns SHA-256 och **26** smoke-kontroller är godkända. Detta verifierar jämförelsebasen, inte den nya motorn.
- TypeScript (app och Node-konfiguration), ESLint och byggd PWA är godkända. **130 webbläsartester godkända, noll fel och elva avsiktligt överhoppade** mot den senaste byggversionen: Android/Chromium, iPhone/WebKit och desktop/tangentbord. Körningen använde två arbetare och inga automatiska omförsök.

Den första fulla webbläsarkörningen gav 127 godkända, tre fel och elva avsiktligt hoppade fall. Felen var samma tidigare återhämtningsförväntan i tre webbläsarprofiler: ett kort maximalt set förväntades alltid ge lätt nästa nivå. Testet har uppdaterats till medel enligt den nya dosmodellen; testet är kvar och fortsatt offline/omladdningsverifierat. `STEP_EXCEEDS_PROGRESS_CAP`-fallen har ersatts med explicita tester av rimliga nästa steg, begränsade repetitionsbryggor och stora, otillräckligt stödda steg.

En mellanliggande full körning gav 129 godkända och ett fel vid kontobekräftelse i WebKit, före övningsbytesflödet. Spåret visade HTTP 401 vid profilläsning. Övningsbytet och hela WebKit-profilen passerade därefter i den slutliga körningen utan ändringar i autentiseringskoden; den enskilda orsaken till 401-svaret är inte fastställd.

Aktuella skärmbilder finns i [local-browser](evidence/adaptive-engine-2026-10-23/local-browser/). Ljust träningsläge i WebKit och mörk avsluts-/planvy i Chromium har också granskats visuellt.

Slutliga körningsresultat sparas i [all-tests.log](evidence/adaptive-engine-2026-10-23/all-tests.log) och [browser-latest.json](evidence/adaptive-engine-2026-10-23/browser-latest.json). Den tidigare `all-tests.json` dokumenterar körningen med 524 tester före de två sista regressionstesten; aktuell full körning med 526 tester finns i loggen ovan. De elva överhoppade fallen hör till den befintliga matrisen: sex särskilda designfotograferingar, tre tester för den avstängda klassiska temavarianten samt två WebKit-fall för tangentbord och ett helt flygplanspass. Övriga offline-/omladdningsfall körs även i WebKit; detta ersätter inte den överhoppade fullständiga sekvensen eller fysisk enhetsprovning.

## Användarupplevelse och historiska data

Användaren ser samma övning, vikt, repetitioner, set och vila. Befintlig slutåterkoppling kan kort beskriva anpassad dos, återgång efter försök eller ett preliminärt högre steg. Den befintliga omräkningsindikationen är kvar och hör till en faktisk omräkning. Ännu ogenomförda pass används inte som prestationer eller kapacitetsbevis.

Ingen databasmigrering behövs. Nya rekommendationsfält är frivilliga JSON-fält; befintlig historik är läsbar. Faktiska vikter/repetitioner, ursprungliga planer och tidigare versioner skrivs inte om. Raderade set filtreras innan kapacitet, återhämtning och planering beräknas. Saknad variant-/sidinformation i äldre data behandlas försiktigt och omvandlas inte till uppfunna sidprestationer. Att en historisk faktisk vikt ligger över ett senare angivet tak ändrar inte den historiska registreringen; nya förslag och planändringar följer taket.

## Återkommande utvärdering och kvarstående begränsningar

Kör `npm run test:adaptive`, `npm run test:adaptive:comparison` och ordinarie testsviter vid policyändringar. Alla slumpfall har fast seed. Jämförelsen använder den historiska commit som är sparad i den nya golden-filen, även efter att den nya motorn har committats. Git-historiken måste innehålla denna commit; `--baseline=<ref>` väljer uttryckligen en annan jämförelseversion. Golden-uppdatering kräver explicit `--write-golden` och ska föregås av granskning av skillnaderna.

`node scripts/evaluate-adaptive-history.mjs <lokal-jsonfil>` kan utvärdera uttryckligen tillhandahållna `PlannerInput[]`. Verktyget skriver aggregerade antal och beslutsskäl utan användaridentifierare och hämtar inga konton eller träningsdata automatiskt. Ett syntetiskt exempel finns i evidensmappen. Ingen ny telemetri eller insamling av personuppgifter har införts. Befintliga versionsnummer, indatahashar och beslutsskäl räcker för framtida lokal återspelning.

Följ i verklig användning framför allt andelen stödda men uteblivna steg, återkommande misslyckade försök, tid till återupptagen progression, överdriven dosminskning, viktpendling, planerad kontra faktisk passtid och användarens fortsatta ändringar efter en automatisk anpassning. Använd aggregeringar och frivilligt, ändamålsbegränsat underlag; samla inte fler hälsoanteckningar för att fylla modellen.

Kvarstående osäkerhet gäller framför allt individuell repetitionsförmåga, överlappning mellan rörelser, generella återstartsgränser, långvariga dosval utan nya högre prestationer och hur konservativ modellen bör vara för mycket erfarna användare. Återhämtningens poänggränser och veckodosens trösklar behöver empirisk uppföljning. Maskiner och sidutföranden med otillräckligt jämförbar historik kan fortfarande behöva den befintliga kalibreringen. Simulerad WebKit/iPhone ersätter inte provning på fysisk iPhone, PWA eller VoiceOver.

[Slutverifiering med käll- och byggfilernas kontrollsummor](evidence/adaptive-engine-2026-10-23/final-validation.json) binder resultaten till den lokala arbetskatalogen, som även innehåller tidigare bevarade ändringar.

Produktionspublicering kräver särskilt klartecken. Lokal testning är inte ett påstående om publicerad eller kliniskt validerad funktion.
