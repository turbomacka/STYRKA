# 04 · Testplan, kvalitet, acceptans och driftsättning

## 1. Acceptansgrindar
**G0 – Byggbar:** `npm ci`, typecheck, lint, unit tester, SQL migration lokalt, inga hemligheter i repository.
**G1 – Motorn:** alla normala, felaktiga och begränsade profiler producerar deterministiska förslag, automatiserad cross-user check, referenstest + property based tests.
**G2 – UI:** träning går att starta och logga på iPhone och Android med förifyllda värden, en tryckregistrering, paus/återuppta/ångra, A11y test.
**G3 – Offline:** lokal atomisk skrivning, idempotent uppspelning, oväntad omstart, offline hela passet, konflikter mellan två enheter.
**G4 – Integritet:** giltiga RLS tester, negativa API tester, lagring/radering och samtycke verifierat, externa avtal klara.
**G5 – Release:** juristbedömning av MDR/GDPR vid behov, fackgranskning av algoritmens säkerhetsgränser, staging-pilot, rollback genomfört. V1 får inte offentliggöras före G5.

## 2. Testspecifikation
### 2.1 Unit / property (minimum)
1. 90 kg 3RM → 99 kg e1RM; felaktig vikt förkastas.
2. Nybörjare e1RM 100 bänk heavy och 2,5 kg steg → 65 kg, 2×8.
3. Medelvan e1RM 100 → 77,5 kg, 3×5. Samma indata => byte-identiskt förslag.
4. Okänd maxstyrka => `kg=null`, `CALIBRATION_REQUIRED`, aldrig slumpvikt.
5. Assisterade chins normaliseras inte till skivstång 1RM.
6. Vid minskad assistans blir progressionen korrekt riktad.
7. Program med marklyft 2 lätta set, knäböj 4 tunga tillåts när uttrycklig parregel inte hindrar.
8. Knäböj 4 tunga + marklyft 3 tunga avvisas om aktiv `block_pair_heavy`.
9. Saknad utrustning => ingen föreslagen blockerad maskin.
10. Alla mål uppnådda, RIR 3, normal tid => reps+1 inom band.
11. Alla set vid topp av band, god RIR, steg inom cap => öka ett steg och återgå till minreps.
12. RIR 0 => inga automatiska extra kilon.
13. RIR saknas => kräver två kompletta, kontrollerade tillfällen vid samma målnivå.
14. Ett missat set => håll; två misslyckade fullständiga pass => minska enligt H.
15. Avbrutet pass av tidskäl behandlas inte som misslyckad styrka.
16. Dålig teknik => ingen automatisk ökning.
17. 20 timmar efter tung squat => ingen automatisk tung squat i spontanpass.
18. 72 timmar utan problem => inte automatiskt extra vikt på grund av tid.
19. 18 dagars uppehåll => omstart 5 %; 30 dagar => 10 % samt setreduktion.
20. Ny hälta => `review_required` för berörd övning, ingen autohöjning.
21. Restriktion ändras av användaren => gäller framtida planer; historik oförändrad.
22. Plan med 20 min => tidsestimat understiger budget eller motorn anger att mål inte ryms.
23. För högt minsta viktsteg => håll vikt och dokumentera stegproblem.
24. Decimal 102,5 sparas 102.500; punkt/komma ger samma värde.
25. 1–7 pass/vecka och 15–120 min valideras; utanför får tydligt fel.
26. Ändra frekvens mitt i rotation => A/B/C historik förblir korrekt.
27. Spontanpass kan komplettera, ersätter bara med aktivt användarval.
28. Ingen `actual` sparas före godkänd lokal IndexedDB transaktion.
29. Flygplansläge hela passet + återstart + nätkontakt => exakt utförda set.
30. Dubbel klick och två retries med samma UUID => en serverpost.
31. Samtidiga ändringar i samma set två enheter => revisionskonflikt, ingen tyst överskrivning.
32. Logout med pending synk => varning; nästa användare ser inga lokala data från första.
33. Två separata konton: all läs/skriv/radering av andra kontots poster nekas.
34. Annan användares session_id i barns FK => nekas även om egen `user_id` skickas.
35. Export omfattar set, pass, planversion, rekommendationsgrunder och aktuell profil.
36. Raderat hälsosamtycke => inga nya symtomposter, tidigare data hanteras enligt vald raderingsrutin.
37. Användaren kan ångra markering `Klart` direkt och få korrekt historik.
38. Appen läser/registrerar kritiska flöden med VoiceOver och TalkBack.
39. Dokumenterad manuell QA vid 200 % textzoom och reducerad rörelse.
40. Skärmläsaren får status vid `sparat lokalt` / `synkat` utan distraherande upprepningar.
41. Avsaknad av maxvärde tvingar inte användaren att göra 1RM försök.
42. Loggade set får aldrig försvinna om passet markeras partial.
43. Tung benkombination tillåts inte efter att användaren lagt restriktion offline.
44. Kombinationsbegränsning med flera par ger aldrig oändlig genereringsloop.
45. Vid symtom och brist på tillåtna alternativ visar appen neutralt tomläge i stället för att improvisera riskfylld övning.

### 2.2 Testnivåer
Unit: motor och valideringar (Vitest) med fixtures. Property-based: invarianta last/steg/tid/regler över slumpgenererade men giltiga profiler. Integration: Postgres RLS SQL med två testkonton; offline/synk i Playwright. E2E: Safari på iOS + Chrome Android + desktop keyboard. Tillgänglighet: axe + manuell test, automatiserat test kan inte garantera WCAG.

### 2.3 Kriterier före pilot
0 kända blockerande fel. 100 % godkända säkerhets- och dataförlusttester. Minst 95 % automatiska motorunit-tester godkända är otillräckligt; **100 % krävs** för deterministiska tester. Användartester minst 2 personer, minst 12 pass per person för praktisk observation, utan att påstå klinisk effekt. Alla motorheuristiker godkända av produktägare och lämplig träningsfackkompetens innan personliga viktförslag går till extern pilot.

## 3. Incidenter och rollback
P0 incident: åtkomst över kontogräns, försvunna pass, osäker tung rekommendation trots aktiv restriction eller falsk symtomvarningshantering. Sätt system i läsläge eller stäng rekommendationsfunktionen (feature flag), informera berörda vid relevant dataskyddshändelse, återställ med verifierad migration/rollback.

**Backup:** schemalagd PostgreSQL backup, återställning i isolerad miljö minst var kvartal, validera exportschema, förkorta återställningstid efter riskbedömning. IndexedDB är inte enda backup. Beskriv status för data vid offlineperiod och vid byte av enhet.

**Observability:** metrics för sync failed/conflict, app crash, planner unsatisfiable, rekommendationsflaggar, latency utan användarspecifik hälsologg. Inga sessiondetaljer, namn, diagnoses, medicinsk text i sentry/loggning. Privacy-preserving feature analytics off by default.

## 4. Miljöer och release
**Local:** syntetiska användare; inga riktiga hälso-/träningsposter. **Staging:** separat Supabase projekt, testkonton. **Production:** separat databas, EU region vald och DPA bekräftad. Kör migrations i CI mot staging först, automatisk kontroll av RLS, manuell releaseapproval. Deploy previews får inte använda production secrets.

**Versionering:** `engineVersion`, `schemaMigration`, `catalogVersion`, `privacyNoticeVersion`, `uiVersion`. Feature flag `loadRecommendationsEnabled` möjliggör omedelbar stopp av viktförslag utan att låsa historik eller export.

## 5. Runbook för kodagent
1. Läs samtliga kontrakt och lista konflikter innan kodändring.
2. Initiera Vite/React/TypeScript; pin beroenden efter aktuell dokumentation, skapa npm lockfile.
3. Lägg in och kör beslutsmotorns tester innan något träningsgränssnitt skrivs.
4. Bygg databas i lokal Supabase; kör migreringar och RLS negativa tester.
5. Bygg offline local-first setlogg och idempotent sync; gör databortfalls- och konfliktenstest.
6. Implementera intro, Idag, Träna, Spontanpass, Utveckling, Profil.
7. Anslut planner + engine; stöd alla 17 katalogövningar och varianteffekt.
8. Kör a11y, mobiltest, säkerhetsskanning och granska varje manuell gräns.
9. Sammanställ testprotokoll med testresultat och skärmbilder, rapportera blockerare.
10. Stanna på staging när G5 ännu inte godkänts. Ingen självvald publik hälsolansering.

## 6. Definition of Done
En feature är färdig först när den har: kod, användbart UI, typvalidering, tillgänglighetsbeteende, enhets-/integrationstest, korrekt loggning och dataåtkomst, felhantering offline, spårbar motivering och dokumenterad versionspåverkan. Applikationen är leveransklar först när alla obligatoriska tester samt G0–G5 passerat.
