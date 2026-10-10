# 10 · UI tokens, komponenter och mikrokopior

## 1. Designkontrakt
STYRKA ska kännas modern, lugn, saklig och Appleinspirerad, men inte imitera skyddade Appleelement. Visuella färger får finjusteras så länge kontrast och tillgänglighet verifieras. Endast en primär handling per skärm. Inga dubbla modaler för normalt setflöde.

**Tokenförslag**: spacing 4/8/12/16/24/32 px; komponentrad 48–56 px; runda kort 12–16 px; primär text 17 px; detaljer 14 px; stor numerik 28–32 px; klickbara ytor 48×48 px; statusfärger kombineras ALLTID med text och ikon, aldrig färg ensam. Fullt mörkt läge med samma informationshierarki. Följ operativsystemets inställning för reducerad rörelse och tillgänglig textstorlek.

### Komponenter
`AppShell`, `BottomTabs`, `HeroNextWorkout`, `WorkoutPreview`, `LiftCard`, `SetRow`, `EditableKg`, `EditableReps`, `WeightStepControl`, `LoadConfidence`, `ExerciseSwapSheet`, `RestTimer`, `SaveStateChip`, `ProgressChart`, `ReasonPopover`, `RestrictionPicker`, `ConsentPanel`, `ConflictResolver`, `EmptyState`, `ToastWithUndo`, `OfflineBanner`.

### S08 setrad (primär kritisk komponent)
Visuell ordning: `Set 2` | `80,0 kg` | `5 reps` | stor `Klart` knapp. Reps och vikt är individuellt tryckbara och öppnar numeriskt tangentbord. Om set slutförts blir `Klart` till en diskret bock och raden kan öppnas för `Ändra` eller `Ångra`. Efter lyckad lokalsparning visas success utan att flytta layouten. Om lokaal DB misslyckats är setet tydligt osparat och användaren kan behålla uppgifterna på skärmen.

### Vikt- och repsinmatning
Keyboard: `inputMode=decimal` för vikt, `numeric` för reps. Om decimaltecken saknas på telefonens tangentbord ge liten synlig komma-knapp. Acceptera `102,5` och `102.5`. Invalid `102,,5` ger inline fel utan att stänga keyboard. Visad vikt kan avrundas till utrustningssteg, lagring är exakt `numeric` i Postgres.

## 2. Svenska UI texter
| Kod | Text |
|---|---|
| CTA_START | Starta dagens pass |
| CTA_EXTRA | Spontanpass |
| CTA_LOG | Klart |
| CTA_EDIT | Ändra set |
| CTA_UNDO | Ångra |
| TITLE_NEXT | Föreslaget pass |
| TITLE_PR | Utveckling |
| INFO_PREVIOUS | Senast |
| INFO_RECOMMEND | Rekommenderat |
| INFO_1RM | Uppskattad maxstyrka |
| WARN_CAL | Vi behöver först hitta en lämplig arbetsvikt. Välj en hanterbar vikt och testa lugnt. |
| WARN_TIME | Det föreslagna passet ryms inte inom vald tid. Vi har kortat kompletteringen. |
| WARN_REVIEW | Du har rapporterat besvär som påverkar funktionen. Vi pausar automatisk belastningsökning för berörda övningar. Vid kvarstående eller återkommande besvär bör du kontakta vården. |
| WARN_OFFLINE | Du tränar offline. Passets uppgifter sparas lokalt och synkroniseras när anslutningen fungerar. |
| WARN_UNSAVED | Setet kunde inte sparas på enheten. Försök igen. |
| WARN_CONFLICT | Det här setet har ändrats på en annan enhet. Välj vilken version du vill behålla. |
| INFO_REASONS | Varför det här förslaget? |
| INFO_ESTIMATE | Det här är en uppskattning som förbättras med dina träningsresultat. |
| CTA_EXPORT | Exportera mina uppgifter |
| CTA_DELETE_HEALTH | Radera mina hälsorelaterade uppgifter |
| CTA_DELETE_ACCOUNT | Radera konto och träningshistorik |

## 3. Begrepp och språknorm
Undvik tekniskt språk som e1RM, RIR och optimizer på startsidan. Förklara `maxstyrka`, `repetitioner kvar` och `arbetsset` bakom info-knapp. Avstå gamification och ovidkommande skärmar. Varje informationsruta ska besvara en användarfråga: `Vad gör jag?`, `Hur mycket?`, `Varför?`, `Vad hände senast?`.

## 4. User testing
Den centrala kontrollen är en människa mellan två arbetsset, med lite svettiga fingrar, bråttom och begränsad uppmärksamhet. Genomför observerade uppgifter på små mobiler, kör VoiceOver/TalkBack, och registrera antal tryck, feltryck och tid att ångra felset. Låt inte designens visuella renhet motivera dolda funktioner.
