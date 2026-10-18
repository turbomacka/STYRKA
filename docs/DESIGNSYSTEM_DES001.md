# STYRKA – designsystem ÄA-DES-001

Implementerat 12–13 oktober 2026. Riktning: lugn kraft och mekanisk precision. Befintliga React-komponenter förfinas; inga nya UI-, diagram-, font- eller animationsberoenden.

## Auktoritativa källor

`src/ui/design.css` innehåller den nya identitetens semantiska tokens. Befintliga namn (`--bg`, `--text`, `--ok` osv.) är alias, så tidigare komponenter använder samma färger. `styles.css` behålls som strukturell bas och återställningsbar tidigare visuell identitet. Komponentspecifika färger tillkommer inte i TSX. Manifest och initial theme-color har statiska startvärden; efter start hämtas webbläsarens theme-color från bakgrundstoken.

| Token | Ljust | Mörkt |
|---|---|---|
| background | #F5F4F0 | #14191C |
| surface | #FFFFFF | #20282B |
| surface-raised | #EDEEE8 | #2B3538 |
| text-primary | #17201F | #F2F4F1 |
| text-secondary | #505D57 | #B8C4BD |
| accent / success | #24624E | #A3D6C1 |
| accent-text | #FFFFFF | #172C24 |
| border, dekorativ | #D3D9D3 | #3C4847 |
| control-border, nödvändig gräns | #78847D | #84978E |
| warning | #77500D | #E8C17F |
| danger | #A33029 | #FFB4A7 |
| danger-text | #FFFFFF | #3A1411 |

Statusytor, fokus, trycköverlägg och dialogbakgrund har också tokens. 60 automatiska kontrastfall täcker båda teman: minst 4,5:1 för definierade textkombinationer och 3:1 för kontrollgränser, fokus och nödvändig grafik. Dekorativa separatorer bär ingen statusinformation. Toastens fokus använder den inverterade ytans kontrast.

## Typografi och mått

Systemtypsnitt utan nätverksfont. Display 2,5 rem, sidrubrik 1,75 rem, sektion 1,3125 rem, brödtext 1 rem, sekundär text 0,9375 rem, mikrotext 0,8125 rem. Tabulära siffror i värden, fält, diagram och historik. Befintlig svensk viktformatterare återanvänds. Enheter visas separat under setvärden; tal bryts inte mitt i en siffra.

Avstånd 4/8/12/16/24/32/48 px. Radier 11/16/20 px. Primära kontroller har 50 px som grund, vilket håller dem över 48 px även vid tryckskalan 0,985. Setkort får en containerstyrd tvåkolumnslayout med en egen knapprad när textstorleken kräver det. Allmän text kan radbrytas, numeriska värden hålls samman. Ingen zoom spärras.

## Komponentkarta och rörelse

| Ansvar | Befintlig implementation / förfining |
|---|---|
| Primär, sekundär, ikonknapp | `.btn`, `.primary`, `.ghost`, `.icon`; gemensam pressadapter |
| Setknapp och numeriska fält | `SetRow`, `EditableKg`, `EditableReps` |
| Stegkontroll, segment | `Stepper`, `Segmented`; radiogrupp med piltangenter/Home/End |
| Övningsrubrik och setkort | `Train`, `.train-head`, `.set-list` |
| Planerade/genomförda kort | `SlotRow`, `DoneRow` + `Expandable` |
| Status och bekräftelse | `SaveStateChip`, `Banner`, `ToastWithUndo` |
| Diagram och informationsruta | `ProgressChart`, befintlig SVG + punktknappar/select/tabell |
| Bottennavigation | Befintliga `.tabs`; markerad aktuell sida |
| Dialog | `Sheet`; fokusfälla, inert bakgrund, Escape och fokusåterställning |
| Tema och haptik | `design.ts`, `Appearance`; endast enhetens lokala inställningar |

| Token | Tid / kurva |
|---|---|
| motion-press | 80 ms |
| motion-release | 120 ms |
| motion-feedback | 160 ms |
| motion-panel | 200 ms |
| motion-navigation | 160 ms |
| easing-standard | cubic-bezier(.2, 0, .2, 1) |
| easing-emphasized | cubic-bezier(.2, .7, .2, 1) |

Pressad yta börjar vid pointerdown och återställs vid pointerup, avbrott, rörelse utanför kontrollen, tangentuppsläpp eller förlorad fönsterfokus. Handlingen ligger kvar på native click. Ingen sparning sker vid pointerdown. Sparlåset är synkront och bekräftelsen startar först efter att lokal loggning lyckats. Ingen väntan på animation eller fjärrsynk läggs till. Haptik är en efterföljande, ignorerbar bieffekt. Misslyckad lagring lämnar värdena kvar för nytt försök.

Numeriska fält ändras omedelbart med en kort opacitetsmarkering. Diagrammens linjer ritas utan introduktionsanimation; punktval ändrar endast markering och information. Form, linjetyp och text skiljer faktisk prestation, uppskattning och mätning. Täta/överlappande punkter kan väljas individuellt i listkontrollen, även med tangentbord. Datatabellen finns kvar. Skala, geometri och underliggande beräkningar är oförändrade.

Panelens enda layoutövergång är CSS-grid 0fr/1fr under 200 ms. Den behövs för att flytta efterföljande innehåll när samma kort öppnas. Ingen mätloop eller kontinuerlig höjdanimation används. Besökta paneler behåller DOM och utkast, medan stängda paneler är inert och dolda för hjälpmedel. Dialoger tonas in med 6 px förflyttning och stängs omedelbart. Bekräftelser stannar en bestämd tid; bakgrundsomrendering förlänger inte tiden.

`prefers-reduced-motion` stänger av övergångar och animationer; tryckfärg, text, bock och status kvarstår. Värdefältens Web Animations-anrop kontrollerar samma inställning. Ingen kontinuerlig animation, ljud, glasoskärpa eller will-change tillkommer.

## Haptikmatris

| Miljö | Strategi | Verifiering / begränsning |
|---|---|---|
| iPhone Safari / installerad iOS PWA | Full funktion utan programmerbar haptik. Ingen dold switch eller annat trick. | API-saknas-fallet testat; ingen fysisk iPhone tillgänglig. |
| Android-webbläsare med Vibration API | Frivillig 8 ms begäran efter lokalt sparat set; av som standard. | Stöd testas vid körning. False/exception påverkar inte handlingen. Ingen garanti att vibration känns. |
| Desktop / övriga | Samma stödkontroll. Inställningen visas bara om API-funktionen finns. | API-existens är inte bevis för vibrationsmotor. |
| Navigering, redigering, diagram, bakgrundssynk, fel | Ingen appstyrd vibration. | Central adapter har endast ett produktanrop: efter lyckat nytt set. |

Inga ljud tillförs. Tema (enheten/ljust/mörkt) och haptik sparas lokalt på enheten, utan databasändring, kontoegenskap, insamling eller ny behörighet.

## Aktivering och återställning

`VITE_FLAG_DESIGN_V2=false` vid byggning återställer tidigare färger och komponentstilar, stänger av nya temainställningar/haptik och döljer de nya diagramkontrollerna. Standard är aktiverad. Bygg om och publicera paketet för att byta; flaggan är inte en dold runtime-inställning i appen. Befintlig komponentlogik, fokus- och sparskydd finns kvar även i reservläget. Ingen datamigrering krävs. Full återgång till föregående publicerade paket är också möjlig eftersom träningsdata och lagringskontrakt inte ändrats.

## Underlag

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) för kontrast, tangentbord, fokus och textförstoring.
- [MDN: reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) och [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) för plattformsanpassning.
- [Apple: Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) och [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) är produktvägledning; valda millisekunder är egna heuristiker.
- [web.dev: INP](https://web.dev/articles/optimize-inp/) och [CLS](https://web.dev/articles/optimize-cls/) skiljs från lokala diagnostiska mätningar i leveransrapporten.

Färgval och rörelsetider påstås inte bevisa ökad träningsfrekvens eller vetenskapligt validerad upplevd kvalitet.
