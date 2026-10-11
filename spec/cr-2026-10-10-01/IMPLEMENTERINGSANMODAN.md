# STYRKA – kompletterande implementeringsanmodan

**Ändrings-ID:** STYRKA-CR-2026-10-10-01  
**Version:** 1.0  
**Status:** Implementationsunderlag till befintlig färdig applikation  
**Omfattning:** (A) Öppen vetenskaps- och transparenssida. (B) Övningssubstitution med övningsspecifik belastningskalibrering.  
**Prioritet:** Hög  
**Viktigt:** Detta är en additiv ändring. Befintliga träningsprogram, setloggning, progressionsregler, användarkonton, offlinehantering och historik får inte ändras eller ersättas av en ny implementation.

## 0. Instruktion till kodagenten

1. Inspektera det existerande repot, dess faktiska datamodell, migrationshistorik, API, katalog, tester och UI. Kontrollera vilka delar av föregående STYRKA-specifikation som faktiskt är implementerade. Anta inte att schemanamnen nedan är identiska med produktionskoden.
2. Implementera denna anmodan som en **kompatibel tilläggsfunktion**. Gör inga destruktiva migrationer och gör inga retroaktiva omskrivningar av träningshistorik. Flytta inte befintliga sidor eller ändra navigationsprincipen utan behov.
3. Använd versionsstyrda, deterministiska regler. Samma data + samma regler => samma förslag. Behåll ursprunglig planerad övning och rekommendationssnapshot efter byte.
4. Aktivera nya substitutsfunktioner bakom feature flag till tester passerar. Vetenskapssidan ska kunna nås utan att logga in.
5. Kör befintliga tester, nya enhetstester, integritetstester och UI-tester. Redovisa ändrade filer, migrationsfil, testresultat och kvarvarande risker. Fatta inte egna medicinska beslut när ett testfall saknar trygg lösning.

## 1. Vetenskap och transparens: mål

Besökare och användare ska direkt kunna se vilka källor, forskningsresultat, produktregler och antaganden som STYRKA bygger på.

### 1.1 Åtkomst och placering

- På inloggnings-/välkomstsidan, under primär åtgärd och utan konkurrerande CTA, visas en diskret textlänk **”Vetenskapen bakom STYRKA”**.
- Samma innehåll kan öppnas under **Profil → Om STYRKA → Vetenskap och metoder**. Om Profil har annan faktisk struktur: välj närmaste logiska plats.
- En publik, direktlänkbar rutt `/vetenskap` ska fungera för både inloggade och utloggade användare, på mobil och dator, utan personlig data, cookieberoende eller krav på konto.
- Viktförslagens redan befintliga ”Varför?” eller motsvarande ska kunna länka till relevant metodregel på vetenskapssidan med stabil ankarlänk.
- Vetenskapssidan är läsbar, sökbar, skärmläsarvänlig och skrivaranpassad. Använd samma designsystem som resten av appen.

### 1.2 Innehållskontrakt

Sidan ska minst ha fem områden:

**A. Vad forskningen ger stöd för.** Träningens effekter på maximal styrka, träningsfrekvens, volym, belastning, övningsspecificitet, individuell anpassning och återhämtning; kort populärvetenskaplig förklaring och klickbar källa per påstående.

**B. Hur rekommendationerna fungerar.** Beskriv hur 1RM eller 3RM uppskattas, hur första arbetsvikten beräknas, progression, RIR, setvolym, vilotid, spontana pass och användarsatta begränsningar. Visa att algoritmen är regelstyrd, individuella data påverkar rekommendationer och att fullständig individoptimering inte är bevisad.

**C. Var forskning upphör och produktval börjar.** Varje numerisk tröskel som saknar direkt empiriskt stöd (t.ex. procentuell höjning, antal timmar vila, försiktighetsfaktor vid ny övning, första vikt vid substitutionskalibrering) markeras **”Produktregel / ännu inte validerad tröskel”**. Ange skälet för regeln och regelversion.

**D. Begränsningar och säkerhet.** Ingen garanti för optimal utveckling eller att träningen är skadefri. Resultat om friska försökspersoner är inte automatiskt tillämpliga på personer med vissa besvär. Registrering av skada ska inte göras till diagnos, behandling eller påstående om att en specifik övning är medicinskt säkrare. Användarens blockeringsregler respekteras alltid.

**E. Källförteckning.** Författare, år, exakt titel, publikation, DOI eller permanent offentlig länk, typ av studie, relevanta resultat, avgränsningar, eventuell population och datum för senaste kontroll. Ange publicerad algoritmversion, metodversion och senaste sakliga uppdatering. Inga påhittade effektstorlekar, säkerhetstal eller automatiska citat.

### 1.3 Evidensregistret som data

Inför ett strukturerat, statiskt eller serverhanterat evidensregister med följande begrepp: `claim_id`, `title_sv`, `plain_language_sv`, `evidence_kind`, `population_scope`, `caveats_sv`, `source_ids`, `rule_ids`, `last_reviewed_at`, `rule_is_heuristic`, `engine_version`. Källpost: `source_id`, `authors`, `year`, `title`, `publication`, `doi`, `public_url`, `design`, `notes`.

Källor är publika och får inte kopplas till personers träningsuppgifter. Ett påstående måste kunna kartläggas till en specifik källa, och en rekommendationsregel ska ha en metodbeskrivning även om den endast bygger på en utvecklingsheuristik. Ange aldrig en övningsspecifik konverteringsfaktor som kliniskt validerad.

### 1.4 Godkännandetester, vetenskap

- Utloggad användare kan öppna `/vetenskap` från välkomstsidan, läsa alla avsnitt och återvända till inloggning.
- Profilen har fungerande länk till samma innehåll; ändring av vetenskapstexter påverkar inte användardata.
- Varje klickbar källa går till en riktig DOI eller offentlig publikationssida.
- Källorna anges med publikationsår, studiedesign, population och relevanta begränsningar där relevant.
- En regel med heuristisk siffra är märkt som produktregel, inte empiriskt säkerställd gräns.
- Ingen privat profil, vikt, symtom eller diagnos exponeras via den publika sidan eller dess API.
- Åtkomst och läsbarhet fungerar på iPhone Safari, Android Chrome, tangentbord och skärmläsare.

## 2. Övningssubstitution: målet och en central distinktion

Användaren ska kunna byta övning före eller under ett pass och kunna göra bytet permanent i sitt framtida program. Funktionen ska **bevara träningsmålet och välja rimlig alternativ stimulans**, samtidigt som systemet förstår att olika övningar har olika maxstyrka, biomekanik och belastningssemantik.

Tre olika relationer ska finnas; alla får aldrig kallas ”likvärdiga” utan förklaring:

- **Nära variant**: stort överlapp i rörelsemönster och utrustning, men separata styrkehistoriker. Exempel knäböj och frontböj.
- **Samma rörelsefamilj**: tränar i huvudsak samma typ av muskelarbete, men skiljer sig mer i teknisk specificitet eller biomekanik. Exempel bänkpress och bröstpressmaskin, vanlig mark och trap bar mark.
- **Kompletterande alternativ**: täcker delar av avsett träningsstimulus, men ersätter inte primärlyftets specifika träning fullt ut. Exempel vanligt marklyft och rumänskt marklyft; knäböj och benpress; planka och kabelcrunch.

Befintligt träningsmål för en specifik basövning ska ligga kvar även om en alternativ övning görs. Visa ett diskret meddelande om att ett byte under längre tid förändrar hur direkt träningen är riktad mot just det baslyftet.

### 2.1 Användarflöde

1. I passförhandsvisning och i aktivt pass: **”Byt övning”** vid vald övning, med högst två ytterligare tryck för att välja en förslagen ersättare.
2. Öppna befintliga katalogvyn S09 eller dess motsvarighet; visa högst 3 prioriterade, tillåtna alternativ först och därefter **”Visa fler”**.
3. Varje alternativ visar svenskt namn, relation (nära variant / samma rörelsefamilj / kompletterande), utrustning, om nytt viktförslag finns, samt kort förklaring och vid behov svagare överföring till ursprungligt styrkemål.
4. Filtrera mot tillgänglig utrustning, användarblockeringar, befintliga kombinationsregler, pågående symtomflaggor, dagens och tidigare träningsbelastning samt befintligt passupplägg. Blockeringar får aldrig kringgås genom byte.
5. Efter val: visa nya set/reps och **nytt, separat viktförslag eller tydligt kalibreringsläge**. Fråga inte rutinmässigt efter 1RM. Låt användaren ändra startvikten. Visa ”Uppskattning – bekräfta vikten med ett kontrollerat första set” när sådant underlag används.
6. Fråga diskret **”Bara idag”** eller **”Använd framöver”**. Standard ”Bara idag”. Permanent byte påverkar endast framtida planering, inte historiska pass.
7. Efter första faktiskt registrerade arbetsset uppdateras fortsättningen med befintlig progressions-/kalibreringsmotor och samma säkerhetsregler. Uppdatera aldrig förslaget bakåt i historiken.
8. Om bytet innebär byte av belastningssemantik (skivstång → hantlar, kg → assistans, repetitioner → sekunder) anpassas formulär, etiketter och datavalidering. Gamla kg visas aldrig som nya övningens träningsvikt.

### 2.2 Förvaltad substitutionskatalog

Levererad fil `replacement_seed.json` är ett första **redaktionellt urval av kandidatrelationer** som utvecklaren ska mappa till appens faktiska övningssluggar och utrustning. Den är inte ett bevis för likvärdiga styrkeeffekter och ska inte användas för att beräkna generella omräkningsfaktorer. Den innehåller relationstyp, källa/motivering och status för viktöverföring.

Obligatoriska övningsfamiljer och exempel:

| Ursprungsövning | Kandidater | Bedömning |
|---|---|---|
| Knäböj | Frontböj, safety bar knäböj, smithknäböj, hack squat, goblet squat, benpress | Frontböj är nära variant; övriga allt mindre specifika alternativ |
| Frontböj | Knäböj, safety bar knäböj, goblet squat | Nära eller samma rörelsefamilj, olika last |
| Marklyft | Sumomarklyft, trap bar marklyft, rumänska marklyft | Sumo nära, trap bar annan biomekanik, rumänska kompletterar |
| Rumänska marklyft | Rumänska hantelmarklyft, stiff leg deadlift, trap bar marklyft | Varierande rörelsemönster och dosering |
| Bänkpress | Hantelpress liggande, smithbänk, bröstpressmaskin, lutande bänkpress | Närliggande eller samma pressfamilj; separat belastning |
| Militärpress | Hantelpress över huvudet, sittande stångpress, axelpressmaskin | Närliggande pressvarianter |
| Latsdrag | Neutralt latsdrag, assisterade chins, chins | Vertikala drag men skilda belastningsmått |
| Assisterade chins | Latsdrag, neutralt latsdrag, chins | Ingen direkt kg konvertering |
| Kabelrodd | Bröststödd rodd, sittande maskinrodd, enarms hantelrodd | Horisontella drag med olika ryggbelastning |
| Cable lateral raise | Hantellyft åt sidan, lateral raise maskin | Axellyft med skild motståndskurva |
| Bicepscurl | Hantelcurl, kabelcurl, lutande hantelcurl | Likartad huvudfunktion, olika momentarmar |
| Triceps pushdown | Reppushdown, overhead triceps extension | Likartad målmuskel, olika ledvinklar |
| Kabelcrunch | Magcrunch i maskin, viktad crunch, planka | Olika bålarbete; planka är bara kompletterande |
| Bulgarian split squat | Utfall, split squat, step up | Samma breda kategori, unilateral dosering |

Inga oförklarade ”skadesäkra” substitutionspåståenden. Biomekaniska gruppskillnader kan inte bevisa medicinsk säkerhet för individen.

### 2.3 Betydelsen av separat styrkehistorik

- Varje övningsvariant måste ha en stabil `exercise_id` och, vid behov, `equipment_profile_id` (maskinmodell/inställning/utväxling). Historik och e1RM får inte skrivas över när användaren byter.
- Samma hantelövning kan ha `per_hand_kg` medan skivstång har `total_external_kg`; två 24 kg hantlar loggas som **24 kg per hand**, inte 48 kg som om det vore en skivstång.
- Maskinens visade ”kg” får inte jämföras direkt mellan olika maskiner med okänd utväxling.
- Assisterade chins har `assistance_kg` där lägre assistans är progression. Ingen skivstångsformel används för att härleda assistans från latsdrag.
- Unilaterala övningar måste stödja `per_side` och valfritt separat vänster/höger, eller tydligt samma vikt på båda sidor. Antal set beror på vald sessionsmodell och tidsbudget.
- Förändringar i frontböj ska inte automatiskt bokföras som förbättrat 1RM i knäböj. Dela endast kvalitativ rörelsefamiljsinformation i schemaplanering.

## 3. Viktrekommendation vid byte: normativ ordning

**Detta är det centrala implementeringskravet.** Om algoritmen inte kan uppskatta den nya övningens belastning tillräckligt rimligt ska den begära ett kontrollerat kalibreringsset. Det är acceptabelt att sakna ett precist kg-förslag.

### 3.1 Auktoritetsordning för startvikt

1. **Direkt prestationshistorik i målövning och identisk redskapsvariant.** Använd befintlig STYRKA-motor på dessa data om de är aktuella och kvalitetskontrollerade. Ingen populationsomräkning.
2. **Uppskattad maxstyrka specifikt i målövningen.** Använd befintligt styrkeestimat, men beakta kalibreringskvalitet och eventuellt långt uppehåll.
3. **Individuellt kalibreringsset i målövningen.** Använd användarens valda startvikt och genomförda repetitioner, teknik/symtom och frivillig RIR för nästa målövningsförslag. Det första setet får inte kräva maxansträngning.
4. **Begränsad populationsbaserad försiktig hjälpskattning** endast för specifika par där publikation med kvantitativ direkt jämförelse finns. Initialt endast `back_squat → front_squat` och `bench_press → dumbbell_flat_bench`. Se 3.2. Detta är låg konfidens, aldrig individuell sanning. Erbjud detta endast om källans e1RM är giltigt, användaren redan har övningsvana i målövningen, redskap och viktssteg är kända, och inga aktiva begränsningar stoppar rörelsen. Kräv tydlig bekräftelse/justering.
5. **Ingen giltig skattning**: visa ”Ingen tillförlitlig vikt ännu” och låt användaren välja lätt, kontrollerad kalibreringsvikt och registrera faktisk prestation. Hitta aldrig på en kg-siffra genom muskelgrupp, maskinvikt eller en generell ”80 % för liknande övningar”.

Innan en rekommendation lämnas ska den befintliga ordningen för blockeringar, tidsbudget, återhämtning och symptom gate tillämpas. Kontrollera även den slutliga planen efter substitution. Undvik att falla tillbaka på föregående övnings kg när estimat saknas.

### 3.2 Två försiktiga hjälpskattningar (heuristiker)

**Knäböj → frontböj**

En studie av Davis m.fl. 2020 med 11 träningsvana personer fann medel 1RM 102,4 kg i frontböj och 123,9 kg i knäböj, ratio ca 0,826. En annan biomekanisk studie av Gullett m.fl. 2009 redovisade också lägre standardiserad arbetslast för frontböj. Detta bevisar inte en generell personlig konverteringsfaktor. Vi väljer tills vidare **0,80 som ett förslag till lågkonfidens-prior**, inte som forskningsfastslaget optimalt värde.

Föreslagen, reproducerbar första hjälpskattning:

`tentativeFrontE1RM = 0.80 × validBackSquatE1RM`  
`tentativeCalibrationPct = min(existingEnginePctForGoalAndExperience, 0.60)`  
`firstWorkingKg = roundDownToTargetEquipmentIncrement(tentativeFrontE1RM × tentativeCalibrationPct)`

`0.60` är en explicit **produktheuristik** för första exponering, inte empirisk säkerhetsgräns. Beräknad vikt får aldrig överskrida användarens angivna gräns eller sättas vid aktiva symptomflaggor. Målövning utan tidigare rörelsevana går till användarvald kalibrering i stället.

**Skivstångsbänk → liggande hantelpress**

Saeterbakken m.fl. 2011 jämförde 1RM i bänkpress med skivstång, smithmaskin och hantlar hos 12 träningsvana män. Total hantelbelastning var i medeltal 17 % lägre än skivstång. Populationen är mycket begränsad. Använd **0,83 som lågkonfidens-prior på sammanlagd hantelvikt**, endast när villkoren ovan är uppfyllda.

`tentativeDumbbellE1RMTotal = 0.83 × validBarbellBenchE1RM`  
`tentativeCalibrationPct = min(existingEnginePctForGoalAndExperience, 0.60)`  
`firstWorkingKgPerHand = roundDownToAvailableDumbbellStep(tentativeDumbbellE1RMTotal × tentativeCalibrationPct / 2)`

Gränssnittet måste skriva exempelvis ”24 kg per hantel” och registrera 24 i en `per_hand_kg` post, aldrig 48 kg som vikten i en hantel. Vilken hantelvikt som finns tillgänglig styr avrundningen.

Båda dessa första värden är **osäkra kalibreringsförslag** som korrigeras med faktiskt arbete och som aldrig uppgraderas till högkonfidens av enbart en populationsfaktor. Ingen omvänd kvot är automatiskt giltig. Nya kvantitativa priors kräver separat evidensbeslut, validerade datatyper och testfall.

### 3.3 Kalibrering när vikt saknas eller skattningen är svag

- Fråga före nytt övningsval: **”Har du gjort övningen tidigare?”** om det är avgörande för hjälpskattning. Värdet ska lagras per övning.
- Om inget giltigt målvärde finns och inget kvalificerat hjälpförslag gäller: be användaren välja en vikt för **ett kontrollerat inledande set**. Visa tydliga instruktioner om att avbryta vid försämrade besvär och att inte testa maximal vikt. För nybörjare används enkla svar ”lätt / lagom / för tungt”; för vana användare kan RIR anges frivilligt.
- Upprepa eller finjustera efter verkligt utfört set i samma övning. Föreslå inte oväntade stora automatiska viktökningar inom ett pass. Inga antaganden om ledstatus baserat på upplevd ansträngning.
- En målövning blir `calibrated` efter att användaren har minst två giltiga, kontrollerade exponeringar utan rapporterade hinder. Detta är en versionssatt produktregel och innebär inte mätvaliditet på populationsnivå.
- Historiska målvikter från ursprungsövningen används inte i progressionsgrafen för ersättaren.

### 3.4 Målreps, set och tid efter substitution

- Bevara ursprungligt **träningssyfte, rörelsefamilj och planerad belastningsroll** där möjligt; ändra set/reps där rörelse, utrustning eller kroppsvikt kräver annan dosering. Befintliga nivå-, tids- och symptomregler gäller.
- Om en benpress ersätter knäböj i passet kan den tillgodoräknas som underkroppsträning i volym/tid, men inte som ett specifikt set knäböj i styrketrenden.
- Om assisterade chins ersätter latsdrag behåll vertikalt drag som rörelsefamilj, men använd assistansmodell och individuell historik; inget falskt kiloestimat.
- Om 1 benövning blir unilateral ska appens tidsmodell räkna med båda sidor. Uppdatera återstående passlängd efter ändring.
- För icke jämförbara övningar måste grafen visa separata serier, utan att skarva ihop dem eller rangordna kg som om de vore samma mått.

## 4. Säkerhet, databas och förändringshantering

### 4.1 Integrering i befintlig motor

- Fortsätt tillämpa normhierarkin i tidigare STYRKA-spec: aktiv användarblockering och olösta funktionella symptom går före alla rekommendationer.
- Substitutionsmotorn får inte skapa en andra progressionsalgoritm. Återanvänd befintlig, versionsstyrd `decision_engine` för målövning efter korrekt kalibrering.
- Förslagslogiken ska även se till att byte av en tung benövning inte skapar ett par förbjudna tunga benövningar i samma pass.
- Den får inte tolka ”frontböj” som särskilt medicinskt säker vid broskskada; biomekaniska jämförelser av friska deltagare ger inte det påståendet.
- Vid osäkerhet ska användaren kunna behålla originalövningen, välja annan variant, ange egen vikt eller avstå.

### 4.2 Additiva datakomponenter

Mappa till de existerande namnen i repot. Föreslagna begrepp:

- `exercise_substitutions`: `from_exercise_id`, `to_exercise_id`, `relation_class`, `strength_specificity`, `rationale_sv`, `evidence_ids`, `load_prior_kind`, `load_prior_ratio?`, `load_prior_reference?`, `enabled`, `catalog_version`.
- `exercise_variant_metadata`: `exercise_id`, `load_kind`, `load_display_basis` (`total_kg`, `per_hand_kg`, `assistance_kg`, `bodyweight_plus_kg`, `reps_only`, `seconds`), `equipment_class`, `requires_equipment_profile`, `unilateral`, `time_multiplier`.
- `user_exercise_calibrations`: `user_id`, `exercise_id`, `equipment_profile_id?`, `familiarity`, `quality`, `observations`, `calibrated_at`; observations är referenser till befintliga utförda set, inte kopior av hälsodata.
- `session_exercise_substitution_events`: `id`, `user_id`, `session_id`, `original_exercise_id`, `replacement_exercise_id`, `choice_scope` (`today`, `future`), `event_id`, `recommendation_before_id?`, `recommendation_after_id?`, `created_at`.
- `evidence_sources` och `evidence_claims`, alternativt versionsstyrd lokal JSON om appen är statisk och innehållet inte behöver redigeras i admin.

Alla nya persondatatabeller måste använda ägarbaserade RLS-policyer och idempotent offline synk enligt STYRKA v2. Den publika vetenskapssidan ska enbart exponera publikt evidensinnehåll. Additiva migrationer får inte radera eller skriva om tidigare set eller rekommendationer. Använd endast stabila övnings-ID:n; skilda gymmaskiner kan kräva ytterligare maskinidentitet.

### 4.3 Revision och analytik

Spara den ursprungliga planeringen och skälen till ersättning. Varje ändrat förslag ska ha `engine_version`, `substitution_catalog_version`, `algorithm_rule_version`, `source_evidence_ids`, `load_estimation_kind` (`target_observed`, `target_estimated`, `calibration`, `population_prior_low_confidence`, `none`), `reason_codes`, `user_override` och `timestamp`.

Visa vid behov: ”Bytt från knäböj till frontböj. Vikten är ett första, osäkert förslag och kalibreras med din prestation.”

## 5. Obligatoriska testfall

| ID | Testscenario | Godkänt utfall |
|---|---|---|
| SUB01 | Byt knäböj till frontböj, målövning har historik | Egen frontböjshistorik styr vikt; knäböjens kg kopieras inte |
| SUB02 | Back squat 1RM 120 kg, vana vid frontböj, inga måldata, steg 2,5 kg och kalibreringspct 0,60 | Lågkonfidens: tentative e1RM 96 kg; första förslag `57,5 kg` (avrundat nedåt); kan redigeras |
| SUB03 | Samma som SUB02 men nybörjare i frontböj/okänd vana | Ingen numerisk automatisk vikt; kontrollerad manuell kalibrering |
| SUB04 | Bänkpress e1RM 100 kg → hantelpress, vana vid målet, viktssteg 2 kg per hantel | Lågkonfidens: e1RM totalt 83 kg; första förslag `24 kg per hantel` efter 0,60 och avrundning |
| SUB05 | Latsdrag 60 kg → assisterade chins | Inga 60 kg kopieras; ingen falsk Epley-1RM; använd assistansprofil/kalibrering |
| SUB06 | Knäböj 100 kg → benpress | Ingen generell viktrelation; manual kalibrering; styrkegrafer separata |
| SUB07 | Marklyft → rumänska marklyft | Markeras kompletterande; ingen generell 1RM-konvertering |
| SUB08 | Blockerad knäböj → frontböj med samma aktiva knäbegränsning | Filtret respekterar begränsningen; ingen automatisk kringgång |
| SUB09 | Aktivt `block_pair_heavy` och substitutionsförslag skapar två tunga höft/knäövningar | Planen stoppas eller justeras innan den visas |
| SUB10 | Byte bara idag | Nästa planerade pass behåller originalövningen |
| SUB11 | Permanent byte | Endast kommande pass påverkas; historisk logg och programversion oförändrade |
| SUB12 | Offline byte, set sparat, telefon startas om, sedan synk | Byte och set kvarstår exakt en gång; inga dubletter |
| SUB13 | Samma byte görs i två flikar och olika redigeringar synkas | Revisionkonflikt visas, inte tyst överskrivning |
| SUB14 | Hantelpress 24 kg per hand registreras | Värde och semantik `24 kg/per_hand` bevaras genom UI, DB, export och analys |
| SUB15 | Ny övning med okänt e1RM och utan källprior | Ingen påhittad kg-siffra; användarvald kalibreringslast |
| SUB16 | Ändrade övningar efter att ett set redan sparats | Utförda set behåller korrekt `exercise_id`; nya set knyts till ersättaren |
| SUB17 | Utloggad besökare trycker ”Vetenskapen bakom STYRKA” | `/vetenskap` öppnas utan konto, källor och begränsningar visas |
| SUB18 | Direktlänk till källa och algoritmregel | Giltig extern DOI/källsida och relevant intern metodbokning |
| SUB19 | Population prior utan markerad osäkerhet | Test ska underkännas; sådan rekommendation får ej presenteras |
| SUB20 | Tidigare 36 pass och befintlig progressionsmotor | Regressionstester gröna; inga historiska set, e1RM eller grafer ändrade |
| SUB21 | Spontanpass med substitution | Registreras i samma belastningshistorik och påverkar framtida plan enligt befintliga regler |
| SUB22 | Giltigt e1RM i målet, men källövningen är starkare | Målövningens egna data prioriteras; populationratio används inte |
| SUB23 | Annan maskinmodell med samma övningsnamn | Inga kg värden överförs utan känd kompatibilitet/explicit bekräftelse |
| SUB24 | Omvänd riktning frontböj → knäböj | Ingen automatisk invertering av 0,80 till 1,25; målövningens egna data eller kalibrering |

## 6. Definition av färdig funktion

Ändringen är färdig först när: vetenskapssidan är publik och källgranskad; övningsbyten fungerar i planerade pass, aktiva pass och spontanpass; alla varianter får korrekt belastningssemantik; relevanta alternativ filtreras mot faktiska användarbegränsningar; viktföreslag är transparanta och inte fabricerade; personliga målövningsdata prioriteras; historiken är oförändrad; offline och RLS tester är godkända; samtliga SUB01–SUB24 och befintliga regressionstester passerar.

## 7. Forskningsreferenser och grund för anmodan

De nedanstående källorna visar att liknande rörelsemönster inte innebär identisk styrketestkapacitet eller överföring. De ger inte stöd för en allmän omräkningsmatris mellan gymövningar.

1. Currier BS m.fl. (2026). American College of Sports Medicine Position Stand: Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Medicine & Science in Sports & Exercise*, 58(4), 851–872. https://doi.org/10.1249/MSS.0000000000003897
2. Saeterbakken AH m.fl. (2025). Task Specificity of Dynamic Resistance Training and Its Transferability to Non-trained Isometric Muscle Strength: A Systematic Review with Meta-analysis. *Sports Medicine*, 55, 1651–1676. https://doi.org/10.1007/s40279-025-02225-2
3. Kassiano W m.fl. (2022). Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review. *Journal of Strength and Conditioning Research*, 36, 1753–1762. https://doi.org/10.1519/JSC.0000000000004258
4. Davis PR, Yakel JP, Anderson DJF (2020). Muscle Oxygen Demands of the Vastus Lateralis in Back and Front Squats. *International Journal of Exercise Science*, 13, 734–743. https://pmc.ncbi.nlm.nih.gov/articles/PMC7241635/
5. Gullett JC m.fl. (2009). A biomechanical comparison of back and front squats in healthy trained individuals. *Journal of Strength and Conditioning Research*, 23, 284–292. https://doi.org/10.1519/JSC.0b013e31818546bb
6. Saeterbakken AH, van den Tillaar R, Fimland MS (2011). A comparison of muscle activity and 1-RM strength of three chest-press exercises with different stability requirements. *Journal of Sports Sciences*, 29, 533–538. https://doi.org/10.1080/02640414.2010.543916
7. Swinton PA m.fl. (2011). A biomechanical analysis of straight and hexagonal barbell deadlifts using submaximal loads. *Journal of Strength and Conditioning Research*, 25, 2000–2009. https://doi.org/10.1519/JSC.0b013e3181e73f87
8. Lee S m.fl. (2018). An electromyographic and kinetic comparison of conventional and Romanian deadlifts. *Journal of Exercise Science & Fitness*, 16, 87–93. https://doi.org/10.1016/j.jesf.2018.08.001
9. Doma K, Deakin GB, Ness KF (2013). Kinematic and electromyographic comparisons between chin-ups and lat-pull down exercises. *Sports Biomechanics*, 12, 302–313. https://doi.org/10.1080/14763141.2012.760204
10. Haugen ME m.fl. (2023). Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance: a systematic review and meta-analysis. *BMC Sports Science, Medicine and Rehabilitation*, 15, 103. https://pmc.ncbi.nlm.nih.gov/articles/PMC10426227/
11. NICE NG226 (2022). Osteoarthritis in over 16s: diagnosis and management. https://www.nice.org.uk/guidance/ng226/chapter/recommendations
12. EU MDCG 2019-11 rev.1 (2025). Qualification and classification of software under MDR/IVDR. https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en

**Förbehåll:** Urvalsrelationer i `replacement_seed.json` är redaktionellt föreslagna för appens katalog. Direkta kvantitativa priors är endast godkända för de två uttryckligen dokumenterade paren ovan. Övriga ersättningar kräver egen historik eller kalibrering. Klinisk lämplighet ska aldrig infereras från en studie som enbart jämfört biomekaniska utfall hos friska försökspersoner.
