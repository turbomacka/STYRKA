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
