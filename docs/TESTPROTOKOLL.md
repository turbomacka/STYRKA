# Testprotokoll STYRKA (2026-10-10)

Miljö: Windows 10, Node 22.13, lokal Supabase (Postgres 17.11, GoTrue 2.197, PostgREST 16.4) i Docker, Playwright 1.64 (Chromium, WebKit 27.2). Alla data syntetiska.

## Sammanfattning av senaste körning

| Nivå | Kommando | Resultat |
|---|---|---|
| Referenssmoke (paketets egen) | `npm run test:reference` | **26/26 PASS**, SHA256 för `decision_engine.ts` = manifest |
| Enhet + property + offline/synk | `vitest --project unit` | **97/97 PASS** (inkl. 600 + 300 slumpade profiler, 2000 ekvivalensfall) |
| Komponenter (jsdom + axe) | `vitest --project ui` | **8/8 PASS** |
| DB/RLS/RPC/demo mot riktig Supabase | `vitest --project db` | **28/28 PASS** (se not om intermittent timeout nedan; ytterligare en gång föll filens förberedelse i en körning direkt efter omstart av lokal Supabase – ej reproducerat i tre efterföljande körningar) |
| E2E | `playwright test` | **58 PASS, 2 SKIP** (WebKit: service worker-offline och Tab-fokus stöds inte av WebKit-emuleringen på Windows) |
| Inloggning (del av E2E, alla 3 profiler) | `e2e/auth.spec.ts` | skapa konto + bekräftelse, befintlig e-post, fel lösenord/validering, glömt lösenord via kod och länk, länk öppnad i **annan webbläsare** (bekräftelse och återställning), konto utan lösenord, obekräftad inloggning, byt lösenord, inloggning via e-post utan lösenord |
| Staging (manuellt) | `npm run test:staging`, `playwright -c playwright.staging.config.ts` | 5/5 och 2/2 mot styrka-staging |
| Lint / typecheck / audit | | 0 fel, 0 sårbarheter (`npm audit`) |

**Not (ärligt redovisat):** I en av tre upprepade körningar av DB-sviten fick testet "10 parallella identiska anrop" en `statement timeout` från Postgres. 60 efterföljande rundor reproducerade det inte. Felet klassas nu som transient (`DB_UNAVAILABLE`) och klientens kö försöker igen med samma eventId, vilket är idempotent – ingen dubblett kan uppstå. Rotorsaken bedöms som I/O-stall i Docker/WSL men är inte bevisad; bör bevakas i staging.

## Acceptanstest 04 §2.1

Status: ✅ automatiskt verifierat · ◐ delvis automatiskt, manuell kontroll återstår · ❌ ej verifierat

| # | Krav (kort) | Status | Bevis (testfil › test) |
|---|---|---|---|
| 1 | 3RM 90 → 99; felaktig vikt förkastas | ✅ | unit/acceptance_engine › 01; reference_engine; fixtures P01 |
| 2 | Novis 100 bänk heavy → 65 kg 2×8 | ✅ | acceptance_engine › 02 (motor + planerare); P02 |
| 3 | Medelvan → 77,5 kg 3×5; byte-identiskt | ✅ | acceptance_engine › 03; property (600 profiler, JSON-identitet) |
| 4 | Okänd max ⇒ kg=null, CALIBRATION_REQUIRED | ✅ | acceptance_engine › 04; P04; UI SetRow kalibrering |
| 5 | Assisterade chins ej skivstångs-1RM | ✅ | acceptance_engine › 05; property (estimatedOneRM null) |
| 6 | Minskad assistans = progression | ✅ | acceptance_engine › 06; demo (40 → 15 kg assistans) |
| 7 | Marklyft 2 lätta + knäböj 4 tunga utan parregel | ✅ | acceptance_engine › 07 |
| 8 | Knäböj+marklyft tunga avvisas vid parregel | ✅ | acceptance_engine › 08 (även relativ last ≥75 %); P05/P06 |
| 9 | Saknad utrustning ⇒ ingen blockerad maskin | ✅ | acceptance_engine › 09; property |
| 10 | Mål uppnådda RIR 3 ⇒ reps+1 | ✅ | acceptance_engine › 10 |
| 11 | Bandtopp ⇒ +1 steg, åter till minreps | ✅ | acceptance_engine › 11 |
| 12 | RIR 0 ⇒ ingen ökning | ✅ | acceptance_engine › 12 |
| 13 | RIR saknas ⇒ två kontrollerade pass | ✅ | acceptance_engine › 13 |
| 14 | 1 miss håll; 2 missar minska | ✅ | acceptance_engine › 14 |
| 15 | Tidsavbrott ≠ misslyckande | ✅ | acceptance_engine › 15; P12 |
| 16 | Dålig teknik ⇒ ingen ökning | ✅ | acceptance_engine › 16 |
| 17 | 20 h efter tung knäböj ⇒ ingen tung knäböj spontant | ✅ | acceptance_engine › 17; P08; property spontanpass |
| 18 | 72 h ⇒ ingen extra vikt pga tid | ✅ | acceptance_engine › 18 |
| 19 | 18 d ⇒ −5 %; 30 d ⇒ −10 % + set | ✅ | acceptance_engine › 19 (motor + planerare) |
| 20 | Ny hälta ⇒ review_required | ✅ | acceptance_engine › 20 (ingen tidsbaserad borttagning); offline_sync › 20/45 appflöde; P07 |
| 21 | Restriktion framåt, historik oförändrad | ✅ | acceptance_engine › 21; offline_sync › 43/21 |
| 22 | 20 min ⇒ ryms eller anges ej rymligt | ✅ | acceptance_engine › 22 (alla frekvenser × rotationer); property |
| 23 | För stort minsta steg ⇒ håll + kod | ✅ | acceptance_engine › 23 |
| 24 | 102,5 ⇒ 102.500; komma = punkt | ✅ | acceptance_engine › 24; db › decimal; ui › SetRow |
| 25 | 1–7 och 15–120 valideras | ✅ | acceptance_engine › 25; db › DB-gränser |
| 26 | Frekvensändring mitt i rotation | ✅ | offline_sync › 26 |
| 27 | Spontanpass ersätter bara med aktivt val | ✅ | offline_sync › 27; fixtures_and_planner › "Räkna som ordinarie" |
| 28 | Ingen actual före lokal commit | ✅ | offline_sync › 28 (QuotaExceededError injiceras; set + kö rullas tillbaka) |
| 29 | Flygplansläge hela passet + omstart + nät | ✅ | offline_sync › 29; **E2E Chromium** offline_privacy › 29 (riktig SW-omladdning offline, verifierat i Postgres) |
| 30 | Dubbelklick + retries ⇒ en post | ✅ | db › 30/P11, 10 parallella; offline_sync › 30 (förlorad ack) |
| 31 | Samtidiga ändringar ⇒ konflikt | ✅ | db › 31; offline_sync › 31 (två enheter, båda lösningsvägar) |
| 32 | Logout med pending ⇒ varning, isolering | ✅ | offline_sync › 32; E2E alla tre projekt |
| 33 | Två konton: all åtkomst nekas | ✅ | db › 33/P10 (12 tabeller × SELECT/INSERT/UPDATE/DELETE) |
| 34 | Främmande session_id i barns FK nekas | ✅ | db › 34 |
| 35 | Export omfattar allt relevant | ✅ | offline_sync › 35 |
| 36 | Raderat samtycke ⇒ inga nya symtom | ✅ | db › 36 (RLS); offline_sync › 36 (köade poster når aldrig servern) |
| 37 | Ångra Klart ⇒ korrekt historik | ✅ | offline_sync › 37; E2E core_flow |
| 38 | VoiceOver och TalkBack | ◐ | Automatiskt: aria-etiketter per setrad, axe 0 allvarliga brott på S01–S16 (ljust + mörkt). **Manuell skärmläsartest på riktig iPhone/Android ej utförd.** |
| 39 | 200 % textzoom och reducerad rörelse | ◐ | Automatiskt: reflow 320 CSS px utan horisontell scroll, reducerad rörelse emulerad. **Manuell QA på enheter ej utförd.** |
| 40 | Skärmläsarstatus sparat/synkat utan upprepning | ◐ | Automatiskt: aria-live annonserar "Set 1 sparat" en gång (a11y › tangentbord). Manuell lyssning ej utförd. |
| 41 | Inget tvingat 1RM-försök | ✅ | acceptance_engine › 41; intro tillåter "Kalibrera" |
| 42 | Loggade set försvinner aldrig vid partial | ✅ | offline_sync › 42 |
| 43 | Tung benkombination efter offline-restriktion | ✅ | offline_sync › 43/21; acceptance_engine › 43 |
| 44 | Flera parregler ⇒ ingen oändlig loop | ✅ | acceptance_engine › 44 (cykliska regler); property |
| 45 | Symtom utan alternativ ⇒ neutralt tomläge | ✅ | acceptance_engine › 45 (ordinarie + spontan) |

**Resultat:** 42 av 45 automatiskt verifierade. 38–40 kräver manuell provning med skärmläsare och textzoom på riktiga enheter (mänsklig uppgift).

## Fixturfall (`fixtures/cases.json`)

P01–P08, P12: `tests/unit/fixtures_and_planner.test.ts`. P09 (offlineuppspelning 10 händelser ⇒ 10 unika), P10 (konton A/B) och P11 (dubbelklick ⇒ 1 set): `tests/db/rls_and_mutation.test.ts` mot riktig databas.

## Interaktionsbudget (01 §3.3) – mätt i E2E

| Krav | Mätt |
|---|---|
| Förifyllt set: 1 tryck | 1 (`Klart`) |
| Endast reps: ≤ 2 handlingar exkl. siffror | 2 (tryck på reps → `Klart`) |
| Idag → första set: ≤ 2 tryck | 2 (`Starta dagens pass` → `Starta`) |
| Idag → spontanförslag: ≤ 3 tryck | 2 till förslag, 3 till första set |

## Demo (STARTA_HAR_KODAGENT)

[docs/evidence/demo_two_users.md](evidence/demo_two_users.md): två oberoende konton, 36 ordinarie pass vardera + ett spontanpass, genom hela applikationslagret mot riktig lokal Supabase. Verifierat i databasen: utförda set på server = lokalt för båda, latsdrag endast hos A, assisterade chins endast hos B, 0 pass med tung knäböj + tung marklyft hos B (parregel), 0 korskopplade rader, B:s offlineperiod (pass 5–8) synkad utan förlust, spontanpasset ändrade nästa ordinarie rekommendation (tung marklyft → lätt, skäl `RECENT_LOWER_HEAVY`) utan att flytta rotationen.

## Skärmbilder

`docs/evidence/screenshots/<android-chrome|iphone-webkit|desktop-keyboard>/S01…S16*.png`, mörkt läge (`*-morkt.png`) och `reflow-320-S08.png`. Emulering ersätter inte provning på riktiga enheter.

## Kvar att testa manuellt (kräver människa/enheter)

1. Safari på riktig iPhone och Chrome på riktig Android: hela passet, installation som PWA, flygplansläge, omstart, dålig täckning.
2. VoiceOver och TalkBack på kritiska flöden (S06–S11), antal tryck, feltryck och tid att ångra felset (10 §4).
3. 200 % systemtextstorlek och reducerad rörelse på enheterna.
4. Användartest med minst 2 personer × 12 pass (04 §2.3).
