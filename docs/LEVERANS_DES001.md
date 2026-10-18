# ÄA-DES-001 – leverans och acceptans

13 oktober 2026. Implementerad, publicerad på staging och kontrollerad mot den publicerade versionen.

## Publicering

- Adress: [STYRKA staging](https://styrka-staging.homeboard-mh.workers.dev/).
- Publicerad 13 oktober 2026 kl. 13:11 svensk tid. Aktiv version: `27653f8a-3b72-4b64-bfcc-8ce95e7caba7`, 100 procent av stagingtrafiken.
- Tidigare version för eventuell återställning: `51d6b72c-e126-415f-a7f3-128582e36caf`.
- Startsida, huvud-JavaScript, CSS, service worker och manifest svarar HTTP 200 och har identiska kontrollsummor med det lokala stagingbygget. [Publiceringsbevis](evidence/design-001/deployment.json).
- **4/4 tester mot publicerad staging passerade direkt**, i Chromium med Android-emulering och WebKit med iPhone-emulering. Testerna omfattar riktig inloggning med syntetiskt konto, introduktion med flera styrkeuppgifter, avbrutet knapptryck, offline setregistrering och lokal sparbekräftelse, synk till stagingdatabasen, överhopp, radering av testpass, diagramval, sparat mörkt tema efter omladdning, byte till ljust tema, publik vetenskapssida och service worker-registrering. Inga CSP-fel noterades.
- Testkontonas städning kördes efter respektive test. Inga befintliga användarkonton eller träningsuppgifter användes. Inga databasändringar gjordes vid publiceringen.
- Bilder från publicerad version ligger under `evidence/design-001/staging/`. Fysisk iPhone/Android-provning återstår enligt matrisen nedan.

## Resultat

STYRKA har en sammanhållen varm ljus och grafitfärgad mörk identitet med skogsgrön/salviagrön accent. Befintliga komponenter används genomgående. Kontroller ger omedelbar, avbrytbar tryckrespons. Set har ett synkront sparskydd och får framgångsmarkering först efter lokal commit. Bekräftelsen säger uttryckligen att setet finns på enheten, medan synkstatus ligger separat.

Numeriska fält använder stabila siffror och svenska decimaler. Stor text ger omflöde av setrader i stället för sönderbrutna värden. Övningsbyte flyttar fokus till övningsnamnet och visar början av övningen direkt. Plan- och balanskort har korta övergångar; öppnade anteckningsfält behålls när kort stängs. Diagram har större punktkontroller, kompakt information, tangentbordsvänlig punktlista och datatabell. Diagrammens data och skala är oförändrade.

Dialogerna har stabilt fokus, tangentbordsfälla, inaktiv bakgrund och återställt fokus vid stängning. Temaval och frivillig haptik finns under Profil. Reducerad rörelse tar bort icke nödvändiga rörelser; informationen finns kvar. Appen förblir tyst.

## Underlag

- [Designinventering före implementation](DESIGNINVENTERING_DES001.md).
- [Designsystem, tokens, komponentkarta, mikrointeraktioner, haptikmatris och återställning](DESIGNSYSTEM_DES001.md).
- [Bildgalleri före/efter](evidence/design-001/index.html): tio vyer × två teman × tre emulerade miljöer, samt bilder med 200 procent text. Vetenskap visas som ett läsbart utsnitt; övriga bilder visar hela sidan. Konton och träningsuppgifter är syntetiska testdata.
- [Lokala prestandadiagnoser och rådata](evidence/design-001/performance.md).
- [Kontrollsummor före designändringen](evidence/design-001/logic-before.json): 37 filer i domain/application/planner/storage/migrations är oförändrade efter arbetet. Tidigare ändringar som redan fanns i arbetskopian har bevarats.

Bildinsamlingen före ändringen fångade Utveckling under inläsning i vissa miljöer, bland annat iPhone/WebKit. Dessa bilder bevaras som den faktiska baslinjen och är inte ett fullständigt visuellt underlag för den tidigare grafen. Efter-bilderna väntar uttryckligen på diagramdata, balansanalys och öppnade kort. Helsidesbilder visar fasta navigationsrader vid det då synliga fönstret; de sitter därför ibland mitt i en lång bild. Datum skiljer sig eftersom slutkontrollen gjordes dagen efter baslinjen.

## Testresultat

- **375 kod-/UI-/databastester godkända**: full körning med 374 tester, därefter tillagt test av bekräftelsens livslängd och samtliga 321 unit/UI-tester omkörda. De 54 databastesterna berör oförändrad kod och passerade fullkörningen.
- **26/26 referensfall godkända**, inklusive kontrollsumman för beslutsmotorn.
- **106 funktionella E2E-fall har godkänt resultat**, över en full körning och riktad omkörning. Första fullkörningen: 95 godkända, 11 misslyckade, 8 avsiktligt överhoppade. Alla 11 misslyckade fall godkändes därefter i en riktad omkörning på en ny byggning. Detta ska inte beskrivas som en helt grön förstakörning.
- Överhoppen var 6 separata bildinsamlingar (körs uttryckligen) samt 2 tidigare dokumenterade WebKit-begränsningar: standardinställning för Tab mellan knappar och offline-omladdning med service worker i Windows-WebKit. Chromium kontrollerar offline-omladdningen; fysisk iOS PWA behövs fortfarande.
- **60 automatiska kontrastfall** ingår i testerna ovan. Axe, 200 procent text, 320 px reflow, pekaravbrott, temapersistens och reducerad rörelse täcks av browserfallen.
- **6/6 designflöden har godkänt resultat i den sista kontrollen**: fem passerade direkt, ett desktopfall stoppades av samma lokala `PGRST303`-tidsfel och passerade separat omkörning utan kodändring. Samtliga sex bildinsamlingar passerade därefter med kontroll att innehållet laddat klart.
- **Reservläget godkänt i desktop Chromium**: tidigare färgtema, setregistrering samt öppning/stängning av plankort fungerar med `VITE_FLAG_DESIGN_V2=false`.
- TypeScript och lint godkända. Produktionsbygge skapas utan fel, med kvarvarande storleksvarning enligt nedan.

Första E2E-körningens sex strukturella avvikelser kom från två testantaganden i tre miljöer: ”Faktisk prestation” finns nu också i punktlistans alternativ, och kollapsade plankort finns kvar i DOM för att skydda utkast. Kontrollerna har preciserats till exakt legendtext respektive osynligt och inert innehåll. De nya beteendena och gamla träningshandlingarna testas fortsatt.

Fyra andra fel i fullkörningen hade lokal serversvarskod `PGRST303`, `JWT issued at future`, direkt efter skapande av testkonto. Det femte var att första fältet för nytt lösenord tappade innehåll i en WebKit-körning. Samtliga passerade vid riktad omkörning utan ändring av autentiseringskod eller försvagade testvillkor. Tidsvalideringsfelet återkom i slutkontrollen ovan och är alltså inte åtgärdat i den lokala miljön. Orsaken till det enstaka lösenordsfältsfelet är inte fastställd. Dessa avvikelser sparas som provningsrisker och ska följas upp vid mobil/staginggranskningen.

## DES01–DES40

”Lokalt verifierat” betyder automatiska kontroller och bildgranskning i denna arbetsmiljö. Det är inte en tillgänglighetscertifiering eller ett påstående om fysisk telefonprovning.

| ID | Status | Resultat / belägg |
|---|---|---|
| DES01 | Lokalt verifierat | Gemensamma semantiska tokens för båda teman; automatiskt och manuellt temaval. |
| DES02 | Lokalt verifierat | Samma befintliga komponentklasser genom centrala vyer; före/efter-bilder. |
| DES03 | Lokalt verifierat | Kritiska färger kommer från tokens. Inga hårdkodade färger i UI-TSX. Tidigare CSS finns kvar bakom reservläget. |
| DES04 | Lokalt verifierat | 60 text-/kontrollkombinationer kontrasttestas; axe-kontroller i båda teman. |
| DES05 | Lokalt verifierat | Tabulära tal, stabil fältbredd, sammanhållna setvärden, omflöde vid stor text. |
| DES06 | Lokalt verifierat | Befintlig svensk formatterare återanvänds; 82,5 kg och tydliga enheter i fält, graf och set. |
| DES07 | Lokalt verifierat | Fylld grön primärhandling, neutral sekundär och diskret textknapp; aktiva segment med ram. |
| DES08 | Lokalt verifierat | Pressadapter sätter visuellt tillstånd på pointerdown utan nätverksväntan. |
| DES09 | Lokalt verifierat | Pointercancel och rörelse utanför knappen återställer tillstånd och sparar inget. |
| DES10 | Lokalt verifierat | Förifyllt set registreras fortfarande med ett klick; befintligt huvudflöde testas. |
| DES11 | Lokalt verifierat | Fördröjd lokal operation i komponenttest: ingen framgång före resolve. |
| DES12 | Lokalt verifierat | Avvisad lokal operation: synligt fel, ingen bekräftelse/haptik, nytt försök fungerar. |
| DES13 | Lokalt verifierat | Två synkrona klick ger ett anrop; nytt klick före databasens UI-uppdatering blockeras också. |
| DES14 | Lokalt verifierat | Byte framåt/bakåt behåller registrerat set, fokuserar rubrik och visar övningens början. |
| DES15 | Lokalt verifierat | Kort öppnas/stängs, stängda kontroller är inert, utkast behålls; utskriftsflödet kontrolleras. |
| DES16 | Lokalt verifierat | Punktval ändrar inte värden, linjegeometri eller skala; direktkontroll och select fungerar. |
| DES17 | Lokalt verifierat | Ingen animation som ritar om kurvan från början; periodbyte använder befintlig datahämtning. |
| DES18 | Delvis verifierat | Funktion utan haptik-API testad. Fysisk iOS PWA återstår. |
| DES19 | Lokalt verifierat | Inga dolda switchar eller iOS-haptikhack. |
| DES20 | Delvis verifierat | Av som standard, stödtest och lokal opt-in; verklig Android-vibration är inte provad. |
| DES21 | Lokalt verifierat | Saknat API, false och exception påverkar inte registreringen. |
| DES22 | Lokalt verifierat | Inga ljudanrop tillkommer. |
| DES23 | Lokalt verifierat | CSS övergångar/animationer avstängda och JS-värdeeffekt uteblir vid reducerad rörelse. |
| DES24 | Lokalt verifierat | Text, bock, ram och status finns kvar utan rörelse. |
| DES25 | Lokalt verifierat | Centrala knappar/tabs/punktval mäts till minst 48 × 48 px; 50 px grundmått även under tryck. |
| DES26 | Delvis verifierat | Fokusfälla, återställning, radiotangenter och träningsnavigation kontrollerade. Fysisk Safari/hjälpmedel återstår. |
| DES27 | Delvis verifierat | Namngivna kontroller och en sparannons; axe och DOM-kontroller. VoiceOver/TalkBack har inte provats. |
| DES28 | Lokalt verifierat | 200 procent CSS-text i träningsvyn, Idag, Utveckling och Profil; 320 px reflow separat. Manuell telefonzoom återstår. |
| DES29 | Lokalt verifierat | Ikon/text/linjestil/ram bär status utöver färg. |
| DES30 | Lokalt verifierat | Ingen animation awaited; ingen animation utlöser en ny dataskrivning. |
| DES31 | Ej fysiskt verifierat | Labdata finns. Representativa telefoner, installerad PWA och verkligt INP p75 återstår. |
| DES32 | Delvis verifierat | Före/efter-diagnoser och bildgranskning; subjektiv användarstudie och verklig bildfrekvens saknas. |
| DES33 | Delvis verifierat | Offline setlagring i Chromium/WebKit samt Chromium offline-omladdning och exakt fjärrantal i befintligt test. Fysisk iOS PWA återstår. |
| DES34 | Lokalt verifierat | Befintliga synk-/konfliktregressioner körda; samma statuskomponenter med nytt tema. Ingen ändring i konfliktregler. |
| DES35 | Lokalt verifierat | Navigation och paneler fungerar med reducerad rörelse; bekräftelser kvarstår. |
| DES36 | Lokalt verifierat | Inga långvariga eller upprepande animationer tillkommer; befintlig timerinformation fungerar som tidigare. |
| DES37 | Lokalt verifierat | Beslutsmotorns kontrollsumma och 26 referensfall samt domäntester. |
| DES38 | Lokalt verifierat | Tränings-/plan-/lagringskod identisk med baslinjen; befintliga data- och E2E-kontroller, ingen migration. |
| DES39 | Godkänt med provningsavvikelser | Alla 106 funktionella fall har passerat efter riktad omkörning. Första körningens lokala tidsfel och enstaka lösenordsfältsfel redovisas ovan. |
| DES40 | Lokalt verifierat | Endast enhetslokala UI-preferenser tillkommer. Ingen datainsamling, behörighet eller produktdataskrivning från animation. |

## Prestanda och enklare val

Inga externa UI-/animationspaket eller typsnitt har installerats. CSS och transform/opacity räcker. Panelens korta grid-övergång är ett avsiktligt undantag eftersom efterföljande innehåll måste flyttas när samma kort öppnas. Ingen will-change eller backdrop-filter används. Diagramkurvan har ingen uppspelningsanimation och dialogstängning är omedelbar.

Stagingbygget är godkänt. Huvudpaketets JavaScript ökar från 973 665 till 981 031 byte (+0,76 procent), CSS från 13 913 till 27 477 byte. Slutpaketen komprimeras till cirka 285,63 kB respektive 6,20 kB med gzip. Baslinjen är de tidigare publicerade stagingfilerna; slutvärdena kommer från bygget som publicerades den 13 oktober. Vites varning för huvudpaket över 500 kB kvarstår och fanns även före ändringen. CSS innehåller både den nya identiteten och den återställningsbara tidigare stilen.

I sista labinsamlingen tog klick till synligt registrerat set 68–95 ms i Chromium och 361–400 ms i WebKit, inklusive Playwrights väntan och automation. Längsta observerade Event Timing-event var 40–48 ms. Observerad CLS var 0 i Chromium; motsvarande API saknades i WebKit. Före/efter-tabellen visar både ökningar och minskningar mellan enstaka körningar och räcker inte för att fastställa en prestandaförändring. Labmått ska inte tolkas som fält-INP p75 eller bevis på telefonprestanda.

## Kvarstående fysisk granskning

| Miljö | Status och kvarstående kontroll |
|---|---|
| iPhone Safari | Ej tillgänglig här. Kontrollera fokus/VoiceOver, textzoom, tangentbord och många upprepade set. |
| Installerad iPhone PWA | Ej tillgänglig här. Kontrollera start, återupptagning, offline-omladdning, safe-area och fokus. |
| Android Chrome | Emulerad Chromium provad. Fysisk touch, TalkBack, valfri vibration och långsammare enhet återstår. |
| Desktop Chromium | Automatiska flöden och bildgranskning genomförda. |
| Ljust/mörkt, reducerad rörelse, offline | Automatiskt täckta med ovanstående plattformsbegränsningar. |
| 5–8 testpersoner | Inte genomfört. Bedöm begriplighet, läsbarhet, respons, spartrygghet och störande effekter. |

## Bedömning efter publicering

**Publicerad och automatiskt verifierad på staging; fysisk produktacceptans återstår.** Full acceptans kräver fysisk mobilgranskning och uppföljning av ovanstående testavvikelser, särskilt lösenordsåterställning på iPhone. De lokala tidsvalideringsfelen återkom inte i stagingkontrollen, men lösenordsåterställning ingår inte i stagingtestet. Designen har en byggflagga för återgång utan datamigrering. Den tidigare publicerade versionen finns också dokumenterad för återställning.
