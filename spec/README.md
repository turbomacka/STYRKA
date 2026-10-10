# STYRKA · utvecklingspaket v2.0

**Status 2026-10-10:** Komplett implementeringskontrakt för en **avgränsad v1**, färdigt att ge till en kodagent för utveckling i testmiljö. Varken publicering, klinisk säkerhet eller GDPR-efterlevnad är därmed verifierade. Dessa har separata releasegrindar.

## Starta här
1. `docs/01_PRODUKT_OCH_UX.md` – funktioner, prioriteringar, skärmar och beteenden.
2. `docs/02_ALGORITM_OCH_PLANERING.md` – normativ beslutstabell, exakta regler, pseudokod och tillämpningsgränser.
3. `docs/03_DATA_API_SAKERHET.md` – datamodell, offline, behörighet, synkronisering, GDPR och medicinteknisk avgränsning.
4. `docs/04_TEST_ACCEPTANS_DRIFT.md` – testplan, kvalitetsgrindar, driftsättning och felhantering.
5. `docs/05_EVIDENS_OCH_BESLUT.md` – primärkällor, evidensnivå, avvägningar och öppna frågor.
6. `docs/06_AGENT_INSTRUKTION.md` – stegvis implementeringsuppdrag och definition av färdigt.
7. `src/decision_engine.ts` – körbar referens för delar av algoritmen. Anges som normativ där dokumenten hänvisar till specifik funktion.
8. `db/001_schema.sql` – versionsbar migrationsbas för Supabase Postgres med RLS. Ska verifieras mot lokal testdatabas före användning.
9. `fixtures/cases.json` och `tests/engine.test.ts` – testfall, inklusive säkerhetsspärrar.
10. `docs/07_SPÅRBARHET.md` – krav till tester och leveranser.
11. `docs/08_EXAKT_PLANERARE.md` och `fixtures/planner_templates.json` – deterministiska regler för schemageneratorn.
12. `scripts/verify_core.mjs` – oberoende smoke-kontroll av referensmotorn.
13. `QA_STATUS.md` – exakt vad som har respektive inte har verifierats.

11. `docs/08_EXAKT_PLANERARE.md` + `fixtures/planner_templates.json` – fullständiga startsekvenser och deterministic templateval för 1–7 pass per vecka.
12. `docs/09_IDEMPOTENT_TRANSAKTION.md` – atomiskt mutationprotokoll och konfliktbeteende.
13. `docs/10_UI_KOMPONENTER_OCH_TEXTER.md` – komponentkontrakt, tillgänglighet och svenska UI texter.

## Normhierarki
1. Säkerhetsgränser, aktivt användarval och användarsatta blockeringsregler i 02/03.
2. Explicit numerisk regel i 02 och referensimplementation i `src`.
3. System- och UX-kontrakt i 01/03.
4. Testernas faktiska förväntade resultat i fixtures när de överensstämmer med 1–3.
5. Bakgrund och forskningsresonemang i 05.

Vid konflikt: stoppa och dokumentera issue. Gör inte medicinska eller finansiella antaganden för att ”fixa” ett test.

## Vad detta paket levererar / inte levererar
Paketet gör tekniska och produktmässiga vägval explicit. Det innehåller ett startbart implementationsuppdrag, en referensmotor, databasstruktur och testunderlag. Det är **inte** en färdig webbapp, inte en kliniskt validerad träningsalgoritm och inte en utförd regulatorisk bedömning. Utrullning till allmänheten kräver de granskningar som anges i releaseplanen.

## Snabbkontroll av referensmotorn
Kör `node scripts/verify_core.mjs` i projektmappen om `tsc` finns installerat. Detta kompilerar den fristående beräkningsmotorn och kör 21 deterministiska kontroller utan externa npm-paket. Den fullständiga testsviten kräver `npm install` och ytterligare implementering av app, planeringsmotor och integrationer.
12. `docs/09_IDEMPOTENT_TRANSAKTION.md` – atomiskt mutationprotokoll och konfliktbeteende.
13. `docs/10_UI_KOMPONENTER_OCH_TEXTER.md` – komponentkontrakt, tillgänglighet och svenska UI texter.
