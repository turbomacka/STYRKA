# Förslag: en lugn och tydlig introduktion på mobilen

Status: designförslag, inte implementerat eller publicerat. Befintlig React-applikation och beräkningslogik är oförändrade. En klickbar skiss av styrkedelen har tagits fram i samtalet.

## Problem i nuvarande flöde

Granskade komponenter: `src/ui/screens/Onboarding.tsx` och `src/ui/components/StrengthInputs.tsx`.

- Introduktionens tredje steg visar tre övningspaneler samtidigt. Varje panel kan växa till flera formulär.
- Val av uppgiftstyp lägger direkt till ett tomt utkast. Valideringen visar då ett fel innan användaren har hunnit skriva.
- ”Hoppa över – jag vet inte” tömmer alla utkast för övningen. Det är en raderingshandling för den som redan fyllt i något.
- ”Hoppa över alla styrkeuppgifter” leder vidare utan att använda någon av styrkeuppgifterna, även om användaren redan matat in värden.
- ”Intro 3/4” anger huvudsteget men ger ingen tydlig bild av hur långt man kommit med de tre övningarna.
- Framstegen ligger i komponenttillstånd. Ett kontobundet utkast behövs för att säkert fortsätta efter omladdning, utloggning eller avbrott utan att visa en annan användares uppgifter.

## Föreslaget flöde

Behåll fyra huvuddelar: **Träning → Utrustning → Styrka → Anpassning**. Visa deras namn, avslutade delar och aktuell del. Undvik en procentsiffra som påstår att tre fjärdedelar är färdiga när styrkedelen just har börjat.

1. **Träning:** pass per vecka, tid och erfarenhet. Befintliga standardvärden kan behållas. Vuxenbekräftelsen kräver fortfarande ett aktivt val.
2. **Utrustning:** börja med ”Standardgym” och en tydlig möjlighet att ändra utrustningen. Lyftprioriteringar och dragvariant finns under ”Anpassa upplägget”; inga funktioner tas bort eller standardvärden ändras i smyg.
3. **Styrka:** kort valvy, sedan en övning åt gången.
4. **Anpassning:** möjlighet att lägga till begränsningar. Hälsosamtycke efterfrågas där hälsouppgifter faktiskt ska lämnas. Ingen automatisk opt-in. Avsluta med ”Skapa min plan”.

### Styrkedelen

Första vyn:

> Vad brukar du lyfta?
>
> Det här är en startpunkt. Du kan ändra senare.
>
> Lägg till styrkeuppgifter
>
> Fyll i senare

Det extra valet gör frivilligheten tydlig innan några fält visas. Väljer man senare ska redan bekräftade värden behållas; handlingen hoppar över det återstående arbetet. Detta behöver testas med nya användare eftersom även en kort extra vy har en kostnad.

Därefter visas **Knäböj**, **Bänkpress** och **Marklyft** i egna vyer. En liten, namngiven indikator visar aktuell övning och vilka som fått uppgifter eller hoppats över. En överhoppad övning markeras med ”–”, inte med samma bock som en angiven uppgift.

För varje övning väljer användaren först en typ:

- Ett träningsset — vikt och repetitioner.
- Max för 1 repetition — uppmätt eller uppskattat.
- Max för 3 repetitioner — vikten man klarar tre gånger.

Valet öppnar ett eget formulär. Bara relevanta fält visas. Det finns ingen horisontell svepkarusell och ingen uppsättning konkurrerande formulär. Den vanliga vägen är **välj typ → fyll i → Fortsätt**. Fortsätt sparar uppgiften innan nästa vy öppnas.

”Lägg till en uppgift” är en sekundär handling när den aktuella uppgiften är giltig. Den bekräftar den aktuella uppgiften och återvänder till typvalet för samma övning. Värden från olika typer behålls oberoende av varandra. Ingen extra obligatorisk bekräftelse behövs mellan sparandet och nästa övning.

### Korta texter, tydliga handlingar

| Situation | Text och beteende |
| --- | --- |
| Inget ifyllt för övningen | ”Fyll i senare”, som sekundär handling längst ned i samma handlingsyta på varje övning |
| Fält korrekt ifyllda | ”✓ Redo att fortsätta”, betyder giltigt formulär, inte verifierad styrka eller sparat |
| Primär handling | ”Fortsätt” |
| Bekräftad lokal lagring | Bock vid föregående övning och kort ”Knäböj sparat” på nästa vy |
| Fel vid lagring | Stanna kvar, behåll texten och erbjud nytt försök. Ingen sparbock |
| Fler uppgifter | ”Lägg till en uppgift” |
| Ändra sig | ”Tillbaka” eller ”Byt uppgift”; bevara utkast och bekräftade värden |
| Ta bort uppgift | Separat uttrycklig handling vid redigering, med möjlighet att ångra |
| Okänd startstyrka | ”Du väljer startvikt på gymmet.” |

Datum och repetitionsreserv är valfria detaljer. Klassificeringen uppmätt/uppskattad maxstyrka ska vara tydlig och aldrig antas vara uppmätt. Befintlig begränsning till 1–8 repetitioner och regeln att okänd RIR inte ger en maxskattning måste fortfarande respekteras. Beskrivande känslosvar får inte översättas till påhittat RIR som en del av en designändring.

### Trygghet att gå vidare — komplettering 2026-10-17

Användaren ska kunna uppfatta uppgifterna som en ändringsbar startpunkt. Visa den lugna raden ”Det här är en startpunkt. Du kan ändra senare.” en gång vid styrkedelens början. Ingen extra informationsruta, bekräftelsedialog eller ny sida behövs för detta.

- I vyn för uppskattad maxstyrka: ”En uppskattning räcker.” Möjligheten att ange en uppskattning innebär inte att användaren måste gissa eller provlyfta en maxvikt. Uppmätt och uppskattat hålls fortfarande åtskilda.
- ”Fyll i senare” är ett vanligt alternativ. Översikten visar ”Kan fyllas i senare” utan varning eller röd markering. Frivilliga uppgifter som saknas blockerar inte att planen skapas.
- ”✓ Redo att fortsätta” bekräftar att inmatningen kan användas, inte att appen vet att styrkan är korrekt eller att uppgiften redan sparats. Använd inte beröm, prestationsbetyg eller en kontrollbock som påstår fysiologisk säkerhet.
- ”Fortsätt” ersätter ”Spara och fortsätt”. Handlingen sparar fortfarande lokalt innan användaren går vidare; ett fel lämnar kvar uppgifterna och visar en konkret möjlighet att försöka igen.
- Tillbaka och Ändra ska finnas där användaren förväntar sig dem. Ett påbörjat utkast bevaras vid byte av uppgiftstyp. Bekräftade värden får aldrig raderas av ”Fyll i senare”.
- Feltexter beskriver vad som behöver ändras i det aktuella fältet. Inga tomma fält markeras fel innan de använts, och den inskrivna texten behålls. Detta följer principen att både giltiga och ogiltiga svar bevaras vid valideringsfel i [GOV.UK:s felmeddelandemönster](https://design-system.service.gov.uk/components/error-message/).

Den korta texten måste motsvaras av funktion. Att korrigera en profiluppgift ska påverka kommande förslag enligt appens regler, utan att skriva om historisk träning. En uppskattning presenteras inte som ett uppmätt max. Vi lovar inte att vilken inmatning som helst alltid ger rätt eller säker belastning.

Utvidga användartestet med en person som inte känner till sitt max: kan personen gå vidare utan att gissa, förstår personen att uppgiften kan ändras och hittar personen hur man rättar ett tidigare svar? Det är beteendet som ska verifieras; en lugnande formulering är inte i sig bevis för minskad tvekan.

Skissens komplettering är kontrollerad i Chromium och WebKit: utkastet ligger kvar efter byte av uppgiftstyp, ”Fyll i senare” behåller redan bekräftade värden, obesökta fält ger inga fel och formuläret visar ”Redo att fortsätta”. Smal bredd och mörkt läge fungerar fortsatt. Detta verifierar skissens beteende, inte lagringen i den publicerade appen eller faktisk minskning av användaroro.

## Telefonens beteende

- En huvuduppgift per vy; relaterade fält, som vikt och repetitioner, hålls ihop.
- Synliga fältetiketter och enheter, minst 16 px fälttext, svenska decimaler samt stöd för inklistring.
- Begär decimaltangentbord för vikt och numeriskt tangentbord för repetitioner. Använd tangentbordets nästa/klart där plattformen stöder det. Ingen egen ritad knappsats.
- Öppna inte tangentbordet automatiskt när en sida visas. När användaren fokuserar fältet får tangentbordet inte täcka fält, felmeddelande eller fortsättningshandling.
- Handlingsytan ska anpassas till det synliga utrymmet och safe area. Undvik en fast fot som hamnar bakom iOS-tangentbordet. Testa verklig Safari och installerad PWA, inklusive mindre telefon och liggande läge.
- Ingen automatisk sidväxling när ett tal råkar bli giltigt. Användaren bestämmer när inmatningen är klar.
- Visa fel efter att ett fält har lämnats eller användaren försöker gå vidare. Ett korrekt viktfält får inte orsaka fel på ett repetitionsfält som ännu inte har besökts.
- Minst 48 px primära tryckytor, kort tryckrespons och reducerad rörelse. Fokus ska flyttas kontrollerat mellan vyerna, och webbläsarens Tillbaka ska fungera.
- Bevara ett kontobundet utkast och skilj mellan utkast, bekräftat lokalt sparande och eventuell synk. ”Sparat” visas först efter lyckad skrivning.

## Teknikförslag

Använd **React Aria Components** för tillgängliga formulärprimitiver i den befintliga React-/TypeScript-appen. Behåll STYRKAs CSS-tokens och visuella komponentidentitet. Inför inte ett nytt appskal eller ett tungt animationsbibliotek.

Relevanta komponenter är NumberField/TextField, Button, Form, RadioGroup, Disclosure och ProgressBar. Numeriska fält ska använda svensk locale, stänga av oavsiktliga hjuländringar och validera utan att tyst snäppa eller ändra användarens registrerade styrkevärde. Lokaliserad inmatning och lämplig validering kräver konfiguration och tester; biblioteket löser inte hela mobilupplevelsen automatiskt.

Separera flödets tillstånd från den återanvändbara inmatningskomponenten, eftersom samma uppgifter också redigeras i Profil. Återanvänd `readStrengthDrafts` och `resolveStrengthInputs`. Inga beräkningsregler behöver ändras för detta förslag. Inventera paketstorlek och dubbel funktionalitet innan biblioteket införs.

## Underlag och verifiering av skissen

- [GOV.UK: Question pages](https://design-system.service.gov.uk/patterns/question-pages/) — en tydlig fråga/uppgift per sida, fungerande tillbaka och bibehållna svar.
- [Apple: Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data) — begränsa inmatningsarbete, tydliga fält och begriplig validering.
- [React Aria: NumberField](https://react-aria.adobe.com/NumberField) — lokaliserad talhantering, format och explicit valideringsbeteende.

Skissens huvudsakliga interaktioner är kontrollerade i Chromium och WebKit: eget formulär, decimalinmatning, ingen förtida feltext, klar-feedback, två separata styrkeuppgifter, tillbaka utan värdeförlust och överhoppad övning. Mörkt läge och smal bredd fungerar. Axe rapporterade inga WCAG A/AA-träffar i den kontrollerade sammanfattningsvyn. Detta är inte en fullständig tillgänglighetsgranskning.

Skissen använder lokala demonstrationsinteraktioner och är inte ansluten till appens lagring. React Aria är föreslaget för implementationen, inte installerat i appen genom detta designarbete. Verkliga mobilers tangentbord, VoiceOver och användbarhet behöver testas när flödet implementeras. Förslag till kort användartest: ange en uppgift, lägg till en till, ändra sig, hoppa över en övning och återuppta efter avbrott.
