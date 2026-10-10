# 02 · Normativt algoritmkontrakt (STYRKA-ENGINE/1.0.0)

> Detta dokument definierar **reproducerbara produktregler**. Numeriska trösklar märkta **H** är heuristiker, inte vetenskapligt validerade trösklar för skaderisk, träningsdos eller optimalt träningsintervall. Kräver fackgranskning och användbarhetsutvärdering. Inget automatiskt beslut ersätter vård/rehabordination.

## 1. Invarianta säkerhetsregler
1. Användarsatt `block_exercise` tar alltid bort övningen ur automatiskt förslag; `block_pair_heavy` förhindrar att två övningar samtidigt har tung status. Regler får bara ändras av användaren. Funktion `propose` får aldrig ignorera dem för att klara tidsmålet.
2. Rapporterad **ny eller kvarstående hälta, betydande svullnad eller tydligt försämrad funktion** i relevant område ger `review_required`: ingen automatisk ökning, tung variant eller auto-ersättning som belastar samma område. Visa neutral anvisning om att avstå provocerande moment och vid kvarstående/återkommande problem kontakta kvalificerad vårdpersonal. Inga diagnoser.
3. Om ingen giltig uppskattning för övning finns får systemet inte visa ett fabricerat kilogramvärde. Erbjud submaximal kalibrering; användaren väljer faktisk vikt. För rehabkänsliga områden låter vi användaren ta ställning till lämplighet innan belastningsförslag.
4. En rekommendation är **förslag** med möjlighet att minska eller avstå. Manuell ändring loggas separat från rekommendation. Maxrepetitionstest föreskrivs aldrig automatiskt.
5. Inga två tunga squats/deadlifts i samma pass för profil med aktiv `block_pair_heavy(squat,deadlift)`; frivilligt accepterad lätt komplettering kan finnas kvar. Okänd 1RM behandlas konservativt som potentiellt tung om användaren uppfattar övningen som tung.
6. Spontanpass påverkar rullande belastningshistorik omedelbart, men får aldrig radera nästa ordinarie pass. Anpassningen görs prospektivt.

## 2. Terminologi och datatyper
- **Övningsexponering:** faktiskt utförda arbetsset i en viss övning, exklusive uppvärmning.
- **e1RM:** estimerat max i kg, **inte** kliniskt testvärde.
- **Mode:** `heavy`, `moderate`, `light`; olika från upplevd dagsform.
- **RIR:** reps i reserv, frivillig 0–5; nybörjare kan lämna okänt.
- **LoadState:** `unknown`, `estimated_low`, `estimated_medium`, `observed_high` beskriver källans precision, inte prestationsnivå.
- **RecoveryGate:** `normal`, `caution`, `restart`, `review_required`, `blocked`. Ingen av dem uttrycker faktisk vävnadsskada.
- **Set:** `kind=warmup|work`, `targetKg`, `targetReps`, `actualKg`, `actualReps`, `rir?`, `technique=controlled|uncertain|poor`, `completedAt?`, `status=planned|done|skipped`.
- **Heavy:** ett planerat set med användarens uttryckliga `heavy` markering, eller normaliserad belastning ≥75 % av giltig e1RM. Detta är en H-konvention enbart för planeringsregler. Vid okänd e1RM använd `mode` och okänd/tung som potentiell blockerare.
- **Endast procent av e1RM avgör aldrig medicinsk säkerhet.**

## 3. Validering
- `weightKg`: 0–500 kg för extern last, exakt i gram eller decimalsträng med högst 3 decimaler. 0 kg möjligt endast på kroppsviktsövning/kalibrering; negativ aldrig.
- `actualReps`: 0–50 per set, där 0 påförs som misslyckat set/avbrutet och måste särskiljas från `skipped`.
- `rir`: 0–5 eller null; `technique` registreras frivilligt per arbetsövning; vid explicit `poor` ingen automatisk ökning.
- `minutes`: 15–120; `plannedSessionsPerWeek`: 1–7; `experience`: novice/intermediate/experienced; `maxEstimateKg` måste vara >0, ≤500.
- `plateIncrement`: positivt, ≤10 kg; maskinassistans valideras inom maskinens eget spann.
- `timestamp`: UTC ISO8601. All tidsdifferens beräknas på absoluta tidsstämplar, inte veckodag.

## 4. Startlast från initial kapacitet
**e1RM:**
- Rapporterat 1RM => e1RM = angivet kg, kvalitet `estimated_medium` om ej nyligen direkt uppmätt, annars `observed_high`.
- Rapporterat 3RM (max tre tekniskt godkända reps) => e1RM = `kg × (1 + 3/30)` (Epley). Kvalitet `estimated_medium`; alltid approx.
- Utfört submaximalt set med 1–8 reps **och** tillförlitligt RIR 0–3: kan beräkna `kg × (1 + (reps + RIR)/30)` som separat indikativ uppskattning, kvalitet `estimated_low`. Om RIR okänt används setet endast för lämpliga arbetsvikter, inte som e1RM.
- Ingen giltig skattning => endast kalibreringsläge. Ingen autogenererad godtycklig vikt.
- Assisterade chins, plank och liknande får **ingen** e1RM enligt Epley. Separat progressionslogik.

**Initial startprocent av e1RM (H).** Väljs utifrån övningens erfarenhet, mode och användarens begränsningar:

| Erfarenhet | heavy | moderate | light |
|---|---:|---:|---:|
| novice | 0,65 | 0,60 | 0,50 |
| intermediate | 0,775 | 0,70 | 0,60 |
| experienced | 0,825 | 0,725 | 0,625 |

För att motverka falsk precision avrundas föreslaget kg **nedåt** till tillgängligt redskapssteg, och kan aldrig bli över användardeklarerat maxlasttak. Vid en kalibrering med låg säkerhet startar appen försiktigare och visar att vikten måste bekräftas i gymmet.

**Startreps/sets (H):**
- novice: heavy/moderate 2 × 8, light 2 × 10.
- intermediate: heavy 3 × 5, moderate 3 × 6, light 2 × 8.
- experienced: heavy 3 × 5, moderate 3 × 6, light 2 × 8.
- Tillåtna dynamiska repetitionsband: novice heavy 8–10, intermediate/experienced heavy 4–6 eller 5–7 enligt övningsmall, moderate 6–10, light 8–12 (isolation 10–20). Ett konkret pass använder ett ENDA rep-band per övning, lagrat som immutable plan snapshot.
- Setantal från programmet tar företräde över starttabellen inom 1–4 arbetsset, om regler och tidsbudget medger. Knäböj 4 tunga set + marklyft 2 lätta kan vara användardefinierad mall; ingen garanti att kombinationen alltid är medicinskt lämplig.

**Ordning:** applicera blockeringar → skapa basövningsroll → bestäm set/reps → beräkna vikt → tidsbudget → verifiera blockeringar igen → lämna förslag.

## 5. Progression efter genomfört pass: dubbel progression H
Progressionsregler gäller **per övning och per utrustningsvariant**, med rekommendationen som utgångspunkt.

- `allCompleted` är sant endast om alla planerade arbetsset utförts. Användarinitierat tidigt avslut ger INTE misslyckad prestation.
- `allTargetsMet` kräver actualReps ≥ plannedReps i samtliga genomförda arbetsset, samma redskapsvariant, verklig vikt ≥ planerad vikt (med tolerans 0), och inga `poor` teknikmarkeringar.
- Frivillig RIR: Om användaren angivit RIR 0–1 för något set => tillåt inte viktökning denna gång. RIR okänd innebär ingen automatisk viktökning förrän **två** på varandra följande kompletta, kontrollerade träningar enligt aktuell topp-repmängd genomförts. Detta är konservativ heuristik.
- När alla mål uppnåtts med RIR ≥2, eller två lyckade tillfällen utan RIR: om planerade reps < bandets max, håll kg och höj planerade reps med 1/set till nästa gång. Om planerade reps är på bandets max, höj vikten med övningens tillgängliga minsta steg om ökningen håller sig inom `maxIncreasePct` (novice 5 %, intermediate 5 %, experienced 3 %) och återhämtningsregler tillåter det. Återgå till bandets min-reps efter viktökning.
- Om minsta steg överskrider procentspärren => håll vikten och visa 'mindre viktsteg behövs', eller erbjud manuell ändring; **ingen** automatisk överträdelse.
- Om ett fullständigt pass missar mål: håll kg och reps vid första miss; efter 2 på varandra följande missar minska arbetsvikten med 1 tillgängligt steg, eller 5 % avrundat nedåt om det ger större minskning. Minst möjlig realistisk vikt (0 eller min-maskinvikt), ingen negativ vikt.
- Vid `poor` teknik håll eller sänk efter användarens val; inga högre vikter. Om `unknown` teknik använd konservativ tvåpassregel.
- Faktisk vikt större än planerad blir historik men ger inte automatiskt ytterligare viktökning samma iteration. Beräkna ny plan från senaste giltiga utförda set med normaliserad belastning efter separat kontroll.
- Giltig styrkeuppskattning uppdateras inte om set utfördes med stor RIR utan tillförlitlig förmåga att estimera; särskilj graf med faktiska prestationer och osäker e1RM.

### Progression vid assisterade chins
`assistanceKg` minskas med maskinens minsta steg efter samma framgångslogik; min 0 kg. Om minskningen annars skulle innebära ett mycket stort steg i användarens faktiska belastning => bibehåll hjälp och lägg till reps inom intervall. Kroppsviktsförändring kan lagras frivilligt men krävs aldrig för att logga. Ett assistansvärde är INTE jämförbart med extern vikt i latsdrag.

## 6. Gate för tid sedan senaste relevanta belastning (H)
Funktionen använder `hoursSinceRelevantWork` för samma övning eller huvudsakligt mönster och påverkas av `reportedSymptoms`. Matrisen ger inte någon biologiskt säker optimal vila:

| Förhållande | Status | Motorns åtgärd |
|---|---|---|
| Relevant tungt pass <24 h | caution | ingen ny tung exponering i samma mönster automatiskt; erbjud andra områden eller lätt alternativ |
| Relevant pass 24–47,99 h | caution | behåll/avstå viktökning för aktuell rörelse; tillåt moderat/lätt enligt begränsningar |
| Relevant pass 48 h–13 dagar | normal | ingen automatisk extra ökning på grund av vila |
| >13 och <28 dagar sedan samma övning | restart | reducerad arbetsvikt 5 % avrundad nedåt; 1 set färre om >2; visas som försiktigt omstartsförslag |
| ≥28 dagar | restart | reducerad arbetsvikt 10 % avrundad nedåt; 1 set färre om >2; första passet återkalibrerar |
| Hälta/svullnad/funktionsförsämring | review_required | relevant tung övning blockeras för automatisk progression, medicinsk bedömning vid kvarstående eller återkommande besvär |

**`hoursSinceRelevantWork` från ingen historik:** `null`, behandlas som ny övning/kalibrering och inte som evig återhämtning. Inga automatiska +procent för 72 h eller en vecka. Enstaka lätta isolationsövningar och muskelöverlapp bedöms mindre konservativt, enligt övningsspecifika rörelsemönster.

**Symtomreaktion nästa dag:** `baseline`, `transient`, `persistent`, `limping`, `swelling`, `unknown`. `transient` => ingen autohöjning tills nästa symtomfria relevanta exponering. `persistent/limping/swelling` => `review_required` för matchande region och rörelse, får enbart ändras via användarens aktiva bekräftelse och ny planbedömning, ingen tyst tidsbaserad borttagning.

## 7. Tidsmodell och programgenerator H
`minutes = generalWarmup + Σ(exerciseWarmup + workSets×workSetDuration + max(0, workSets−1)×restMinutes + transitionMinutes)`.

Standardvärden (H): generell uppvärmning 4 min; första skivstångsbasövning 5 min specifik uppvärmning, andra 3 min; övriga 1 min; arbetsset 45 s för flerleds, 35 s för isolation; vila basövning tung 2,5 min, bas lätt 1,5, andra flerleds 1,5, isolation 1 min; stationsbyte 1 min.

**När tiden inte räcker:** (1) huvudbasövning + uppvärmning (2) andra nödvändiga stora rörelsemönster (3) balanserande drag/press (4) isolationsövningar (5) bonus. Pruna bonus först, sedan isolationsset, därefter andra rörelser. **Förkorta aldrig nödvändig vila för tungt baslyft automatiskt.** Om första basövningen inte ryms: visa kortpass med enbart övning eller ange att tidsbudgeten är otillräcklig.

**1/vecka:** helkropp med växlande fokus huvudövning över veckor. **2/vecka:** roterande A→B→C utan kalenderreset; A squat/bench, B bench/deadlift, C squat/deadlift med press/drag. **3/vecka:** samma A/B/C men välj en tydlig huvudbasövning/pass. **4/vecka:** över/under rotation eller fördelad helkropp beroende på restriktion. **5–7/vecka:** lägre genomsnittlig dos per pass; aldrig multiplicera tvåpassmallens fulla veckovolym med frekvensen. Initialt versionsstyrda exponeringsmål per rörelsemönster, avrundning och tidsanpassning.

**För tvåpassprofilens defaultmallar** (kan justeras efter tid, vana och begränsningar):
- A: squat heavy 3 set, bench moderate 3, lat pulldown/pullup 2, cable lateral raise 2; mage 2 bonus.
- B: bench heavy 3, deadlift light/moderate 2, vertikalt drag 2, biceps 2, triceps 2; lateral raise bonus.
- C: deadlift heavy 2, squat light 2, overhead press 3, vertikalt drag 2, cable lateral raise 2; mage bonus.
- För profil med `block_pair_heavy(squat,deadlift)` **måste** C vara deadlift heavy + squat light **eller** squat heavy + deadlift light; val följer övningsprioritet och användarens egna toleransmarkering. Mallen får aldrig tolka båda som tunga enbart för att de är basövningar.
- För underkroppskänslig profil får C också bli endast EN av de två; tvåbasövningsambitionen är lägre prioriterad än uttryckliga begränsningar.
- Knappt 40 minuter bör automatiskt minska komplettering om uppskattningen överskrider tid.

**Viktighet:** tidsschemat bestäms på gymtid, inte teoretisk repetitionslängd ensam. Actual session duration sparas för möjlig framtida estimering; ingen automatisk individuell anpassning av tidsmodell i version 1.0 utan nya tester.

## 8. Spontanpass H
- Separat planeringstyp `extra`, användaren väljer 15–120 min och dagsform `good/normal/tired/pain`.
- Senaste 7 dagarnas genomförda set används för sammanhang, tidsgränser från avsnitt 6 gäller före annan schemalogik.
- Prioritera kompletterande rörelsemönster med minst nylig exponering, favoriter och mindre krävande övningar, men inga slumpvis valda medicinska substitut.
- Dagsform `pain` eller olösta symtom i relevant region: visa varning/avstå relevanta belastningar, ev. annat ickeprovocerande område på användarens val. Ingen automatisk höjning.
- Genomfört extra pass läggs på samma historik som planerat pass, ökar redovisad dos och kan leda till omprioritering av nästa ordinarie övning. Det räknas **inte** automatiskt som nästa A/B/C; däremot kan appen erbjuda `Ersätt kommande ordinarie pass` när motsvarande huvudarbete faktiskt gjorts och användaren samtycker.
- Alla beslut ger skäl med code, t.ex. `RECENT_LOWER_HEAVY`, `TIME_LIMIT_20`, `USER_RESTRICTION`, `PREFERRED_MOVEMENT`.

## 9. Rekommandationsordning och reproducibilitet
1. Hämta giltig användarprofil, katalogversion, utrustning.
2. Läs och verifiera aktiva uttryckliga blockeringar och olösta symtomflaggor.
3. Beräkna relevanta prestationsdata och e1RM kvalitet.
4. Välj kandidatövningar från templates och behov; filtrera förbjudna och otillgängliga.
5. Tilldela mode, set, repetitionsband, initial vikt. Följ regel om okänd styrka.
6. Tillämpa progressionsregler och recovery gates.
7. Kontrollera parregler och negativ belastningsreaktion; reducera/ersätt enligt användarkonfigurerade alternativ eller markera olöst.
8. Skatta tid och pruna enligt prioritet.
9. Kontrollera samtliga invarianta regler igen. För varje övning generera `reasonCodes`, `engineVersion`, `ruleSetVersion`, `inputsHash`, `confidence`.
10. Skapa immutable snapshot. Alla set loggas mot snapshot. Ny plan på nästa pass uppdaterar aldrig historiska rekommendationer.

## 10. Saknade data och olösta konflikter
- Ingen e1RM: låt användaren välja submaximal vikt. Ingen autogenererad siffra.
- Motstridiga begränsningar gör hela basmallen omöjlig: föreslå bara återstående tillåtna övningar och visa `Inget fullt schema möjligt med aktuella begränsningar`.
- Precision: kg inom 0,001 lagras i integer gram; jämför aldrig med flyttals tolerans mot databasen.
- App offline: beslutsmotorn använder senaste lokala konsistenta snapshot; markera äldre/synk ej klar. Same input + version => same output.
- Manuell ändring trumfar föreslagen träningsvikt **som loggad prestation**, men systemet ska aldrig ange att den avvikelsen var rekommenderad.

## 11. Utvärdering
För v1 mäts praktisk rimlighet: andel rekommendationer accepterade, självrapporterad RIR, träffsäkerhet på planerat repmål, efterföljande symtom, avbrott och styrkeutveckling i uppmätt standardiserad prestation. Jämförelse mot enkel dubbelprogression kräver prospektiv plan och etik-/integritetsbedömning om det ska bli forskning. Varken enskilda användardata eller 36 pass kan styrka generell effekt.
