# Överhoppade övningar och godkänd anpassning av nästa pass

Godkänt av produktägaren i samtalet 2026-10-12: "Bra kör på", efter förslag att införa orsaker för överhopp och begripliga planändringar. Denna ändring kompletterar den deterministiska planeraren och träningsdagboken. Den ändrar inte viktprogressionens regler.

## Produktregler

1. I Träna kan användaren hoppa över återstående arbetsset i en övning och välja Hann inte, Utrustningen upptagen, Besvär eller ingen angiven orsak. Valet är frivilligt och kan korrigeras. Redan utförda set bevaras. Vid Avsluta finns en valfri sektion för helt ogjorda övningar.
2. Endast helt ogjorda, fortfarande aktuella övningar från det senaste avslutade passet kan ge ett förslag, och endast vid tidsbrist eller upptagen utrustning. Övningsbytta original och senare utförda övningar ger inget förslag. Besvär/ingen orsak ger ingen uppsamlingsplan. Besvär kräver befintligt hälsosamtycke och är inte en automatisk symtomdiagnos; UI hänvisar till befintlig rapportering.
3. Ett frivilligt förslag visas åt gången. Nästa ordinarie pass kan byta ut exakt en kompletterande, icke prioriterad övning. Huvudövningen och övriga övningars nivå och setantal bevaras. Rotationen fortsätter. Senare pass ändras inte av detta engångsval.
4. Använd den befintliga planeraren för belastning, utrustning, varianter, restriktioner, återhämtning, parkontroller, tidsbudget och slutlig invariantkontroll. Gränser kring nybörjarset och tungt marklyft gäller även den införda övningen. Ett tidigare variantsamband bevaras för parkontrollen. Ingen ny viktomräkning införs.
5. Kandidater prövas deterministiskt i sparad händelseordning. Ersättbara moment prövas från slutet av nästa pass. Första giltiga kandidat visas. Ingen användardata eller revision skrivs vid visning. Ingen slump används för övningsval.
6. Förslaget visar orsak, tillagd övning, borttagen övning, föreskriven dos och uppskattad total tid. Godkännande krävs. Före godkännandet revalideras aktuellt underlag atomärt. Föråldrade förslag nekas. Valet kan ångras fram till passtart.
7. Om övningen redan ingår i nästa pass läggs inga extra set till. Om inget lämpligt byte finns visas ett neutralt besked och grundplanen fortsätter. Inga missade moment samlas till en växande träningsskuld.
8. Ett accepterat val gäller exakt en programversion och rotationsplats. Nya begränsningar eller ändrade förutsättningar kan stoppa det; då visas grundplan och förklaring. Ett startat pass har kvar sitt accepterade snapshot. Ett tidigare förhandsvisat val som återkallats får inte startas som om det fortfarande vore godkänt.
9. Idag, förhandsvisningen och Plan visar samma aktiva val. En planrevision registrerar den godkända förändringen med en begriplig förklaring. Historiska pass ändras inte.

## Lagring och synk

- Additiv lokal Dexie-version 5 och servermigration `20261012084242_exercise_skip_events.sql`.
- `exercise_skip_events` är en logg av val: skipped/accepted/dismissed. Klienten kan inte uppdatera tidigare serverhändelser. Händelser sorteras efter tid och därefter ID så att enheter kommer överens; lokala nya val får monotont ökande tid. Bara ett accepterat val används per målplats.
- RLS för ägare, sammansatta FK till källa och program, kontroll att övningsraden tillhör rätt pass samt samtyckesvillkor för besvär. Endast den egna användaren kan läsa, lägga till eller radera sina händelser.
- Val och överhopp sparas lokalt med köpost i samma transaktion. Idempotent synk och hämtning på annan enhet stöds. Nya händelser får inte återinföra raderade pass eller hälsodata.
- Export inkluderar valen. Radering av källpass/konto tar bort dem. Radering av hälsorelaterade uppgifter tar bort samtliga skäl och härledda beslut.
- Tillagda pass använder `STYRKA-PLANNER/1.1.0` i sitt snapshot. Befintliga planer utan detta val ger samma resultat som tidigare. Metodregeln `overhoppad-ovning` dokumenterar beteendet som ett produktval, utan nytt forskningspåstående.

## Verifiering

Applikationstester täcker frivillig/deterministisk förhandsvisning, endast nästa plats, ångra, befintlig övning, besvär, ofullständiga set, ändrat underlag, restriktioner, tidsbudget, offline, export, radering och återkallat förhandsförslag. Databastester täcker verklig synk mellan separata enheter, RLS, immutabilitet, samtycke och raderingskaskad. Mobiltester täcker hela valet, offlineläge, omladdning, planvisning, ångra och tillgänglighet.
