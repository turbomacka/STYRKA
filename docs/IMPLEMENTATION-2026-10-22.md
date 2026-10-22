# STYRKA – sammanhängande träningsflöde
Implementeringsrapport, 2026-10-22. Lokal arbetskopia: turbomacka/STYRKA, utgångspunkt d81c9cc. Ingen produktionspublicering.

## Granskning och genomförandeplan
Granskningen utgick från fungerande domänregler, IndexedDB/Dexie-transaktioner, outbox, serverns mutationslogg och befintliga tester.

| Område | Befintligt att återanvända | Faktisk brist och genomförd ändring |
|---|---|---|
| Set | Separata planvärden/prestationer, sidor, autosparning, snabb ångra | Registreringsångra var dold i editorn. Den är nu direkt åtkomlig. En ensam menyåtgärd är en direkt knapp. Explicit borttagning även av utfört set använder återställbar tombstone. |
| Uppvärmning | Utrustningssemantik, settyp, policyfunktion | Individuella visningsval konkurrerade med profilval; automatiska förslag följde inte planändringar. En profilinställning styr nu alla övningar. Versionsmärkt ägarskap skyddar manuella och utförda set. |
| Startbelastning | prescribe, configuredPrescription, comparableHistory, substitutionskatalog | Ordinarie/permanenta byten saknade ersättningsflödets väg till startlast. Alla tre vägar samt tillägg använder nu resolveStartingLoad. |
| Övningstillägg | Katalog, begränsningar, ordning och befintlig historik | Funktionen låg i översikten. Den finns nu direkt i träningsvyn. Extra arbetsset ingår i samma beräkningar som övrig faktiskt utförd träning. |
| Vila | Sparad timer, RIR/ansträngning, max av korrelerade signaler | Timer kunde visas i fel övning. Visningen kräver rätt övning och kvarvarande målset. Standardkonfiguration kan användas vid jämförbar maxlast. Sen redigering uppdaterar rekommendationen. |
| Avslut | Sparat pass före lokal framtidsplan | Automatisk återgång gjorde omplanering osynlig. Verkliga steg och en jämförelse visas före återgång. Fel ger separat försök igen utan ny registrering. |
| Historik/synk | Oföränderliga snapshots och planrevisioner | Framtidsrevisioner lagrade inte lastförslag. Nya revisioner lagrar även preliminära värden och källa. Historikkorrigering har en egen dialog med sidval och separat försök igen för omplanering. Den kan skapa ny revision även med oförändrad struktur. |
| Återkoppling | Faktabaserat urval och minne av senaste texter | Biblioteket har utökats med fler varianter och kategorier; korrigerad prestation ogiltigförklarar tidigare textunderlag. |

Arbetsordning: gemensam startmodell och datametadata → dynamisk uppvärmning och korrigeringar → förenklad träningsvy och vilokontext → omplanering och återkoppling → regression, lokal server, mobilflöden och visuell granskning. Inga nya externa tjänster eller beroenden behövs.

## Algoritmer och datamodell
- STYRKA-PLANNER/1.1.0: integrerar gemensamma startrekommendationer. Befintliga säkerhetsregler, återhämtningsbegränsningar, maxtak och förbjudna kombinationer kvarstår.
- STARTING-LOAD/1.0.0: rekommendationskälla, säkerhet, föreslagen last och eventuell källövning lagras i snapshot. Källor: egen historik, egen uppskattning, egna submaxset, försiktig överföring, generell modell, konservativ provlast eller kalibrering.
- WARMUP/2.0.0: planerad arbetslast, repetitionsmål, övningskategori, intensitet, vana, genomförda arbetsset i samma rörelsemönster samt utrustningsminimum/viktsteg. Tungt 50/70/85 % × 5/3/1; medel 60/80 % × 5/3; lätt/isolering högst ett kort set. Samtliga tal är produktheuristiker.
- REST/1.1.0 återanvänds. Timer avser nästa återstående set eller sida; ingen automatisk obligatorisk timer mellan övningar införs. Det är ett medvetet val för ett enkelt flöde. Vila mellan överlappande övningar görs efter eget behov.
- REPLAN-FEEDBACK/1.0.0 jämför nästa rotation vid samma klockslag och med samma övriga indata, med respektive utan det nyss avslutade passets historik. Det är en kontrafaktisk jämförelse, inte en påstådd jämförelse med en skärmbild användaren såg tidigare.
- EVIDENS/2.2.0 och STYRKA-METOD/1.5.0 dokumenterar nya regler i appens vetenskapliga del.

Startmodellens generella profil beräknas deterministiskt ur användarens egna data. Ingen demografi antas motsvara individuell maxstyrka. Jämförbar målövningshistorik går först. Vid osäker överföring används katalogens populationsprior med 50 % arbetsandel; kompatibla övriga relationer inom samma rörelsemönster använder 40 % av källmax som provlast. Inget målövningsmax lagras från dessa heuristiker. Egna kontrollerade submaxset används försiktigt; övriga möjliga startvärden utgår från känd utrustning. Okänd maskinskala, assistans och inkompatibla redskap konverteras inte till fria kilo. Användarvalet att endast använda utförda set respekteras.

Nya numeriska provförslag behåller kalibreringsbeteendet: registrerad faktisk last kan försiktigt fylla kommande orörda set. Egna registreringar i målövningen tar sedan över. Även härledning till ett lättare träningsläge använder verklig kalibreringslast, inte det tidigare automatiska provförslaget. Historiska planvärden ändras inte när nya rekommendationer beräknas.

Uppvärmningsmetadata är ett valfritt tillägg i befintlig JSON: policyVersion, managed och vid behov suppressed. Deterministiska rad-id förhindrar dubbletter. Oförändrat förslag ger ingen ny köskrivning. Legacyrader utan metadata lämnas orörda, eftersom det inte går att säkert avgöra om de är manuellt ändrade. Registrerade uppvärmningar finns kvar även när visningen stängs av. Vid olika planvikter per sida används den lägre som försiktig gemensam uppvärmningslast.

Framtidsrevisionernas lastvärden är preliminära vid den redan befintliga strukturella 72-timmarshorisonten. Det konkreta nästa passet räknas fortfarande live. Avslutets jämförelse sparas lokalt med indatans hash; servern synkroniserar träningsdata och planrevisionerna, inte den lokala presentationscachen.

## Dataintegritet och uppgradering
Ingen SQL- eller IndexedDB-schemamigrering behövs: befintliga validerade JSON-fält tillåter de valfria tilläggen. Gamla individuella warmupVisible-fält behålls för bakåtkompatibilitet med servervalidering men ignoreras för visning i den nya klienten. Äldre klienter kan fortfarande tolka sina gamla inställningar tills de uppdateras.

Planändring skriver inte prestation. Ångra tar bort relevant prestation/sida från beräkningsunderlaget. Explicit borttagning filtreras ur historiken men kan återställas med sina registrerade värden. Ändrad historik räknar också om tidigare kalibreringsstatus. Gamla planrevisioner och sessionssnapshots skrivs aldrig om. För detaljbaserade set sparas tidigare registrerade värden och sidor i recordingChanges, med tid, mutations-id och hash av resultatet. Historiken visas separat och används aldrig som ytterligare prestation. Äldre aggregatrader utan detaljformat får inte påhittade siduppgifter eller retroaktiv värdehistorik.

Snabba ångra–redigera-tryck är skyddade genom att värdekontrollerna är låsta medan ångringen sparas. En upptäckt WebKit-race verifieras både i komponenttest och i det sammanhängande mobilflödet.

Två normaliseringsfel har rättats: lokalt null för viktsteg och serverns katalogstandard ger samma effektiva planeringsvärde; utförandetider normaliseras till samma UTC-format före historikberäkning. Serverns +00:00 och klientens Z skapar därmed inte en onödig ny planrevision.

Extra övningar och set använder samma lagring, återhämtning och progression. Originalplanen ligger kvar i snapshot. Beräkningen använder antalet kvarvarande arbetsrader vid bedömning av genomförandet; extra set gör inte att en prestation felaktigt underkänns för att radantalet skiljer sig från originalplanen. Uppvärmning och enbart tillagda men ogjorda övningar räknas inte som utförd arbetsbelastning.

## Kritisk evidensgranskning
Granskningen använder primärkällor och tillgängliga abstracts/förlagstexter. Den är en riktad produktgranskning, inte en ny systematisk översikt. Fulltext har inte varit tillgänglig för samtliga arbeten.

| Referens | Slutsats för produkten och begränsning |
|---|---|
| [Currier m.fl. 2026](https://doi.org/10.1249/MSS.0000000000003897) | Översikt av översikter om styrketräningsordination. Stöd för generella träningsprinciper; validerar inte STYRKA:s exakta startandelar eller algoritm. |
| [Neves m.fl. 2026](https://link.springer.com/article/10.1007/s42978-025-00361-9) | 19 studier om uppvärmning, en om återuppvärmning; styrketränade män. Specifik uppvärmning kan förbättra vissa akuta utfall, men protokollen varierar. Förlagets abstract granskat. DOI i beställningen anger Neves som första författare, inte Sequera. |
| [Viveiros m.fl. 2024](https://pubmed.ncbi.nlm.nih.gov/39593476/) | 15 män; 80 % av 10RM × 5 gav större efterföljande volym än lättare protokoll med fler reps. Belastning och volym ändrades samtidigt, och ingen grupp utan uppvärmning ingick. Ingen universell 80-procentsregel. |
| [Enes m.fl. 2025](https://www.sciencedirect.com/science/article/pii/S2666337625000988) | 29 tränade deltagare i överkorsningsstudie med Smithbänk och benpress. Korta uppvärmningar gav liknande resultat som kontroll utan specifik uppvärmning. Motiverar begränsad volym, inte att uppvärmning alltid saknar värde. |
| [Singer m.fl. 2024](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full) | Nio studier med heterogenitet och breda intervall. Liten tendens för vila över 60 sekunder, ingen tydlig ytterligare hypertrofifördel över 90. Hypertrofiresultat ger inte ett exakt individuellt vilobehov för tung styrka. |
| [Gullett m.fl. 2009](https://pubmed.ncbi.nlm.nih.gov/19002072/) | 15 tränade deltagare; olika biomekanik i front- och bakböj. Ingen individuell lastkonvertering validerad. Katalogens befintliga 0,80-prior härrör från Davis 2020, inte denna studie. |
| [Swinton m.fl. 2011](https://pubmed.ncbi.nlm.nih.gov/21659894/) | 19 manliga styrkelyftare; olika maxlaster och ledmoment med rak respektive hexagonal stång. Gruppresultatet motiverar att lyften skiljs åt, inte att alla ska lyfta en given procent mer med trapbar. |
| [Lockie m.fl. 2018](https://doi.org/10.1519/JSC.0000000000001781) | 31 deltagare; höga trapbarhandtag gav högre maxlast och kortare rörelsebana. Handtagshöjd, teknik och population begränsar generalisering. Ingen universell trapbarkvot införs. |

## Verifiering
- 482/482 enhets-, UI- och databastester i 50 filer passerade i en sammanhängande körning. Databastester använder verklig lokal Supabase, inklusive två användare × 36 pass, återförsök, ägarisolering och hämtning på ny enhet.
- 26/26 referenskontroller passerade; SHA256 för både original och appens beslutskärna är oförändrad.
- De sex riktade webbläsartesterna passerade: två sammanhängande flöden vardera i Android/Chromium, iPhone/WebKit och Chromium på skrivbord. Axe kontrollerar både aktiv träning och historikkorrigeringsdialog. Offlineomladdning och avslut verifieras i Chromium.
- Byggningen passerade. Vite varnar fortsatt för en JavaScript-chunk över 500 kB; detta är ingen ny uppdelning eller prestandagaranti.
- TypeScript-kontroll och ESLint passerade. Bred webbläsarregression plus riktad slutkörning gav 85 godkända unika fall och 5 avsiktligt överhoppade, utan kvarstående testfel. Slutkörningen omfattade 17 godkända fall och en WebKit-tangentbordsbegränsning. De övriga fyra överhoppen gäller klassiskt tema (tre plattformar) och offline service worker i Windows WebKit. Fullständiga konto-/lösenordsflöden och separata designfotograferingar ingick inte i den breda körningen.

| Acceptansscenario | Verifiering och omfattning |
|---|---|
| 1. Ångra andra av tre set | adaptive_training: enbart två prestationer efter ångra, korrigering och återregistrering; borttagning/återställning och verklig synk. Mobilflödet verifierar direkta kontroller. |
| 2. Lägg till övning | Aktivt pass → katalog → förifyllt bicepsförslag → registrering → historik/avslut. Enhets- och DB-tester verifierar underlag, extra set och synk. |
| 3. Uppvärmning 100 → 80 kg | Automatiskt förslag ändras; manuellt 45 kg och redan utfört 70 kg bevaras; upprepade anrop ger inga nya outboxposter. Profilval gäller även med äldre individuellt av-val. |
| 4. Permanenta byten | Knäböj → frontböj och marklyft → trapbar ger samma konservativa källa och last som runtimevägen; egna målövningsdata prioriteras i befintliga progressionstester. |
| 5. Adaptiv vila | Första setets mål är det andra, borttaget mål räknas inte, sen ansträngning behåller starttid, sista setet lämnar ingen aktiv gammal timer. Befintliga tester täcker sidvila och manuella justeringar. |
| 6. Ombearbetad plan | Sparat pass före beräkning, verklig jämförelse, extra träning och oförändrade förslag. UI-test injicerar planeringsfel och verifierar återförsök utan omsparning. |
| 7. Generella startförslag | Gemensam resolver, osäkra överföringar utan fiktivt målmax, kalibrering vid okänd maskinskala och bevarat val att bara använda registrerade set. |
| 8. Historikkorrigering | Separat vänstersideskorrigering bevarar höger sida, originalsnapshot och gammal revision; ny planrevision och synkbar värdehistorik. Även provat genom webbläsarens historikdialog. |
| 9. Offline | Tillägg, planredigering, registrering, ångra, borttagning/återställning, omladdning och avslut lokalt. Verkliga DB-tester verifierar synk och andra enheten efter korrigering. |
| 10. Mobil/tillgänglighet | iPhone 14/WebKit och Pixel 7/Chromium emulerade; axe, synliga etiketter och fungerande dialogsidor. Fysisk iPhone, VoiceOver och installerad iOS-PWA återstår. |

Sammanvägt testprotokoll, där senare riktade tester ersätter tidigare resultat för samma fall: [verification.json](evidence/adaptive-2026-10-22/verification.json). Den breda rårapporten behåller de fyra fel som sedan följdes upp: en tillfällig lokal autentiseringsstörning och tre för breda testselektorer.

Maskinläsbara slutresultat: [final-tests.json](evidence/adaptive-2026-10-22/final-tests.json). Skärmbilder finns under [evidence/adaptive-2026-10-22](evidence/adaptive-2026-10-22/). Tidigare misslyckade körningar användes för felsökning och utgör inte verifiering av slutläget.

## Kvarvarande praktiska gränser
- Fysisk iPhone med Safari/VoiceOver och installerad PWA har inte testats här. WebKit-emulering ersätter inte detta. Offlineomladdning verifieras i Chromium; Windows WebKit har en känd begränsning för offline service worker-omladdning.
- Okänd tom stångvikt och okänd maskinskala ger inte påhittade minimum. Automatisk stånguppvärmning kräver känd minsta last eller tillgängliga laststeg. Användaren kan alltid lägga till egen uppvärmning.
- Uppvärmning för tid/kroppsvikt/assistans får ingen fiktiv procentuell kilolast.
- Osäkra överföringsfaktorer är inte individuellt validerade. Ingen automatisk programändring görs enbart för att en användare ofta lägger till en viss övning.
- Korrigeringshistoriken delar serverns befintliga gräns på 64 kB per setdetalj med övrig setmetadata. Ett konservativt storleksskydd avbryter hela den lokala mutationen innan en osynkbar post kan köas; ingen historik kapas tyst. Ett mycket stort antal korrigeringar kan därför kräva en framtida separat journalmodell.
- Omplanering sker lokalt. Produktionssynk och produktionsdistribution är inte utförda inom denna leverans.

## Leveransstatus
Ändringarna finns lokalt och är inte committade, pushade eller publicerade. Produktionsbeslut återstår. Tidigare evidensfiler är återställda; den nya körningens bilder och rapporter har en separat daterad katalog. Ingen ändring av produktionsdatabasen har utförts.
