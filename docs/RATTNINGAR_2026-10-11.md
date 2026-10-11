# Rättningar efter granskningen 2026-10-11

Ändringarna ovanpå `97ee461` publicerades på [STYRKA staging](https://styrka-staging.homeboard-mh.workers.dev) den 2026-10-11 på användarens begäran. Cloudflare-version: `ebc500b9-c515-48b7-8086-ab0f177c4693`. Databasschema, migrationer och referensmotor är oförändrade.

## Vad som har rättats

| Fynd | Nytt beteende | Verifiering |
|---|---|---|
| F1: felaktig introduktion vid långsam kontohämtning | En ny enhet väntar på en lyckad fullständig hämtning. Nät-/serverfel visar ett begripligt fel och möjlighet att försöka igen. Befintlig lokal profil kan fortfarande användas offline. | Komponenttest med 30 sekunders väntan, offline och serverfel. Webbläsartest med befintligt konto, separat webbläsarkontext, fördröjning över sex sekunder, serverfel och lyckat omförsök. |
| F2: utgången inloggning fastnar i synkläge | Appen visar ”Logga in igen för att synka”. Användaren förnyar inloggningen för samma konto utan att logga ut eller radera lokal data. Därefter fortsätter kön med samma händelse-id. | 401 under setloggning, omladdning, fel lösenord och lyckad återinloggning; setet finns kvar och lagras exakt en gång i lokal Supabase. En samtidig lyckad läsning får inte dölja ett nyare skrivfel. |
| F3: hälsodata raderade på en annan enhet ligger kvar lokalt | En lyckad full hämtning avstämmer raderade begränsningar och symtom. Köade och samtidigt ändrade poster skyddas. Lokala raderingar återställs inte från en äldre serverbild. Kvitterade upserts markeras nu korrekt som synkade; äldre felmärkta poster hanteras också. | Två klienter mot lokal Supabase: serverradering tas bort ur lokal data och export, medan ett osänt träningsset bevaras och kan synkas. Enhetstester för nätfel, samtidiga ändringar och köade raderingar. |
| F4: falskt besked att bekräftelsemejl skickats | Ett nekat omsändningsförsök ger felmeddelande och hänvisning till tidigare mejl eller nytt försök. | Komponenttest med simulerad begränsning av mejlutskick. |
| F5: sent svar flyttar användaren till en övergiven vy | Svar från en tidigare åtgärd får inte ändra aktuell vy, vänteläge eller felmeddelande efter navigation. | Fördröjt kontoskapande efter återgång till inloggningen. |
| F6: standardmaskin sparas inte för framtida pass | ”Använd framöver” rensar tidigare maskinprofil när standardmaskinen väljs. ”Bara idag” behåller det bestående valet. | Byte före och under pass, omöppnad lokal databas, nästa träningsförslag och synk till en andra simulerad enhet. Tidigare set och maskinhistorik bevaras. |

## Förenklad mobilinloggning

- Kort introduktion. Både **Logga in** och **Skapa konto** ryms på första skärmen vid 320 × 568 och 375 × 667 CSS-pixlar, utan tangentbord. Knapparna är minst 48 pixlar höga.
- Visa/dölj lösenord ligger intill fältet. Fälten stöder lösenordshanterare och mobilens e-posttangentbord.
- E-post och lösenord är huvudflödet. Alternativet utan lösenord ligger under **Andra sätt att logga in**.
- Bekräftelse via mejllänk beskrivs som automatisk fortsättning där länken öppnas. Knappen för att återvända till ursprungsappen finns kvar för länkar öppnade i annan webbläsare.
- Kodfält visas först när användaren väljer **Jag har en kod från mejlet**. Kontots e-postadress kan rättas från bekräftelsevyn.
- Väntande anrop låser sina inmatningsfält. Det går fortfarande att gå tillbaka utan att sena svar byter tillbaka vyn.

Skärmbilder: [första mobilskärmen](evidence/screenshots/android-chrome/S01-mobil-forsta-skarmen.png), [återinloggning med felmeddelande](evidence/screenshots/android-chrome/S16-aterinloggning.png). Motsvarande bilder finns under `iphone-webkit` och `desktop-keyboard`.

## Testresultat

| Kontroll | Resultat |
|---|---|
| Enhets-, komponent- och databastester (`npm test`) | **203/203 godkända**, 19 filer |
| Referensmotor (`npm run test:reference`) | **26/26 godkända**, båda SHA256-kontrollerna godkända |
| Typecheck och lint | **Godkända** |
| Produktionsbygge | **Godkänt**, befintlig varning för stort JavaScript-paket kvarstår |
| Full webbläsarsvit (`npm run test:e2e`) | **79 godkända, 2 undantagna**, Android/Chromium, iPhone/WebKit och dator; 5,8 minuter |
| Slutkontroll efter sista synkjusteringen (`playwright test e2e/auth_resilience.spec.ts`) | **9/9 godkända** mot ombyggd app: mobilvy, långsam hämtning/omförsök och återinloggning på alla tre profiler |

Riktade regressionstester för samtliga sex fynd är godkända. Ovanstående tester använder syntetiska data och lokal Supabase. Verifieringen efter publicering redovisas separat nedan.

De två befintliga WebKit-undantagen gäller Tab-fokus och full offlineomladdning med service worker i Windows-emuleringen. Tillgänglighetsskanning, mörkt läge, reflow, ordinarie träningsflöden, kontoisolering och övningsbyte ingår i den fulla webbläsarsviten.

En tidigare riktad webbläsarkörning fick ett tillfälligt 401-svar från den lokala testservern med `PGRST303: JWT issued at future`. Samma test passerade vid omkörning. Felet är dokumenterat som en avvikelse i testmiljön; ingen ändring har gjorts för att kringgå tokenkontrollen.

## Publicering och verifiering på staging

- `npm run deploy:staging` lyckades. Fem nya eller ändrade filer laddades upp.
- Publik HTML svarar HTTP 200 och hänvisar till det nya huvudpaketet `index-o_9StkRD.js`. Även den publicerade service workern innehåller den nya versionen. CSP och `noindex` finns kvar.
- `npm run test:staging`: **6/6 godkända** mot staging-databasen.
- Webbläsartester efter publicering: **4/4 godkända**, Android- och iPhone-emulering. Inloggning, introduktion, träningspass och faktisk synk till staging-databasen samt publik vetenskapssida passerade. Service worker registrerad och inga CSP-fel i träningsflödet.
- Installerade appar visar **Ny version finns** och kan laddas om med **Uppdatera**. Den mekanismen raderar inte den lokala databasen.

## Återstående verifiering inför bredare användning

- Fysiska iPhone/Android, installerad PWA, mobilens tangentbord och mejlapp samt VoiceOver/TalkBack. Webbläsaremulering ersätter inte detta.
- Extern mejlleverans och faktisk SMTP-konfiguration är inte kontrollerade här. Projektets tidigare releaseprotokoll anger att egen SMTP återstår.
- Huvudpaketet för JavaScript ger fortsatt byggets storleksvarning. Första laddningen på långsamt mobilnät behöver mätas separat.

Se [releasegrindarna](RELEASEGRINDAR.md) för projektets övriga kvarstående krav. Denna rättning innebär inget nytt releasegodkännande.
