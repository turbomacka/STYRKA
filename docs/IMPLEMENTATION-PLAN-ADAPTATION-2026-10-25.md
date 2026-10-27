# Implementeringsplan: STYRKA som lyssnar, anpassar och uppmuntrar

Datum: 25 oktober 2026. Status: komplett genomförandeplan för nästa revision; ändringarna nedan är ännu inte implementerade eller verifierade. Planen bygger på den lokala träningsmotor 2.0, [granskningen av anpassning](ADAPTATION-REVIEW-2026-10-25.md) och ytterligare granskning av manuell registrering och återkoppling. Tidigare arbete och testresultat finns i [leveransrapporten](ADAPTIVE-ENGINE-2026-10-23.md).

## 1. Resultatet vi ska leverera

STYRKA ska använda vad personen faktiskt genomför, väljer och rapporterar för att föreslå nästa rimliga pass. Anpassningen ska märkas i rätt vikt, repetitioner, set, vila och övningsfördelning, samt i kort återkoppling som visar att informationen kom fram.

Det ska vara lika enkelt att träna som nu. Inga nya obligatoriska frågor, kontroller, personlighetsinställningar, diagram eller paneler. Befintliga föreskriftsrader, planvyer och slutåterkoppling används. Ett oförändrat förslag kan vara rätt och ska då kunna förklaras utan att appen hittar på en ändring.

Särskilt viktigt:

- En representativ, manuellt vald och genomförd arbetsvikt blir relevant utgångspunkt för nästa rekommendation. Appen återställer inte sin äldre vikt av gammal vana.
- ”Lätt” och ”Lagom” följer med hela vägen till beslutet. De är kvalitativa uppgifter, inte påhittade RIR-tal.
- Ett misslyckat progressionsförsök hålls isär från försämrad kapacitet och självvald lägre dos.
- Tillfälligt kortare pass låser inte framtida setantal. Extra arbete gör inte heller automatiskt nästa pass större.
- Hårda gränser, aktuell relevant begränsningsinformation och korrekta lastrepresentationer gäller i alla vägar.
- Återkopplingen blir personlig genom konkreta observationer, varm ton och ibland torr humor. Den ska inte lova framtida resultat eller pressa till mer träning.

**Uttryckligt användarval den 25 oktober:** en försiktig höjning får föreslås redan nästa pass när den manuellt sänkta vikten har genomförts och representativt markerats som Lätt/För lätt. Inget extra bekräftelsepass krävs enbart därför att vikten sänktes. Försöket utgår från den nya valda dosen och behöver vara rimligt med hänsyn till prestation, utrustningssteg och begränsningar. Det är ingen automatisk återställning till den gamla appvikten. Lagom räknas som lyckad träning men utlöser inte ensamt en direkt höjning.

## 2. Brister som revisionen ska täcka

| ID | Verifierad brist eller policyfråga | Avsedd åtgärd |
|---|---|---|
| R1 | En vald lägre dos på en nivåmaskin kan försvinna när passläget ändras. | Analysera dosval före lägesfiltrering och föra samma begränsningar till alla lastadaptrar. |
| R2 | En ordinal adapter kan föreslå progression vid exakt 48 timmar trots fortsatt återhämtningsbegränsning. | Använd ett gemensamt återhämtningsbeslut; ta bort konkurrerande mjuka tidsgrindar. |
| R3 | En minskning från två till ett set för tidsbrist består vid senare 90-minuterspass. | Separera ordinarie dos från tillfällig passdos och definiera hur tillfälliga skäl upphör. |
| R4 | Omvänd knäböjs-/bänkprioritet gav samma plan i alla 15 granskade jämförelser. | Låt mål styra ordning, urval och fördelning när det finns en verklig avvägning. |
| R5 | Sidmål och vissa belastningsfält tappas mellan motor, planslot, jämförelse och text. | Gemensam föreskrift och formattering med full lastrepresentation och sidmål. |
| R6 | Sluttext missar en ändrad övning när den inte finns i närmaste mall. Framtidsvyn kan visa fel repsintervall. | Beskriv nästa relevanta förekomst och visa faktiskt aktivt mål. |
| R7 | Slutjämförelsen använder dagens tid; alla framtidsplatser använder samma +72 timmar. | Gemensam deklarerad horisont, successiva preliminära tillfällen och korrekt före-/efterjämförelse. |
| R8 | Generella återhämtnings- och veckodosgränser kan begränsa utan tillräcklig individuell prövning. | Jämför policyalternativ och ta hänsyn till upprepade jämförbara prestationer. |
| R9 | Enstaka lågt RIR stoppar hela övningens progression; viss viloreaktion kräver RIR. | Bedöm setfördelning, prestation och trend, med en försiktig väg även utan RIR. |
| R10 | ”Lätt”/”Lagom” tappas på väg till progressionsunderlaget. | Bevara rå setkänsla i den gemensamma observationen, även per sida. |
| R11 | Samma manuella sänkning kan räknas som lyckad efter planredigering men som miss vid direkt resultatregistrering. | Separera ursprungligt appmål, aktuellt användarmål och faktiskt resultat. |
| R12 | Minsta vikt/reps bland alla set kan definiera hela övningen; extraset kan bli framtida basdos. | Bedöm ordinarie set och återkommande mönster; undvik ett enda minimum som dosmodell. |
| R13 | En vald lägre dos kan bara släppas efter manuellt högre prestationer och därmed skapa en låsning. | Ompröva också med stabil prestation och upprepade positiva signaler, utan att upphäva hårda gränser. |
| R14 | Generisk feedback och planfeedback gör delvis egna, olika tolkningar. Ett bra set kan dominera viktigare anpassning. | Gemensamma fakta från det tillämpade beslutet, därefter ett separat språklager. |
| R15 | Textcache påverkas av orelaterade senare set, saknar vissa relevanta fält och väljer om text slumpmässigt. | Versionsstyrt, deterministiskt textval med korrekt avgränsad cachenyckel. |
| R16 | Radering lämnar vissa härledda planfeedbackposter och fulltexter för repetitionskontroll. | Samlad invalidering/rensning och minimal lagring av mallreferenser. |

R1–R8 har reproduktionsunderlag länkat i granskningsrapporten. R10–R16 bygger även på granskning av `editPlannedSet`, `logSet`, `SetResult`, `adaptiveNext`, `savedWorkoutFeedback` och deras datavägar. Alla får automatiserade regressioner innan implementationen betraktas som färdig.

## 3. En gemensam beslutsmodell

### 3.1 Håll isär vad uppgifterna betyder

Motorn behåller de fyra huvudbegreppen från uppdraget: uppskattad prestationsförmåga, faktisk/vald dos, bekräftad nivå och föreslagen nästa nivå. För dosens livscykel tillkommer en tydlig skillnad mellan ordinarie dos och tillfällig passdos.

| Begrepp | Innehåll och användning |
|---|---|
| Uppskattad kapacitet | Osäker uppskattning från jämförbara genomförda prestationer. En bättre eller sämre observation ändrar inte ensam hela bedömningen. |
| Bekräftad nivå | Senaste tillräckligt konsekvent genomförda nivå, med referenser till prestationer. Finns kvar när ett svårare försök misslyckas. |
| Vald arbetsdos | Aktuellt representativt dosval, berörda dimensioner, sida, ursprung och säkerhet i tolkningen. Kan vara preliminärt utan att historisk kapacitet skrivs ned. |
| Ordinarie dos | Rimlig dos utifrån mål, frekvens, historik och aktuellt dosval före tillfälliga passbegränsningar. |
| Passdos | Den konkreta föreskriften efter tid, återhämtning, återstart och övriga begränsningar för just detta tillfälle. |
| Progressionsförsök | Ett ännu obekräftat steg, dess grund, utfall och villkor för nytt försök. |

Detta är interna begrepp. De blir inte nya saker användaren måste administrera.

### 3.2 Observationskontrakt

Skapa en gemensam normaliserad observation per genomfört arbetsset och sida. Den ska innehålla:

- Övning, variant, utrustningsidentitet, lastrepresentation, utförande och jämförelsenyckel.
- Ursprunglig appföreskrift och dess skäl, inklusive eventuell tillfällig begränsning.
- Användarens senast valda setmål, när det finns säker uppgift om en ändring.
- Faktisk vikt/nivå/assistans/tid, reps, setroll, sida och genomförandestatus.
- Rå setkänsla, separat RIR, registrerad teknik och tillförlitlig tidsinformation.
- Referens till aktuell registrering och revision; tidigare rättade värden får inte bli aktiva observationer.

`manualOverride` räcker inte för att bestämma ursprung eftersom flaggan inte fångar alla planredigeringar. Lägg vid behov till valfri versionsmärkt ändringsmetadata i befintlig detaljdata. För äldre rader anges okänt ursprung när det inte går att härleda. Säg då ”du genomförde” i stället för att påstå ”du valde”.

En ändrad men ogenomförd plan ger ingen prestationsbekräftelse. Uppvärmning räknas separat från arbetsdos. Delvis genomförda ensidiga set räknas på den sida där arbete finns. Avbrutna pass bidrar med faktiskt arbete utan att alla saknade set behandlas som styrkemissar.

### 3.3 Beslutsordning och ansvar

1. Normalisera aktuell giltig historik; skilj jämförbara prestationer från annan relevant områdesbelastning.
2. Fastställ hårda spärrar, tillåtna övningar, utrustningens genomförbara alternativ och aktuella relevanta varningssignaler.
3. Härled representativa dosval och tillfälliga begränsningar. Analysera dosval före uppdelning i lätt/medel/tungt.
4. Uppdatera kapacitetsunderlag, bekräftad nivå och försöksstatus från faktiska prestationer.
5. Bedöm återhämtning och samlad dos med osäkerhet. Samma signal får inte ge flera oberoende påslag av försiktighet.
6. Välj nästa rimliga dos inom tillåtna alternativ, med hänsyn till mål, frekvens och tid.
7. Låt lastadaptern realisera giltiga steg och enheter. Kontrollera gränser igen efter avrundning och efter eventuell substitution.
8. Spara spårbar beslutsbeskrivning och använd den för plan, visning och feedback.

Säkerhetens prioritet är oförändrad. Utrustningens genomförbarhet är ett villkor redan vid kandidatvalet, inte en detalj som upptäcks efter ett färdigt beslut. Mål och tid får välja mellan tillåtna alternativ, men inte upphäva begränsningar.

`decision_engine.ts`, `prescription.ts`, `configuredPrescription.ts` och `adaptiveProgression.ts` ska få tydliga, avgränsade roller. En adapter får inte ha en egen återhämtningspolicy eller återinföra äldre dos efter att ett överordnat beslut tagits. Gemensamma typer och rena hjälpfunktioner kan brytas ut, men ingen parallell träningsmotor införs.

## 4. Manuella vikter och ”Lätt”/”Lagom”

### 4.1 Grundregeln

En genomförd manuell ändring används som verklig information. Nästa förslag utgår från en representativ vald nivå, förutsatt att den är förenlig med gällande gränser och utrustning. Det är inte samma sak som att en ny maximal kapacitet redan är bekräftad.

”Lagom” betyder att användaren upplevde dosen som passande. Det stöder ett lyckat genomförande och blockerar inte senare progression. ”Lätt” och ”För lätt” ger ytterligare kvalitativt stöd för ett försök. Inget av svaren innebär att vikt måste öka nästa gång. Det som genomfördes, hur många ordinarie set som omfattas och tidigare jämförbara pass väger tillsammans.

### 4.2 Föreslagen beslutsmatris

Exemplen avser nästa jämförbara utförande utan nya överordnade begränsningar. Ett lättare passläge, återstart eller aktuell säkerhetsbegränsning kan motivera annan tillfällig passdos. Då bevaras det manuellt etablerade arbetsmålet separat och avvikelsen får ett uttryckligt skäl.

| Observation | Nästa rekommendation |
|---|---|
| Appen föreslog 80 kg; alla ordinarie set genomfördes på 82,5 kg med avsedda reps och Lagom. | Utgå från 82,5 kg. Behåll den som preliminär arbetsnivå och samla bekräftelse. Gammal procentspärr eller äldre appförslag får inte återställa 80 kg. |
| Appen föreslog 80 kg × 7; användaren genomförde samstämmigt 82,5 kg × 5 och Lagom utan att redigera repsmålet först. | Ändrad vikt tillsammans med jämnt ändrade reps kan ge preliminärt valt arbetsmål 82,5 kg × 5. Det är inte automatiskt bekräftad högre kapacitet och inte en miss enbart mot det gamla appmålet. |
| Appens eget försök var 82,5 kg × 5; samma vikt genomfördes med endast tre reps, utan separat relevant dosanpassning. | Miss på föreslaget försök. Återgå till försökets sparade utgångsdos; Lagom ensam gör inte missade mål till ett nytt användarval. |
| Samma högre val, upprepade Lätt/För lätt och stöd från jämförbar historik. | Ett ytterligare litet försök kan vara rimligt. Det ska bedömas från den genomförda nivån, inte läggas ovanpå den automatiskt. |
| Appen föreslog 80 kg; alla ordinarie set genomfördes på 75 kg, Lagom. | Utgå från 75 kg. Ingen missräkning eller styrkenedgång enbart för att appen tidigare föreslog 80 kg. |
| Samma sänkning, representativt Lätt/För lätt. | Ett litet genomförbart försök får föreslås redan nästa pass, exempelvis 77,5 kg när underlaget stöder det. Utgångspunkten är 75 kg. Om viktsteget är för grovt kan reps prövas inom rimligt intervall eller nivån behållas. Ingen automatisk återställning till 80 kg. |
| Sänkt vikt eller reps i en övning som berör ett registrerat problemområde. | Bevara berörda dimensioner som preliminär anpassning. Lätt ensam upphäver inte den. Ingen kompensation med högre vikt, fler reps eller överlappande extra set. |
| 80, 80 och 60 kg. | Det sista setet räknas i faktisk dos. Gör inte alla framtida set till 60 kg utifrån minsta värdet. |
| 80, 80 och 85 kg, endast sista setet Lätt. | Den högre prestationen är en observation, inte bekräftelse på tre set med 85 kg. |
| Planerat 3 × 10; genomfört 10, 10, 6. | Bedöm setförloppet. Ingen omedelbar omdefinition till 3 × 6. |
| Planerat 3 × 10; genomfört 3 × 6 på samma vikt, relevant problemområde. | Preliminärt 3 × 6 kan vara rätt. Det är en minskning till 18 arbetsrepetitioner, utan automatisk viktkompensation. |
| Ett av tre set genomfört och markerat Lätt. | Räkna det gjorda arbetet. Det ensamma setet motiverar varken allmän kapacitetssänkning eller större nästa pass. |
| Två ordinarie set plus ett extra. | Alla tre räknas i dos och återhämtning. Det extra setet blir inte automatiskt permanent mål. |
| Redigerad vikt men inget genomfört set. | Bevara aktuellt passval, men dra ingen slutsats om styrka. |
| Lätt tillsammans med RIR 0 eller registrerad teknikvarning. | Markera motstridigt underlag; ingen automatisk ökning på grund av Lätt. Ingen ny obligatorisk kontrollfråga. |
| Tungt endast i sista setet. | Bedöm helhet och trend. Ingen automatisk sänkning eller permanent progressionsspärr. |
| Upprepade svårigheter på bekräftad nivå. | Håll eller sänk dos proportionerligt med ett eget skäl, separat från misslyckat högre försök. |
| Genomförd vikt över ett uttryckligt maximum. | Historiken ska återge faktum korrekt. Nästa automatiska förslag och redigerbara plan ska fortfarande respektera maximum. |

### 4.3 Representativ prestation och bekräftelsetakt

Första policyversionen får följande uttryckliga, testbara startregler:

- Samstämmig ändring genom samtliga avsedda ordinarie arbetsset, med uppnått valt repsmål och utan registrerad teknikvarning, kan bli nästa preliminära arbetsvikt redan efter ett pass.
- Blandade set bevaras som setvis evidens. Ett återkommande mönster över minst två jämförbara exponeringar kan ändra arbetsmålet. Ett enstaka toppset, avslutningsset eller extraset får inte styra hela övningen.
- Två jämförbara lyckade exponeringar är grundregel för bekräftelse. Vid stor ändring, begränsade data eller motsägelser krävs mer stöd. Ett enda arbetsset per pass ska inte ges samma evidensstyrka som flera jämförbara set.
- Efter en representativ sänkning är den lägre dosen det nya arbetsmålet. Om genomförandet och samstämmig Lätt/För lätt ger stöd för ett rimligt steg får ett försök föreslås redan nästa pass. Det kräver inte ett extra väntpass eller att nivån först blir fullt bekräftad. Äldre högre kapacitet ensam räcker däremot inte för att upphäva dosvalet.
- Återkommande Lagom och genomförda mål kan stödja ett försök även utan RIR. Återkommande Lätt kan stärka underlaget, men ersätter inte faktisk prestation.
- Vid problemrelaterad dosanpassning krävs upprepade relevanta positiva observationer innan ett försiktigt försök. Hårda spärrar kvarstår. Frånvaro av en ny varning betyder inte att ett problem har läkt.

Antalen är produktantaganden som ska känslighetstestas, inte forskningsbestämda gränser. För ett omedelbart försök efter sänkning krävs genomförda ordinarie arbetsset och Lätt/För lätt på minst två tredjedelar av dem, minst två positiva svar när flera set planerats, utan tydligt motstridigt underlag. Saknade svar ska inte räknas som positiva. Ett enda planerat arbetsset kan användas tillsammans med jämförbar historik, men ett ensamt lätt set utan sådan historik räcker inte för att bekräfta en större helhetsdos. Setordning och sista setets utfall vägs in; ett svar av tre får inte beskrivas som ”seten kändes lätta”.

Klassificera ursprung och samstämmigt dosval före vanlig måluppfyllelse/missräkning. En manuellt ändrad vikt tillsammans med jämnt ändrade reps och positiv/passande känsla kan vara en ny preliminär dos även om det gamla repsmålet inte nåddes. Samma repavvikelse på appens oförändrade progressionsförsök ska däremot bedömas som försökets utfall, om det inte finns ett separat underbyggt dosval. Skillnaden bygger på dokumenterat ursprung och helhetsmönster, aldrig på vilken redigeringsknapp användaren råkade använda.

Varje progressionsförsök sparar den aktuella arbetsdos som försöket utgår från. Vid miss återgår förslaget till den dosen efter aktuella begränsningar, utan extra sänkning. Ett aktivt manuellt dosval har företräde framför äldre högre bekräftad kapacitet vid val av arbetsdos. Exempel: tidigare 80 kg → genomfört valt 75 kg → försök 77,5 kg misslyckas → tillbaka till 75 kg, inte 80 eller 72,5 kg.

Ett självständigt motiverat litet steg kan råka sammanfalla med den gamla appvikten. Det är tillåtet om steget är rimligt från den nya dosen och behandlas som ett försök; den gamla siffran är aldrig i sig ett mål att återställa. Motorn höjer högst en dosdimension åt gången som separat progression. En viktökning får kombineras med ett lägre rimligt repsmål, men inte med samtidiga ökningar av reps eller set.

Förhandsvisning, omladdning och omräkning räknas aldrig som ny prestation. De får visa samma redan motiverade försök, men får inte trappa upp det vidare. Ett misslyckat försök återkommer först efter relevant ny positiv evidens. En återgång och ett nytt identiskt försök får inte varvas utan nytt underlag.

### 4.4 Behåll betydelsen av varje ansträngningssvar

| Svar | Hur det används |
|---|---|
| För lätt | Stark positiv kvalitativ signal när prestationen också är genomförd. |
| Lätt | Positiv kvalitativ signal om den rapporterade dosen. |
| Lagom | Passande upplevd ansträngning; stöd för genomförbar dos, inte ett löfte om mer vikt. |
| Tungt | Hög ansträngning, inte synonymt med misslyckande. |
| Maxansträngning | Behåll befintlig uttrycklig definition om ingen ytterligare repetition med god teknik. |
| Äldre För tungt | Negativ toleranssignal; får inte tyst likställas med Tungt. |
| Saknat svar | Okänd känsla. Registrerade prestationer kan fortfarande ge progression. |

RIR bevaras separat. ”Lätt = RIR 3” och liknande omräkningar införs inte. En rättad vikt/repsregistrering får inte behålla en föråldrad känsla som om den säkert avsåg det nya värdet; bevara befintlig rensning och tillåt ett nytt uttryckligt svar i den ordinarie redigeringen.

### 4.5 Samma regler i alla lastrepresentationer

- **Fria vikter och kilogrammaskiner:** använd giltiga steg, dokumenterad viktbas och rimlig repbedömning. 80→82,5 kg får inte stoppas enbart vid tre procent. Mycket grova steg forceras inte.
- **Nivåmaskiner:** använd ordningen i samma maskins tillåtna nivålista. Ingen procentaritmetik, kilogrametikett eller e1RM från nivånumret.
- **Assistans:** mer assistans är lägre krav; mindre assistans är högre krav. Begränsningar ska tillämpas med rätt semantik, inte genom generell numerisk min/max.
- **Oberoende staplar och ensidigt:** bevara båda lastvärdena och sidvisa mål. Högersidans prestation bekräftar inte vänstersidans kapacitet.
- **Tilläggsvikt, kroppsvikt och tid:** behåll respektive representations befintliga betydelse; okänd last ska inte fyllas med fabricerade kilogram.
- **Variant-/utrustningsbyte:** jämför bara när det finns verklig jämförbarhet. Använd befintlig kalibreringsväg vid ny maskin; inga exakta omräkningar mellan benpress, frontböj och knäböj.
- **Ogiltigt registrerat viktsteg:** behåll det historiska värdet som registrering. Nästa förslag måste vara genomförbart och texten får inte säga ”samma vikt” om en annan faktiskt föreslås.

När inget giltigt alternativ uppfyller begränsningarna används befintlig alternativ-/översynsväg. Avrundning får aldrig användas för att kringgå en spärr.

## 5. Dos, återhämtning, frekvens och balanserad styrkeökning

### 5.1 Tillfällig minskning ska kunna upphöra

Spara vilka dimensioner som ändrades av tid, återhämtning, frekvensfördelning eller återstart och vad den ordinarie dosen var. Ett pass med ett set kan bekräfta genomförd vikt/reps utan att göra ett set till permanent programdos.

När mer tid finns eller det tillfälliga skälet upphör får den ordinarie rimliga dosen återkomma efter kontroll av aktuella begränsningar och historik. En större återställning görs stegvis; startregel är högst ett återinfört ordinarie set per relevant exponering. När ett ordinarie arbetsset återinförs ska samma beslut inte samtidigt öka vikt eller repetitionsmål som separat progression. Det finns ingen skuld av missade set att betala tillbaka.

Automatisk återställning får endast upphäva motorns egen tillfälliga begränsning. Den får inte upphäva ett separat aktivt manuellt dosval, oavsett om användaren har ett registrerat problemområde. Vid blandade orsaker återställs endast den del som faktiskt berodde på det tillfälliga skälet. Äldre oklara orsaker hanteras försiktigt och får inte skrivas om som säkra användaravsikter.

### 5.2 Planera över flera pass

Låt ordinarie planering använda en begränsad rullande horisont, inledningsvis cirka två veckor utifrån befintligt antal pass per vecka. För två respektive tre pass innebär det fyra respektive sex planerade exponeringstillfällen. Annan stödd frekvens behåller samma princip med en tekniskt begränsad horisont.

Rangordning sker deterministiskt inom tillåtna alternativ. Befintlig målprioritet påverkar tidigare placering, vilka övningar som behålls vid tidsbrist och vilka som återkommer över horisonten. Tid sedan relevant faktisk exponering och senaste dos vägs in. Nollprioritet betyder lägre prioritet, inte ett förbud.

Följ täckningen av större rörelsemönster och målövningar. Se särskilt över horisontellt drag i två-/trepassrotationen: omfördela utrymme till lämplig befintlig övning när utrustning, begränsningar och tid tillåter. Lägg inte på obegränsat fler övningar. Ingen universell press/drag-kvot eller påstådd skadegaranti införs.

Två och tre pass behöver inte få identisk totaldos. Fördelningen ska vara rimlig för mål och tidigare genomförd dos, med avtagande nytta av mer arbete och möjlighet till återhämtning. Hög prioritet innebär inte automatiskt större totalvolym. Långvarig tidsbrist ska ge begripliga prioriteringar, inte allt större kompenserande pass.

### 5.3 Skilj tre typer av överlappning

1. Övningsspecifik exponering som underlag för styrka i ett visst utförande.
2. Direkt/indirekt muskelarbete som beskrivning av samlad träningsdos.
3. Rörelse-/områdesöverlappning som osäkert underlag för trötthet och relevanta begränsningar.

Samma viktning ska inte användas för alla tre utan motivering. En modell där indirekta set räknas fraktionellt i en studie validerar inte motsvarande fysiologisk återhämtningspoäng. Gemensamma områden som knä/höft/rygg behöver mer precision än en enda bred muskelgruppsetikett.

### 5.4 Individuell återhämtning med tydliga begränsningar

Behåll set, reps, relativ intensitet där den går att uppskatta, ansträngning, tid och överlappning som separata underlag. Tonnage är beskrivande, inte facit. 2 × 1 och 2 × 20 ska kunna ge olika bedömning, samtidigt som tunga singlar inte antas vara obetydliga enbart för att repsantalet är lågt.

Generella poäng används som osäkert försiktighetsunderlag. Jämför med tidigare liknande dos, intervall och efterföljande jämförbara prestationer. Upprepade stabila utfall kan minska behovet av generella begränsningar; återkommande prestationstapp och hög ansträngning kan stärka dem. Få observationer ger mindre individuell anpassning, inte skenbar precision.

Lärandet ska använda tidsordnade samband: föregående faktisk dos och intervall paras med efterföljande jämförbar prestation, inklusive den senare prestationens egna begränsningar. Utebliven uppföljning, överhoppad övning och ett enklare återhämtningspass är inte i sig bevis för vare sig god tolerans eller försämring. Motorn får inte bekräfta sina egna tidigare försiktighetsbeslut genom att räkna ett lättare föreskrivet pass som bevis på full återhämtning.

Jämför minst tre policyvarianter före val: nuvarande generell policy, generell policy med mildare hållbeslut, och försiktigt individviktad policy. Variera tidsavklingning, gränser och mängden jämförbar historik i känslighetstester. Välj efter flera utfall: obefogade ökningar/sänkningar, pendling, genomförbarhet och rimlig progression. Optimera inte bara antal viktökningar.

Föredra ett motiverat bibehållande eller en begränsad dosjustering framför flera samtidiga sänkningar utan oberoende stöd. Registrera vilket underlag varje ytterligare begränsning bygger på. Hårda spärrar kan aldrig läras bort av lyckade pass.

En kontinuerlig indikator utesluter inte alla diskreta beslut, eftersom vikter och set är diskreta. Kravet är att minutskillnader inte ska skapa omotiverade stora hopp eller att olika adaptrar ska tolka samma begränsning olika. Testa lokala gränser och hysteresis där beslut annars pendlar.

### 5.5 Vila och verklig passtid

Planering och vilotimer ska använda samma vilopolicy. Beräkna arbetsset, uppskattad utförandetid, relevant uppvärmning, setvila och rimliga byten/utrustningsmoment. Ett pass som bara får plats genom orealistiskt kort vila ska inte betraktas som tidsmässigt genomförbart.

Vila ska också kunna omprövas vid återkommande repetitionsfall utan RIR, med lägre säkerhet än när underlaget är tydligare. Jämför belastning, reps, teknik och rå setkänsla; en längre vila är ett prövbart förslag, inte en diagnos av orsaken till tappet. Bakgrundstid och saknade startmarkeringar får inte behandlas som säker vilodata. Bevara uttryckliga befintliga viloval inom deras regler.

### 5.6 Kapacitet och uppehåll

Initial 1RM/3RM och allmän styrkenivå är startunderlag. Jämförbara genomförda prestationer får gradvis större betydelse. Uppskattat 1RM används inom begränsade repsområden och med osäkerhet; höga reps, ordinala nivåer och okända maskinvikter ska inte ge falsk precision.

Historisk kapacitet behålls vid uppehåll. Återstart är en tillfällig passanpassning som kan omprövas av aktuella prestationer, även på nivåmaskiner. Första positiva passet efter ett längre uppehåll ska inte automatiskt återställa all tidigare volym och samtidigt öka vikten.

## 6. Samma beslut i plan, träningsvy och återkoppling

### 6.1 En gemensam ändringsbeskrivning

Låt planberäkningen producera ett strukturerat beslut med övning/variant/sida, berörda dimensioner, före/efter, viktigaste skäl, evidensreferenser, osäkerhet, tillfällighet och nästa relevanta förekomst. Behåll algoritm-/policyversion och indatafingeravtryck internt.

`refreshFuturePlan` ska kunna lämna tillbaka beslutsbeskrivningarna. Feedback ska inte köra en oberoende coachberäkning med annan tidshorisont. Samma slutliga föreskrift används av planslot, revisionsjämförelse, formattering och start av det faktiska passet.

Bevara minst `targetLoadValue`, `targetSecondLoadValue`, `sideTargets`, nödvändig konfiguration, reps, set, sekunder och vila i rätt representation. Jämförelsesignaturer ska omfatta verkliga mål och relevanta skäl, inte bara en del av kilogramfälten eller interna tillståndsnamn.

### 6.2 Horisont och preliminära rekommendationer

- Ett pass som startas nu beräknas med faktisk tid.
- Närliggande framtidsplatser får successiva interna tidsantaganden utifrån befintlig frekvens när kalender saknas. Dessa är ungefärliga planeringsantaganden, inte avtalade träningsdagar.
- Före-/efterjämförelsen använder samma målpass, tid, profil, begränsningar och rotation; den relevanta nya registreringen är skillnaden.
- Sluttexten beskriver nästa förekomst av den berörda övningen inom planeringshorisonten. Om ingen sådan är möjlig ska texten inte lova ett specifikt nästa övningspass.
- Planerade framtida set får bidra till fördelningen av planerad dos men aldrig användas som genomförda prestationer, bekräftad kapacitet eller redan inträffad fysiologisk trötthet.
- Kontrollera även den planerade sekvensen villkorligt: om passen genomförs som föreslaget ska dos, rörelseöverlappning och avstånd mellan dem vara rimliga. Den kontrollen hålls skild från faktisk återhämtning och för inte in syntetiska set i träningshistoriken.
- Närliggande pass visar aktuell preliminär föreskrift. Mer avlägsen struktur ska inte visa skenbart exakta framtida styrkeökningar.
- När ett framtida pass faktiskt öppnas räknas det om från då aktuella fakta. En skillnad som beror på nya fakta ska kunna spåras.

### 6.3 Visning utan fler kontroller

Använd befintliga rader. Lika sidmål kan visas ”per sida”. Olika mål visas kompakt som vänster/höger i samma komponent; ingen ny sidopanel. Ett aktivt mål 3 × 4 får inte ersättas av mallintervallet 6–10. Maskinnivåer visas som nivåer, assistans som assistans och hantelvikt med korrekt bas.

Slutåterkopplingen innehåller en kort bekräftelse och högst två relevanta beslut. Undvik en lista över alla oförändrade övningar. Det viktigaste beslutet väljs efter användarrelevans: aktuell spärr eller anpassning får inte döljas av ett enstaka bättre set någon annanstans.

Den befintliga omräkningsindikatorn kopplas till verkligt beräkningsarbete. Ett sparat pass och en lyckad omräkning är två olika utfall. Om beräkningen misslyckas ska texten bekräfta sparad träning men inte hävda att planen uppdaterats. Återförsök får inte skapa dubbla revisioner eller byta beröm vid varje rendering.

## 7. Personlig återkoppling med torr humor och pepp

### 7.1 Tonen

Personligheten kommer först från att STYRKA uppmärksammar det användaren faktiskt gjorde. Skriv till ”du”, med ett konkret resultat eller dosval och ett begripligt nästa förslag. Språket ska vara vuxet, varmt och framåtblickande.

Beröm även jämn prestation, genomtänkt anpassning och att ett rimligt pass genomfördes. Mer vikt, fler set och högre ansträngning är inte de enda saker som får positiv respons. Ett kortare pass ska inte utlösa skuld eller krav på revansch.

Humor är en valfri kort avslutning som kan tas bort utan att information går förlorad. Den får handla om små steg, kilogram och träningsdagbokens vardag. Den får inte rikta sig mot personen, kroppen, ålder, smärta, misslyckade försök eller frånvaro. Ingen sarkasm, hån, tävlingspress eller skämtsam medicinsk bedömning.

Startregel: högst en humorfras i ett meddelande och minst två lämpliga avslutade pass utan humor mellan användningarna. Detta är ett tak, aldrig en kvot. Vid aktuella symtomspärrar, avbrutet/tomt pass, misslyckat försök eller tekniskt fel används varm saklighet. En gammal områdesnotering behöver däremot inte göra all framtida återkoppling klinisk.

Undvik ”nu är du starkare” efter ett enstaka set, ”du är återhämtad”, ”knät är bättre” och ”nästa gång klarar du det”. Skriv exempelvis ”det ger stöd för att prova” och ”en bra utgångspunkt för nästa pass”. Ingen formulering ska uppmana till omedelbart nytt pass eller antyda att vila är ett hinder.

### 7.2 Exempel på sluttext

Exemplen förutsätter att motsvarande observation och beslut faktiskt finns. Siffror, övningsnamn och nästa mål hämtas från föreskriften, inte från fri textgenerering.

| Situation | Exempel |
|---|---|
| Manuell sänkning, Lagom | ”Du valde 75 kg och markerade seten som lagom. Nästa bänkpass utgår från 75 kg igen. Bra jobbat med dagens pass.” |
| Manuell sänkning, Lätt och rimligt viktsteg | ”Du genomförde dina tre set på 75 kg och markerade dem som lätta. Nästa bänkpass föreslår 77,5 kg med sex repetitioner. Ett litet steg från din valda vikt.” |
| Manuell höjning genomförd | ”Du genomförde 82,5 kg med fem repetitioner i alla tre set. Nästa bänkpass utgår från den vikten. Snyggt arbete.” |
| Upprepade lätta pass, nytt försök | ”Du har klarat 80 kg, 3 × 7, och markerat seten som lätta. Nästa bänkpass föreslår 82,5 kg, 3 × 5. Små steg räknas. Även de som väger 2,5 kilo.” |
| Repprogression efter vald lägre vikt | ”Dina senaste pass ger stöd för ett litet steg. Nästa förslag behåller 60 kg och provar sju repetitioner per set.” |
| Bibehållen nivå | ”Du genomförde 80 kg, 3 × 7 igen. Vi behåller den nivån ett pass till för att få säkrare underlag. Bra jobbat — det här går att bygga vidare på.” |
| Problemrelaterad repanpassning | ”Du genomförde 60 kg, 3 × 6. Nästa knäböjspass utgår från samma dos. Din genomförda nivå får styra.” |
| Misslyckat högre försök | ”Nästa bänkpass utgår från 80 kg, 3 × 7, som du tidigare har klarat. Försöket på 82,5 kg hjälper oss att välja nästa steg.” |
| Tillfällig tidsminskning upphör | ”Förra passet fick ett set för att rymmas på tiden. Nu finns plats för två ordinarie set igen.” |
| Kortare pass | ”Två arbetsset blev gjorda och sparade. De räknas in när nästa plan beräknas. Det du hann göra räknas.” |
| Extra övning | ”Du lade till två set rodd. De räknas med när kommande träningsdos planeras. Bra jobbat med dagens pass.” |
| Återkomst efter uppehåll | ”Välkommen tillbaka. Dagens pass ger nytt underlag, och nästa förslag utgår från det du genomförde. Ett pass i taget.” |
| Aktiv begränsning stoppar ökning | ”Nästa förslag behåller 60 kg eftersom din registrerade belastningsgräns gäller. Dagens genomförda set finns sparade.” |

Exakt beröm och humorfraser ska redaktionellt granskas i sina sammanhang. Det finns inget forskningsstöd i denna granskning för att en viss skämtfrekvens ger bättre motivation; detta är en produktfråga som ska följas upp.

### 7.3 Textarkitektur och variation

Använd en lokal, versionshanterad mallbank. Varje mall har id, beslutstyp, faktakrav, ton och eventuell humorfamilj. Separera saklig observation/åtgärd från valfri uppmuntran. Det gör det möjligt att variera språk utan att ändra rådet.

Välj deterministiskt utifrån session, relevant beslut och textversion. Undvik nyligen använda mallar och humorfamiljer över exempelvis de senaste tio relevanta passen före den aktuella sessionen, i stabil händelseordning. Spara mall-id och minimal beslutsreferens för detta, inte en extra historik av fulltexter. Repetitionskontrollen ska uppdateras idempotent en gång per relevant återkoppling, inte vid varje rendering. Vid rättning behålls mallvalet om det fortfarande passar korrigerade fakta; senare pass får inte i sig ändra tonvalet för det äldre passet.

Cache ska omfatta relevanta registreringar, konfiguration, berörda begränsningar, datum/händelseordning, policyversion och deklarerad horisont. Senare orelaterade pass ska inte slumpa om äldre feedback. Korrigering av underlaget ska däremot uppdatera fakta och återkalla ett felaktigt besked. Historisk återkoppling måste tydligt vara knuten till då beräknad planrevision, inte framstå som dagens nya rekommendation.

Vid radering, ångring och rättning invalideras berörda `workout-feedback`, `replanning:*` och repetitionsreferenser genom den gemensamma datalivscykeln. Invalideringen följer underlagsreferenser till berörda senare beslut. Kvarvarande historisk text får inte fortsätta hävda en prestation som har rättats eller raderats. Förnyat textval får inte i sig sprida omskrivning till orelaterade pass. Inga tränings- eller hälsouppgifter behöver skickas till en extern språkmodell.

## 8. Tekniskt genomförande och bakåtkompatibilitet

### 8.1 Ansvar per kodområde

| Område | Planerad förändring |
|---|---|
| `domain/model.ts`, `domain/trainingFlow.ts`, relevanta typer i `decision_engine.ts` | Gemensamma typer för observation, dosens ursprung/livscykel, kvalitativ känsla och spårbart beslut. |
| `application/workout.ts`, `application/training.ts` | Bevara appmål, redigerat mål och faktiskt resultat; konsekvent beteende vid registrering, korrigering, ångring, extraarbete och radering. |
| `application/plannerInput.ts`, `planner/history.ts`, `domain/comparableTraining.ts` | Projicera bara aktuell giltig evidens, inklusive setkänsla och sidvisa värden; skilj jämförbar kapacitet från relevant överlappning. |
| `domain/adaptiveProgression.ts` | Separera valt arbetsmål, bekräftelse och försök; ersätt minimum över alla set; beakta rå känsla och helhet. |
| `domain/prescription.ts`, `domain/configuredPrescription.ts`, `domain/decision_engine.ts` | Gemensamt beslut före adaptrar; likvärdig återhämtning och dosrespekt över lägen/representationer; slutlig gränskontroll. |
| `domain/recoveryPolicy.ts`, `domain/trainingDose.ts`, `domain/restPolicy.ts` | Skilda ändamål för dos/överlappning, jämförd individuell policy, vila även utan RIR och gemensam tidskostnad. |
| `planner/planner.ts` och befintliga mallar | Målstyrd ordning, rullande fördelning, relevant rörelsetäckning, tidsprioritering och återställning av tillfällig dos. |
| `application/trainingPlan.ts`, `application/replanningFeedback.ts` | Gemensam horisont, full föreskrift i slots, nästa relevanta förekomst och strukturerad ändringsbeskrivning. |
| `application/workoutFeedback.ts`, `domain/workoutFeedback.ts`, `ui/strings.ts` | Fakta från faktiskt beslut, situationsanpassad varm ton, mallbank, variation och korrekt cachelivscykel. |
| `ui/components/widgets.tsx`, `ui/screens/Plan.tsx`, `ui/screens/Finish.tsx` och befintlig setrad vid behov | Korrekt kompakt formattering, exakta aktiva reps/sidmål och kort återkoppling i befintliga ytor. |
| `tests`, befintliga simulerings-/utvärderingsskript, `science/evidence.json`, `docs` | Spårbara regressioner, jämförelser, källor, känslighetsanalys och leveransrapport. |

Nya hjälpfiler kan motiveras för rena normaliserings-, besluts- eller formatteringsfunktioner. Ansvaret ovan ska ändå vara en sammanhängande kedja och inte dupliceras mellan UI och domän.

### 8.2 Historik och synk

Föredra valfri versionsmärkt metadata i befintliga JSON-detaljer och snapshots där det räcker. Kontrollera lokal validering, servermappning och synk innan slutsatsen dras att ingen schemamigration behövs. En eventuell migration ska ha eget testunderlag för gamla/nya klienter, återställning och konflikter.

- Äldre oföränderliga snapshots och faktiska prestationer skrivs inte om för att passa den nya modellen.
- Nya framtidsrevisioner får ändras när aktuell historik räknas om.
- Bekräftad nivå, dosval och försöksstatus ska kunna återskapas från giltig historik. En cache får inte bli den enda sanningen.
- Korrigerade, raderade och ångrade värden ska försvinna ur aktiv beräkning och ur relevant återkoppling.
- Nya frivilliga fält ska överleva synkrundresa utan att äldre rader slutar fungera.
- Samtidiga ändringar, offlinearbete, omladdning och återförsök ska gå genom befintliga transaktioner och konfliktregler.
- Sen synk eller återförsök av en äldre ändring får inte återuppliva raderad prestation, ersatt värde eller inaktuell feedback. Testa två enheter, båda synkordningarna och replay efter omladdning.
- Bevara separationen mellan användare. Ingen extra insamling av person- eller hälsouppgifter behövs.

Versionera policy och texter separat. En intern återgång till föregående algoritm ska inte kräva radering av historik eller nya användarinställningar. Undvik en produktionsflagga som låter två konkurrerande motorer ändra samma plan samtidigt; jämförelsekörning ska vara läsande och utan sidoeffekter.

## 9. Forskning, antaganden och vad som ska följas upp

Den fullständiga källgranskningen och populationsbegränsningarna finns i [forskningsavsnittet i granskningsrapporten](ADAPTATION-REVIEW-2026-10-25.md#forskningsbedömning). Följande kopplingar ska bevaras i beslutsdokumentation och evidensregister:

| Princip | Underlag | Vad studierna inte fastställer |
|---|---|---|
| Regelbunden målberoende styrketräning, flera set, betydelsen av tyngre belastning och placering av prioriterade lyft. | [ACSM 2026](https://pubmed.ncbi.nlm.nih.gov/41843416/). | Exakt individuell dos eller bekräftelsetakt för en mycket erfaren person med besvär. |
| Volym/frekvens har målberoende samband och avtagande utbyte; direkt/indirekt arbete behöver skiljas. | [Pelland 2026](https://link.springer.com/article/10.1007/s40279-025-02344-w). | Ett universellt veckotak eller att samma fractional-set-värde mäter fysiologisk trötthet. |
| Repetitionsförmåga vid relativ belastning varierar mellan person och övning. | [Nuzzo 2024](https://link.springer.com/article/10.1007/s40279-023-01937-7). | Exakta maskinomräkningar eller säkert nästa repsmål från en generell formel. |
| Både reps- och viktprogression kan vara användbara. | [Plotkin 2022](https://pubmed.ncbi.nlm.nih.gov/36199287/). | Att obegränsad repökning är optimal eller att alla erfarna ska öka lika snabbt. |
| RIR kan vara användbar information i studerade förhållanden; failure är inte ett generellt krav för styrkeutveckling. | [Refalo 2024](https://pubmed.ncbi.nlm.nih.gov/37967832/), [Robinson 2024](https://link.springer.com/article/10.1007/s40279-024-02069-2), ACSM. | Exakt RIR från orden Lätt/Lagom eller ett universellt veto från ett enda RIR ≤1. |
| Ansträngning påverkar återhämtning utöver totalantal reps. | [Morán-Navarro 2017](https://pubmed.ncbi.nlm.nih.gov/28965198/). | Att 24 timmars halveringstid eller STYRKA:s poängtrösklar är validerade individuella mått. |
| Autoreglering är ett rimligt arbetssätt som behöver prövas. | [Helms 2018](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00247/full). | Överlägsen effekt av varje automatisk anpassning eller av just denna algoritm. |
| Högre intensitet är inte automatiskt bättre symtombehandling i kliniska grupper. | [de Wit 2025](https://pubmed.ncbi.nlm.nih.gov/40320557/), [START 2021](https://pubmed.ncbi.nlm.nih.gov/33591346/). | Diagnos, läkning eller användarens avsikt utifrån en sänkt registrerad dos. |

Två bekräftelser, representativitetsregler, återställning med ett set, tvåveckorshorisont, textlängd och humorfrekvens är uttryckliga produkt-/algoritmantaganden. De ska versionsmärkas, känslighetstestas där det är relevant och omprövas med verklig användning. Simulering kan avslöja logiska fel, men kan inte bevisa bättre fysiologisk effekt eller högre motivation.

## 10. Acceptans- och verifieringsplan

### 10.1 Befintliga och nya acceptansfall

Behåll samtliga ursprungliga A–P: rimligt viktsteg, bekräftat/misslyckat försök, saknad RIR, problemrelaterad reps-/viktsänkning, normal trötthet, setminskning, återhämtningsdos/tidsgräns, frekvens, ensidighet, nivåmaskin efter uppehåll, radering, extraövning och hårda gränser. En äldre förväntan om `STEP_EXCEEDS_PROGRESS_CAP` ska ersättas av uttrycklig prövning av genomförbart steg, inte bara tas bort.

Komplettera med följande namngivna acceptansgrupper:

| Grupp | Obligatoriska nya kontroller |
|---|---|
| M1 Registreringsväg | Samma slutliga manuella dos via planredigering och direkt resultatregistrering ger samma nästa arbetsdos. Ursprungligt appmål och aktuell prestation bevaras. |
| M2 Höjd vikt | Alla ordinarie set på högre giltig vikt + Lagom/Lätt utan RIR används som ny preliminär utgångspunkt; inget återfall enbart till gammal appvikt. |
| M3 Sänkt vikt | Samstämmig sänkning + Lagom blir inte två misslyckanden. Representativt Lätt/För lätt och ett rimligt steg kan ge försök redan nästa pass, utan obligatoriskt väntpass eller automatisk återställning till gammal appvikt. Ett misslyckat försök återgår till den valda utgångsdosen. |
| M4 Blandade set och ursprung | 80/80/60, 80/80/85 och 10/10/6 omdefinierar inte alla set utifrån minimum eller maximum. Parade fall skiljer manuellt 80 × 7→82,5 × 5 Lagom från miss på appens 82,5 × 5-försök. |
| M5 Ansträngning | För lätt, Lätt, Lagom, Tungt, Maxansträngning, äldre För tungt och saknat svar bevaras; upprepade Lagom tillåter progression; RIR-konflikt ger inte oförklarad höjning. |
| M6 Begränsad evidens | Ett av tre set, ett extra set och en ofullständig sida får inte bekräfta större helhetsdos. |
| M7 Representationer | Nivåmaskin över lägesbyte, assistansriktning, tilläggsvikt, sekunder, andra stapeln och vänster/höger följer hela kedjan. |
| M8 Tillfällig dos | 30→90 min, frekvens 3→2 och återhämtning→normal släpper tillfällig minskning. Samma test med aktivt manuellt dosval, med och utan problemområde, får inte återställa bortvald dos. Återinfört set kombineras inte med separat vikt- eller repsökning. |
| M9 Omprövning | Vald lägre dos kan senare utvecklas efter nya positiva belägg utan att kräva att användaren själv måste gissa en högre vikt. Hårda gränser kvarstår. |
| M10 Mål och balans | Prioritetsbyte påverkar ordning/urval/fördelning där en avvägning finns. Övriga möjliga rörelsemönster trängs inte undan permanent i realistiska tidsbudgetar. |
| M11 Tid och vila | Beräknad tid använder samma vila som passet. Nästan identiska tidsintervall ger närliggande bedömning genom alla adaptrar. |
| M12 Synbarhet | Exakt nästa dos överensstämmer mellan beslut, planslot, föreskriftsrad, sluttext och faktiskt startat pass vid samma relevanta indata. |
| M13 Nästa förekomst | Anpassad knäböj förklaras även när närmaste mall saknar knäböj; 3 × 4 visas inte som 6–10. |
| M14 Rättning/radering | Rättning, ångring, borttaget set/pass och ändrat datum tar bort gammalt inflytande från kapacitet, dos, försök och beroende textcache. Äldre offlineändring från annan enhet återupplivar inte borttaget/rättat arbete. |
| M15 Språk | Inga progressionspåståenden när ökning stoppats; inga medicinska slutsatser; inga skämt i avstängda situationer; högst två viktiga beslut. |
| M16 Stabilitet | Identiska relevanta indata ger samma beslut och text; tio previews eskalerar inte ett redan föreslaget steg och skapar inte nytt beröm; senare orelaterad träning ändrar inte gammal saklig återkoppling. |
| M17 Fel och återförsök | Sparande lyckas men omräkning misslyckas: inget falskt uppdateringsbesked. Återförsök är idempotent och beräkningsindikatorn följer faktiskt arbete. |

Kombinera mål, läge, variant, representation, sida, ansträngning och tidsbudget i egenskapstester. Det räcker inte att varje funktion klarar en isolerad testfixture.

### 10.2 Egenskaper som aldrig får brytas

- Ingen automatisk föreskrift utanför uttryckliga gränser eller utrustningens giltiga steg.
- Ingen ordinal procent-/e1RM-aritmetik och ingen omvänd assistanslogik.
- Ingen extra sänkning enbart på grund av ett misslyckat obekräftat högre försök.
- Ingen kompensationsökning från en relevant vald dosminskning.
- Ingen prestationsbekräftelse från uppvärmning, previews, framtidsplaner, raderat eller ångrat arbete.
- Ingen överföring av en sidas prestation till den andra utan verkligt underlag.
- Ingen oändlig repstegring för att kringgå alltför grova viktsteg.
- Identiska relevanta indata och policyversioner ger deterministiska beslut.
- Saknad RIR och saknad äldre metadata ger fungerande, försiktiga beslut utan beräkningsfel.

Kör minst den befintliga mängden egenskapstester och utöka till minst 10 000 reproducerbara genererade fall över representationerna. Spara seed och minimerat motexempel vid fel. Antalet i sig är ingen kvalitetsgaranti; varje viktig invariant ska ha meningsfull täckning.

### 10.3 Longitudinella simuleringar och jämförelse

Bygg vidare på befintliga 24-veckorssimuleringar. Jämför den tidigare baslinjen, nuvarande motor 2.0 och reviderad policy på samma syntetiska förlopp och separata alternativa kapacitetsantaganden. Bevara källfingeravtryck och policyversioner så resultaten går att återskapa.

Utöver ursprungsuppdragets profiler ska förloppen omfatta återkommande manuella höjningar/sänkningar, Lagom utan RIR, Lätt med motsägande RIR, topp-/avslutningsset, tids-/frekvensbyten, problemrelaterad minskning, hög målprioritet under tidsbrist, tillagda/överhoppade övningar och stabil respektive sjunkande kapacitet. Kör alla relevanta lastrepresentationer.

Redovisa:

- Oönskad återställning till gammal appvikt, extra sänkning och permanent fastnad tillfällig dos.
- Ogrundade försök, omotiverade stopp, återgångstid efter miss och återupptagen progression efter positiva belägg.
- Pendling mellan nivåer och känslighet nära tids-/dosgränser.
- Planerad och genomförd veckodos som set, reps och last separat; inte bara tonnage.
- Fördelning av prioriterade övningar och täckning av möjliga rörelsemönster.
- Planerad/faktisk tidsmodell, återhämtningsbedömning och påverkan av ofullständiga data.
- Överensstämmelse mellan tillämpat beslut, synligt mål och återkoppling.

Varje påstått ”omotiverat” utfall måste ha en deklarerad bedömningsregel eller en känd invariant, så jämförelsen inte bara belönar den nya algoritmens egna antaganden. Spara separata resultat per erfarenhet, utrustning, frekvens och begränsningsscenario. Ingen sammanvägd vinst får dölja försämring i ett säkerhetskritiskt delscenario.

### 10.4 Integration, UI och relevant testmiljö

Verifiera hela flödet: planera → redigera vikt → genomför → ange känsla → avsluta → verklig omräkning → läs nästa relevanta mål → starta pass. Upprepa med rättning, ångring, radering, extraövning, övningsbyte och offline/synk.

Kör befintlig typkontroll, lint, referenskontroll, enhets-/UI-/databastester, adaptiva tester, jämförelseskript, build och Playwright. Befintliga kommandon omfattar `npm run typecheck`, `npm run lint`, `npm run test:reference`, `npm test`, `npm run test:adaptive`, `npm run test:adaptive:comparison`, `npm run build` och `npm run test:e2e`. Utöka skripten endast där nya kontroller behöver en återkommande ingång.

Mobilverifiering ska kontrollera de faktiska siffrorna och orden, inte bara att skärmen öppnas. Testa smal mobilvy, svensk decimalformatering, långa övningsnamn, sidmål, tangentbord, skärmläsartext och bibehållet fokus. Ingen ökning av obligatoriska interaktioner för ett vanligt pass accepteras. Redaktionell granskning ska bedöma värme och sarkasm i sammanhang; strängtester räcker inte.

Bind slutligt testunderlag till samma exakta källversion och byggda artefakt. Lokal build, simulerad användning, verifierad testmiljö och publicerad produktion ska redovisas separat. Produktionspublicering kräver särskilt klartecken.

## 11. Genomförandeordning och leverabler

| Fas | Arbete | Färdig när |
|---|---|---|
| 1. Beteendekontrakt | Gör R1–R16 och M1–M17 till spårbara regressioner; säkra jämförelsebaslinjer och aktuell filstatus. | Felen går att reproducera och förväntade beslut är uttryckliga. Befintligt orelaterat arbete är bevarat. |
| 2. Gemensamt underlag | Observationsmodell, dosens livscykel, ursprung, ansträngning och gemensamt beslut före adaptrar. | Samma registrering betyder samma sak oavsett UI-väg och lastrepresentation. Gamla data kan läsas och räknas om. |
| 3. Manuell dos och progression | Representativa set, vald vikt, bekräftelse/försök, omprövning och gränsskydd. | Manuell vikt + Lätt/Lagom beter sig enligt matrisen; misslyckade försök och dosval blandas inte ihop. |
| 4. Helhetsplanering | Tillfällig dos, målordning, frekvens, rörelsetäckning, individuell återhämtning och gemensam vila/tid. | Rullande planer är rimliga och jämförda policyalternativ saknar oförklarade säkerhets-/stabilitetsregressioner. |
| 5. Synlig anpassning | Fulla slots, gemensam horisont, korrekt formattering, nästa förekomst och ändringsbeskrivning. | Användaren ser samma mål som motorn faktiskt rekommenderar. |
| 6. Personlig återkoppling | Gemensamma fakta, mallbank, varm ton, sparsam humor, stabil variation och cachelivscykel. | Saklig och språklig granskning godkänd utan fler steg eller kontroller. |
| 7. Samlad verifiering | Alla tester, egenskaper, 24-veckorsjämförelser, mobilflöden och dokumentation på samma version. | Resultat, risker och kvarvarande osäkerheter är redovisade i en lättläst leveransrapport. |
| 8. Publicering efter separat beslut | Verifiera relevant testmiljö och publicera endast efter klartecken. | Exakt publicerad version är känd och efterkontroller dokumenterade. |

Oberoende regressioner, textarbete och dokumentation kan göras parallellt. Gemensam datamodell och beslutspolicy fastställs innan flera adaptrar ändras, så parallellt arbete inte skapar olika betydelser av samma signal.

Leveransen ska innehålla uppdaterad regelmatris, kod och tester, versionsmärkt evidensregister, reproducerbara simuleringsresultat och en kort rapport om före/efter, användarupplevelse, historikpåverkan och kvarstående begränsningar. Denna plan är inte ett intyg på att de framtida testerna redan har passerat.

## 12. Uppföljning i verklig användning

Förbered läsande utvärdering med befintlig minimerad data: vilka dimensioner som ändrades, varför, om förslaget genomfördes, återkommande manuella justeringar, upprepade misslyckade försök, planerad/faktisk dos och rimlig tid. Analysera separat för erfarenhet, utrustning och frekvens utan att skapa nya detaljerade hälsoprofiler.

Följ begripligheten: stämmer användarens uppfattning om vad appen ändrade med det faktiska beslutet? Frivillig användarutvärdering kan bedöma värme, motivation och om humorn känns naturlig. Detta ska inte bli ett återkommande obligatoriskt formulär efter passet.

Färre manuella ändringar är inte automatiskt bättre; en ändring kan vara ett klokt val. Fler viktökningar är inte heller ensamt ett kvalitetsmått. Det önskade resultatet är rimliga genomförbara pass, respekt för användarens input, stabil utveckling och en tydlig känsla av att nästa förslag har en begriplig grund.
