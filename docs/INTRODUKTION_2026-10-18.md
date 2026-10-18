# Introduktion och underlag för viktförslag

Implementerat i den befintliga appen 17–18 oktober 2026.

## Användarflöde

- Fyra namngivna steg: Träning, Utrustning, Styrka, Anpassning. Standardgym och befintliga träningsvärden behålls; utrustning, prioriteringar och dragövning kan ändras.
- Nya användare får **Utgå från mina träningspass** förvalt. Ingen styrkeuppgift krävs. Alternativet **Ange styrkeuppgifter nu** öppnar en separat vy för varje huvudlyft, därefter ett formulär för den uppgift man valt.
- Ett vanligt set, 1RM och 3RM kan sparas oberoende. Ett extra värde skriver inte över ett annat. RIR och datum ligger under Fler detaljer; okänd RIR förblir okänd. Inga regler för uppskattad maxstyrka har ändrats.
- Tydlig skillnad mellan `Redo att fortsätta` (giltigt formulär) och en sparad uppgift. Vid lokalt lagringsfel stannar användaren på samma vy med sina värden kvar och kan försöka igen.
- `Fyll i senare` bevarar redan bekräftade värden. Halvfärdiga utkast finns kvar vid bakåtnavigering och omladdning, men omvandlas inte till styrkeuppgifter när planen skapas.
- Bekräftade styrkeuppgifter bevaras även om användaren sedan väljer träningshistorik som enda underlag. Valet går att ändra i Profil.
- Begränsningar är frivilliga. Hälsosamtycke är inte förvalt. Avslutande handling heter `Skapa min plan`.

## Lagring och kompatibilitet

Ingen SQL- eller IndexedDB-schemamigration behövs. `training_preferences.loadRecommendationSource` använder befintligt validerat JSON-fält, profilkö, konfliktmodell och synk. Tillåtna klientvärden är `performed_sets` och `strength_inputs`. Frånvaro av fältet behåller tidigare beteende för befintliga användare.

Utkast ligger i den kontospecifika IndexedDB-databasens `meta`, nyckel `onboarding-draft-v1`, med ytterligare kontroll av `userId`. Utkast synkas inte till andra enheter. De tas bort i samma transaktion som introduktionen slutförs. Utloggning/kontobyte följer appens befintliga policy för att radera lokal cache. Ingen utloggningsåterställning utlovas.

Historiska träningspass, set och ursprungliga planögonblicksbilder skrivs inte om. Referensmotorn är oförändrad.

## Beräkningsregler

I `performed_sets` ignoreras manuella styrkeuppskattningar i ordinarie pass, extrapass och övningsbyten. Befolkningsbaserade kvoter används inte. Jämförbarhetsregler för övning, sida och utrustning behålls.

Utan tillräcklig jämförbar historik visas **välj startvikt**. Planens övningar, set och repetitioner kan ändå bestämmas. Endast genomförda arbetsset används för viktunderlaget; uppvärmning och överhoppade set ger inga viktförslag.

Den tidigare arbetsvikten projiceras från verkligt registrerad belastning, normalt den lägsta genomförda jämförbara vikten (högsta assistans för assisterade övningar). Den gamla, eventuellt uppskattade målviktens storlek kan inte bli ny bas. Historiska mål behålls vid bedömning av måluppfyllelse. Befintliga progressionsregler, spärrar, viktsteg och belastningstak gäller fortsatt. Härledning till ett lättare träningsläge får använda faktisk arbetsvikt; ingen automatisk uppåträkning till ett tyngre läge.

Planerade övningar i detta läge märks `STYRKA-LOAD-SOURCE/1.0.0`. Manuella uppskattningar behövs inte för nästa arbetsvikt, och ingen RIR eller maximal styrka fabriceras. Äldre profiler och den befintliga planregressionen behåller sitt tidigare utfall.

## Komponenter

React Aria Components 1.22.1 (exakt låst version): radioval och tillgängliga textfält. TextField används för vikt för att behålla svenska decimaler och rå inmatning utan automatisk avrundning eller klampning. Befintliga knappar, stegkontroller, samtycke, begränsningsväljare och designvariabler återanvänds.

Nya filer: `application/onboardingDraft.ts`, `ui/components/IntroStrengthEntry.tsx`, `ui/components/LoadSourceChoice.tsx`, `ui/onboarding.css`. Ändringar i `Onboarding`, `Profile`, `profile`-tjänsten, `trainingFlow`, `prescription`, `planner`, modell och presentationsetikett för startvikt. Tester finns i `onboarding_source`, `onboarding_source_db`, `intro_strength`, `onboarding`, `strength_inputs` samt motsvarande publiceringskontroll.

## Verifiering

Resultat och bilder sparas i `docs/evidence/onboarding/`. Kontroller omfattar oberoende värden, kommadecimaler, bakåt/omladdning, ofullständiga utkast, lagringsfel och lyckad återprovning, offline, två enheters synk och kontoavskiljning, bevarade styrkeuppgifter, källval samt inga uppskattningsläckor vid övningsbyten.

Mobilbilder och flöden: Chromium/Pixel 7 och WebKit/iPhone 14 emulerade i Playwright, dessutom desktop. Ljust/mörkt tema, reducerad rörelse, 320 px och 200 procent textstorlek samt automatiska WCAG/Axe-kontroller ingår. Detta är inte fysisk provning på iPhone eller installerad iOS-PWA. Verkligt iOS-tangentbord och skärmläsare behöver fortfarande enhetsprovning. Inga fältprestandamått som INP p75 har samlats in.

Testmiljön fick sporadiskt `JWT issued at future` mellan lokal Auth och PostgREST. Testkontofabriken inväntar nu att just den nya sessionen accepteras innan testerna börjar. RLS-assertioner ändras eller försvagas inte.

Supabase säkerhetskontroll rapporterar inga ERROR. Befintliga WARN gäller `rls_auto_enable` och avstängt skydd mot läckta lösenord. Returtypen för `rls_auto_enable` verifierades som `event_trigger`; detta är inte en nytillagd vanlig RPC. Authkonfiguration och behörigheter ändras inte i denna leverans.

## Referenser

- [React Aria TextField](https://react-aria.adobe.com/TextField) och [RadioGroup](https://react-aria.adobe.com/RadioGroup).
- [Supabase JSONB](https://supabase.com/docs/guides/database/json).

## Resultat och publicering

- 384 enhets-/UI-tester godkända; inkluderar 2 100 befintliga planer med 7 333 övningsrader i tidigare regression.
- 59 databastester godkända, inklusive verklig profilkö, synk mellan enheter och kontoavskiljning.
- Referensmotorns SHA256 oförändrad; 26 referenskontroller godkända.
- 9 introduktionsflöden godkända (Chromium/Android, WebKit/iPhone, desktop). Ytterligare 8 träningsflöden för återhämtning, uppvärmning, ensidiga övningar, maskinbelastning och offline godkända i mobiltesterna. Första körningen hade två timingfel i testets direkta browser-back; slutkörningen inväntar den bekräftade navigeringen.
- Typecheck, lint och stagingbygge godkända. Paketinstallationen rapporterade inga kända sårbarheter.
- Huvudpaketet är 1 117,08 kB, 326,70 kB gzip; CSS 31,93 kB, 7,09 kB gzip. Vites varning om en JS-fil över 500 kB kvarstår. Inget stort animationsbibliotek har införts; ingen uppmätt INP på fysiska mobiler utlovas.
- Publicerad på befintlig adress `https://styrka-staging.homeboard-mh.workers.dev/`, Worker-version `a60190d1-cdb3-4a8b-83ee-ca64a364ac9f`, 100 procent trafik. Alla 11 publicerade appfiler verifierade byte för byte mot bygget; CSP pekar på rätt stagingdatabas. Se `evidence/onboarding/deployment.json`.

Samtliga 8 tester mot den publicerade appen godkända: båda startalternativen, beständig lagring och synk, inloggning, genomfört träningspass samt publik vetenskapssida i Chromium/Android- och WebKit/iPhone-emulering. Inga CSP-fel i kontrollerade flöden. Resultaten finns i `evidence/onboarding/published-tests.log`.

Endast tillfälliga syntetiska konton användes. De fyra nya introduktionstesternas konton raderades med efterföljande 404-kontroll; de två befintliga träningsflödenas testkonton raderades också. Fysisk iPhone och installerad PWA återstår enligt begränsningarna ovan.

Publiceringen är verifierad. Befintliga installationer får uppdateringen genom appens ordinarie meddelande **Ny version finns** och knappen **Uppdatera**.
