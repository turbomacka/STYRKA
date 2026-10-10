# 01 · Produktkontrakt och användarupplevelse

## 1. Syfte och omfattning
**Produkt:** STYRKA, svensk mobilförst webbapp för vuxna som vill utveckla styrka i framför allt knäböj, bänkpress och marklyft. Målfunktion: praktiskt hållbar progression under användarens egna tids- och belastningsbegränsningar. Inga löften om optimala vikter eller medicinsk behandling.

**V1:** e-postbaserad inloggning, individuellt upplägg för 1–7 planerade pass/vecka, 15–120 minuter/pass, import av uppskattat 1RM eller 3RM eller kalibrering, frivilliga problemområden/övningsregler, träningsförslag, setloggning, spontana pass, historik, förklarade rekommendationer, offlinekö, synk, export och kontoradering.

**Inte V1:** fysioterapi, diagnoser, automatisk skadeprognos, videobaserad teknikgranskning, Garmin/Apple Health koppling, kommersiella coachfunktioner, sociala flöden, kostråd, adaptiv ML modell, automatiska personliga medicinska råd, native app. Ingen könsuppgift behövs. Användaren måste bekräfta att hen är vuxen (`adult_confirmed`) för att komma vidare, men exakt ålder är frivillig metadata; **ålder påverkar inte matematiska viktrekommendationer i V1**. Det samma gäller biologiskt kön.

**Minsta godkända verkliga användning:** två separata konton kan genomföra 36 pass var utan att få blandad historik. En användare gör latsdrag, den andra assisterade chins, med separata algoritmregler. Övningsval får ändras.

## 2. Personliga inställningar
- `plannedSessionsPerWeek`: heltal 1–7, start 2.
- `minutesPerSession`: heltal 15–120, steg 5, start 40.
- `experience`: novice/intermediate/experienced, start novice om okänt. Per övning kan nivån ändras.
- `goal`: strength i V1. Prioritera squat/bench/deadlift med vikter 0–3 (start 1 var).
- `equipment`: rack, barbell, plates, bench, cable, pullup-assist, dumbbell, machines, bodyweight. Krävs för övningsval; användaren kan välja gym-standardpaket.
- `liftEstimates`: 1RM eller 3RM för valfria övningar; källtyp, kg, datum, säkerhetsskattning.
- `plateIncrementKg`: per övning/maskin (t.ex. 2,5 kg skivstång, 1 kg vissa isolationsövningar), anges/ändras i profil. Inga antaganden om att alla gym har samma steg.
- `restrictionRules`: frivilliga, användardefinierade blockeringar eller begränsningar för enskilda övningar, par eller belastningslägen.
- `symptomArea`: valfri registrering av knä, höft/ljumske, ländrygg, axel, armbåge, handled/hand, nacke/övre rygg, lår/baksida, fotled/fot, annat; sida vänster/höger/båda/ej relevant.
- `dateTime`: sparas UTC samt lokal visning och IANA tidszon. Inga antaganden om kalendervecka eller att nästa dag innebär återhämtning.

## 3. IA, navigation och skärmkontrakt
**Bottom navigation:** `Idag`, `Utveckling`, `Profil`. `Träna` är helskärmsläge vid aktivt pass och har alltid `Pausa/Avsluta` synligt. `Spontanpass` är sekundär handling på Idag.

| ID | Vy | Obligatoriskt innehåll | Handling och tillstånd |
|---|---|---|---|
| S01 | Välkommen | kort syfte, logga in, skapa konto, integritetslänk | laddar; auth fel; nätverksfel |
| S02 | Intro 1/4 | pass/vecka, minuter, erfarenhet | endast två obligatoriska val; Back/Next |
| S03 | Intro 2/4 | utrustning, prioritetslyft, önskade alternativ | inga långa frågor; default gym |
| S04 | Intro 3/4 | 1RM, 3RM, submax med god uppgift eller välj kalibrering | inga maxlyft krävs; kvalitetsetikett |
| S05 | Intro 4/4 | frivilliga begränsningar, integritet för hälsouppgifter | helt möjligt att hoppa över |
| S06 | Idag | starta rekommenderat pass (primärt), spontant pass (sekundärt), uppskattad tid, snabb övningslista | offline/synkstatus diskret men synlig |
| S07 | Passförhandsvisning | övningsordning, set/reps/kg, RIR om van, tidsestimat och kort varför | start, byt, ändra tid; konfliktvarning |
| S08 | Träna | en övning i fokus; utförda och kommande setrader; vikt/reps som redigerbara tal; föregående resultat | ett tryck att spara förifyllt set, ångra, lägg till, nästa övning |
| S09 | Byt övning | filtrerad katalog med likvärdiga rörelsemönster, otillgängliga markerade | välj ersättare; påverkar inte tidigare logg |
| S10 | Spontanpass | minuter, dagsform, rekommenderad lista, varför | visa ett förslag och möjlighet att revidera |
| S11 | Avsluta | summering, faktisk tid, valfritt RIR/dagsform och symtom | spara som completed/partial; bakgrundssynk |
| S12 | Utveckling | e1RM kurva per övning, mätt/beräknad skiljs, senaste pass, rekord | filter 4v/12v/alla |
| S13 | Profil | frekvens, minuter, viktssteg, nivå per övning, utrustning | ändringar endast prospektivt |
| S14 | Begränsningar | område/sida, regeltyp, prioritering, aktiv/inaktiv | separat frivilligt samtycke för hälsodata |
| S15 | Data & konto | export JSON/CSV, radera hälsoprofil, radera konto, logga ut | tvåstegsbekräftelse för irreversibla val |
| S16 | Konflikt/offline | synkstatus, lokal kö, ändringskonflikt om samma set | användaren väljer version vid faktisk redigeringskonflikt |

### 3.1 Kritiska tillstånd
S08 set: `planned → saved_local → queued_for_sync → synced`; fel `failed_local` eller `sync_conflict`. Gränssnittet får ALDRIG visa ”Sparat” innan lokal transaktion lyckats. Vid upprepade nätverksfel fortsätter användaren lokalt och ser diskret `Sparas när du är uppkopplad`.

Pass: `preview → in_progress → paused → completed | partial | abandoned`. `abandoned` lämnar alla verkliga utförda set i historiken, om användaren så väljer. Frånkopplade pass får inte försvinna vid omstart.

Fokus: `unknown / low-confidence / calibrated / stable`, symtomstatus `none / monitor / flagged / unresolved`. Inga medicinska diagnoser här.

### 3.2 Mobildesign som kontrakt
- Systemtypsnitt, numeriska värden i tabulära siffror, 16 px eller mer på primär kroppstext, aldrig mindre än 13 px på kritiska labels.
- Primär handling längst ned inom tumbereich, minst 48×48 CSS px aktiv träffyta (vår designnivå, WCAG AA kräver 24×24 med undantag).
- Endast en stark visuell CTA per skärm; inga belöningspoäng, sociala funktioner eller aggressiva notiser.
- Ingen gest som enda alternativ till knapp; skärmläsare kan läsa tabellradens setnummer, vikt, reps och status.
- Viktfältet stödjer decimal komma och punkt, konvertering till gram eller exakta decimaler utan flyttalsdrift i datalagring.
- RIR är frivilligt, dold avancerad kontroll för novice; endast när användaren anger det tas det med i motorn.
- Enkla tomlägen, interaktiv validering och korrigerbara fel. UI måste fungera med 200 % textzoom och reducerad rörelse.
- Manuell granskning på Safari iOS och Chrome Android; test vid dålig täckning och i flygplansläge.

### 3.3 Interaktionsbudget
- Efter att förifylld setrad visas ska registrering av lyckat set kräva **1 tryck**.
- Justering av bara reps högst **2 handlingar** inklusive spara, exklusive inmatning av siffra.
- Från `Idag` till första planerade set högst **2 tryck**.
- Från `Idag` till spontanförslag högst **3 tryck** när standardtid accepteras.
- Förbättring av målet får inte ske genom att dölja viktiga säkerhetsdialoger.

## 4. Standardövningar och katalog
Varje övning får unik `slug`, svenskt namn, rörelsemönster, utrustningskrav, `loadKind` (`external_kg`, `assistance_kg`, `bodyweight_plus_kg`, `reps_only`, `duration_sec`), `defaultIncrementKg`, tidsprofil, prioritet, lokala områden (inte medicinsk riskpoäng), och `replacementGroup`. Katalogen inkluderar:

`squat`, `bench_press`, `deadlift`, `romanian_deadlift`, `overhead_press`, `lat_pulldown`, `assisted_pullup`, `pullup`, `cable_row`, `chest_supported_row`, `cable_lateral_raise`, `biceps_curl`, `triceps_pushdown`, `cable_crunch`, `plank`, `split_squat`, `leg_press`.

**Viktsemantik:** `external_kg` är angiven extern träningsbelastning; i assistansmaskin betyder högre `assistance_kg` LÄGRE faktiskt krav; en lägre siffra är progression. Kroppsvikt/assisterad vikt får inte räknas som jämförbar 1RM med skivstång. `reps_only` visar inte fiktiva kg. `duration_sec` visar sekunder och kräver inga repetitioner. Varianten för olika gymmaskiner särskiljs vid behov med användarspecifik maskinprofil.

## 5. Funktionella krav (systemtestbara)
**FR01–FR05 Profil**: skapa, ändra, validera 1–7 pass/vecka och 15–120 min, förifyll 2 och 40, frivilligt maxvärde, övningsspecifika viktssteg.
**FR06–FR11 Planering**: välj programtemplate, föreslå övningar och varje set inom tid, tillämpa begränsningar, ändra pass framåt, auto-omplanera efter missad vecka, bevara gamla pass.
**FR12–FR17 Pass**: starta, pausa, återuppta, redigera, markera, ångra, komplettera set; hantera misstag och kalibrering.
**FR18–FR21 Spontant**: välj tid/dagsform, föreslå pass utifrån historik, räkna in i kommande plan, uppdatera när användaren avviker.
**FR22–FR27 Algoritm**: 1RM från godkänd källa, belastning från mode och vana, dubbel progression, recovery gate, symtom gate, skäl och evidensetikett.
**FR28–FR32 Data**: autospara, lokal kö, idempotent synk, ägarisolering, export/radering.
**FR33–FR36 UX**: förifyllning, korrekt svenska decimaler, tydlig offlineindikator, genomförbar användning utan tvingande enkäter.

**FR37–FR40 Förvaltning**: versionera algoritm, reproducera historiska förslag, featureflags för nya regler och anonym teknisk telemetri endast efter separat godkännande.

## 6. Scope per fas
V1 ska levereras utan beroende av tränings AI modell. Gränssnitt, databas och regelmotor kan testas i lokalt demo mode med syntetiska data, och publicering till produktion är en separat godkänd process. Uppgifter som användaren själv lämnar ska inte tränas på eller användas för forskning utan särskilt ändamål, transparens och rättslig prövning.
