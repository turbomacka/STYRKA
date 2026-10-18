# Designinventering ÄA-DES-001

Inventerat 2026-10-12 före designändringar. Baslinje: publicerad funktionalitet från version `51d6b72c-e126-415f-a7f3-128582e36caf`, inklusive separata styrkeuppgifter. Tidigare ocommittat arbete bevaras.

## Befintligt system

- React/TypeScript, egen CSS och inline-SVG. Inget externt komponent-, diagram- eller animationsbibliotek används. Systemtypsnitt, semantiska färgvariabler, 4/8/12/16/24/32 px, 48 px knappar och automatisk mörk färgpalett finns redan.
- `common.tsx`: Banner, EmptyState, SaveStateChip, Stepper, Segmented, Sheet, ToastWithUndo, ConfirmTwice, PageHeader och ikonuppsättning.
- `SetRow.tsx`: setregistrering, status, EditableKg och EditableReps. `widgets.tsx`: övningskort, vilotimer, befintliga konflikt-/begränsningsvyer.
- Planens SlotRow/DoneRow, ProgressChart, BalanceSection, SubstitutionSheet samt de nya komponenterna för överhopp och styrkeuppgifter använder samma grundklasser. Dessa förfinas i stället för att ersättas.
- Sidlayouten är centrerad med maxbredd 640 px även på desktop. Mobil har fast bottennavigation, träningsvyn sticky rubrik och formulär fast åtgärdsrad. Ljust tema är kallgrått/blått; mörkt tema svart/blått.

## Iakttagelser och åtgärder

1. `.btn`, `.val`, `.done-mark`, `.segmented`, `.plan-row-head` och `.balance-head` har olika tillstånd och saknar gemensam tryckrespons. Konsolidera med delade tokens och visuell pekarrespons utan affärslogik i pointerdown.
2. Endast introduktionens förloppsindikator har en CSS-övergång (width 300 ms). Reducerad rörelse finns globalt. Inför korta, namngivna tider för tryck, återgång, bekräftelse och paneler; inga kontinuerliga animationer.
3. Set sparas redan lokalt före toast och vilotimer. Synchronous UI-lås behövs dessutom runt asynkron knappaktivering. Separera fortsatt lokal bekräftelse från fjärrsynk. Ingen fördröjning av nästa tryck.
4. Siffror använder tabulära tecken på flera ställen, men fasta pixelstorlekar, varierande knappbredd och setgrid blir trånga vid stor text. Använd rem-baserad typografi, stabila kolumner och smal-layoutfall.
5. Border-token är för svag för vissa nödvändiga kontrollgränser. Separera dekorativa kantlinjer från kontrollgräns, och kontrasttesta båda teman. Hårdkodad dialogbakgrund, knapptext och skuggfärger flyttas till tokens.
6. Sheet återfokuseras när onClose byter identitet och saknar komplett fokusfälla. Förfina fokus, bakgrundens inaktivitet och återställning. Kontroller ska inte döljas bakom fasta paneler.
7. ProgressChart har sanningsenlig skala, separata linjer/former och datatabell, men små SVG-etiketter och inget punktval. Lägg till pek-/tangentbordsval och stabil informationsruta utan att ändra data eller skala.
8. Passkort monterar innehåll vid öppning och tar bort det vid stängning. Inför gemensam kort övergång som behåller redan öppnat innehåll och anteckningsutkast, med omedelbar reducerad rörelse.
9. Ingen appstyrd haptik, inget ljud och inget temaval finns. Enhetens tema förblir standard. Frivillig lokal haptik kan erbjudas endast där API finns, efter lyckad setregistrering.

## Baslinje och avgränsning

Före-bilder och lokala prestandadiagnoser tas med `e2e/design_capture.spec.ts`, för Android Chromium, iPhone WebKit och desktop, i ljust/mörkt tema. Bilder av inloggning, vetenskap, Idag, Träna, övningsbyte, sparat set, Plan, Utveckling och Profil ligger under `docs/evidence/design-001/before/`.

Automatisk mobil emulering är inte fysisk enhetsgranskning. Den här miljön ger inte tillgång till fysiska iPhone/Android-enheter eller 5–8 testpersoner. Riktig Safari/PWA, haptikkänsla och fält-INP markeras därför uttryckligen som kvarstående i slutrapporten.

Ingen databasändring och inga ändringar av rekommendationsmotor, historik, substitutionsregler eller träningsmodell ska göras. Ny visuell identitet kan stängas av med en byggflagga utan datamigrering.
