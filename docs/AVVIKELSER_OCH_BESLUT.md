# Avvikelser, tolkningar och alla H-värden

Alla tolkningar följer normhierarkin i paketets README. Nya produktheuristiker är märkta **H (ny)** och har acceptanstest. Nedan dokumenteras tidigare beslut med respektive versionsnummer.

## Tillägg 2026-10-23/24: adaptiv motor och regelversion 2.0.0

På produktägarens implementeringsanmodan ersätts procenttak för progression, den tidigare separata progressionslogiken per lasttyp och fasta korttidsfönster med en gemensam modell för bekräftad nivå, försök, vald dos och gradvis återhämtningsbelastning. **H (ny):** beslutströsklar, undantag, alternativ, forskningsanknytning och testresultat finns samlade i [ADAPTIVE-ENGINE-2026-10-23.md](ADAPTIVE-ENGINE-2026-10-23.md). Äldre beslut nedan som beskriver dessa ersatta regler är historik, inte den aktuella policyn. Specifikationens referensmotor bevaras som fryst jämförelsebas; produktmotorn är nu 2.0.0. Användarspärrar och medicinska översynsspärrar behåller högsta prioritet. Ingen produktionspublicering ingår.

## Tillägg 2026-10-16: återhämtning, regelversion 1.3.0

På produktägarens begäran ersätts den generella tidsregeln för nyligt arbete och H-N4 av en gemensam bedömning av faktiskt utförda arbetsset, ansträngning, sidprestationer och rörelseöverlapp. **H (ny):** vanliga direkta exponeringar begränsar till medelnivå under 24 timmar; krävande/större direkt arbete till lätt nivå under 48 timmar; krävande överlapp till medelnivå under 24 timmar. Gränserna är produktheuristiker, inte uppmätt individuell återhämtning. Uppvärmning undantas. Automatisk progression hålls tillbaka även för maskinnivåer och oberoende staplar. Referensmotorn, symtomreglerna och historiska registreringar bevaras.

Fullständiga kriterier, arkitektur och verifiering: [Återhämtning utifrån faktiskt arbete](ATERHAMTNING_2026-10-16.md). Tidigare uppgifter om återhämtning nedan ska läsas med detta tillägg. Övriga historiska beslut gäller fortsatt.

## 1. Motsägelser och luckor i paketet

| # | Iakttagelse | Hantering |
|---|---|---|
| K1 | README nämner `scripts/verify_core.mjs` och `QA_STATUS.md` som saknas i paketet; anger "21 kontroller" medan smoke-filen har 26. | `npm run test:reference` kör paketets `smoke.node.cjs` (26/26) och verifierar SHA256 mot manifestet. |
| K2 | Referensmotorns `REGIONS` täcker 8 av 17 övningar; övriga skulle aldrig spärras vid hälta. | Katalog 1.1.0 anger områden för alla 17 (överuppsättning för de 8 – mer konservativ). Kräver fackgranskning. |
| K3 | `recommendNext` ökar alltid kg vid framgång – fel riktning för assistans. | Separat lastriktningsneutral `progressionDecision` för assistans/kroppsvikt/tid; property-test visar identiska beslut som referensen för extern last (2000 fall). Referensmotorn används oförändrad för extern last. |
| K4 | 02 §4 anger isolationsband 10–20; referensen ger 8–12/10–12. | Referensens band används (ligger inom tillåtet intervall). |
| K5 | "Bonus" markeras inte i mallfilen. | Roll härleds: första övning = huvudlyft, bål = bonus, isolation = komplettering. |
| K6 | 08 §2 steg 8: vad som visas om huvudlyftet inte ryms. | Kortare alternativ: huvudlyftet i lätt variant, 1–2 set, vila oförändrad; status `time_insufficient`, varning visas. |
| K7 | `training_sessions.kind='calibration'` i schemat, men kalibrering sker per övning. | Kalibrering sker inom ordinarie pass (räknas för rotation); typen används inte. |
| K8 | Schemaförslaget tillät direkta setskrivningar. | Direktskrivning återkallad; endast `apply_set_mutation` (som 001-kommentaren föreslår). |
| K9 | Paketets `deadlift → romanian_deadlift` kräver samma utrustning, så utrustningsbyte kan aldrig ske. | Regeln (accept krävs vid känslig profil) är implementerad men praktiskt sett vilande. |

## 2. Tekniska beslut (delegerade till kodagent, 07)

React 19 + Vite 8 + TypeScript 5.9 (strikt), react-router 7, Dexie 4 (IndexedDB), supabase-js 2, vite-plugin-pwa (Workbox, endast statisk precache), egen SVG-graf, ingen CSS-ram. Planerade set skapas på servern först när de berörs (utförda/ändrade/överhoppade) – minskar synk och är fullt spårbart via planens snapshot. Profilpatchar är idempotenta (lika värden ⇒ tillämpat) efter att E2E hittade falsk konflikt vid förlorad ack. Magisk länk är primär inloggning; lösenord finns som alternativ (båda e-postbaserade, används av automatiska tester).

## 2b. Inloggning

Klassisk e-post + lösenord är huvudväg (önskat av produktägaren 2026-10-10). E-postlänkar använder implicit flöde så att de fungerar i valfri webbläsare; sifferkoder i mejl stöds när mallarna innehåller dem (lokalt; i staging först med egen SMTP). Lokal Supabase kör med e-postbekräftelse påslagen så att testerna speglar staging.

## 3. Alla H-värden (ruleSetVersion `STYRKA-RULES/1.0.0-app.1`)

### Från paketet (oförändrade)
- Startandel av e1RM: novis 0,65/0,60/0,50 · van 0,775/0,70/0,60 · mycket van 0,825/0,725/0,625 (tung/medel/lätt); avrundning nedåt.
- Startset/reps och band enligt referensmotorn (novis 2×8 tung/medel, 2×10 lätt; övriga 3×5 tung, 3×6 medel, 2×8 lätt; band 8–10/10–12, 5–7/6–10/8–12).
- Maxökning 5 % / 5 % / 3 %; vänta två pass utan RIR; RIR ≤ 1 håller; två missar ⇒ −max(1 steg, 5 %).
- Återhämtning: < 24 h och 24–48 h caution; 48 h–13 d normal; > 13 d −5 % och ett set färre om > 2; ≥ 28 d −10 %.
- Tung = markerad tung eller ≥ 75 % av e1RM.
- Tidsmodell: 4 min allmän uppvärmning; 5/3/1 min specifik; 45 s/35 s per set; vila 2,5/1,5/1,5/1 min; 1 min stationsbyte; tolerans +1 min.
- Novis högst 2 set per övning; tung marklyft högst 2 set; 14 dagar utan prioriterat baslyft ⇒ högre prioritet.

### H (ny) – kräver produktägarens och fackgranskares godkännande
| Kod | Regel |
|---|---|
| H-N1 | Efter kalibrering blir nästa arbetsvikt den **lägsta** vikt användaren faktiskt använde (assistans: **högsta** assistans). |
| H-N2 | Saknas uppskattning i ett lättare mode härleds vikt från tyngre mode via startandelarna – **aldrig uppåt**. |
| H-N3 | Återhämtningsgrupper: underkropp (knäböj, marklyft, RDL, split squat, benpress), press (bänk, militärpress), drag (latsdrag, chins, rodd); isolation/bål bara samma övning. Caution använder grupp < 48 h, omstart använder samma övning > 13 d. |
| H-N4 | Tung övning med relevant arbete < 48 h nedgraderas till lätt (konsekvent med referensens `RECENT_HEAVY_MODE_REQUIRES_REPLAN`). |
| H-N5 | Tillfälligt symtom släpps vid nästa relevanta exponering efter rapporten; kvarstående/hälta/svullnad endast genom användarens aktiva "löst". |
| H-N6 | Underkroppskänslig profil (områdesnotering eller aktivt symtom i knä/höft/ländrygg/lår) ⇒ högst en av knäböj/marklyft per pass. |
| H-N7 | Assistans: minska ett maskinsteg vid framgång; med känd kroppsvikt spärr om steget > maxökning av effektiv last; omstart ⇒ +1 steg assistans. |
| H-N8 | Chins med extra vikt: ökning bara med känd kroppsvikt och inom maxökning, annars håll. |
| H-N9 | Plankan: kalibrering i sekunder; +5 s vid uppnått mål, −5 s efter två missar; 10–90 s. |
| H-N10 | Spontanpass: upp till 3 flerledsövningar i olika grupper + 2 isolationsövningar; dagsform bra ⇒ första övning tung om tillåtet, normal ⇒ medel, trött/ont ⇒ lätt; tung 3 set (novis 2), övriga 2. |
| H-N11 | Vilotimer använder tidsmodellens vila. |
| H-N12 | Regel kan avse ett område i stället för en övning (alla övningar som belastar området). |

## 3b. STYRKA-CR-2026-10-10-01 (2026-10-11): vetenskapssida och övningsbyte

Ändringen är additiv: referensmotorn, befintliga program, setloggning, progressionsregler, konton, offlinehantering och historik är oförändrade. Aktuella versioner efter kompletteringen 2026-10-11: regelversion `STYRKA-RULES/1.2.0`, katalog `2.0.1`, substitutionskatalog `SUBST/1.2.0` (`src/planner/replacement_seed.json`, katalogversion 1.2.0 – enda källa), evidensregister `EVIDENS/2.0.0` (ur produktägarens register schema 1.0.0), metodversion `STYRKA-METOD/1.2.0`.

### Komplettering 2026-10-11: produktägarens `replacement_seed.json` och `evidence_register.json`

Filerna kom efter den första implementationen och ligger nu oförändrade i `spec/cr-2026-10-10-01/` (SHA-256 i `SHA256.json`, kontrolleras i test). Granskningen av den tidigare implementationen mot filerna gav följande, som är rättat:

| # | Avvikelse i tidigare implementation | Rättning |
|---|---|---|
| K-1 | Substitutionskatalogen var rekonstruerad ur anmodans tabell; flera relationsklasser skilde sig (t.ex. bänkpress → hantelpress, knäböj → gobletknäböj, militärpress-paren, kabelrodd-paren). | Katalogen härleds nu direkt ur seed-filen: klass (`near_variant`/`movement_family`/`accessory`), `notes_key`, evidens-id och omvända kandidater (`reverse_candidate_allowed`, aldrig med viktprior). |
| K-2 | Påhittat fält `strength_specificity` styrde ordning och "svagare överföring". | Borttaget. Ordning: relationsklass, egna data, favorit, ordning i seed-filen. Överföringsnotisen följer seed-filens klassdefinitioner. |
| K-3 | Egna tilläggsrelationer utan stöd (bl.a. utfall, chins ↔ assisterade chins, split squat-varianter, benpress → gobletknäböj). | Borttagna. Tre par ur anmodans obligatoriska tabell som seed-filen saknade är, efter produktägarens beslut 2026-10-11, införda i seed-filen version 1.2.0 (se nedan); undantagskoden är borttagen. |
| K-4 | `barbell_row` saknades; `lunge` fanns men ingår inte i seed-filen. | `barbell_row` tillagd (katalog 2.0.1, migration 005). `lunge` erbjuds inte längre (`active = false`), raden finns kvar för eventuell historik. |
| K-5 | Seed-sluggar skiljer sig för sex nya övningar. | Uttrycklig 1:1-mappning enligt §2.2 ("mappa till appens faktiska övningssluggar"): `dumbbell_flat_bench`→`dumbbell_bench_press`, `machine_chest_press`→`chest_press_machine`, `dumbbell_overhead_press`→`dumbbell_shoulder_press`, `machine_shoulder_press`→`shoulder_press_machine`, `machine_lateral_raise`→`lateral_raise_machine`, `rope_triceps_pushdown`→`rope_pushdown`. Redan driftsatta id behålls (inga omskrivningar). |
| K-6 | Hjälpskattningen saknade seed-villkoret "no active restriction". | Tolkat försiktigt: ingen aktiv användarregel (blockering, parregel, set-/nivågräns, områdesnotering) som rör käll- eller målövningen eller målövningens områden; annars kalibrering utan siffra. Kvot, tak (0,60) och evidens-id läses från seed-filen. |
| K-7 | Vetenskapssidan hade sex källor utanför registret (Currier 2023, Pelland 2026, Zhang 2021, Hickmott 2022, Moseng 2024, Tung 2024) och saknade Saeterbakken 2013; `mdcg2019` hette `mdcg2025` i registret. | Källförteckningen är nu exakt registrets 13 källor. Titel, år, länk, studietyp, population, stött påstående och begränsning visas ordagrant; författare/tidskrift/DOI verifierade mot Crossref. |
| K-8 | Påståenden gick längre än registret stöder (t.ex. "minst två pass per vecka", "2–3 set", "STYRKA är inte en medicinteknisk produkt" – det sista en juridisk slutsats). | Påståendena är nu registrets åtta (`claims.*`, `rules.*`) med registrets klassning och regel-id. Den regulatoriska texten anger att avsett ändamål avgör och att juridisk bedömning inte är gjord. Produktbegränsningar visas separat, utan källhänvisning. |

Rader nedan som rör S1 (rekonstruerad seed) är ersatta av K-1–K-5.

### Seed-fil 1.2.0 (produktägarens beslut 2026-10-11)

`src/planner/replacement_seed.json` är nu den enda auktoritativa källan: originalet (`spec/cr-2026-10-10-01/`, oförändrat) ordagrant plus tre par, med `catalog_version` 1.2.0, `derived_from` och `changelog`. Ett test säkerställer att inget annat än dessa tre par skiljer sig från originalet.

| Par (båda riktningar) | Klass | Förklaring i appen | Vikt |
|---|---|---|---|
| Assisterade chins ↔ Latsdrag med neutralt grepp | `movement_family` | Assistans i stället för extern vikt – siffrorna betyder olika saker. | Manuell kalibrering |
| Assisterade chins ↔ Chins | `near_variant` | Samma rörelse, men assistans och kroppsvikt är skilda belastningsmodeller – kilon kan inte jämföras eller räknas om. | Manuell kalibrering |
| Rumänska marklyft ↔ Trap bar-marklyft | `accessory` (bredare rörelsealternativ) | Träningseffekten och belastningsfördelningen skiljer sig, och övningen är inte styrkemässigt likvärdig. | Manuell kalibrering |

Ingen av relationerna har viktprior i någon riktning; historik och kalibrering är separata per övning. Inga evidens-id anges (ingen källa i registret jämför exakt dessa par).

### Utfall

`lunge` förblir inaktivt (produktägarens beslut 2026-10-11). Övningen fanns inte före ändringsbegäran och har ingen användning i staging; raden finns kvar så att eventuell historik bevaras.

### Tolkningar och beslut

| # | Iakttagelse | Hantering |
|---|---|---|
| S1 | Anmodan hänvisar till `replacement_seed.json`, som inte fanns i leveransen. | Rekonstruerad ur tabellen i §2.2 (`src/planner/replacement_seed.json`) med redaktionella tillägg för övriga mallövningar (chins, bröststödd rodd, split squat, benpress m.fl.). Relationerna är ett redaktionellt urval (H), inte bevis för likvärdig effekt. **Kräver fackgranskning.** |
| S2 | Anmodan beskriver Gullett 2009 som "lägre standardiserad arbetslast". | Formuleringen finns inte i abstraktet. Vetenskapssidan återger abstraktet och avvisar uttryckligen tolkningen att frontböj skulle vara säkrare vid knä- eller broskskada (§4.1). |
| S3 | Endast två kvantitativa priors är godkända. | `squat → front_squat` 0,80 (totalt) och `bench_press → dumbbell_bench_press` 0,83 (totalt, visas per hantel). De visas bara när användaren svarat att hen gjort målövningen förut, presenteras som ett osäkert kalibreringsförslag (kg = null, `calibrationSuggestionKg`, `confidence: low`) och måste bekräftas eller ändras. Ingen omvänd kvot. Invariant (SUB19) stoppar en hjälpskattning utan markerad osäkerhet. |
| S4 | Befintliga hantelövningar (bicepscurl, split squat) saknade definierad lastbas. | De behåller sin semantik (`legacyUnspecifiedBasis`); historiska värden tolkas inte om. Nya hantelövningar har `per_hand_kg`. "Per sida" visas bara för nya ensidiga övningar. |
| S5 | Tidsmodellen ska räkna båda sidor för ensidiga övningar. | Nya ensidiga övningar har tidsfaktor 2. Befintlig split squat behåller faktor 1 så att version 1-planerna inte ändras. |
| S6 | Parregler vid byte. | En ersättare räknas också som den ursprungligt planerade övningen i parreglerna (skärpning, aldrig uppmjukning). Kedjade byten pekar på den ursprungliga övningen. |
| S7 | Spontanpass och den större katalogen. | Spontanpassens urval är oförändrat (katalog 1-övningar plus användarens permanenta ersättare); byte i spontanpassets förhandsvisning fungerar som i ordinarie pass. |
| S8 | Byte på två enheter. | Samma byte ger deterministiska id för ersättare, set och revisionspost (`uuidFromSeed`) ⇒ en serverpost; olika redigeringar ger revisionskonflikt (SUB13). **Kvarstående risk:** *olika* byten av samma övning i samma pass på två enheter – serverns unika ordning (`session_id, order_index`) avvisar den senare enhetens ersättare, som då visas som ej synkad. Ingen tyst överskrivning, men användaren måste välja på den enheten. |
| S9 | Anmodans tabellnamn. | `exercise_substitutions` och `evidence_sources/claims` är versionsstyrd lokal JSON (tillåtet i §4.2; ingen adminredigering). `exercise_variant_metadata` är kolumner i `exercise_catalog`. `equipment_profile_id` motsvaras av `variant_key`. `recommendation_before/after_id` motsvaras av `original_/replacement_session_exercise_id`, vars snapshots är rekommendationerna. |
| S10 | Kalibrering efter byte. | Ingen andra progressionsalgoritm: efter första passet används referensmotorn/befintlig kalibreringsväg för målövningen. Inom passet förifylls kvarvarande set med den faktiskt använda vikten. |
| S11 | Feature flag. | `VITE_FLAG_SUBSTITUTION_V2` (byggtid, standard `true` efter godkända tester). `false` ⇒ tidigare bytesvy S09 v1 (begränsad till katalog 1-övningar, som förut). Vetenskapssidan påverkas inte av flaggan. |
| S12 | Text för skälkoden `USER_SWAP`. | Ändrad från "Du bytte övning under passet." till "Du valde att byta övning." eftersom byte nu även görs före start. Endast UI-text. |
| S13 | Fråga om vana. | Ställs bara när svaret avgör en hjälpskattning (de två paren ovan) och sparas per övning. Inget svar eller "Nej" ⇒ kalibrering utan siffra. |
| S14 | Utvecklingsgraf. | Serier per övning och maskinprofil skarvas aldrig ihop. Uppskattning i inställningar gäller standardprofilen. Hantelövningar visas i kg per hantel. |
| S15 | Medicinska beslut. | Inga nya medicinska bedömningar: byten filtreras mot befintliga blockeringar, symtomspärrar och parregler. Ingen variant beskrivs som säkrare vid skada. |

### H (ny i STYRKA-RULES/1.1.0) – kräver produktägarens och fackgranskares godkännande

| Kod | Regel |
|---|---|
| H-S1 | Relationsklasser (`near_variant` / `movement_family` / `accessory`) per par enligt seed-filen 1.2.0; omvända kandidater enligt `reverse_candidate_allowed`. |
| H-S2 | Ordning för förslag: relationsklass, egna data i målövningen, favorit, ordning i seed-filen; högst 3 tillåtna först, resten under "Visa fler" (ej tillåtna med skäl). |
| H-S3 | Första exponering från hjälpskattning: högst 0,60 av preliminär e1RM (seed-filens `first_exposure_fraction_cap`), avrundat nedåt till viktsteget, aldrig över användarens maxtak, aldrig vid aktiv symtomflagga eller aktiv regel som rör övningarna (K-6). |
| H-S4 | Populationskvoter 0,80 och 0,83 används endast som lågkonfidensförslag och uppgraderas aldrig av sig själva. |
| H-S5 | Inom ett kalibreringspass förifylls kvarvarande set med senast utförda vikt; "för tungt" ⇒ ett viktsteg lättare (assistans: ett steg mer); ingen automatisk höjning inom passet. I kalibreringsläget (H-N1) ger "för tungt" även nästa pass ett steg lättare förslag. |
| H-S6 | Nivån `calibrated` efter minst två avslutade pass med utförda arbetsset i målövningen (samma maskinprofil), kontrollerad teknik, inget "för tungt" och inga rapporterade besvär i övningens områden. |
| H-S7 | Ensidig ny övning: tidsfaktor 2 för arbetsset (båda sidor). |
| H-S8 | Ny maskinprofil för maskin-/kabelövning: separat historik och kalibrering; inga kg förs över. |

## 3c. ÄA-PLAN-001 "Min träningsplan" (2026-10-11)

Inga nya träningsregler. Framtidsplanen tas fram genom den befintliga planeraren per kommande rotationsplats; motor, planerare och historik är oförändrade (2 100-planers regression grön).

| # | Fråga | Beslut |
|---|---|---|
| P1 | Kontrakt → befintligt schema | `program_id` = `programs.id`; `workout_session_id` = `training_sessions.id`; `planned_slot_id` = deterministiskt id ur löpande ordinarie passnummer (överlever revisioner och programversioner); `plan_revision_id` = ny `plan_revisions` (append-only); `planned_session_snapshot` = `plan_revisions.slots[]`; `user_note` = ny `notebook_notes`. Inga ändringar i befintliga tabeller utöver ett index. |
| P2 | Passnummer | Härleds ur befintlig historik: ett ordinarie pass räknas när det flyttade rotationen (första avslutade pass med utfört arbetsset per programplats) eller när spontanpass uttryckligen räknats som ordinarie. Spontanpass i övrigt saknar nummer. Inga gamla data behöver migreras. |
| P3 | Vikter i framtida pass | Lagras aldrig. Nästa pass visar befintlig live-rekommendation; pass 2–3 visar senast utförd vikt som "referens, inte en prognos"; övriga "Vikt beräknas närmare passet". |
| P4 | Återhämtning i strukturell plan (visningsantagande, inte träningsregel) | Varje framtida plats beräknas som om normal vila (3 dygn efter senaste utförda pass) föregår den. Gör planen deterministisk och oberoende av klockan; nästa pass beräknas alltid vid passtillfället. **Bör bekräftas av produktägaren.** |
| P5 | När en revision skapas | När planerarens indata ändrats: genomfört pass, spontanpass, räknat spontanpass, profil, övningsval/maskinprofil, begränsningar, symtom eller regelversion ger alltid revision; rättade set ger revision endast om kommande pass ändras. Öppna/expandera/byta flik/skriva ut ger aldrig revision. Kontrollen körs i bakgrunden efter lokala ändringar och synk. |
| P6 | Horisont | 72 platser lagras per revision; "Visa fler pass" beräknar längre utan nya poster. |
| P7 | Datum | Appen har ingen veckodagsinställning ⇒ endast passnummer och "ca vecka X"; inget markeras som missat. |
| P8 | Anteckningar och hälsodata | Anteckningar kräver inte hälsosamtycke men visas som privata, ingår i JSON-exporten, och raderas av "Radera mina hälsorelaterade uppgifter" (migration 006 utökar `erase_health_data`). **Rättslig grund för fri text som kan innehålla hälsouppgifter kräver juridisk bedömning (RD02/RD05).** |
| P9 | Utskrift | Webbläsarens utskrift med utskrifts-CSS (ingen PDF-infrastruktur). |
| P10 | Konflikter | Anteckningar sparas villkorat mot revision; konflikter visas i befintlig Synk-vy. |

## 3d. ÄA-BAL-001 "Balans" (2026-10-12)

| # | Fråga | Beslut |
|---|---|---|
| B1 | ÄA-UTV-001 (styrkekurvor, `deriveProgressSeries`) finns inte i repot | Styrkejämförelsen återanvänder befintliga Utveckling-serien `strengthSeries` (oförändrad e1RM-logik; punkterna fick bara ett tillagt `sessionId`). Endast session-härledda e1RM-punkter används. |
| B2 | Kontrakt → befintligt schema | Utförda set: `training_sets`; pass: `training_sessions`; accepterad plan vid passtart: `training_sessions.snapshot` (oföränderlig, sparad vid start); byten: `session_exercises.replaced_by_id`/substitutionshändelser; aktiv planrevision: `plan_revisions`; spärrar: `restriction_rules`, symtom med samtycke och befintlig `activeSymptoms`. Ny tabell endast för beslut: `balance_suggestion_decisions` (migration 007). |
| B3 | Planjustering "byt kompletteringsmoment mot annat mönster" | Den godkända substitutionskatalogen (SUBST/1.2.0) saknar relationer mellan olika rörelsemönster, och planeraren tillämpar bara godkända relationer. I produktion blir resultatet därför alltid "Det går inte att föreslå en justering inom dina nuvarande ramar." Mekanismen (förhandsvisning med verklig planerare, godkännande via profilval + revision) är verifierad med en **testrelation** som bara finns i testet. Godkännande ligger bakom `VITE_FLAG_BALANCE_ADJUSTMENTS` (av). **Produktbeslut krävs** om godkända relationer mellan mönster ska införas. |
| B4 | Kandidatnyckel | Enligt §7.2 (inkl. aktiv planrevision). Godkänt förslag undertrycks för samma underlag oberoende av revision; förhandsvisning/avböjande accepterar samma underlag om bara planrevisionen bytts i bakgrunden. Godkännande kräver oförändrad revision. |
| B5 | Mönsterpolicy | Exakt enligt §4; `lunge` (pensionerad, ej i tabellen) klassas uttryckligen som `other`. |
| B6 | Beskrivande heuristiker (H) | "Täcker flera rörelsemönster" = minst 3 av 6 huvudmönster med set; "ligger nära valt upplägg" = minst 2 jämförbara pass, ≥ 8 planerade set och ≥ 90 % matchade. |
| B7 | Bortprioriterat | Målprioritet 0 för ett prioriterat lyft i mönstret tolkas som uttryckligt avstående. |
| B8 | Källor i §11 | Verifierade mot Crossref/PMC: Lauersen m.fl. BJSM 2014;48(11):871–877; Parkinson m.fl. J Sports Sci Med **2021** (anmodan: 2022), DOI 10.52082/jssm.2021.594 = PMC8488821; ACWR-artikeln har förstaförfattare **Wang C** (Shrier I sist), Sports Med 2020;50(7):1243–1254. Tillagda som märkt, versionssatt tillägg EVIDENS/2.1.0; registrets 13 källor och 8 påståenden oförändrade. |
| B9 | Prestanda | Läsvy beräknas på begäran utan cache; 500 historiska pass verifierades för planlistan (PL24). Mätning av Balans på 500 pass på riktig mobil återstår. |

## 4. Medvetet ej implementerat

- Anonym telemetri (FR40) – kräver separat godkännande; finns inte.
- Fjärrstyrd feature flag – flaggan är en byggtidsvariabel; snabb rollback = nytt bygge/redeploy (runbook).
- Symptomsida (vänster/höger) påverkar inte spärren (konservativt: båda sidor spärras).
- Individuell anpassning av tidsmodellen (förbjudet i v1.0 enligt 02 §7).
- Uppdelning av JS-paketet (757 kB, 222 kB gzip) – fungerar, men bör koddelas före pilot.

## 5. Öppna frågor till produktägaren

1. Godkänn eller ändra H-N1–H-N12 (och paketets H-värden) efter fackgranskning.
2. Är områdesmappningen per övning (katalog 1.1.0) acceptabel som planeringsetikett?
3. Retention för idempotenskvitton (förslag 120 dagar, minst 90) och fysisk radering/backup.
4. Ska "Radera mina hälsorelaterade uppgifter" även radera rena övningsblockeringar (nuvarande: ja, alla regler raderas)?
5. Godkänn H-S1–H-S8 och substitutionskatalogens relationer efter fackgranskning; bekräfta att vetenskapssidans formuleringar (inkl. medicinteknisk gräns) får publiceras.
6. Ska "Använd framöver" även gälla spontanpassens urval i fler fall än i dag (nu: endast permanenta ersättare)?


## 6. Sammanhängande UX, 18–19 oktober 2026

Den samlade UX-anmodan ersätter tidigare krav på separata Idag-/förhandsvisningsflöden, fyra huvudflikar, synliga maskinprofilsformulär och en extra navigeringshandling efter avslut. Plan är startsida, planvärden autosparas separat från registrering, och samma passöversikt används före/under träning. Motiv, migration, testresultat och begränsningar finns i [UX-redovisningen](UX_OMARBETNING_2026-10-18.md).

Vila versionshöjs separat till REST/1.1.0 för sent frivilligt ansträngningssvar. Referensmotorns numerik och kontrollsummor ändras inte. Originalrekommendation, aktuell plan och prestation bevaras som skilda uppgifter. Servermigrationerna är additiva och lokal lagring uppgraderas till Dexie v6. En eventuell klientrollback måste behålla v6-stödet så att uppgraderad lokal data fortfarande kan öppnas.

Implementationen är lokal; produktionspublicering och fysisk enhetsverifiering ingår inte i genomförda kodtester.


## 7. Adaptiv modell 2.1, 27 oktober 2026

Den godkända implementeringsplanen ersätter äldre procenttak och schabloner där de motsäger den nya gemensamma beslutsmodellen. Manuella dosval, representativ Lätt, separata försöksankare, dimensionvis omprövning, individuell återhämtningsförsiktighet och gemensam konkret framtidsåterkoppling beskrivs i [implementeringsrapporten](ADAPTATION-IMPLEMENTATION-2026-10-27.md). Sidoberoende begränsningar hanteras nu för ensidigt utförande. Inga nya obligatoriska UI-val eller persondata införs. Publicering avser befintlig staging; fysisk enhetsgranskning och separat produktionsmiljö omfattas inte av automatiserade tester.
