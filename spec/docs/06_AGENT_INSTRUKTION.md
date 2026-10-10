# 06 · Uppdrag till kodagent

## Systemuppdrag
Bygg en vältestad, svensk, mobilförst PWA med namn STYRKA enligt kontrakten i detta paket. Arbeta självständigt med tekniska detaljer, men ändra **inte** evidensklassade eller användardefinierade träningsregler utan dokumenterad produktändring. V1 är träningsrelaterad wellness, inte medicinsk diagnostik eller behandling. Målet är att nå samtliga kvalitetsgrindar på staging och lämna en färdig, testad utvecklingsprodukt. Publicering till allmänheten kräver separat godkännande.

### Obligatorisk läsordning
`README.md` → `docs/01...` → `docs/02...` → `src/decision_engine.ts` → `docs/03...` → `db/001_schema.sql` → `docs/04...` → `docs/05...` → `docs/07...` → `docs/08...` → fixtures/tests.

### Konkreta arbetsuppgifter i ordning
1. Skapa och versionshantera React/TS/Vite PWA; pin versions; konfigurera ESLint, tsc, Vitest, Playwright.
2. Implementera schema enligt migration; lokalt Supabaseprojekt, negativa RLS tests och idempotent `apply_set_mutation` med ägarkontroll, revisionslogik och transaktion.
3. Testa referensmotor och utöka med: assisterade chins, övningsmaskinsvarianter, input från historik, brutna pass, kombinationsregler, planering och försiktig återstart.
4. Implementera schemagenerator för samtliga frekvenser och tidsbudgetar, strikt ordning för constraints och prunings. Spontanpass med samma motor.
5. Implementera IndexedDB local-first med atomisk kö, konfliktlösning och dataisolering vid logout.
6. Implementera vyerna S01–S16 med designsystem, svenska texter och tillgänglighet.
7. Implementera grafer som skiljer mätt från estimerad maximal styrka och anger datakvalitet.
8. Skapa installationsguide, dataintegritetstext, säkerhetstestrapport, release runbook och exportfunktion.
9. Kör enhet, integration, e2e, tillgänglighet och manuellt mobiltest med skärmbilder.
10. Rapportera allt arbete med länkar till commit, exakta testresultat, identifierade begränsningar, releasegrindar och eventuella blockerare.

### Autonomiregler
- Fatta tekniska lågriskbeslut själv.
- Vid motsägelse mellan träningsregler: prioritera uttryckliga användarspärrar och avstå osäker rekommendation.
- Fråga projektägaren endast om ett juridiskt beslut, kontoåtkomst, betalning, faktisk extern lansering, förändrad produktdefinition eller konflikt som inte kan lösas av normhierarkin kräver det.
- Skapa aldrig fiktiva kliniska evidensvärden. Märk nya heuristiker H och lägg till acceptanstest.
- Använd syntetiska testanvändare. För aldrig privat hälsodata till externa AI eller logganalystjänster.
- Fyll aldrig kod luckor med antagandet att `service_role` får placeras i klienten.

### Slutrapportformat
1. Vad som byggts och URL till staging om sådan existerar.
2. Vilka acceptanstestfall passerar, vilka fallerar.
3. Aktuell algoritmversion och alla H värden.
4. Säkerhetsgranskning och RLS negativtest med bevis.
5. Browser/device tests inklusive offline.
6. Resterande juridiska och säkerhetsgrindar före publik release.
7. Vad produktägaren konkret behöver godkänna, utan onödiga önskemål.

## Klar när
Kod, migrationsfiler, testresultat, dokumentation och en prövad stagingprodukt finns. Demonstrera att två användare kan registrera hela programmet separat. Visa att systemet aldrig automatiskt rekommenderar två tunga squat/deadlift vid aktiva parregler och att en hälta spärrar berörd progression. Färdig prototyp är inte samma sak som regulatoriskt godkänd tjänst.
