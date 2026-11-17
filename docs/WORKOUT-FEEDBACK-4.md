# Återkoppling efter pass, version 4

Implementerat lokalt på `feature/workout-feedback-4`, med `origin/main` på
`cea4cbe` som utgångspunkt. Separat arbetskopia: `D:\Projekt\STYRKA\workout-feedback-4`.
Rapporten beskriver implementationens lokala verifiering före release. Publiceringen följs separat i releaseunderlaget. Andra arbetskopiors lokala ändringar är bevarade.

## Ändringen

- `WORKOUT-FEEDBACK/4.0.0` och `REPLAN-FEEDBACK/3.0.0`.
- Alla övningar med genomförda arbetsset eller genomförda sidor får ett strukturerat
  underlag. Tillagda övningar och delvis genomförda set räknas med. Utrustning och
  sidor hålls åtskilda; presentationen samlar dem under övningens namn.
- Flera observerade framsteg kan visas samtidigt. Anpassad dos och symtom bedöms
  för berörd övning/sida. Dagsform påverkar summeringens ton. Jämförbarhetskraven
  för historisk prestation kvarstår, och varierade vikter visas set för set.
- En gemensam lista ersätter de överlappande prestations- och omplaneringslistorna.
  Utfällbara detaljer visar dagens arbete, tidigare jämförbart arbete och nästa
  faktiska förslag. Saknat förslag och beräkningsfel döljer inte genomförandet.
- Textbiblioteket innehåller 165 summeringar med fokus på träning och insats,
  samt 12 korta humorinslag. Ett humorinslag kan kombineras med prestationsinsikter.
  Stabilt textval, mellanrum mellan humorinslag och skydd mot upprepning behålls.
- Version och observationsberoenden uppdaterar gamla cacheobjekt utan datamigrering.
  Historikrättningar, radering och återöppning använder befintlig invalidation.
  En öppen avslutningsvy följer också ändringar i underlaget.
- Träningsmotorns dos-, progressions- och återhämtningsregler är oförändrade.

## Verifiering

Kört med Node 24.22.1 och befintliga låsta beroenden:

| Kontroll | Resultat |
| --- | --- |
| `npm run typecheck` | Godkänd; även testernas typer kontrollerade efter sista testjusteringen |
| `npm run lint` | Godkänd |
| `npm run build` | Godkänd, inklusive PWA-bygge |
| `npm run test:reference` | 26/26, referensmotorns SHA256 oförändrad |
| Berörda unit/UI-tester, 8 filer | 92/92 |
| Befintligt `workout_feedback.spec.ts` | 3/3: Android/Chromium, iPhone/WebKit, desktop |
| Visuell kontroll av samma blandpass | Android och iPhone, fyra övningar, öppnade detaljer, ljust/mörkt läge och 320 px |
| Axe och reflow | Inga överträdelser i kontrollerade vyer; ingen horisontell överströmning vid 320 px |
| Byggets befintliga kontroll av hemlighetsmönster | Godkänd |
| `git diff --check` | Godkänd |
| `npm audit --audit-level=high` | Godkänd nivågräns; 12 befintliga moderate-fynd i beroendekedjor, inga beroenden ändrade |

Testfiler: `workout_performance_insight`, `adaptation_feedback_revision`,
`reopen_workout` (unit och UI), `workout_ux`, `finish_ux`, `adaptation_feedback`,
`history_correction`. Exakt två nya samlade testfall har lagts till, med en
gemensam blandpassfixtur. Befintliga jämförbarhets-, cache- och felvägstester är
bevarade och uppdaterade för den nya presentationen. Befintliga browser- och
stagingtester väntar nu på beräkningsstatus i stället för den borttagna rubriken.

Browserkontrollerna använde syntetiska lokala data och avlyssnade backendanrop.
Inga riktiga konton eller träningsdata ändrades. Full databas-/E2E-svit och stora
simuleringar har inte körts för denna presentationsändring. Fysiska mobiler,
installerad PWA, VoiceOver/TalkBack och publicerad miljö återstår vid en release.
Bygget har fortsatt en varning om en stor JavaScript-bundle.

## Verkligt genererat exempel från blandpasset

> 2 övningar tog ett steg framåt i dag. Du anpassade dagens dos och fick träning
> gjord. Bra jobbat. Nu får även vikterna en paus.

| Övning | Huvudbesked | Utfällda detaljer |
| --- | --- | --- |
| Sittande kabelrodd | 4 fler repetitioner på samma belastning. | I dag 2 × 10 på 40 kg; tidigare 2 × 8 på 40 kg. Inget nytt förslag inom närmaste planeringen. |
| Knäböj | 2 fler repetitioner på samma belastning. | I dag 2 × 7 på 60 kg; tidigare 2 × 6 på 60 kg. Nästa förslag 2 × 7 på 60 kg, ett till jämförbart pass. |
| Bänkpress | Anpassad dos i 2 arbetsset. | I dag 2 × 6 på 40 kg. Nästa förslag samma dos, med uttrycklig förklaring att förslaget utgår från genomförandet. |
| Bicepscurl, tillagd | 2 arbetsset. En första referens finns nu. | I dag 2 × 6 på 21 kg. Nästa förslag samma dos, ett till jämförbart pass. |

Fullständigt genererat underlag: [mixed-review.json](evidence/feedback-v4/mixed-review.json).
Skärmbilder: [mobil lista](evidence/feedback-v4/mixed-android.png),
[öppnade detaljer i mörkt läge, 320 px](evidence/feedback-v4/mixed-iphone-320-dark.png).
