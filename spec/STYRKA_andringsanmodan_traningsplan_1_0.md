# STYRKA – ändringsanmodan ÄA-PLAN-001

**Titel:** Min träningsplan – levande framtidsplan och komplett träningsdagbok  
**Datum:** 11 oktober 2026  
**Status:** Godkänd för implementation i befintlig applikation  
**Omfattning:** Tillägg till redan implementerade STYRKA. Ingen ny app och ingen ombyggnad av fungerande rekommendationsmotor.  
**Prioritet:** Hög

## 1. Uppdrag till kodagenten

Inspektera den befintliga koden, datamodellen, planeringsmotorn, övningsbytena och träningshistoriken innan du ändrar något. Inför en **samlad, lättnavigerad vy "Min träningsplan"** där användaren kan se hela sin framåtplanerade träningssekvens och samtliga genomförda pass i en personlig träningsdagbok. Kommande pass ska visas som en **levande plan** som kan revideras efter varje genomfört ordinarie pass, spontanpass, ändrad inställning eller begränsning. Redan genomförda pass får aldrig ändras av planeringsmotorn. Historiska prognoser får inte skrivas över utan spårbarhet.

Implementera detta som en avgränsad, bakåtkompatibel utökning. Bevara befintlig styrkelogik, övningssubstitutioner, rehabiliterings-/belastningsbegränsningar, offlinefunktion, kontoisolering, dataexport och användbarhet. Följ projektets redan fastställda normhierarki och algoritmversionering. Vid konflikt med befintligt kontrakt ska du dokumentera konflikten i stället för att uppfinna nya träningsregler.

## 2. Produktidé och användarnytta

Användaren ska få samma överblick som i ett traditionellt träningshäfte med exempelvis **36 planerade pass**, samtidigt som appen förblir adaptiv. Hen ska kunna bläddra framåt och förstå den planerade ordningen, vilka basövningar som prioriteras, set, repetitionsintervall och ungefärlig tid. Efter träningen ska hen kunna gå tillbaka till ett visst pass och se de **verkliga** vikterna, repetitionerna, ändringarna och egna anteckningarna.

Det är två separata informationslager:

1. **Plan**: föreslagen framtida träningsstruktur, alltid tydligt preliminär.
2. **Journal**: tidsstämplad, faktisk genomförd träning inklusive korrigeringar och eventuella spontanpass.

Ett tredje lager, **planversioner**, gör det möjligt att se när och varför framtida förslag reviderades.

## 3. Omfattning och navigering

### 3.1 Ny huvudvy

Lägg till **Plan** i bottennavigationen så att navigeringen blir **Idag | Plan | Utveckling | Profil**. Håll aktiv träning i befintligt fokuserat helskärmsläge. På Idag ska en diskret länk "Visa hela planen" öppna Plan på rätt position. Återanvänd tidigare historikkomponenter från Utveckling där det är möjligt. Behåll analysgrafer i Utveckling och undvik två oförenliga historikdatakällor.

### 3.2 Planvy

Överst visas rubriken **Min träningsplan** och en tvådelad kontroll **Kommande | Genomförda**. Kommande är förvalt vid öppning från Idag. Vid återbesök får appen återställa senast vald flik om det är konsekvent med befintlig navigation. Inga modaler eller obligatoriska informationsdialoger för normal användning.

**Kommande:** en kompakt, vertikal och expanderbar lista med passnummer, exempelvis "Pass 7 · Helkropp A", uppskattad tidsåtgång, prioriterade övningar och eventuell ungefärlig vecka/dag. Varje pass expanderas till ordnad övningslista med set, reps eller repetitionsintervall, intensitetsläge och rekommenderad vikt endast där motorn har tillräckligt underlag. Visa visuellt och textmässigt att planen är preliminär. Nästa pass kan öppnas i befintlig passförhandsvisning och startas därifrån.

**Genomförda:** fullständig, kronologiskt sorterad lista över ordinarie pass, spontanpass och partiellt genomförda pass, med datum, faktisk tidsåtgång och status. Expandera till de verkliga seten per övning med faktisk vikt, reps, settyp och eventuella efterhandskorrigeringar. Låt användaren skriva och redigera en kort, frivillig anteckning om passet, exempelvis "Fungerade bra, men knät trött efteråt". Befintliga hälsorelaterade sekretessregler ska gälla för sådana anteckningar.

**Detaljer i en expanderad planrad:** stabil passidentitet, ordning och namn, övningar, valda övningsvarianter, set/reps, uppskattad tid, eventuella belastningsrestriktioner, prognosstatus, möjlighet att öppna ett pass och användarens frivilliga egna plananteckning. Redigeras passets övningar genom befintligt övningsbytesflöde.

### 3.3 Planeringshorisont

Generera som standard en **rullande sekvens om 36 kommande ordinarie pass**, oavsett veckogränser. Erbjud val **12 / 36 / 72 pass** och möjlighet att förlänga ytterligare på begäran, med paginering eller virtualisering vid stora mängder. Dessa är en **planeringshorisont**, inte ett tidsbegränsat träningsprogram. Appen fortsätter också efter pass 36.

När frekvensen är två pass per vecka motsvarar 36 pass ungefär 18 veckor. Visa datum bara om användaren har angett veckodagar eller konkreta passdatum. Utan sådan inställning visas sekvensnummer och eventuellt "ungefär vecka X", aldrig påhittade bokningstider. En uppskattad vecka får inte automatiskt markera ett pass som missat.

Alla pass som systemet har genererat inom vald horisont måste kunna visas. Följ inte ett oändligt schema genom att skapa oändligt många poster i databasen.

## 4. Träningsvikter och graden av osäkerhet

Appen får inte presentera framtida viktökningar som kunskap om kommande prestationsförmåga. Skillnaden mellan **förskriven vikt**, **indikativ vikt** och **ännu ej beräknad vikt** ska vara tydlig.

1. **Nästa ordinarie pass / `ready`**: beräkna konkret rekommendation enligt den befintliga motorn, inklusive set, reps, vikt och orsakskoder, och visa den som "Rekommenderad vikt". Om kalibrering saknas visas ingen fabricerad kg-siffra.
2. **Övriga närliggande pass / `provisional`**: visa planerad övning, set, repetitionsintervall och intensitetsläge; visa endast vikt om motorn uttryckligen stöder en säker indikativ beräkning med dagens kunskapsläge. Märk alltid "Preliminärt, uppdateras efter föregående pass". Att återanvända senaste verifierade arbetsvikt som *referensvärde* är tillåtet, men värdet får aldrig betecknas som en säker framtidsprognos.
3. **Längre bort / `structural`**: visa övningsfördelning, set, repetitionsintervall och prioritering. I viktfältet visas "Beräknas närmare passet" om den befintliga motorn inte producerar en tillförlitlig rekommendation. Ingen extrapolerad 1RM-kurva får läggas till i denna ändring.

Det krävs ingen medicinskt eller vetenskapligt ogrundad ny viktmodell för att fylla anteckningsboken. Användaren ska kunna skriva egna viktnoteringar utan att de misstas för motorrekommendationer eller faktisk prestation.

## 5. Livscykel, identitet och omplanering

### 5.1 Separera planplats, version och genomförande

Behåll begreppslig separation mellan:

- `program_id`: pågående programinstans.
- `planned_slot_id`: stabil identitet för ett framtida ordinarie pass i rotationen (t.ex. den sjunde framtida platsen i programmet). Överlever omplanering av samma plats.
- `plan_revision_id`: en oföränderlig utgåva av den framtida plansekvensen.
- `planned_session_snapshot`: passets innehåll i en viss planrevision med `planned_slot_id`, ordning, övningar, status och algoritmversion.
- `workout_session_id`: genomfört eller påbörjat verkligt pass med befintliga set, egen identitet och valfri koppling till `planned_slot_id`.
- `user_note`: personlig anteckning knuten till stabilt pass eller genomfört pass, **inte** endast till en temporär planrevision.

Dessa är logiska kontrakt. Återanvänd befintliga tabeller och ID:n när det går och inför enbart nödvändiga, bakåtkompatibla migrationer. Skapa inte en parallell källa för utförda set.

### 5.2 När planversionen revideras

Revidera **bara återstående framtida planplatser** vid:

- Slutfört eller partiellt ordinarie pass som påverkar planeringsunderlaget.
- Slutfört spontanpass (inklusive om det ska räknas som ersättning för ett planerat pass, endast med aktivt användarbeslut).
- Ändrad frekvens, tid, utrustning eller prioriterade basövningar.
- Ny/ändrad belastningsbegränsning eller rapporterad symtomflagga.
- Av användaren ändrad övningsvariant för kommande pass.
- Uttrycklig ändring av planerad träningsdag eller hantering av ett missat pass.

Att öppna planen, expandera en rad eller växla flik ska **inte** skapa en ny revision. Gruppera samtidiga ändringar till en enda transaktion och revision där det är rimligt. Samma indata + motorversion + regelversion ska ge samma innehåll.

### 5.3 Omplaneringsregler

1. Läs aktuellt konsekvent snapshot av träningshistorik och begränsningar.
2. Fastställ vilka `planned_slot_id` som redan är genomförda, påbörjade eller väntar.
3. **Lås redan utförda set och genomförda pass.** Pågående pass använder sin accepterade övnings- och setplan; omplaneras inte tyst under registrering.
4. Anropa befintlig deterministisk schemagenerator för återstående pass. Respektera ordinarie A/B/C-rotation, begränsningar, senaste utförda set, spontanpass och tidsbudget.
5. Bevara stabila passplats-ID:n och användarens anteckningar vid revision. Förändrade övningar och numeriska förslag lagras i en ny planversion, utan att ersätta äldre snapshots.
6. Spara orsakskoder, indatasignatur/hash, motorversion, ändringstyp, skapandetid och en kortfattad ändringssammanfattning.
7. Visa den nya versionen som aktuell. Tidigare planversion kan öppnas genom "Tidigare planversioner" i en diskret meny, med datum och varför planen ändrades.

Om en planerad övning tas bort på grund av en begränsning ska systemet aldrig fortsätta visa den som aktuell bara för att en plananteckning råkar referera till den. Anteckningen kan dock finnas kvar på passplatsen.

### 5.4 Missade pass och spontanpass

- Ett uteblivet pass utan uttryckligt datum ska inte klassas som missat baserat på kalendern.
- Ett spontanpass visas i genomförda listan men **förbrukar inte automatiskt** nästa ordinarie A/B/C-position.
- Om användaren väljer "Räkna som ordinarie pass" måste systemet först verifiera vad den befintliga planeringsmotorn kräver; bekräfta därefter val och koppling. Ingen tyst omläggning av historik.
- Efter ett spontanpass kan nästa ordinarie pass ändras framåt enligt befintliga återhämtnings- och begränsningsregler.
- Partiella pass behåller verkligt utförda set; de blir aldrig retroaktivt fullständiga genom omplanering.

## 6. Anteckningsbok och export

### 6.1 Personliga anteckningar

Användaren kan lägga till, redigera och radera frivillig text på en framtida planplats respektive ett historiskt träningspass. Anteckningarna sparas automatiskt och lokalt först enligt STYRKAs befintliga offlineprotokoll. Visa sparstatus och erbjud ångra när det går. Ingen automatisk textanalys eller vidarebefordran till externa tjänster.

Textlängd 0–2 000 tecken. Visa att anteckningar är privata. HTML och skript får aldrig köras från anteckningstext. Om användaren anger hälsouppgifter måste de skyddas enligt appens regler för känsliga data; bedöm särskilt om samma rättsliga grund och raderingsflöde behövs. Lagra bara det som är nödvändigt.

### 6.2 Export som personlig träningsdagbok

Erbjud **Skriv ut / Spara som PDF** från Plan. Exportera enligt vald horisont och flik:

- Kommande: en lättläst ögonblicksbild med genereringstid, planrevision, alla valda pass, övningar, set/reps, kända eller uttryckligen preliminära vikter, samt utrymme för handskrivna vikt-/repsnoteringar.
- Genomförda: vald tidsperiod eller alla pass med faktiska set, inklusive spontanpass, och frivilligt val att ta med egna anteckningar.

Exporten ska tydligt märkas "Ögonblicksbild – framtida plan kan ändras". Exporten ska inte påverka schemat eller skapa en revision. Använd webbläsarens utskriftsfunktion med bra utskrifts-CSS om det ger en robust och lättunderhållen PDF-lösning; inför inte tung PDF-infrastruktur om det inte behövs. Den befintliga JSON/CSV-exporten ska fortsätta fungera.

## 7. UX och tillgänglighet

- Följ STYRKAs tidigare mobil-först-design med avskalad Appleliknande tydlighet; använd befintliga typografier, komponenter och interaktionsmönster.
- En rad per pass i stängt läge; endast det användaren expanderar visar detaljer. Inga långa tabeller som kräver horisontell skrollning på mobil.
- Sekvensnumret ska förbli begripligt över planrevisioner och vid oregelbunden träningsfrekvens. Spontanpass har egen etikett och stör inte numreringen.
- Aktuellt pass är tydligt markerat. Statusetiketter ska vara tillgängliga utan färgseende: "Nästa", "Preliminär", "Genomfört", "Delvis genomfört", "Spontanpass".
- För varje pass går det att läsa sammanfattning med skärmläsare, navigera med tangentbord och expandera med riktig knapp. Respektera reducerad rörelse och 200 % textzoom.
- För längre listor använd serverpaginering/virtuell rendering utan att förlora fokusposition, tangentbordsnavigation eller möjligheten att skriva ut hela vald period.
- Normal användning ska kräva högst två tryck från Idag till den fulla framtidslistan, och högst ytterligare ett tryck för att öppna ett pass.
- Svensk terminologi, rätt decimalformat och kg-semantik för respektive övningstyp. Assisterade chins får aldrig presenteras som "tyngre" när maskinassistansen ökat.

## 8. Tekniska kontrakt

### 8.1 Föreslagna use cases

Skapa eller återanvänd applikationstjänster som motsvarar:

- `getPlanOverview(userId, status, cursor?, limit?)`
- `getFuturePlan(userId, count, asOfRevision?)`
- `getWorkoutHistory(userId, cursor?, filters?)`
- `getPlanSlotDetail(userId, plannedSlotId, revisionId?)`
- `regenerateFuturePlan(userId, reason, inputVersion)`
- `saveNotebookNote(userId, targetType, targetId, text, baseRevision)`
- `exportNotebook(userId, selection, includeNotes)`

Namnen är vägledande. Följ projektets etablerade kod- och API-konventioner.

### 8.2 Persistens och migration

Använd befintliga `programs`, `sessions`, `session_exercises`, `training_sets` och `recommendation_audits` som grund. Utöka med stabil `planned_slot_id`, versionerade framtidssnapshots, revisionsmetadata och personliga anteckningar om motsvarande representation saknas. Säkerställ att äldre utförda pass saknar inga obligatoriska nycklar efter migrering; tillåt nullable koppling till `planned_slot_id` för gamla och spontana pass. Skapa index för `(user_id, program_id, slot_sequence)`, `(user_id, revision_created_at)` och `(user_id, completed_at)` i lämpliga tabeller. Anpassa till faktiska tabellnamn i projektet.

Varje användarägd tabell ska ha RLS/ägarkontroll och korsreferenser ska vara skyddade mot andra användares data. All hälsokänslig fritext kräver samma eller starkare skydd som befintliga symtomdata. Migrering får inte radera, omskapa eller konvertera historiskt utförda vikter eller set.

### 8.3 Offline och synk

Planöversikt, senast synkade historik och egna anteckningar ska kunna läsas offline. Anteckningar och explicita planändringar ska använda befintligt idempotent mutationsprotokoll och konﬂikthantering; inga dubbla pass eller duplicerade anteckningar vid återanslutning. Om ett nytt träningspass genomförs offline ska framtidslistan kunna uppdateras lokalt med en tydligt markerad ej synkad status. Efter serverkvittens ska revision och aktuell plan stämma överens. Vid samtidiga ändringar i samma anteckning visas befintligt konfliktflöde, aldrig tyst överskrivning.

### 8.4 Oförändrade systeminvarianter

Denna ändring får inte ändra algoritmens rekommendationsvikter, träningssäkerhetsgrindar, tidigare övningsbyten, användarens blockeringsregler eller skillnaden mellan rekommenderad och utförd vikt. Forskningstransparenssidan från tidigare ändringsanmodan ska vara opåverkad. Ingen bakgrundsprocess ska retroaktivt skriva om utförda set.

## 9. Acceptanstester

Följande testfall ska implementeras som enhetstester, integrationstester eller E2E-tester efter relevans. De är obligatoriska, inklusive regressionstest av tidigare funktioner.

| ID | Scenario | Förväntat resultat |
|---|---|---|
| PL01 | Ny användare med två pass/vecka väljer 36 pass | Exakt 36 framtida ordinarie pass i rimlig A/B/C-sekvens, utan påhittade fasta datum. |
| PL02 | Användaren öppnar Plan och expanderar pass 20 | Full strukturell plan syns utan krav på numerisk framtidsvikt. |
| PL03 | Användaren öppnar nästa pass | Befintligt rekommenderat pass öppnas med korrekt, versionsmärkt vikt när styrkeunderlag finns. |
| PL04 | Ny övning saknar styrkeuppskattning | Ingen påhittad vikt; tydligt kalibreringsläge. |
| PL05 | Ett ordinarie pass genomförs | Det visas med sina verkliga set i Genomförda; framtidslistan revideras; gamla set förblir oförändrade. |
| PL06 | Pass genomförs delvis | Bara utförda set visas som utförda; passet markeras Delvis genomfört. |
| PL07 | Spontanpass genomförs dagen efter tung träning | Spontanpasset visas historiskt och påverkar återstående framtidsförslag; A/B/C flyttas inte tyst. |
| PL08 | Användaren väljer explicit att spontanpass ska ersätta ordinarie pass | Ändringen bekräftas och lagras spårbart; inte dubbelt räknat. |
| PL09 | Användaren ändrar två till tre pass/vecka | Framtidssekvensen planeras om; genomförda pass och deras nummer/identiteter bevaras. |
| PL10 | Användaren ändrar 40 till 25 min | Framtida tidsanpassning sker enligt befintlig planerare, inte på redan genomförda pass. |
| PL11 | Knäbegränsning förbjuder två tunga benövningar | Alla framtida relevanta pass respekterar förbudet efter omplanering. |
| PL12 | Användaren byter knäböj till frontböj framöver | Målövningens egna vikter eller kalibreringsflöde används; basövningens historik skrivs inte om. |
| PL13 | Användaren skriver anteckning på pass 25 | Anteckningen finns kvar på samma logiska passplats efter omplanering. |
| PL14 | Användaren skriver anteckning på genomfört pass | Anteckningen kan läsas, ändras och raderas utan att utförda set påverkas. |
| PL15 | Planeringen revideras två gånger | Aktuell version används; båda äldre versioner kan öppnas med ändringsorsak. |
| PL16 | Användaren enbart öppnar/stänger planrader | Ingen ny planrevision eller ändrat träningsförslag skapas. |
| PL17 | Pass saknar schemalagt datum | Passet markeras aldrig automatiskt som missat på grund av en antagen veckodag. |
| PL18 | Appen saknar internet vid anteckning och passloggning | Lokal sparning bekräftas efter commit, ändringar kan synkas senare utan dubblering. |
| PL19 | Samma mutation skickas två gånger | Endast en logisk uppdatering registreras. |
| PL20 | Två enheter ändrar samma anteckning | Ingen tyst last-write-wins, användaren får hantera konflikten. |
| PL21 | Två användarkonton finns | Varken plan, anteckningar, revisioner eller träningshistorik kan nås mellan kontona (RLS-test). |
| PL22 | Användaren skriver ut 36 kommande pass | Alla 36 finns med, läsbart och märkt som ögonblicksbild med datumsstämpel. |
| PL23 | Genomförda pass exporteras | Faktiska set och spontanpass medföljer, privata anteckningar endast efter aktivt val. |
| PL24 | 72 framtida och 500 historiska pass | Listorna laddas med god upplevd prestanda, utan stora hopp eller förlorad scrollposition. |
| PL25 | En pågående träningssession finns när planändring sker | Pågående accepterat set-snapshot ändras inte tyst; nästa framtida pass kan uppdateras. |
| PL26 | Planversioner och framtidsvikt visas | Historiskt föreslagen vikt, aktuell rekommendation och utförd vikt kan aldrig förväxlas i UI eller export. |
| PL27 | Användaren raderar sina hälsouppgifter | Hälsokänsliga anteckningar och deras eventuella revisionskopior hanteras enligt befintligt raderingskontrakt; träningsset bevaras om användaren valt det. |
| PL28 | Användaren börjar pass 37 efter en 36-passhorisont | Kontinuerlig rotation fortsätter och ingen artificiell programslutpunkt stoppar träning. |

## 10. Leveransordning och definition av klart

1. Inventera faktisk kod, schema och redan implementerad träningshistorik. Dokumentera kort hur befintliga entiteter motsvarar kontraktet ovan.
2. Lägg till bakåtkompatibel datamigration och RLS för nödvändiga nya entiteter; testa på kopia av befintliga data.
3. Implementera en deterministisk tjänst för framtidssekvens, stabila planplatser, revisioner och omplanering som återanvänder befintlig motor.
4. Bygg Plan-vyn, fullständig historik och anteckningsflöde.
5. Implementera utskrift/PDF samt offline/synk för nya uppgifter.
6. Skriv och kör PL01–PL28 samt befintliga regressionstester. Verifiera på iPhone/Safari och Android/Chrome med ljust/mörkt läge och utan nätverk.
7. Leverera en kort ändringsrapport: ändrade filer, schemaändringar, genomförda tester och deras utfall, eventuella kända begränsningar och skärmbilder från mobilgränssnittet.

**Definition av klart:** Användaren kan med högst två tryck från startsidan öppna hela den valda framtidsplanen; se alla tidigare pass inklusive spontanpass och faktiskt genomförda set; lägga in egna anteckningar; skriva ut en läsbar träningsdagbok; och genomföra nya pass så att endast framtida planplatser anpassas. Inga gamla prestationer skrivs om, inga skadebegränsningar kringgås och inget annan etablerad funktionalitet försämras.

**Instruktion:** Fortsätt från projektets nuvarande kodläge. Riv inte upp fungerande lösningar och återimplementera inte den befintliga motorlogiken. Genomför arbetet självständigt, men stoppa och rapportera verkliga motsägelser eller säkerhetskritiska oklarheter innan du antar nya produktregler.
