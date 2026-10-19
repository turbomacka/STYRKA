# STYRKA – sammanhängande träningsflöde

## Diagnos

Granskad baslinje: `e22fd1f`. Centrala vyer och komponenter har lästs tillsammans med tränings-, synk- och historiktjänsterna, releasegrindarna och befintliga tester. Referensbilder finns i `evidence/onboarding/` och `evidence/training-flow/` från den föregående leveransen.

| Problem | Orsak | Beslut |
| --- | --- | --- |
| Viktredigering kan registrera ett set | Samma Klart-knapp används i editorn och vid genomförande | Automatisk lagring av planvärden, separat Registrera set. Redigering av utfört set ändrar samma prestation. |
| Plan och träning känns som olika objekt | Förhandsvisningen finns endast i komponentens minne | Spara ett verkligt passutkast med samma set-ID före start. Samma översikt används även under passet. |
| Ändrat antal set ger fel slutförandestatus | Avslut jämför med ursprungligt snapshot | Räkna mot den aktuella uppsättningen set; originalets rekommendation bevaras separat. |
| Utrustning kräver för många beslut | Mekaniska metadata visas som ett formulär i varje övning | Ta bort maskinformuläret. Behåll enhet och historiska snapshots, samt ett litet val för ensidigt utförande. |
| Byte är svårt att upptäcka | Kontrollen ligger efter setlistan och väljarens rader har långa förklaringar | Byt övning och Hela passet nära övningsnamnet. Sökbar lista, bara relevanta och tillåtna alternativ. |
| Vilotimern missar setkänslan | Vila beräknas innan det frivilliga svaret kommer | Omberäkna aktiv vila när svaret ändras, behåll starttid och manuellt tillägg. Versionera vilopolicyn separat. |
| Avslut kräver extra navigation | Generisk bekräftelse och Till Idag efter sparandet | Spara först; kort regelstyrd återkoppling och verklig beräkningsstatus; återgå automatiskt till Plan. |
| Planering har dubbla ingångar | Idag återger samma nästa pass som Plan | Plan blir startsida. Tre huvudflikar: Plan, Utveckling, Profil. Spontanpass nås från Plan. |

## Design

Plan visar nästa/pågående pass först. Öppna passet visar en redigerbar översikt med övningar och set, Starta träningen längst ned. Under träning fokuserar användaren på en övning, direkt redigerbara siffror, Registrera set och därefter stor vila. Hela passet öppnar samma översikt utan att tappa övning eller timer. Fördjupningar och regelmotorns förklaringar lämnar vardagsflödet; säkerhetsvarningar behålls.

Bekräftelse avser lyckad lokal transaktion. Synkstatus hålls separat. Ogiltig inmatning behålls i editorn med felmeddelande; ingen falsk sparindikering. Ingen tangentbordsförändring eller animation får registrera en prestation.

Ändringar gäller dagens pass. Genomförda set ligger kvar med ursprunglig övningsidentitet vid byte eller borttagning. Flytta upp/ned används framför precisionskrävande dragning; tangentbord och skärmläsare får samma funktion.

## Teknisk plan

- Återanvänd `preview` som sessionsstatus. Spara alla planerade set i befintlig idempotent setkö, även före start. `target*` är aktuell plan, `actual*`/sidprestationer är utfall, rekommendationssnapshot är oförändrat original.
- Separat applikationskommando för planvärden, med validering och transaktion. Återanvänd befintlig revisionskonflikt för set; inga samtidiga skrivningar får tyst skriva över en annan enhets set.
- Additiv tabell för ordningshändelser, append-only och kontoavskild, för att behålla både ursprunglig ordning och användarens ändringar. Ingen historisk data skrivs om. Borttagning av återstående set använder befintliga tombstones.
- Återanvänd substitutionsmotorns utrustnings-, symptom-, återhämtnings- och parregler. Manuellt tillägg använder samma säkerhetsgrindar och en konservativ föreskrift.
- Fristående, versionsmärkt återkopplingsbibliotek. Slump väljs utanför domänlagret; inga ogrundade rekordpåståenden och inga prestationsbudskap vid noll genomförda set.
- Passlagring och beräkning av nästa plan är separata steg: beräkningsfel får aldrig presenteras som att sparandet misslyckats.

## Ersatta äldre UX-krav

Fyra huvudflikar, en temporär separat förhandsvisning, maskinprofilsformulär i aktiv träning, synliga motiveringar vid varje byte och avslut med Till Idag ersätts av denna anmodan. Äldre E2E-selektorer och flödesförväntningar ska uppdateras; träningsmotor-, behörighets- och dataintegritetstester behålls.

## Verifieringsplan

Scenarier A–J testas med enhets-/integrationstester och mobil-E2E. Särskilt: planändring utan prestation, dubbeltryck, undo, delvis ensidigt byte, borttagning/ordning, offline/omladdning, återkoppling efter timerstart, synkkonflikter, RLS och avslut där nästa plan misslyckas. Referensmotorns hash och numeriska regression kontrolleras. Automatisk mobil- och tillgänglighetsprovning är inte fysisk iPhone/PWA- eller VoiceOver-provning.

Ingen ny produktionspublicering ingår. G5 och behov av verkliga enhetstester kvarstår enligt releasegrindarna.

## Referenser

- [Apple – Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback): vägledning för tydlig återkoppling; implementationen anpassas till en webbapp.
- [Supabase – Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): ägarkontroll och explicita rättigheter för nya tabeller.

## Levererad implementation (18–19 oktober 2026)

### Sammanhängande pass

- Plan är startsida med tre huvudflikar. Nästa/pågående pass, spontanpass och synkstatus är samlade där. Kortet visar den användaranpassade övningslistan när ett utkast finns.
- En gemensam passöversikt används före start och under träningen. Vikt och repetitioner sparas automatiskt efter 300 ms utan nya tangenttryckningar, direkt vid avslutad redigering eller när fokus lämnar editorn. Sparbesked visas först efter lokal transaktion.
- Registrera är en separat handling. Planredigering kan inte registrera ett set. Utförda set korrigeras med samma prestations-ID; ångra återställer setet. Även historiska oberoende viktstaplar använder samma editor.
- Översikten stöder tillägg/borttagning av set, tillägg/borttagning av återstående övningar och flytt upp/ned. Borttagning kan ångras. Originalrekommendationen ligger kvar som snapshot.
- Hela passet och Byt övning ligger direkt under övningsnamnet. Tillbaka/Fortsätt träna återgår till den övning användaren lämnade. URL:en bevarar aktuell övning vid omladdning och följer ersättaren efter övningsbyte. Passräknaren inkluderar redan genomförda set från den ersatta övningen.
- Sökbar substitutionslista använder den befintliga regelmotorns tillåtna alternativ. Byte ersätter endast återstående arbete; utförda set/sidor behåller sin identitet och kan läsas i översikten. Standard är bara dagens pass.
- Förberedda pass kontrolleras mot aktuella blockeringar och uttryckliga set-/nivågränser igen före start.

### Förenklingar

Separata Idag-fliken, tillfällig förhandsvisning, maskinprofilsformulär, maskinbyte som egen avancerad dialog, mekaniska parametrar och motiveringar i det aktiva träningsflödet har tagits bort/konsoliderats. Tidigare maskinmetadata har **inte** raderats. Belastningens enhet och per-hantel-definition visas fortfarande där de behövs.

Uppvärmning och utförande ligger i en fördjupning. Senaste setets frivilliga känsla visas utan att varje tidigare set ställer samma fråga igen. Befintliga fem svar och deras innebörd bevaras. Planhorisont och tidigare planversioner finns i en fördjupning; normalvyn visar 12 pass.

### Vila och avslut

Vilotimern visar stora stabila siffror, ±30 sekunder, Börja nästa set och Dölj timer. Klockan utgår från sparad starttid. Ett sent svar på setkänslan uppdaterar pågående rekommendation utan att starta om vilan eller skriva över manuell justering. Timer för borttaget nästa set eller utbytt övning avslutas utan att påstå en uppmätt faktisk vila.

`REST/1.1.0` lägger till samma försiktiga +30 sekunder för Tungt, Maxansträngning och För tungt som befintlig hög ansträngning. Närliggande faktorer kombineras med maxvärdet, inte genom blind summering. Grundvärden 180/120/90/60 sekunder och befintliga gränser 30–300 sekunder kvarstår. Explicit standardvila har företräde. Ingen RIR uppfinns från en känsla. Referensmotorn är oförändrad.

Avslut sparar träningen före nästa-plan-beräkningen. En verklig beräkningsstatus visas utan konstgjord väntetid, därefter öppnas Plan automatiskt med återkopplingen kvar. Besvärsrapportering, avbrott och spontanpassets eventuella ordinarie tillgodoräknande bevaras. Om nästa plan misslyckas visas tydligt att träningen redan är sparad; återförsöket registrerar inte passet igen.

Återkopplingsbiblioteket har åtta kategorier med tre svenska formuleringar per kategori, samt ett neutralt tompassmeddelande. De senaste tolv formuleringarna undviks när möjligt. Valet sparas per pass lokalt. Framsteg jämför mot senaste jämförbara passets prestationer med samma sida, utrustningsnyckel, kontrollerad teknik och känd lika ansträngningsankring. Det används inte för att påstå personliga rekord. Återkomst definieras som minst 21 dagar; detta är en produktheuristik. Återkopplingen är exporterbar och tas bort när passet raderas.

## Arkitektur och ändrade filer

| Del | Viktigaste filer |
| --- | --- |
| Träningskommandon, separation plan/utfall, seträkning | `src/application/training.ts`, nya `src/application/workout.ts` |
| Återkoppling och viloregler | nya `src/domain/workoutFeedback.ts`, `src/application/workoutFeedback.ts`, `src/domain/restPolicy.ts`, `src/domain/trainingFlow.ts` |
| Lagring/synk/export/radering | `src/storage/db.ts`, `src/server/{mapping,supabaseTransport,transport}.ts`, `src/application/{sync,privacy,deleteWorkout}.ts` |
| Gemensamma kontroller | `SetRow.tsx`, `TrainingFlow.tsx`, `SubstitutionSheet.tsx`, nya `WorkoutOverview.tsx` |
| Vyer och navigation | `App.tsx`, `Train.tsx`, `Preview.tsx`, `Today.tsx`, `Plan.tsx`, `Finish.tsx`, `Profile.tsx`, `design.css` |
| Nya tester | `tests/unit/workout_ux.test.ts`, `tests/db/workout_ux_db.test.ts`, `tests/ui/finish_ux.test.tsx`, `e2e/workout_ux.spec.ts` |
| Uppdaterade kontrakt | Befintliga komponent-/synktester och E2E-flöden har uppdaterats för automatisk lagring, tre flikar och automatiskt avslut. |

### Datamigrering

1. `20261018150155_workout_order_events.sql`: ny append-only-tabell för ordning, RLS, ägarskap och kontroll att båda övningarna tillhör samma pass. UPDATE/DELETE är inte tillåtet för klienten; borttagning av pass/konto kaskaderar.
2. `20261018200423_planned_side_validation.sql`: validering av frivilliga sidmål i befintlig set-JSON. Inga historiska rader skrivs om.
3. IndexedDB/Dexie v5 → v6 lägger till en tabell. Migrationstest visar att befintligt pass och registrerad prestation behålls exakt, utan duplicering.

Båda servermigrationerna är applicerade och verifierade **endast i lokal Supabase**. Alla planerade rader köas nu med samma idempotenta setmekanism som registrerade prestationer. Pågående utkast kommer med i JSON-exporten. Borttagna planrader använder tombstones, eftersom de kan ha hunnit synkas. Exakt identiska serversvar hanteras som kvitterade dubletter; verkligt avvikande revisioner förblir synkkonflikter.

Ordning sparas som deterministiskt sorterade, oföränderliga händelser. Nyare manuella flyttar ges stigande lokala tidsstämplar. Ursprunglig rekommenderad ordning ändras inte. Metadata för enheter och prestationssidor bevaras.

## Verifiering

| Scenario | Kontrollerat beteende |
| --- | --- |
| A | Redigerade mål sparas lokalt och synkas; status är fortsatt planerad och actual/tidpunkt är tomma. |
| B | En registreringshandling; snabba dubbla anrop ger en prestation med stabilt ID. |
| C | Sent ansträngningssvar ändrar aktiv vila med bibehållen starttid/manuell justering. |
| D | Sökbart byte före/under pass; genomförda prestationers identitet bevaras. |
| E | Tillägg, flytt, borttagning och ångra; slutförandestatus räknas mot aktuell plan. |
| F | Oberoende mål/resultat per sida, automatisk sidväxling och gemensam seträkning. |
| G | Timestamp-baserad återställning, omladdning och offlinekö i Chromium. |
| H | Lokalt sparat avslut, automatisk Plan-navigation; separat test med misslyckad nästa-plan-beräkning och återförsök. |
| I | Korrigering bevarar ID, ångra återställer, misslyckad autosparning behåller editorn och kan försökas igen. |
| J | Normalt pass utan maskininställningar, algoritmmotiveringar eller obligatoriska känslosvar. |

- `npm test`: **465/465**, 47 testfiler (enheter, komponenter och verklig lokal Postgres/RLS).
- `npm run test:reference`: oförändrade SHA-256 för båda referensmotorfilerna, **26/26** rökprov.
- `npm run typecheck`, `npm run lint` och produktionsbygge: **godkända**. Inga nya paketberoenden.

### Webbläsarprovning 19 oktober

| Miljö | Godkända unika fall | Omfattning |
| --- | ---: | --- |
| Chromium, Android-format | 43 | Hela ordinarie E2E-sviten, inklusive konto, intro, plan, träning, byte, offline, export/radering, balans och utveckling. |
| WebKit, iPhone-format | 8 | Tillgänglighet, reflow, båda teman, byte, uppvärmning/sidor och nya sammanhängande passflödet. Omladdning online. |
| Chromium, desktop/tangentbord | 9 | Samma fokuserade verifiering, inklusive tangentbord och omladdning offline. |

Detta är **60 unika godkända fall över flera körningar**, inte en enda obruten testkörning. Den breda Android-körningen gav först 41 godkända och två fel. Ett verkligt navigeringsfel efter övningsbyte rättades: aktuell övning följer nu ersättarens ID. Det andra felet var att testet läste rubriken innan navigeringen hunnit uppdateras; testet inväntar nu rätt övning. Båda fallen passerade därefter på samtliga tre plattformar.

Den fokuserade körningen av 27 plattformsfall gav 25 godkända, ett avsiktligt hoppat och ett fel vid kontoskapande. Det felet kom från lokal PostgREST: `PGRST303`, `JWT issued at future`. Det är ett tidsproblem i den lokala autentiseringsmiljön, inte ett misslyckat träningsscenario. Inloggningsreglerna har inte försvagats. Det berörda tillgänglighetstestet passerade sedan **två gånger i följd** utan kodändring. Enstaka tidsfel i lokal Supabase behöver fortsatt skiljas från regressionsfel; råa autentiseringstraces ska aldrig publiceras.

Avsiktliga undantag: två särskilda bildgenereringstester och ett äldre design-rollbacktest kräver egna miljöflaggor och ingår inte i normal Android-körning. WebKits test för Tab-fokus hoppas över enligt befintlig plattformsbegränsning; tangentbordskontrollen passerar i Chromium. Inga av dessa räknas som godkända.

Sista kontrollen av `workout_ux.spec.ts` med förnyade bilder och kontroll av träningsrubrikens position gav **3/3 godkända**: Android-format, iPhone-format och desktop.

Körkommandon:

```text
npm test
npm run test:reference
npm run typecheck
npm run lint
npx playwright test --project=android-chrome
npx playwright test e2e/substitution.spec.ts e2e/workout_ux.spec.ts e2e/training_flow.spec.ts e2e/design.spec.ts e2e/a11y.spec.ts --project=android-chrome --project=iphone-webkit --project=desktop-keyboard
npx playwright test e2e/a11y.spec.ts --project=android-chrome --grep "axe" --repeat-each=2
```

### Interaktionskostnad

Öppna och starta dagens pass: två tryck. Registrera föreslagna värden: ett tryck. Ändra vikt/reps: tryck på värdet och skriv; ingen sparknapp krävs. Byt känd övning: Byt övning, välj alternativ, bekräfta; första användningen kan behöva ett frivilligt bekantskapssvar. Hela passöversikten: ett tryck. Från aktiv träning till sparat pass och uppdaterad plan: Avsluta, Avsluta och spara; inga ytterligare grundflödesbekräftelser.

## Visuell evidens och begränsningar

Efterbilder finns i `evidence/ux-2026-10-18/`, inklusive Plan, passöversikt, aktiv träning, vilotimer, avslutsåterkoppling och regressionsbilder i båda teman. Förebilderna i äldre evidensmappar bevaras. De är tidigare referensbilder, inte en kontrollerad pixeljämförelse med identiska träningsdata.

- [Plan, ljust](evidence/ux-2026-10-18/android-chrome/plan-light.png)
- [Passöversikt, ljust](evidence/ux-2026-10-18/android-chrome/overview-light.png)
- [Aktiv träning och vila, mobilens synliga yta](evidence/ux-2026-10-18/iphone-webkit/training-viewport-light.png)
- [Passöversikt, mörkt](evidence/ux-2026-10-18/iphone-webkit/overview-dark.png)
- [Sparat pass och nästa plan, mörkt](evidence/ux-2026-10-18/iphone-webkit/finish-plan-dark.png)
- [Ensidigt set och vila](evidence/ux-2026-10-18/training-flow/iphone-webkit/unilateral-rest-light.png)

Helhetsbilder av långa sidor kan placera fasta fält mitt i bilden vid webbläsarens helsidesfångst. Bilden av mobilens synliga yta används därför även för granskning av den faktiska träningsvyn.

Kontrollerna omfattar axe, tangentbord, minst 48 px primära träffytor, 320 px bredd, 200 procent text och reducerad rörelse. Automatiska kontroller och granskade bilder ersätter inte VoiceOver eller användbarhetstest med riktiga personer.

Windows WebKit med iPhone-format är emulering. Service worker-offline fungerar inte i denna testmiljö; där kontrolleras återställning efter online-omladdning. Faktisk Safari/iPhone-PWA, låst skärm, fysisk Android, systemtextstorlek, haptisk känsla och upprepad användning på gym återstår. Ingen generell iPhone-vibration införs; befintlig frivillig haptikadapter behålls. Appen är tyst.

Inget fält-INP vid 75:e percentilen har mätts. Bygget varnar fortfarande för ett stort JavaScript-paket: huvudfilen är 1 070 979 byte minifierad före komprimering i det verifierade bygget. Ingen ny animation läggs på sparandets kritiska väg och inget animationsbibliotek har tillförts. Kvantitativa prestandapåståenden på riktiga mobiler görs inte.

## Införande och återställning

Koden är lokalt implementerad och testad. Ingen push, fjärrmigration eller offentlig produktionspublicering har gjorts inom denna ändring.

Bedömning: implementationen är redo för kontrollerad staging-verifiering efter migrationskontroll. Fullständigt produktionsgodkännande kan inte ges utifrån emulering; verkliga telefoner, hjälpmedel och kvarstående releasegrindar behöver verifieras.

Vid godkänt införande ska servermigrationerna appliceras före den nya klienten. Uppdateringen behöver kontrolleras mot staging och därefter på riktiga enheter enligt befintliga releasegrindar. En återställning måste **behålla Dexie v6-schemat och transportstödet**; publicera inte en gammal v5-klient direkt över en redan uppgraderad lokal databas. Serverändringarna är additiva och behöver inte rullas tillbaka eller radera data.

Befintliga juridiska/vetenskapliga produktgrindar är inte avgjorda genom dessa kodtester. De aktuella UX-ändringarna tillför ingen ny behörighet eller extern datainsamling.
