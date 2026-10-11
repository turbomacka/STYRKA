# Avvikelser, tolkningar och alla H-värden

Alla tolkningar följer normhierarkin i paketets README. Inga evidensklassade eller användardefinierade regler har ändrats. Nya produktheuristiker är märkta **H (ny)** och har acceptanstest.

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

Ändringen är additiv: referensmotorn, befintliga program, setloggning, progressionsregler, konton, offlinehantering och historik är oförändrade. Ny regelversion `STYRKA-RULES/1.1.0`, katalog `2.0.0`, substitutionskatalog `SUBST/1.0.0`, evidensregister `EVIDENS/1.0.0`, metodversion `STYRKA-METOD/1.1.0`.

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
| H-S1 | Relationsklasser (nära variant / samma rörelsefamilj / kompletterande) och styrkespecificitet per par enligt `replacement_seed.json`. |
| H-S2 | Ordning för förslag: relation, specificitet, egna data i målövningen, favorit, katalogordning; högst 3 tillåtna först, resten under "Visa fler" (ej tillåtna med skäl). |
| H-S3 | Första exponering från hjälpskattning: högst 0,60 av preliminär e1RM (även om nivåns startandel är högre), avrundat nedåt till viktsteget, aldrig över användarens maxtak, aldrig vid aktiv symtomflagga. |
| H-S4 | Populationskvoter 0,80 och 0,83 används endast som lågkonfidensförslag och uppgraderas aldrig av sig själva. |
| H-S5 | Inom ett kalibreringspass förifylls kvarvarande set med senast utförda vikt; "för tungt" ⇒ ett viktsteg lättare (assistans: ett steg mer); ingen automatisk höjning inom passet. I kalibreringsläget (H-N1) ger "för tungt" även nästa pass ett steg lättare förslag. |
| H-S6 | Nivån `calibrated` efter minst två avslutade pass med utförda arbetsset i målövningen (samma maskinprofil), kontrollerad teknik, inget "för tungt" och inga rapporterade besvär i övningens områden. |
| H-S7 | Ensidig ny övning: tidsfaktor 2 för arbetsset (båda sidor). |
| H-S8 | Ny maskinprofil för maskin-/kabelövning: separat historik och kalibrering; inga kg förs över. |

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
