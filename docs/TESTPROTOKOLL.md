# Testprotokoll STYRKA (uppdaterat 2026-10-11, inkl. STYRKA-CR-2026-10-10-01)

Miljö: Windows 10, Node 22.13, lokal Supabase (Postgres 17.11, GoTrue 2.197, PostgREST 16.4) i Docker, Playwright 1.64 (Chromium, WebKit 27.2). Alla data syntetiska.

Senare rättning ovanpå `97ee461`, publicerad på staging 2026-10-11: se [Rättningar efter granskningen](RATTNINGAR_2026-10-11.md) för F1–F6, förenklad mobilinloggning och aktuell verifiering. Stagingresultaten i tabellen nedan gäller den tidigare versionen.

## ÄA-PLAN-001 "Min träningsplan" (2026-10-11)

| Nivå | Kommando | Resultat |
|---|---|---|
| Referenssmoke | `npm run test:reference` | **26/26 PASS** |
| Enhet, komponent, DB | `npm test` | **236/236 PASS**, 22 filer (inkl. 2 100-planers regression mot `3ec01ef` – oförändrad) |
| E2E | `playwright test` | **82 PASS, 2 SKIP** (samma två WebKit-undantag), 6,4 min |
| Lint / typecheck | | 0 fel |

| ID | Test | Resultat |
|---|---|---|
| PL01 | unit `training_plan` › 36 pass i A/B/C-ordning, inga datum, ca vecka 18 | PASS |
| PL02 | unit › pass 20 strukturellt utan `kg`; E2E `plan` › "Vikt beräknas närmare passet", ingen kg-siffra | PASS |
| PL03 | unit › nästa pass = befintlig rekommendation med motor-/regelversion; E2E › "Rekommenderad vikt", öppnas i förhandsvisningen | PASS |
| PL04 | unit › ingen vikt utan uppskattning, kalibreringsläge i hela planen | PASS |
| PL05 | unit › verkliga set i Genomförda, revision `SESSION_COMPLETED`, gamla set oförändrade; E2E | PASS |
| PL06 | unit › delvis pass: bara utförda set; E2E › "Delvis genomfört", "Inte utfört" | PASS |
| PL07 | unit › spontanpass: revision `EXTRA_SESSION_COMPLETED`, rotation/nummer oförändrade, nästa rekommendation påverkas | PASS |
| PL08 | unit › "räkna som ordinarie" (befintligt villkor uppfyllt): revision `EXTRA_COUNTED_AS_PLANNED`, nummer +1, andra försök nekas | PASS |
| PL09–PL10 | unit › 3 pass/vecka och 25 min: ny sekvens, genomförda pass/nummer/snapshots/set identiska | PASS |
| PL11 | unit › kombinationsregel respekteras i alla 72 framtida pass | PASS |
| PL12 | unit › knäböj → frontböj framöver: frontböj i planen (kalibrering), knäböjens set orörda | PASS |
| PL13–PL14 | unit › anteckning på pass 25 följer passplatsen; passanteckning ändras/raderas utan att set påverkas; HTML som ren text; E2E | PASS |
| PL15 | unit › tre revisioner, äldre öppnas oförändrade med orsak; E2E › "Tidigare planversioner" | PASS |
| PL16–PL17 | unit › upprepad öppning/expansion skapar ingen revision; två månader utan träning ⇒ inget "missat" | PASS |
| PL18–PL19 | unit › offline anteckning + set, omstartad synk med tre tappade kvittenser ⇒ en anteckning (revision 1), inga dubbletter; db › villkorad sparning mot Supabase | PASS |
| PL20 | unit › två enheter ⇒ konflikt (`note`), servern orörd tills användaren väljer | PASS |
| PL21 | db `training_plan_db` › RLS: B/anon ser/ändrar/raderar inget av A:s; sammansatt FK; revisioner append-only | PASS |
| PL22 | E2E › utskrift av 36 kommande pass, "Ögonblicksbild – framtida plan kan ändras · Skapad …", skrivrader | PASS |
| PL23 | E2E › Genomförda skrivs ut utan anteckningar som standard, med efter aktivt val; unit › JSON-export | PASS |
| PL24 | unit › 72 framtida + 500 historiska: sidindelning 30 åt gången utan dubbletter/luckor, mätt tid under gräns | PASS |
| PL25 | unit › planändring under pågående pass: passets övningar och set identiska, ny revision för framtiden | PASS |
| PL26 | unit › revisioner innehåller aldrig vikter; E2E › "Rekommenderad vikt", "Utfört", "Rekommenderat då" åtskilda | PASS |
| PL27 | unit + db › hälsoradering tar bort anteckningar lokalt och på servern; set bevaras; revisioner saknar anteckningstext | PASS |
| PL28 | unit › 37 genomförda pass ⇒ planen fortsätter från pass 38 | PASS |

Inte verifierat här: Safari på riktig iPhone och fysisk Android (ljust/mörkt, utan nät). Kvarstår, se RELEASEGRINDAR.

## Senaste körning: substitutionskatalog 1.2.0 (2026-10-11)

Seed-filen 1.2.0 är enda källan (tre beslutade par införda, undantagskoden borttagen). Algoritm, rekommendationsmotor och historik oförändrade.

| Nivå | Kommando | Resultat |
|---|---|---|
| Referenssmoke | `npm run test:reference` | **26/26 PASS** |
| Enhet, komponent, DB | `npm test` | **211/211 PASS**, 20 filer |
| Regression mot koden före ändringsbegäran | unit `regression_pre_cr_plans` | **2 100 planer / 7 333 föreskrifter identiska** med `3ec01ef` (SHA-256 över övning, nivå, set, reps, kg, sekunder, kalibrering, skälkoder, status, tid, borttagna övningar, varningar) |
| Katalogintegritet | unit `substitution` | originalet ordagrant + exakt tre par; inga dubbletter/motsägande klasser; alla `notes_key` har text; omvända kandidater utan prior; de tre paren utan viktomräkning i båda riktningar |
| E2E | `playwright test` | **78 PASS, 1 instabilt, 2 SKIP**. Det instabila fallet (`auth.spec.ts` › konto utan lösenord via Glömt lösenordet, desktop) väntar på bekräftelsemejl från lokal Mailpit; vid omkörning 2/3 godkända isolerat och hela auth-sviten 36/36. Ingen koppling till katalogändringen. |
| Lint / typecheck | | 0 fel |

**Överhoppade E2E-fall (endast iPhone/WebKit-projektet):**

| Test | Vad det testar | Varför överhoppat | Kräver Safari på iPhone? |
|---|---|---|---|
| `a11y.spec.ts` › "tangentbord: starta pass och logga set utan mus…" | Starta pass och logga set enbart med tangentbord; skärmläsarstatus annonseras en gång | WebKit/Safari flyttar inte Tab-fokus mellan knappar som standard | Delvis: tangentbordsflödet är verifierat i Chromium; i Safari (iPhone med externt tangentbord, Mac med "Tab markerar alla kontroller") samt VoiceOver behöver det provas manuellt |
| `offline_privacy.spec.ts` › "29: flygplansläge hela passet + omladdning offline…" | Helt offlinepass med service worker, omladdning offline och korrekt synk efteråt | Playwrights WebKit på Windows saknar service worker-offline | **Ja** – Safari/iOS har egen service worker- och lagringshantering (bl.a. rensning av data); måste provas på riktig iPhone, installerad PWA i flygplansläge |

Verifiering i Safari på iPhone har **inte** kunnat utföras: testmiljön är Windows utan macOS/Xcode, iOS-simulator eller ansluten iPhone. Kvarstår som kontroll före produktionslansering.

## CR-komplettering med produktägarens filer (2026-10-11)

Ovanpå rättningarna (`495cf5f`): substitutionskatalogen härleds nu ur produktägarens `STYRKA_replacement_seed.json` och vetenskapssidan ur `STYRKA_evidence_register.json` (båda oförändrade i `spec/cr-2026-10-10-01/`, SHA-256 kontrolleras i test). Migration 005 (additiv).

| Nivå | Kommando | Resultat |
|---|---|---|
| Referenssmoke | `npm run test:reference` | **26/26 PASS**, SHA256 för referensmotorn = manifest |
| Enhet, komponent, DB (inkl. rättningarnas granskningsfall) | `npm test` | **207/207 PASS**, 19 filer (unit 154, ui 14, db 39) |
| E2E | `playwright test` | **79 PASS, 2 SKIP** (samma två WebKit-undantag som tidigare), 5,9 min |
| Källänkar | `node scripts/check-evidence-links.mjs` | **13/13** registerkällor svarar; alla DOI registrerade (Taylor & Francis svarar 403 på automatiska anrop men DOI är giltiga) |
| Lint / typecheck | | 0 fel |
| Staging efter migration 005 | `npm run test:staging`, `playwright -c playwright.staging.config.ts` | **6/6** och **4/4** (version `866d5394`) |

Nya och ändrade kontroller i kompletteringen:

| Kontroll | Test |
|---|---|
| Seed-filen och evidensregistret är oförändrade (SHA-256) och appen läser exakt seed-filen | unit `substitution` › "seed-filen ligger oförändrad…" |
| Varje seed-slugg mappas till befintlig övning med rimlig utrustning/lastbas (6 namnmappningar, `barbell_row` tillagd) | unit `substitution` › "varje seed-slugg mappas…" |
| Alla 40 seed-par finns med seed-filens relationsklass, `notes_key` och evidens-id; omvända kandidater utan viktprior; inga relationer utöver seed-filen och anmodans tabell (3 tillägg) | unit `substitution` › "alla seed-par finns…" |
| Kvantitativa priors endast seed-filens två par (0,80 totalt; 0,83 totalt delat per hand), tak 0,60 från seed-filen | unit `substitution` › "kvantitativa priors…" |
| Seed-villkoret "no active restriction": aktiv regel för käll-/målövning eller målets område ⇒ ingen hjälpskattning | unit `substitution` › "seed eligible_if…" |
| Utfall (saknas i seed-filen) erbjuds inte; alla erbjudna övningar finns i kandidatmappningen; DB: endast erbjudna aktiva | unit `substitution`, db `substitution_db` |
| Vetenskapssidans källor och påståenden = registrets (id, titel, år, länk, studietyp, population, stöd och begränsningar ordagrant; klassning och regel-id) | unit `evidence_registry` |
| Ingen juridisk slutsats om medicinteknisk status | unit `evidence_registry` |
| Publik sida visar registrets 13 källor och varningstext | E2E `science` (3 profiler) |

## Tidigare körning före rättningarna (97ee461)

| Nivå | Kommando | Resultat |
|---|---|---|
| Referenssmoke (paketets egen) | `npm run test:reference` | **26/26 PASS**, SHA256 för `decision_engine.ts` = manifest (filen oförändrad) |
| Enhet + property + offline/synk + substitution + evidensregister | `vitest --project unit` | **139/139 PASS** (inkl. 600 + 300 slumpade profiler, 2000 ekvivalensfall, SUB01–SUB24 på domän- och applikationsnivå) |
| Komponenter (jsdom + axe) | `vitest --project ui` | **8/8 PASS** |
| DB/RLS/RPC/demo mot riktig Supabase | `vitest --project db` | **38/38 PASS** (varav 10 nya för migration 004) |
| E2E | `playwright test` | **70 PASS, 2 SKIP** (WebKit: service worker-offline och Tab-fokus stöds inte av WebKit-emuleringen på Windows). Se not om e-postfördröjning. |
| Inloggning (del av E2E, alla 3 profiler) | `e2e/auth.spec.ts` | skapa konto + bekräftelse, befintlig e-post, fel lösenord/validering, glömt lösenord via kod och länk, länk öppnad i **annan webbläsare** (bekräftelse och återställning), konto utan lösenord, obekräftad inloggning, byt lösenord, inloggning via e-post utan lösenord |
| Staging (manuellt, 2026-10-11 efter migration 004) | `npm run test:staging`, `playwright -c playwright.staging.config.ts` | **6/6** och **4/4** mot styrka-staging (inkl. migration 004 och publik `/vetenskap`) |
| Lint / typecheck / audit | | 0 fel, 0 sårbarheter (`npm audit`) |

**Not (ärligt redovisat):** I en av tre upprepade körningar av DB-sviten fick testet "10 parallella identiska anrop" en `statement timeout` från Postgres. 60 efterföljande rundor reproducerade det inte. Felet klassas nu som transient (`DB_UNAVAILABLE`) och klientens kö försöker igen med samma eventId, vilket är idempotent – ingen dubblett kan uppstå. Rotorsaken bedöms som I/O-stall i Docker/WSL men är inte bevisad; bör bevakas i staging.

**Not (e-post i E2E):** I en full E2E-körning fick ett inloggningstest (Android) inget mejl inom 15 s från lokal Mailpit efter många kontoskapanden i följd; testet passerade vid omkörning (alla 45 auth-/vetenskapsfall gröna). Klassas som testmiljöns e-postfördröjning/rate limit, inte som appfel.

## STYRKA-CR-2026-10-10-01 (2026-10-11): vetenskapssida och övningsbyte

Ändringen är additiv. Befintliga regressionstester körs oförändrade och är gröna (motor, planerare, offline, RLS, demo 2 × 36 pass, E2E).

| ID | Test (fil › fall) | Resultat |
|---|---|---|
| SUB01 | unit `substitution` › målövningens egen historik styr vikten | PASS |
| SUB02 | unit `substitution` › 1RM 120 ⇒ e1RM 96, 57,5 kg, låg säkerhet, redigerbart; E2E `substitution` (bekräftad startvikt i UI) | PASS |
| SUB03 | unit `substitution` › okänd vana ⇒ ingen siffra; unit `substitution_app` › SUB03 i appen | PASS |
| SUB04 | unit `substitution` › 83 kg totalt, 24 kg per hantel; unit `substitution_app` › SUB14 (24 kg i appflödet) | PASS |
| SUB05 | unit `substitution` › latsdrag → assisterade chins | PASS |
| SUB06/07 | unit `substitution` › benpress / rumänska marklyft: kompletterande, ingen omräkning | PASS |
| SUB08 | unit `substitution` › knäområdesblockering och symtom respekteras | PASS |
| SUB09 | unit `substitution` › förbjudet tungt par justeras eller stoppas | PASS |
| SUB10 | unit `substitution_app` › "Bara idag" ⇒ samma mall har originalet nästa gång | PASS |
| SUB11 | unit `substitution_app` › "Använd framöver" ⇒ endast kommande pass, historik och programversion oförändrade, återställning; E2E `substitution` (profil → Återställ) | PASS |
| SUB12 | unit `substitution_app` › offline byte + set + omstart + tappad kvittens ⇒ exakt en gång | PASS |
| SUB13 | unit `substitution_app` › samma byte på två enheter ⇒ en serverpost, revisionskonflikt vid olika redigering | PASS |
| SUB14 | unit `substitution_app` › 24 kg per hand genom lokal data, synk, CSV/JSON, analys; db `substitution_db` › lastbas i DB + appflöde mot riktig server; E2E (`kg/hantel` i UI) | PASS |
| SUB15 | unit `substitution` › ingen påhittad siffra | PASS |
| SUB16 | unit `substitution_app` › utförda set behåller exercise_id, nya set knyts till ersättaren | PASS |
| SUB17 | E2E `science` › utloggad når /vetenskap från välkomstsidan (3 profiler) | PASS |
| SUB18 | E2E `science` › direktlänk till regel och källa (DOI); `docs/evidence/evidence_links.md` (13/13 registerkällor svarar) | PASS |
| SUB19 | unit `substitution` › hjälpskattning utan markerad osäkerhet underkänns (invariant kastar) | PASS |
| SUB20 | unit `substitution_app` › 36 tidigare pass: inga historiska set, snapshots, audits eller serier ändras; hela befintliga sviten grön | PASS |
| SUB21 | unit `substitution_app` › spontanpass med byte i samma belastningshistorik, påverkar nästa plan (återhämtning) | PASS |
| SUB22 | unit `substitution` › målövningens e1RM prioriteras | PASS |
| SUB23 | unit `substitution` + `substitution_app` › annan maskin ⇒ separat historik, inga kg | PASS |
| SUB24 | unit `substitution` › ingen invertering av 0,80 | PASS |

Övrigt nytt: kalibreringsfortsättning ("för tungt" ⇒ ett viktsteg lättare, ingen höjning inom passet), kalibreringsnivå efter två kontrollerade pass, revisionspost med alla fält i §4.3, RLS/append-only/sammansatta FK för de nya tabellerna, `perceived_effort` via `apply_set_mutation` (ogiltigt värde avvisas atomiskt), evidensregistrets kartläggning (alla skälkoder har regelankare, alla påståenden har källor, inga persondata), axe på vetenskapssidan och bytesvyn, ≤ 2 tryck från "Byt övning" till bytt övning (E2E). Feature flag av (`VITE_FLAG_SUBSTITUTION_V2=false`) ⇒ tidigare bytesvy (unit › "feature flag av").

Skärmbilder: `docs/evidence/screenshots/<profil>/SUB-1…SUB-4*.png`, `VET-1-vetenskap.png`.

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
