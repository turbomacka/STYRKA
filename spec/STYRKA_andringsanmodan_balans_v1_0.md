# STYRKA – ändringsanmodan ÄA-BAL-001

**Titel:** Balans – allsidig träning, begriplig styrkeutveckling och hållbara val  
**Version:** 1.0  
**Datum:** 11 oktober 2026  
**Status:** Normativ implementeringsanmodan till kodagent för *befintlig* STYRKA-applikation  
**Prioritet:** Efter/ihop med ÄA-UTV-001 (Utveckling)  
**Omfattning:** Ett nytt analys- och beslutsstöd **inom befintliga fliken Utveckling**. Ingen ny huvudflik och ingen ändring av befintlig tränings-/progressionsmotor.  
**Beroenden:** STYRKA v2 (program, verkliga set, begränsningar, recovery gates), ÄA-PLAN-001 (Min träningsplan) och ÄA-UTV-001 (styrkekurvor), samt genomförd substitutionsändring. Mappa alltid begreppen nedan till den **verkliga** kodbasen, inte hypotetiska tabellnamn.

---

## 0. DIREKT ORDER TILL KODAGENTEN

Inspektera hela berörda kodflödet före kodändring: registrerade arbetsset och sessionsstatus, planens revisions- och slotmodell, faktiskt implementerad rörelsekatalog, övningsbyten, Utvecklingssidans e1RM-/prestationsadapter, aktiva användarbegränsningar, återhämtningsgrindar, offlinecache, RLS och befintliga tester. Implementera denna ändring i **ett separat domän-/analyslager** med ett litet gränssnitt på Utveckling.

**Produktmålet:** STYRKA ska göra användaren motiverad att träna regelbundet, allsidigt och med omtanke om egna begränsningar. Det ska vara lätt att förstå *vad jag har tränat*, *vad som utvecklats* och *vilken frivillig, rimlig förändring jag kan göra härnäst*. Appen får **aldrig lova skadefrihet**, diagnostisera muskulär obalans eller påstå att dess rekommendationer minskar en enskild användares skaderisk.

**Högsta princip:** användarsatta regler, befintliga hälsorelaterade spärrar och dataägarskap har högre prioritet än alla balansförslag. **Inga nya träningsvikter, nya generella volymmål, medicinska trösklar eller automatiska planändringar.** Vid konflikt stoppar agenten berörd del och redovisar issue; den får inte improvisera fram träningsregler.

Detta är en **additiv produktändring**. Behåll alla genomförda pass, planer, planrevisioner, styrkekurvor, algoritmversioner, substitutionsrelationer och tidigare historik. Befintliga pass ska inte behöva migreras till en ny träningsdatakälla. Implementera, testa och rapportera enligt §14–16.

---

## 1. PRODUKTBESLUT OCH MÄTTEORETISK AVGRÄNSNING

STYRKA har tre separata informationsytor:

1. **Idag**: vad användaren kan träna nu, enligt befintlig planerare.
2. **Plan**: kommande, reviderbara träningspass och den oföränderliga journalen över utförd träning.
3. **Utveckling**: övningsspecifik styrke-/prestationskurva enligt ÄA-UTV-001 och därunder en kompakt sektion **Balans**.

Under **Balans** skiljs följande **tre konstrukt åt**:

| Dimension | Vad mäts faktiskt? | Tillåten slutsats | Inte tillåten slutsats |
|---|---|---|---|
| Träningens allsidighet | Genomförda arbetsset fördelade på klassificerade rörelsemönster; där data medger även matchning mot användarens *egna* accepterade passplaner | ”Horisontellt drag har tränats mindre än planerat i de genomförda passen.” | ”Ryggmusklerna är för svaga.” |
| Styrkans utveckling | Kvalificerade jämförbara prestationsobservationer från ÄA-UTV-001, per övning/variant | ”Bänkpress har ökat mer procentuellt än knäböj under denna period.” | ”Du har en patologisk styrkeobalans.” |
| Belastning och återkoppling | Existerande recovery-/restriction-/symptomstatus samt verkligt registrerad träningsmängd | ”Det finns en aktiv begränsning som behöver beaktas vid planering.” | ”Din skaderisk är 37 %.” |

Det finns **inget vetenskapligt etablerat enhetligt index** som här visar ”muskelbalans”, ”skadefrihet” eller ”hur rätt” någon tränar. **Skapa därför INTE ett numeriskt balansbetyg 0–100**, grönt/gult/rött skadeindex, riskprocent, generellt krav på press/drag-kvot eller antagandet att alla sex rörelsemönster bör få lika många arbetsset.

Balans är en *beskrivande, personanpassad översikt* och ett frivilligt handlingsstöd, inte en diagnos eller en ny preskriptionsmotor.

---

## 2. SLUTLIG UX – MINIMALISTISKT, MOBIL FÖRST

### 2.1 Placering

Behåll huvudsidan `Utveckling` enligt ÄA-UTV-001, inklusive vald övning, tidsperiod, senaste dokumenterade prestation och tillhörande linjediagram. **Direkt under grafen** läggs en lugn, sammanfällbar sektion `Balans` med underrubriken *Träna allsidigt och hållbart*. Den får inte tränga undan huvuddiagrammet på liten skärm.

När den är stängd visas endast:

- Rubrik `Balans`.
- En saklig mening om bästa relevanta fynd, eller `Din träning täcker flera rörelsemönster` om detta stöds; annars `Se hur din träning är fördelad`.
- Chevronsymbol och knappsemantik för att öppna. Ingen balanspoäng eller hotfull status.

När sektionen öppnas visas tre **enkla underavsnitt**, inte tre nya sidor:

**A. Träningens allsidighet** (först och viktigast): sex rader med genomförda arbetsset i senaste 28 dagarna, grupperade efter rörelsemönster. När tillämpligt visas en diskret kompletterande rad för bål, isolationsövningar och ej klassificerade övningar så att ingen träning göms. Där meningsfullt visas även `X av Y planerade set i genomförda ordinarie pass`; extra set och spontanpass redovisas separat. En kort förklaring, *Detta visar träningsfördelning, inte hur stark varje muskel är*.

**B. Din styrkeutveckling**: högst 2–3 korta, kontrollerade jämförelser från befintliga styrkekurvor, t.ex. `Bänkpress +8 % · Knäböj +3 % under vald jämförbara period`. Endast om kvalificerade, metodjämförbara datapunkter existerar. Annars `Ännu för lite jämförbara data`. Ingen ny graf behöver införas här. Huvudgrafen ovan är fortfarande auktoritativ.

**C. Belastning och återhämtning**: visa bara begriplig status som härleds från redan befintliga begränsnings-/recoveryregler, t.ex. `Kommande förslag behöver ta hänsyn till dina begränsningar`. Visa inte medicinska detaljer i sammanfattningen, och inga nya hälsobedömningar. Fördjupning öppnas frivilligt.

Efter delarna visas **högst ett** sammanfattat `Ditt nästa steg`-förslag, om en kandidat klarar kraven nedan, med tydlig grund och åtgärden `Visa möjlig justering`. Om inga relevanta handlingsförslag finns visas en saklig återkoppling om aktuell fördelning utan att hitta på en brist.

### 2.2 Design och tillgänglighet

- Behåll existerande Appleliknande färger, systemtypografi, luft, avskalade kort, ljust/mörkt tema och mobilt navigationsmönster.
- Diagram, staplar, färger och ikoner får **aldrig ensamma** bära betydelse. Visa mönsternamn, enhet och antal i text. Undvik färger som signalerar klinisk fara.
- Minst 48 × 48 CSS-px klickyta för primära mobila kontroller enligt appens befintliga designstandard; tangentbord, VoiceOver/TalkBack, 200 % textzoom, WCAG 2.2 AA och reducerad rörelse.
- Inga badges/utmärkelser, streakstraff, skammande formuleringar, tränings”skuld”, köpta normtabeller eller tävlingspercentiler i första versionen.
- Inga obligatoriska formulär eller nya frågor under ett pågående pass. Valfria RIR-/teknik-/symtomuppgifter används **endast om de redan finns och är tillåtna**.
- Utan användarens godkännande sker inga nya inställningar, övningsbyten, vikter eller träningspassändringar.

---

## 3. DATAGRUND, TIDSFÖNSTER OCH SKILLNADEN MELLAN PLAN OCH VERKLIGHET

### 3.1 Datakälla och vad som räknas

**Enbart** registrerade, verkligt utförda arbetsset (`kind=work`, `status=done`, `actualReps>0` eller motsvarande genomförd giltig prestation). Uppvärmning, planerade set, hoppade över set, raderade set och förslag utan prestation räknas inte som genomförd träningsmängd. Även faktiskt utförda set i partiella och spontana pass räknas. Använd korrekta tider för utförandet, **inte** synktid eller planerat passdatum. Undvik dubbletter efter offline-synk.

För **allsidighet** är huvudmåttet **antal arbetsset per rörelsemönster**. Detta är ett transparent *exponeringsmått*, inte en säker ekvivalent mellan tunga knäböj, lätta benpressar, muskelaktivering och rehabilitering. Visa inte tonnage mellan olika maskiner eller procent av 1RM som universellt ”balansmått”.

Tidsfönster v1: **senaste 28 avslutade kalenderdygnen inklusive idag** i användarens IANA-tidszon, räknat från lokal dags början 27 dagar bakåt till nu. Dokumentera och enhetstesta DST/tidszonsgränser. Fönstret påverkar inte ÄA-UTV-001:s separata periodfilter (`4 veckor | 3 månader | All tid`). Visa `Senaste 28 dagarna` explicit. Undvik att 28 dagar felaktigt blir 28 × 24 timmar vid tidsomställning om ni valt lokaldygn som kontrakt.

En enda aktivitetsperiod kan inte alltid ge meningsfull analys: om inget giltigt arbetsset finns, visa tomläge. **Avsaknad av träning en dag är inte i sig en skada, ett missat schemapass eller låg balans.**

### 3.2 Planerade kontra genomförda set – undvik nämnarfelet

Vissa användare har ingen avtalad träningsdag i kalendern. STYRKA planerar då en **sekvens av pass**, inte schemalagda datum. Därför får modulen **inte** härleda ”missade träningspass de senaste fyra veckorna” från att 28 dagar passerat.

Beräkna två skilda vyer utan att blanda ihop dem:

1. **Alla utförda set senaste 28 dagarna** inklusive ordinarie, extra/spontana och giltiga set i partiella pass. Detta är huvudstaplarna och saknar planerad nämnare.
2. **Matchning mot plan i *genomförda* ordinarie pass**: för varje ordinarie pass som påbörjats under perioden och har en accepterad, oföränderlig `planned_session_snapshot` vid start jämförs antal *förväntade* arbetsset i detta snapshot med antal *verkligt genomförda, relevant mappade* set. Matchning sker via stabil pass-/setidentitet eller dokumenterad substitutionshändelse och primärt rörelsemönster. Använd **den historiska accepterade planversionen vid passets start**, aldrig dagens reviderade framtidsplan. Planändring under ett pågående pass får inte skriva om den historiska nämnaren. Om källsnapshot saknas: `Jämförelse mot plan saknas` och inget fabricerat Y.

I matchningen får en planerad uppgift högst räknas som fullföljd **en gång**. Extra set och spontana set läggs under `Utöver plan` och kan inte retroaktivt täcka andra, ej genomförda övningar. Om samma rörelsemönster tränats med godkänd annan övning får det räknas som **mönsterexponering** men aldrig som bevis för specifik styrkeökning i ursprungsövningen. En substitution som hör till ett annat huvudmönster krediteras utförd kategori, inte den ursprungligen planerade kategorin.

Visa exempel `Horisontellt drag: 3 av 10 planerade arbetsset i dina genomförda ordinarie pass · +2 extra set`, endast om respektive tal verkligen följer denna definition. Om historiken saknar planögonblicksbilder visas enbart utförda set och texten `Planjämförelse saknas för äldre pass`.

**Frånvaro från ett planerat pass:** jämförs endast om användaren explicit schemalagt ett faktiskt datum och appen har funktionalitet för frånvaro; i denna ändring ska ingen sådan närvarologik uppfinnas.

### 3.3 Hantera mål och anpassade träningsprogram

En användare kan legitimt prioritera bänkpress, begränsa knäböj eller träna endast två korta pass per vecka. **Kräv inte identiska setantal mellan mönster** och tillskriv inte ”obalans” åt mönster som valts bort eller begränsats.

Använd den enskildes *accepterade plan vid passets start* som jämförelse när sådan finns. Referera dessutom kvalitativt till nuvarande användarmål och aktiva begränsningar. Om valda mål gör att vertikal press inte finns i planen är frånvaron ett **medvetet upplägg**, inte ett automatiskt förbättringsbehov.

---

## 4. RÖRELSEMÖNSTERS KLASSIFICERING – AUKTORITATIV POLICY

Varje katalogövning får för **balansanalys** en versionsstyrd klassificering med **exakt ett primärt** rörelsemönster. Undvik dubbelräkning: ett fullföljt arbetsset tilldelas **en primär kategori** i summeringen. Eventuella sekundära mönster kan lagras för information men tillför inte fler set till totalerna.

| Primär kategori (`pattern_id`) | Svenska namn | Exempel på övningar och princip |
|---|---|---|
| `knee_dominant` | Knädominant | `squat`, `front_squat`, `safety_bar_squat`, `smith_squat`, `hack_squat`, `goblet_squat`, `leg_press`, `split_squat`, `bulgarian_split_squat`, `step_up` – klassificera varianter efter faktiskt utförande; blanda inte unilateral belastningsdata |
| `hip_dominant` | Höftdominant | `deadlift`, `sumo_deadlift`, `trap_bar_deadlift`, `romanian_deadlift`, `dumbbell_romanian_deadlift`, `stiff_leg_deadlift` – trap bar är en analytisk huvudkategoriförenkling; kan belasta knäleden betydligt |
| `horizontal_push` | Horisontell press | `bench_press`, `dumbbell_flat_bench`/appens faktiska mappade ID, `smith_bench_press`, `machine_chest_press`, `incline_bench_press` |
| `vertical_push` | Vertikal press | `overhead_press`, `dumbbell_overhead_press`, `seated_barbell_press`, `machine_shoulder_press` |
| `horizontal_pull` | Horisontellt drag | `cable_row`, `chest_supported_row`, `seated_machine_row`, `one_arm_dumbbell_row`, `barbell_row` |
| `vertical_pull` | Vertikalt drag | `lat_pulldown`, `neutral_grip_lat_pulldown`, `assisted_pullup`, `pullup` |

Kompletterande kategorier, **separat från huvudsexan**:

- `accessory_upper`: `cable_lateral_raise`, `dumbbell_lateral_raise`, `machine_lateral_raise`, `biceps_curl`, dess varianter, `triceps_pushdown`, dess varianter. Differentiera gärna underkategorier i katalogen men kräv ingen ny huvudgraf.
- `trunk`: `plank`, `cable_crunch`, `machine_crunch`, `weighted_crunch`.
- `other`: övningar med okänd/ännu ej godkänd klass, inklusive äldre användarskapade poster. Visa `Övrigt/ej klassificerat`; inga implicita antaganden.

**Viktigt:** detta är en analytisk taxonomi – inte ett påstående om att ett set knäböj endast tränar en muskelgrupp, att marklyft är rent höftdominant eller att två övningar är utbytbara. En enbensövning ligger under knädominant om detta är valt i katalogpolicyn men kan märkas `unilateral=true` som kompletterande attribut; skapa ingen ogrundad sidosymmetripoäng. Smärta, skaderisk eller säkra alternativ får inte infereras ur `pattern_id`.

**Implementation:** anslut till nuvarande exercise catalog och verifierad aliasmappning för substitutionskatalogen. Förändra inte övnings-ID, lastsemantik, e1RM-policy eller substitutionens `relation_class`. `pattern_policy_version=balance-patterns/1.0.0`; se till att katalogen täcker alla aktiva övningar, och markera okända som `other`, aldrig tyst bortfall. Varje alias får samma kanoniska klass efter mappning. För historiska pass ska använda ID:n och tillhörande policyversion kunna återskapas.

---

## 5. ANALYS AV STYRKEUTVECKLING – ENDAST JÄMFÖRBARA MÅTT

Använd **befintlig `deriveProgressSeries` eller motsvarande från ÄA-UTV-001**, och dess publicerade kvalitetsfilter. Denna ändring skapar *inte* en ny e1RM-formel.

En jämförelse mellan två övningar får endast presenteras som en **beskrivande jämförelse av förändring**, inte att den ena övningen är ”objektivt för svag”. Det krävs:

1. Samma användare; varje övning har egen stabil variant- och utrustningsnyckel.
2. Samma typ av indikator, helst `estimated_1rm_kg` eller konsekvent dokumenterat `measured_1rm_kg`, med metod- och kvalitetsskillnader synligt deklarerade. Blanda **inte** olika indikatorer (`kg` mot `reps`, per-hand mot total, assistance_kg mot external_kg) i procentjämförelse.
3. För en automatiskt presenterad **jämförelse av utvecklingstakt** används ett **gemensamt jämförelsefönster på 12 veckor** och minst **tre giltiga observationer från skilda träningspass per övning**, med första och sista observation minst **42 dagar** isär, samt inga oförenliga metod-/variantbyten. Detta är en *konservativ produktregel (H)* för att minska missvisande småtal, inte en validerad reliabilitetströskel.
4. Den visade procentförändringen = `100 × (sista jämförbara observation − första jämförbara observation) / första observation`, endast om positiva värden, samma målövningsmått och tillåten semantik. Olika faktiska start-/slutdatum visas tydligt; hävda inte exakt likvärdiga observationsintervall bara för att båda ligger inom samma tolvveckorsfönster.
5. Om två övningar inte uppfyller jämförbarhetskraven: visa deras individuella data separat eller `Det finns ännu inte tillräckligt jämförbara observationer för att jämföra utvecklingstakten.`

**Ingen automatisk negativ klassning av en övning enbart utifrån lägre ökning**, eftersom träningstid, teknik, nybörjareffekt och planerad prioritering skiljer sig. Om sambandet med träningsfördelning diskuteras, använd försiktig text `Det kan vara värt att se över fördelningen`, aldrig `Orsaken är att du gjort för få set`.

Direkt 1RM och e1RM är olika typer av observationer. En uppmätt 1RM-punkt ska förbli korrekt märkt och får inte tyst göra en tidsserie metodhomogen. Referenspercentiler, styrkelyftsnormer, fasta squat:bench:deadlift-förhållanden och populationsjämförelser ingår **inte** i denna version.

---

## 6. BELASTNING, ÅTERHÄMTNING OCH SÄKERHET – VISA STATUS, INTE SKADERISK

Balans ska läsa, aldrig ersätta, STYRKAs befintliga:

- explicita `restriction_rules` och användarvalda blockerade övningar/övningspar;
- `recovery_gate` och de beslut som faktiskt används av planeringsmotorn;
- frivilliga symtomrapporter och `review_required`, **endast där användaren valt motsvarande funktion och det finns giltig lagrings-/behandlingsgrund**;
- verkligt genomförd arbetssetmängd och dokumenterade träningsuppehåll.

**Tillåtet:** visa att relevant övning eller föreslagen omfördelning behöver beakta aktiv spärr, att tidigare belastning påverkar nästa planerade pass, och att en alternativ övning bara får erbjudas enligt substitutionsanmodan med korrekt kalibrering.

**Förbjudet:** predicera skador, kalla viss 7-dagars-/28-dagarskvot farlig, använda ACWR som skyddströskel, utläsa vävnadsskada från arbetsset eller kröna ett rörelsemönster som ”säkert vid knäproblem”. Styrketräning i sig kan vara gynnsam för skadeförebyggande arbete i undersökta populationer; **det validerar inte denna app som skadepreventiv behandling**.

En frivillig beskrivning av ändrat arbetssetantal över tid får finnas, men utan riskfärger och utan nya absoluta säkra veckogränser. Befintliga restriktionsspärrar får aldrig förbigås för att förbättra en balansindikator.

**Symtomprioritet:** Vid aktiv `review_required`/olöst relevant belastningsreaktion får Balans **inte** erbjuda automatisk ökad träning eller automatiskt ersätta berörd övning. Visa diskret befintlig säkerhetsinformation i enlighet med den aktuella motorns beslut och eventuellt hänvisning till kvalificerad vård vid kvarstående problem enligt befintligt regelkontrakt. Undvik generella medicinska råd.

---

## 7. MOTIVATION UTAN GAMIFICATION ELLER SKULDBELÄGGNING

Återkoppling ska vara **sann, proportionerlig, respektfull och användarstyrd**:

- Bekräfta dokumenterad kontinuitet och utförda pass utan överdrifter: `Du har genomfört fyra träningspass under de senaste 28 dagarna.`
- Synliggör möjlig förbättring där egen plan och faktiska data ger stöd: `Du har tränat mindre horisontellt drag än du planerat i de genomförda passen.`
- Ge en valfri åtgärd som *inte automatiskt ökar total träningstid*: `Vill du se om ett roddmoment kan prioriteras i ett kommande pass?`
- Respektera avböjanden. Ett förslag som avböjs ska inte återkomma oförändrat efter varje sidöppning. Inga aggressiva pushnotiser, straff för uppehåll eller ”kom ikapp-skuld”.
- Om träningsfördelningen följer vald plan: visa `Din genomförda träning ligger nära det upplägg du valt.` *endast om* tillräcklig data för detta finns; annars neutral summering utan värderande slutsats.

**Högst ett prioriterat åtgärdsförslag synligt åt gången**. Fler diagnostiska kort ska inte införas. Förslag kan alltid avböjas utan att träningen markeras misslyckad.

### 7.1 Begränsad, deterministisk kandidaturvalspolicy (H)

Syftet är att förhindra överreaktion på enstaka uteblivna set. Detta är en **produktheuristik**, inte en evidensbaserad optimal träningsvolym:

- Kandidat `PLAN_PATTERN_GAP` kan skapas när (a) minst **två olika genomförda ordinarie pass** inom de senaste 28 dagarna hade samma rörelsemönster planerat; (b) minst **fyra arbetsset** i mönstret sammanlagt finns i dessa accepterade snapshots; (c) **minst tre planerade set saknas** efter tillåten matchning; (d) `matched_completed / planned < 0.70`. Förslag ska beskriva utförd kontra planerad träningsfördelning, inte ”obalans” eller diagnos.
- Villkoren kontrolleras endast för pass där historisk plan och verklig prestation säkert kan matchas. Om en relevant ordinarie passnapshot som behövs för planmatchningen saknas eller inte kan kopplas säkert till användarens accepterade plan: ge ingen `PLAN_PATTERN_GAP`-kandidat för det mönstret. Visa neutralt att underlaget är ofullständigt.
- Om användaren uttryckligen avstått från rörelsen, ändrat prioritet eller har relevant aktiv begränsning, **generera inte** förslag om att öka just denna rörelse. Visa eventuell lucka sakligt utan press.
- Rangordna kvalificerade luckor deterministiskt med `(planerade_set − matchade_set)` fallande, därefter lägsta mönster-id lexikografiskt. Höjd **skaderisk** eller osäker fysiologisk ”muskelbalans” får inte användas som rankningssignal.
- Efter `PLAN_PATTERN_GAP` (och bara om användaren uttryckligen vill): förbered ett *framtida* planförslag som prioriterar relevant rörelsemönster genom att i första hand **byta ett icke prioriterat kompletteringsmoment** mot en redan tillåten kandidat i samma tidsbudget. Kontrollera att tidigare huvudlyft, planens sekvens och viktiga mål bevaras. Om det inte ryms eller saknar godkänd alternativ övning visas `Det går inte att föreslå en justering inom dina nuvarande ramar.`
- **Ingen kandidat från enbart skillnader i e1RM-utveckling**. Sådana skillnader får förklara vad användaren kan undersöka men inte styra träningsdos automatiskt.
- Om ingen kvalificerad kandidat finns: **inget förslag**. Ett korrekt tomläge är bättre än irrelevant råd.

Dessa trösklar är lätta att granska, versionera och falsifiera. Redovisa dem i `/vetenskap` under `Så fungerar balansförslagen`, tydligt märkta som **produktregler utan dokumenterad klinisk validering**.

### 7.2 Förslagslivscykel

`eligible → previewed → accepted | dismissed | invalidated` med stabil `candidate_key = hash(user_id, rule_version, active_plan_revision, pattern_id, sort(eligible_source_set_ids), sort(eligible_plan_slot_ids))`. **Dagens datum får inte ensamt ändra kandidatnyckeln:** om det rullande fönstret flyttas men exakt samma underliggande set och planplatser fortfarande kvalificerar sig, är detta samma kandidat. Att öppna sidan flera gånger ska inte skapa nya förslag eller planrevisioner. Avböjande kvarstår för **samma kandidatnyckel** tills relevant indata/planrevision verkligen ändras. `dismissed` får inte spärra ett senare nytt, sakligt förändrat förslag.

`Visa möjlig justering` öppnar befintlig planförhandsvisning, **utan att spara**. Visa vilken framtida passplats/övning som föreslås bytas, vad som tillkommer, vad som tas bort, effekt på tidsuppskattning och eventuella ändrade vikter eller kalibreringsbehov. Inga dolda substitutioner. Klick `Godkänn ändring` genomför bekräftad framtida planändring via **befintligt idempotent revisions-/synkprotokoll**, och loggar orsak `USER_ACCEPTED_BALANCE_SUGGESTION`. Ingen mutation av pågående/genomförda pass och inga retroaktiva setändringar.

Efter accepterad ändring ska nästa rekommendation genereras **av den oförändrade befintliga planerings-/progressionsmotorn**, med full kontroll av symtom, parregler, återhämtning, utrustning, substitution och tidsbudget. Det är inte Balans som bestämmer kg eller set/reps. Om befintlig planerare inte stöder den föreslagna ändringen används en icke-mutativ insikt och funktionen hålls bakom featureflag tills korrekt integration finns.

---

## 8. EXAKT REGELORDNING (SERVER OCH KLIENT)

Implementera i ett rent beräkningslager utan direkt nätverk, systemtid eller React-state:

```ts
function deriveBalanceOverview(input: BalanceInput, asOf: IsoDateTime): BalanceResult {
  // 1. Läs endast aktuell användares auktoriserade, konsistenta pass-/setrevisioner.
  // 2. Välj faktiskt utförda arbetsset i lokala 28-dagarsfönstret.
  // 3. Mappa varje set en gång till versionerat primärt pattern_id.
  // 4. Beräkna observerad träning; särredovisa extraset/spontanpass.
  // 5. Matcha ordinarie pass mot accepterad historisk plan, aldrig dagens framtidsplan.
  // 6. Återanvänd kvalificerade observationsserier från ÄA-UTV-001 för styrkeförändring.
  // 7. Läs befintliga restriktioner/recovery-utfall; skapa inga egna medicinska regler.
  // 8. Beräkna insikter med reason codes och evidens-ID från faktiskt registrerade set.
  // 9. Filtrera kandidater mot nuvarande användarval, spärrar, mål, tid och utrustning.
  // 10. Returnera högst ett frivilligt förslag; inga skrivningar till träningsplanen.
}
```

**Policyprioritet vid konflikt:** (1) användarspärr och `review_required`, (2) befintlig motorns övriga säkerhets-/återhämtningskrav, (3) användarens uttalade mål och träningsram, (4) datakvalitet och historisk sanningskälla, (5) personlig planmatchning, (6) beskrivande trend, (7) motivatorisk formulering. Saknas giltigt underlag får systemet säga att det saknas.

Reason codes minst: `BAL_NO_DATA`, `BAL_NO_PLAN_SNAPSHOT`, `BAL_PATTERN_COVERAGE`, `BAL_PLAN_PATTERN_GAP`, `BAL_USER_DEPRIORITIZED`, `BAL_RESTRICTION_SUPPRESSED`, `BAL_REVIEW_REQUIRED`, `BAL_STRENGTH_NOT_COMPARABLE`, `BAL_NO_SAFE_PLAN_ADJUSTMENT`, `BAL_DISMISSED`, `BAL_PREVIEW_ONLY`.

---

## 9. DATAMODELL OCH API – MINIMALA ADDITIVA FÖRÄNDRINGAR

**Normativt:** nytt analysresultat är en **härledd läsvy**, aldrig en ny auktoritativ träningsjournal. Återanvänd befintliga tabeller. Namn nedan är **logiska kontrakt** – agenten ska mappa till faktiska modeller.

```ts
type BalancePatternId =
  | 'knee_dominant' | 'hip_dominant'
  | 'horizontal_push' | 'vertical_push'
  | 'horizontal_pull' | 'vertical_pull'
  | 'accessory_upper' | 'trunk' | 'other';

type BalancePatternSummary = {
  patternId: BalancePatternId;
  actualWorkSets28d: number;
  actualSessionCount28d: number;
  // null betyder saknad eller ej jämförbar historisk plan, inte noll:
  eligiblePlannedWorkSets: number | null;
  matchedCompletedWorkSets: number | null;
  extraWorkSets28d: number;
  supportingSetIds: string[]; // användarskyddade käll-ID
  supportingWorkoutIds: string[];
  dataQuality: 'complete' | 'partial' | 'insufficient';
};

type BalanceInsight = {
  kind: 'descriptive' | 'positive' | 'optional_action' | 'limitation';
  reasonCode: string;
  textSv: string;
  supportingSourceIds: string[];
  decisionPolicyVersion: string;
  evidenceLevel: 'observed' | 'descriptive_rule' | 'product_heuristic';
};

type BalanceOverview = {
  asOf: string;
  timezone: string;
  patternPolicyVersion: string;
  decisionPolicyVersion: string;
  historyRevisionOrHash: string;
  windowStartLocalDate: string;
  windowEndLocalDate: string;
  summaries: BalancePatternSummary[];
  progressComparisons: BalanceInsight[];
  recoveryStatus: 'not_evaluated' | 'no_block' | 'limited' | 'review_required';
  topSuggestion?: BalanceInsight & { candidateKey: string };
};
```

Tjänstekontrakt (implementationsnamn får anpassas):

- `deriveBalanceOverview(authorizedHistorySnapshot, now, policyVersions)` – ren deterministisk funktion.
- `getBalanceOverview(userId, asOf?)` – autentiserad, ägarfiltrerad adapter, paginerad hämtning efter behov, ingen N+1 per set.
- `previewBalanceAdjustment(userId, candidateKey, currentPlanRevision)` – endast simulering med existerande planerare, inga sidoeffekter.
- `acceptBalanceAdjustment(userId, candidateKey, expectedRevision, eventId)` – sker **enbart** via existerande atomisk, autentiserad planmutation med versionskonflikt, idempotens och nya framtida snapshots.
- `dismissBalanceSuggestion(userId, candidateKey, eventId)` – användarens aktiva avböjande, idempotent, utan förändring av styrkemotorn.

Om persistens behövs för avböjande eller acceptans är en minimal RLS-skyddad `balance_suggestion_decisions`-tabell tillåten (user_id, candidate_key, status, policy_version, event_id, updated_at). Undvik att lagra härledda känsliga tränings- och symtomuppgifter en gång till. Om databasen kan härleda detta och beslut redan loggas i `plan_revision_events`, återanvänd dem.

**Cache:** härledda resultat får cachas bara med användar-ID, relevant historikrevision, aktiv planrevision, policyversion, tidsfönster, tidszon och begränsningsrevision i nyckeln; invalidera vid genomförda/korrigerade/raderade set, nya/ändrade restriktioner, kontobyte, ändrad tidszon, aktiv planrevision och datumövergång. Hantera lokalt sparad, osynkad prestation exakt en gång och visa `Uppdateras efter synk` där fullständig serverdata inte finns. Offline kan visa senaste konsistenta användarspecifika snapshot, men **får inte acceptera planändring** utan att befintligt offlineprotokoll stödjer auktoriserad, konfliktkontrollerad mutation.

**Säkerhet/integritet:** Supabase RLS på alla nya användarspecifika poster; inga externa AI-anrop för analys, ingen känslig telemetri eller export till tredjepart. Varje dataexport/raderingsflöde måste omfatta ev. nya beslut. Hälsodata enbart enligt befintlig separat integritetsdesign. Undvik att blotta medicinska noteringar på delad skärm genom att återge dem i allmänna kort.

---

## 10. SKÄRMTEXTER – ANVÄND DESSA SOM UTGÅNGSPUNKT

- Rubrik: **`Balans`**
- Ingress: **`Se hur din träning är fördelad och hitta nästa steg som passar dig.`**
- A: **`Träningens allsidighet`**
- A metod: **`Staplarna visar arbetsset i olika rörelsemönster. De mäter inte muskelstyrka eller skaderisk.`**
- A fönster: **`Genomförd träning senaste 28 dagarna`**
- A planjämförelse: **`Av planerade set i genomförda ordinarie pass`**
- A utan jämförbar plan: **`Vi kan visa vad du har tränat, men saknar äldre planunderlag för en rättvis jämförelse.`**
- B: **`Styrkans utveckling`**
- B begränsning: **`Vi behöver fler jämförbara prestationer innan vi kan jämföra utvecklingen mellan övningar.`**
- C: **`Belastning och återhämtning`**
- C försiktighet: **`Dina registrerade begränsningar vägs in när nästa pass planeras.`**
- C aktivt hinder: **`Det finns en aktuell begränsning. Förslag som påverkar området visas inte som automatiska ökningar.`**
- D: **`Ditt nästa steg`**
- D exempel: **`Du har tränat mindre horisontellt drag än planerat i dina genomförda pass. Vill du se en möjlig justering inom din vanliga träningstid?`**
- CTA: **`Visa möjlig justering`**
- Bekräftelse: **`Godkänn ändring`**, alternativ: **`Behåll min plan`** / **`Inte nu`**
- Metod: **`Så fungerar Balans`** (med länk till den publika sidan `/vetenskap`).
- Tomläge: **`När du har genomfört några pass kan du se hur träningen fördelas mellan olika rörelser.`**
- Explicit fotnot: **`Balans är en hjälp att förstå och planera din träning. Den kan inte avgöra om du kommer att skadas.`**

Språkregler: ord som `svag`, `obalanserad`, `riskzon`, `onormalt`, `försummat`, `du måste` och `säker träning garanteras` får inte genereras som standardfeedback av analysregler. Använd neutrala observationsord: `tränat`, `planerat`, `skillnad`, `prioriterat`, `jämförbara data`, `möjlig justering`.

---

## 11. TRANSPARENS, EVIDENS OCH METODREGISTER

Länka `Så fungerar Balans` från sektionen till befintliga publika `/vetenskap`. Lägg till ett separat metodstycke – utan att återintroducera oförankrade vetenskapspåståenden eller skriva om befintligt `evidence_register.json` tyst.

Det ska ange:

1. Vilka registrerade set som räknas och varför värdet inte är identiskt med muskeltillväxt, maximal styrka eller skadefrihet.
2. Att sex rörelsemönster är en **praktisk produktklassificering**, inte en biologisk eller klinisk norm.
3. Skillnaden mellan planerat och genomfört, särskilt när dagar **inte** schemalagts.
4. Vad som krävs för att jämföra styrkeutveckling, och vilka observationer som utesluts.
5. Att förslagsgränserna i §7.1 är **versionssatta produktheuristiker** som inte validerats som säkra träningsdoser.
6. Att skaderisk inte kan beräknas ur denna balansprofil och att befintliga användarbegränsningar har företräde.

Relevanta primärkällor att knyta till eller tydligt särskilja från existerande forskningsregister (verifierade länkar 2026-10-11):

- Currier BS m.fl. (2026). ACSM Position Stand on Resistance Training Prescription, *Medicine & Science in Sports & Exercise*. https://doi.org/10.1249/MSS.0000000000003897 – övergripande stöd för styrketräningens nytta och individuell programmering; **stöder inte** STYRKAs specifika balansgränser.
- Lauersen JB, Bertelsen DM, Andersen LB (2014). Exercise interventions to prevent sports injuries: systematic review/meta-analysis, *British Journal of Sports Medicine*. https://doi.org/10.1136/bjsports-2013-092538 – effekter i undersökta **idrottspopulationer/interventioner**, inte bevis för STYRKAs balansprofil eller individuella prognoser.
- *The Calculation, Thresholds and Reporting of Inter-Limb Strength Asymmetry: A Systematic Review* (2022), https://pmc.ncbi.nlm.nih.gov/articles/PMC8488821/ – visar svaghet i generella asymmetrigränser och att överföring till kliniska påståenden är problematisk.
- Shrier I m.fl. (2020). *Analyzing Activity and Injury: Lessons Learned from the Acute:Chronic Workload Ratio*, *Sports Medicine*, https://doi.org/10.1007/s40279-020-01280-1 – metodkritik av belastningskvoter som skaderiskunderlag.

Spara källor med faktiska titlar, DOI/länkar, publikationstyp och begränsningstext. Om de ska in i befintliga källregistret måste detta ske som **explicit versionssatt addition** med validering av DOI och referens-/påståendekopplingar. Låt befintliga referenser och tidigare fastställda påståenden vara oförändrade. Märk interna produktbeslut som sådana, inte som empirisk evidens.

---

## 12. PRESTANDA, ROBUSTHET OCH KORREKT ÅTERKOPPLING

- Påbörjad träning påverkar inte planmatchningen förrän relevanta utförda set verkligen är lokalt transaktionssparade. Vid korrigering ska en tidigare balansinsikt omvärderas; en felaktig insikt får inte ligga kvar som aktuell.
- Sidan får inte starta om befintliga workout-state machines, rekommendationsberäkningar eller omplanera automatiskt vid läsning. Att öppna/stänga Balans är sidoeffektsfritt.
- Hämta set/snapshots i batch, undvik N+1, inga onödigt tunga externa visualiseringsberoenden. Analys över minst två konton × 36 pass och på minst 500 genomförda pass ska förbli användbar på normal mobil; agenten ska mäta faktisk prestanda och ange testmiljö.
- Servern ska aldrig lämna ut annan användares resultat, och klientens cache/outbox måste vara isolerad per `user_id`.
- Stabil sortering och deterministiskt urval: samma godkända underlag, tid och policyversion ger identisk output; ingen slump, språkmodell eller nätverksberoende beslutskedja.
- Vid mycket gles data, gamla historiska pass med oklara maskinuppgifter eller underkända set ska systemet visa `Otillräckligt underlag`, inte skapa kompensationsförslag.

---

## 13. FÖRESLAGEN IMPLEMENTERINGSORDNING

1. **Kartlägg** befintlig kod, faktiska övnings-ID:n, från/till för substitutionshändelser, träningshistorikens sanningskälla och återhämtningsgrindar. Leverera kort beroendekarta före kodning.
2. Inför **versionsstyrd balansklassificering** i exercise catalog/analysadapter. Testa mappning och ingen dubbelräkning. Ingen SQL-migration om lokal versionerad policy räcker.
3. Implementera **ren 28-dagarsaggregator** + rättvis historisk planmatchning (inklusive oschemalagda pass, revision och substitution).
4. Återanvänd ÄA-UTV-001:s giltiga styrkepunkter för försiktig jämförelse. Skapa inte nytt e1RM-mått.
5. Lägg till **read-only balanssektion** på Utveckling med metodbegrepp, datakvalitet och skärmläsarstöd.
6. Inför högst ett regelbaserat förslag i **preview-only**. Integrera med planeraren för säker, uttryckligen bekräftad planrevidering om existerande API stödjer det. Aktivera bakom separat featureflag, t.ex. `balance_adjustments_enabled`, tills giltig idempotens och alla grindar är testade.
7. Publicera metodtext på `/vetenskap` med korrekt versionssatt forskningsregistrering.
8. Kör alla balansters testfall och sedan STYRKAs kompletta regression-, offline-, RLS-, Safari- och Android-svit. Verifiera mot äldre testplaner att träningsrekommendationer inte förändrats om användaren inte accepterat en planändring.

---

## 14. ACCEPTANSTESTER – BAL01–BAL38

Automatisera i Vitest/integration där det är möjligt och i Playwright/E2E för verkliga interaktioner. Varje test måste ha ett **uttryckligt expected outcome**, inte bara `renders` eller `does not throw`. Ange vilka tester som inte kunnat köras och varför.

| ID | Scenario | Obligatoriskt godkänt resultat |
|---|---|---|
| BAL01 | Konto utan registrerade träningsset öppnar Utveckling → Balans | Tydligt tomläge, inga fabricerade mönstermängder eller förslag |
| BAL02 | Ett utfört arbetsset knäböj + uppvärmning + planerat ej utfört set | `knee_dominant=1`, ej 3 |
| BAL03 | Ett utfört knäböjsset bidrar även mekaniskt till höftbelastning | Räknas **en gång**, endast under primär `knee_dominant` i dessa sex staplar |
| BAL04 | Trap bar-marklyft med primärmönster `hip_dominant` | Räknas i hip; UI påstår inte att knäet är obelastat |
| BAL05 | Okänt historiskt övnings-ID med korrekt set | Visas i `other`, bidrar inte till falsk lucka eller försvinner tyst |
| BAL06 | Substitutionsalias för `dumbbell_flat_bench` | Mappas till faktiskt app-ID och `horizontal_push`, gamla ID:n skrivs inte om |
| BAL07 | Två konton med identiskt nämnda övningar | Helt åtskilda resultat och cache; negativa RLS-tester |
| BAL08 | Utfört spontanpass med tre vertikala dragset | 3 i faktisk 28-dagarsmängd, 0 automatiskt krediterat som planerade set i ordinarie pass |
| BAL09 | Kalenderlöst program och ett uppehåll | Inget ”missat pass” på grund av passage av kalenderdygn |
| BAL10 | Utförda ordinarie pass med sparade accepterade snapshots | `planned` baseras på de historiska snapshots som accepterats före passstart |
| BAL11 | Framtidsplanen revideras efter genomförda pass | Historisk planjämförelse ändras inte |
| BAL12 | Äldre utfört pass saknar plansnapshot | `planned=null`, UI visar bara faktiskt utförd mängd, ingen påhittad nämnare |
| BAL13 | Planerat horisontellt drag 10 set, 3 genomförda, +2 spontana/extra | `matched=3`, `planned=10`, extra=2; inget falskt `5/10` |
| BAL14 | Planerat knäböj ersätts med annan knädominant variant via verifierat byte | Rörelsemönster kan räknas som genomfört; specifikt knäböjs-1RM ökar inte |
| BAL15 | Planerad knädominant övning ersätts med övning vars primärmönster är hip | Ursprungligt knee-mönster ej krediterat; faktiskt hip krediteras |
| BAL16 | En planplats har fler extra set än planerat | Matchning högst planerat setantal; extra set separat och ingen procent över 100 i planmatchningen |
| BAL17 | Pass som avslutats delvis med giltiga arbetsset | Endast verkliga set räknas, ej fulla planerade set eller misslyckade set som ej utförts |
| BAL18 | Ett pass i lokal sommartidsomställning för relevant IANA-tidszon | Korrekt lokal 28-dagarsgräns, ingen dubblering eller bortfall |
| BAL19 | Användare har inga fasta veckodagar men 36 framtida slots | Dessa framtida slots används inte som faktiskt planerade kalenderhändelser i 28-dagarsnämnaren |
| BAL20 | Alla sex mönster finns i eget program men har olika antal set | Ingen automatisk varning för ojämlika setnivåer |
| BAL21 | Rörelse avsiktligt bortprioriterad av användaren | Ingen åtgärd som försöker öka den mot användarens vilja |
| BAL22 | Knärelaterad aktiv blockering eller olöst `review_required` | Ingen balansföreslagen ökad knäbelastning/kringgång av spärr |
| BAL23 | Endast två giltiga styrkepunkter under 12 veckor | Ingen automatisk slutsats om jämförd styrkeutvecklingstakt |
| BAL24 | Två övningar, ≥3 giltiga punkter var men olika kg-semantik | Ingen procentuell cross-metric-jämförelse |
| BAL25 | Två jämförbara e1RM-serier, ≥3 punkter/övning och ≥42 dagars spann | Sakligt beskrivande separata procentförändringar; källdatum synliga; ingen diagnos |
| BAL26 | En assistansövning med sjunkande assistansvikt | Ingen förväxling med stigande e1RM eller felaktig ”negativ styrkeutveckling” |
| BAL27 | 1–2 saknade arbetsset i enstaka pass | Ingen `PLAN_PATTERN_GAP`-kandidat enligt explicit policy |
| BAL28 | 10 planerade horisontella dragset i ≥2 genomförda ordinarie pass, 3 matchade, inga restriktioner | Högst en `PLAN_PATTERN_GAP`-kandidat med transparent `3 av 10` |
| BAL29 | Flera kvalificerade pattern-gap-kandidater samtidigt | Endast en presenteras, deterministiskt störst lucka och stabil tie-break |
| BAL30 | Samma data, planrevision, tidszon, asOf och regelversion igen | Exakt samma output och kandidatnyckel; inga nya planrevisioner |
| BAL31 | Förslag avböjs och användaren öppnar sidan flera gånger | Samma kandidat återkommer inte förrän relevant indata förändras |
| BAL32 | Användaren trycker `Visa möjlig justering` | Bara planförhandsvisning; inga ändringar av pass, planer eller träningshistorik |
| BAL33 | Användaren godkänner tillåtet byte via befintlig planerare | En (1) framtida revision, rätt orsakskod, inga gamla pass/set omskrivna |
| BAL34 | Dubbelt knapptryck eller återförsänd begäran offline | Idempotent, exakt en logisk ändring; konflikt bevarar äldre korrekt data |
| BAL35 | Föreslagen kompletteringsövning skulle överskrida tidsbudget eller bryta parregel | Ingen mutation; tydlig ”kan inte föreslå inom ramarna” |
| BAL36 | Korrigerad/raderad prestation eller kontobyte efter cacheladdning | Balansgraf och insikter invalideras korrekt, inga andra användares data |
| BAL37 | VoiceOver/keyboard/200 % textzoom/ljust-mörkt/reducerad rörelse | Sektion, staplar, CTA och metodtext är fullt tillgängliga på mobil |
| BAL38 | Regression: två konton × 36 genomförda pass, separat 2 100-plansfixture om den finns i repot | Samma rekommendationer före/efter ändringen när ingen balansjustering aktivt accepterats |

**Ytterligare kvalitetskrav:** negativa RLS-/behörighetstester på varje ny endpoint, urkopplad featureflag och migrerad äldre profil; E2E på iPhone Safari och Android Chrome där miljön medger. Rapporterade automatiska testresultat ska ange hur många som körts, hoppats över och varför.

---

## 15. DEFINITION OF DONE OCH RELEASEGRIND

Ändringen är färdig endast om samtliga gäller:

- [ ] Balans ligger under **Utveckling**; inga dubbla plan- eller journalvyer, ingen ny huvudflik.
- [ ] Analysen använder enbart verkligt registrerad träning och korrekta historiska snapshots, versionsstyrd övningsklassificering och inga fabricerade datavärden.
- [ ] Sex huvudmönster + kompletterande övningar/okänt stöds utan dubbelräkning, aliasmappning och alternativa belastningsmått respekteras.
- [ ] Kalenderlösa program behandlas rättvist; framtida 36-passplanen likställs aldrig med daterade skyldigheter.
- [ ] Analys av styrkeutveckling är ett separat, evidenskvalificerat komplement utan ny e1RM-formel eller låtsad ”svaghet”.
- [ ] Befintliga säkerhetsgrindar har absolut företräde; ingen ny generell skaderiskmodell eller balanspoäng införs.
- [ ] Högst ett frivilligt, sakligt, begripligt förslag visas; förhandsvisning har inga sidoeffekter; mutation endast efter godkännande.
- [ ] Versionering, användarskyddad synk/RLS, caching, GDPR-funktioner och källspårbarhet fungerar.
- [ ] `/vetenskap` förklarar metoder, vetenskapens gränser och egna heuristiker; tidigare forskningsregister ändras bara versionsstyrt.
- [ ] BAL01–BAL38 och befintliga regressionstester passerar; Safari/Android och två-konto-36-passflöden är verifierade eller tydligt redovisade som kvarstående releaseblockerare.
- [ ] Kodagenten har rapporterat exakt vilka filer, migrationer, versioner och tester som ändrats, identifierat avvikelser och inte påstått utförda verifieringar som inte genomförts.

**Separat produktionsgrind:** Behåll STYRKA v2:s GDPR/artikel 9- och eventuell MDR-bedömning. Att balansmodulen avstår från diagnostik eller skaderiskprognos innebär inte automatiskt att hela appens rättsliga klassificering är avgjord.

---

## 16. SLUTRAPPORT SOM AGENTEN SKA LÄMNA

Redovisa kort men verifierbart:

1. Reponamn, utgångscommit, slutcommit/PR och featureflagstatus.
2. Hur faktiska tabeller och tjänster mappats till kontrakten ovan.
3. Lista med nya/ändrade filer, eventuella migrationer och nya källregisterposter.
4. Katalogens `pattern_policy_version`, `decision_policy_version` samt om nya klient-/databaskontrakt tillkommit.
5. Exakta testkommandon, resultat BAL01–BAL38, befintlig Vitest/Playwright/SQL-RLS/36-passregression samt status för iOS Safari; hopptest och blockerare tydligt identifierade.
6. Exempel med verkliga testfixtures på minst **en godkänd insikt, en avvisad insikt, en avstådd användaråtgärd och en accepterad framtida planrevision**.
7. Bekräftelse att originaldata och träningsmotor förblivit oförändrade om användaren inte aktivt har godkänt planjustering, samt eventuella identifierade saknade förutsättningar.

**Startprompt till kodagenten:** `Implementera den bifogade ÄA-BAL-001 i befintliga STYRKA. Inspektera först aktuell kod och redan pågående ÄA-PLAN-001/ÄA-UTV-001. Gör minsta möjliga bakåtkompatibla ändring. Följ kontrakt och acceptanstester ordagrant, skapa inga påhittade medicinska eller träningsvetenskapliga gränser, utför verifiering och återrapportera enligt §16. Fortsätt självständigt genom kodning och testning; eskalera endast verkliga kontraktskonflikter.`
