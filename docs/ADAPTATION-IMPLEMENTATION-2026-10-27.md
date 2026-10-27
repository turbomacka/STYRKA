# STYRKA 2.1: planen följer det du gör och hur det känns

Implementeringsrapport, 27 oktober 2026. Uppdraget omfattar adaptiv träning, enkel presentation och publicering i den befintliga stagingmiljön. Ingen ny produktionsmiljö skapas. Publiceringsbevis och sista testresultat samlas i `evidence/adaptation-2026-10-26/`; katalogdatumet anger när verifieringen började.

## Vad användaren får

- En samstämmigt genomförd manuell vikt blir arbetsnivå för kommande förslag. Den gamla rekommendationen återställs inte bara för att användaren valt annorlunda.
- Lätt/För lätt kan stödja ett litet försök direkt vid nästa jämförbara tillfälle. Lagom behåller den valda nivån och bidrar till senare bekräftelse. Ett kommande lättare pass eller en aktuell begränsning kan fortfarande motivera bibehållen dos.
- Ett missat försök återgår till den nivå försöket byggde på. Exempel: 75 → försök 77,5 → tillbaka till 75, även om appen tidigare föreslog 80.
- Färre repetitioner, lägre vikt och färre set behandlas som separata dimensioner. En bekräftad repetitionsökning upphäver inte ett separat valt vikttak i den adaptiva dosmodellen.
- Slutåterkopplingen visar faktisk observation, konkret kommande förslag och kort skäl. Den hittar nästa relevanta övning även när övningen saknas i den allra närmaste mallen.
- Nära framtidspass visar konkreta preliminära mål, inklusive olika vänster-/högermål och maskinnivåer. Avlägsna pass visar struktur, inte påstådda framtida resultat.
- Varmare, varierad återkoppling med sparsam torr humor. Exempel: ”Små steg räknas. Även utan trumvirvel.” Ingen humor vid registrerade varningssignaler, missade försök eller avbrutna pass. Inga nya obligatoriska frågor, inställningar eller paneler.

## Bekräftade brister och åtgärder

| Tidigare brist | Implementerad åtgärd |
|---|---|
| Procenttak kunde blockera 80 → 82,5 kg för erfaren användare. | Bedöm nästa giltiga utrustningssteg mot genomförda reps och osäker marginal; begränsad repetitionsbrygga vid stora steg. |
| Manuell vikt kunde tappas eller räknas som misslyckande. | Skilj ursprungligt appmål, redigerat mål och utfört resultat. Samstämmig vald dos blir preliminär arbetsnivå. |
| Missad högre nivå kunde sänka redan etablerad nivå. | Separat bekräftad nivå, försöksmål och historiskt underbyggd försöksbas. Nya positiva belägg krävs före återförsök. |
| Lätt/Lagom nådde återhämtningen men inte progressionen. | Rå ansträngningskategori följer med till samma beslutsmotor, utan påhittat RIR. |
| Ordinala maskiner tappade dosval mellan passlägen och återhämtning vid 48 timmar. | Analysera relevant dos före lägesuppdelning; skicka samma kontinuerliga återhämtningsunderlag till samtliga lastadaptrar. |
| Ett tidsborttaget set kunde bli permanent. | Spara tillfällig dosorsak separat. Återinför högst ett ordinarie set när orsaken upphört, utan samtidig vikt-/repsökning. |
| Generell återhämtnings- och veckodosregel kunde begränsa väl tolererad träning. | Jämför nyliga, relevanta faktiska prestationer. Mildra endast lättare generisk återhämtningsbegränsning när upprepat underlag finns. |
| Framtidsöversikt och slutfeedback använde olika tidshorisont och målrepresentation. | Gemensam beräkning, full föreskrift och formattering för sparade planplatser och återkoppling. |
| Rättningar/raderingar kunde lämna gammal text. | Härledda fakta har beroenden till pass och set. Mutation, synk, konflikthantering, passradering och hälsoradering rensar berörd återkoppling. |

Grundrotationen har nu horisontellt drag även i B. Befintliga mål påverkar ordning och lågprioriterad komplettering inom samma tidsbudget. En särskild planeringskontext för preliminära pass får aldrig användas som utförda prestationer. Muskelarbete och möjlig återhämtningsöverlappning har skilda funktioner och vikter.

## Beslutsmodell och dokumenterade produktantaganden

Ordningen är uttryckliga spärrar → relevanta varningssignaler → tydliga dosval → återhämtning/samlad dos → belägg för progression. Mål, utrustning och tid begränsar samtidigt vilka förslag som faktiskt kan genomföras. Slutlig kontroll av giltiga steg och maximala belastningar görs även efter återställning av tillfälliga set.

Bekräftelse kräver normalt två jämförbara lyckade exponeringar, tre vid endast ett arbetsset. Direkt försök från manuellt vald dos kräver representativa Lätt/För lätt-svar: minst två tredjedelar och minst två svar när flera set finns. Motstridiga hårda svar, RIR ≤1, dålig teknik och aktiva begränsningar stoppar den snabbare vägen. Lagom blir aldrig ett fabricerat RIR-tal.

Problemrelaterad dos kan försiktigt omprövas efter minst två senare samstämmiga positiva exponeringar och tydlig marginal, alternativt tre med positiva/passande svar. Varje dimension omprövas för sig. Missade/avböjda försök kräver nytt stöd; väntan ökar vid upprepning. Den begränsade repetitionsbryggan är högst två reps över intervallet och aldrig över 15.

Återhämtningssignalen använder faktisk repetition, set, ansträngning och jämförbar relativ intensitet med gradvis tidsavklingning. Tre policyer jämfördes: generell, generellt mildare och individuellt modifierad. Den individuella valdes för att kräva eget underlag innan en lättare generell spärr mildras. Minst tre jämförbara positiva efterföljande utfall behövs; högdosskyddet kvarstår. Halveringstid 24 timmar och gränser 0,7/1,6 är versionssatta produktantaganden. Modellens värde är inte uppmätt fysiologisk återhämtning.

Vila använder samma policy i tidsplanering och aktivt pass. Jämförbart repetitionstapp utan RIR kan ge ett försiktigt tillägg om 15 sekunder. Korrelerade ansträngningssignaler summeras inte okritiskt. Ingen kompensationsskuld skapas efter kortare pass.

Detaljer och gränsfall: [domänredovisning](evidence/adaptation-2026-10-26/domain-summary.md), [implementeringsplan](IMPLEMENTATION-PLAN-ADAPTATION-2026-10-25.md).

## Forskningsgrund och gränser

| Källa | Princip som används | Vad den inte validerar |
|---|---|---|
| [ACSM/Currier 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/) | Regelbunden, målanpassad styrketräning; större belastning relevant för maximal styrka. | Individens optimala dos eller appens trösklar. Mycket underlag från ovana/friska. |
| [Nuzzo 2024](https://doi.org/10.1007/s40279-023-01937-7) | Stor variation i repsförmåga; egna prestationer väger tungt. | Exakta kilogramkonverteringar mellan övningar/maskiner. |
| [Pelland 2026](https://doi.org/10.1007/s40279-025-02344-w) | Avtagande utbyte av dos/frekvens; skilj direkt och indirekt arbete. Förlagsabstract granskat. | Fast säkerhetstak eller samma överlappningsvikt för trötthet och anpassning. |
| [Refalo 2024](https://pubmed.ncbi.nlm.nih.gov/37967832/) | RIR kan vara användbart hos tränade under studerade förhållanden. | Att ett svar är exakt, eller att utveckling kräver RIR. |
| [Plotkin 2022](https://pubmed.ncbi.nlm.nih.gov/36199287/) | Både fler reps och högre vikt kan fungera; 43 tränade, åtta veckor. | En optimal långsiktig algoritm för mycket erfarna. |
| [Robinson 2024](https://doi.org/10.1007/s40279-024-02069-2) | Styrkeökning kräver inte generellt träning till failure. | En exakt RIR-gräns för nästa viktökning; analysen är explorativ. |
| [Helms 2018](https://doi.org/10.3389/fphys.2018.00247) | Autoreglerad belastning är ett användbart alternativ. | Säker överlägsenhet över procentstyrning eller automatisk tolkning av avsikt. |
| [Morán-Navarro 2017](https://pubmed.ncbi.nlm.nih.gov/28965198/), [Schoenfeld 2016](https://pubmed.ncbi.nlm.nih.gov/26605807/) | Ansträngning och tillräcklig vila spelar roll. Små studier på tränade män. | Individuell återhämtningstid eller appens poäng. |
| [de Wit 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12050247/), [START 2021](https://pubmed.ncbi.nlm.nih.gov/33591346/) | Högre intensitet/dos innebär inte självklart bättre kliniska utfall vid knäartros. | Diagnos, läkning eller rehabiliteringsdos för appens användare. |

Den tidigare forskningsgranskningen och populationsbegränsningarna finns i [granskningsrapporten](ADAPTATION-REVIEW-2026-10-25.md). Exakta beslutsregler och text/humor är produktval som behöver följas upp empiriskt.

## Simuleringar och kvalitetssäkring

Deterministiska förlopp använder 16 profiler, tre förutbestämda kapacitetsförlopp och 24 veckor, både fryst motor 1 och ny motor. En alternativ repetitionskurva används som känslighetskontroll. Kapaciteten styrs oberoende av rekommendationen; simuleringen visar inte att algoritmen orsakar bättre styrkeutveckling. Dessutom körs 36 hela planeringsförlopp för två/tre pass per vecka och 10 000 genererade egenskapsfall.

| Mätetal, huvudsimulering | Fryst motor 1 | Tidigare lokal motor 2.0 | Motor 2.1 |
|---|---:|---:|---:|
| Långvarigt oförändrade förslag trots syntetiskt utrymme | 1734 | 924 | 848 |
| Förslag över uttryckligt maximum | 0 | 0 | 0 |
| Extra sänkning efter missat försök | 0 | 0 | 0 |
| Feltolkad självvald dos enligt simuleringens definition | 405 | 0 | 0 |
| Viktvändningar under förbättring/stabilitet/försämring | 0 | 69 | 96 |

Första måttet är en granskningssignal, inte antal bevisat omotiverade stopp. I 2.1 beror återstående 748 på låg marginal och 100 på utrustningssteg. Motor 1 har noll viktvändningar eftersom dess stopp ofta hindrar försök alls. 2.1 har fler vändningar när omprövningar åter tillåts efter positiva belägg. Det är en avvägning att följa upp, inte ett utfall som döljs. Återgång till basnivå sker i samma rekommendation (maximal uppmätt fördröjning noll); progression återupptas efter nya positiva belägg.

Alternativkurvan ger ett initialt fall där användarens avsikt ännu inte kan utläsas eftersom sex utförda reps exakt motsvarar målet. Därefter lärs valet in. Inga maxöverträdelser eller extra sänkningar efter missat försök. Understödda omprövningar räknas separat och kontrolleras mot faktisk stabil dos, positiva prestationer, liten ändring och korrekt försöksbas; ett beslutsskäl ensamt gör inte ett förslag godkänt.

2 100 planer jämförs med den frysta historiska källversionen: 2 015 avsiktligt ändrade, 85 identiska. Äldre referenser behålls; gemensamma övningars dos i färska, tidsmässigt obegränsade planer kontrolleras separat. Nya funktions-, säkerhets- och acceptanstester krävs utöver kontrollsumman.

600 enhets-, UI- och riktiga databastester passerade på samlad implementation. Sista körningar efter beroende- och integritetskontroller finns i `all-tests.json` och `final-data-check.json`. Full webbläsarkörning, CI och publicerad verifiering redovisas separat i samma evidenskatalog. Testresultat från äldre versioner används inte som publiceringsbevis för denna version.

## Data, kompatibilitet och utvärdering

Inga nya personuppgifter, externa analysanrop eller telemetri har införts. Ingen server- eller lokal databasmigrering behövs. Valfria JSON-fält beskriver ursprungligt setmål och dosroll; äldre historik får okänt ursprung. Historiska prestationer och accepterade plansnapshots skrivs inte om. Uppvärmning, raderat arbete och framtidsplatser är aldrig prestationsbevis.

Radering och rättning påverkar framtida beräkning genom aktuell giltig historik. Härledd återkoppling kan raderas och återskapas; en sparad språkvariant ersätter aldrig fakta. Hälsoradering rensar även härledd text lokalt och när raderingen hämtas från annan enhet.

`scripts/evaluate-adaptive-history.mjs` kan köras på uttryckligen tillhandahållna lokala planeringsindata. Den lämnar aggregerade mängder och beslutsskäl, utan identifierare och utan nätverksöverföring av användardata.

Följ upp faktisk acceptans av försök, återkommande manuella korrigeringar, antal återförsök/viktvändningar, genomförbar passtid, målbalans och om återkopplingen upplevs lyhörd. Separera användbarhet från fysiologiska resultat. Fysisk iPhone/PWA och VoiceOver behöver fortfarande mänsklig enhetsverifiering; emulerad WebKit är inte samma sak.

Publiceringsverktygets beroenden uppdaterades inom kompatibla versioner efter aktuella säkerhetsrapporter. Wrangler är låst till 4.153.0 och den fulla beroendekontrollen gav noll kända sårbarheter. Appens träningsberoenden och användarflöde ändrades inte av denna uppdatering.

Slutkontrollen reproducerade även ett kortvarigt autentiseringsfel (`PGRST303: JWT issued at future`) vid första profilhämtningen. Transporten försöker samma, av servern avvisade begäran en gång till efter en sekund. Endast detta exakta fel återförsöks; utgången/ogiltig inloggning och nekad behörighet behåller tidigare skydd. Servern måste godkänna även återförsöket. Sex transporttester och ett webbläsarfall per plattform verifierar beteendet. [PostgRESTs feldefinitioner](https://docs.postgrest.org/en/stable/references/errors.html#group-3-jwt) beskriver felgruppen; den begränsade återförsökspolicyn är ett produktval.
