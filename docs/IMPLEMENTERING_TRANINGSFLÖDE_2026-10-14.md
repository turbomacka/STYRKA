# Samlat träningsflöde – inventering och arbetslogg

Anmodan 14 oktober 2026. Arbetet görs i befintlig React/TypeScript-app. Tidigare publicerade, ännu ocommittade ändringar bevaras. Implementationen verifierades lokalt och publicerades på användarens begäran den 15 oktober; resultat från publicerad version finns i [leveransrapporten](LEVERANS_TRANINGSFLODE_2026-10-15.md).

## Inventering före kodändringar

| Område | Befintlig implementation och viktig förutsättning |
|---|---|
| Katalog | `domain/catalog.ts`: 48 övningar, lasttyp, hantelbas, unilateral-markering, maskinvariant och tidskategori. Ingen explicit utförandeform. |
| Planering | `planner/planner.ts`, `application/plannerInput.ts`, `trainingPlan.ts`: immutabla plansnapshots, historikstyrda arbetsvikter och strukturell framtidsplan. |
| Set | `application/training.ts`: en Dexie-transaktion för set och köpost. `LocalSet` innehåller en vikt/reps/RIR. `kind=work/warmup` finns redan. |
| Synk | `SyncEngine`, `SupabaseTransport`, `mapping.ts`: versionskontrollerad set-RPC, idempotent event-ID, synliga konflikter. Sidprestationer måste omfattas av samma konfliktkontroll. |
| Progression | `domain/prescription.ts` ovanpå kontrollsummeskyddad referensmotor. Exponering bygger på kompletta arbetsset och ett tal per set. Referensmotorns originalfil ändras inte. |
| Historik | `application/history.ts`: separata maskinvariantserier, arbetsset filtreras; ingen sidmodell. e1RM kräver 1–8 reps och RIR 0–3; kroppsvikt/assistans/tid omvandlas inte till skivstångs-1RM. |
| Balans | `domain/balance.ts`: räknar arbetsset, inte fysisk mekanisk energi. Ett komplett sidpar måste fortsätta vara ett arbetsset; delvis utfört arbete måste redovisas separat. |
| Vila | `widgets.tsx`: lokal komponent med Date.now och intervall. 60/90/150 sekunder, försvinner vid omladdning och startar även efter sista setet. |
| Inställningar | `LocalProfile` och `user_exercise_profiles`; profilkonflikter hanteras redan. Enhetslokala tema-/haptikpreferenser återanvänds. |
| Lagring | Dexie v5 och Postgres/Supabase. Set skrivs endast via `private.apply_set_mutation`; sessionens föreskrift är oföränderlig. |
| Tester | Vitest för domän, UI och lokal databas; Playwright för tre emulerade miljöer; separata publicerade stagingtester. |

## Arkitekturbeslut

- Återanvänd `work/warmup`. Ett set får en versionsmärkt detaljstruktur med utförandeform, individuella prestationer och viloposter. Sidprestationerna lagras atomärt i samma set/RPC och delar revision; inga parallella skrivvägar för samma resultat.
- Varje prestation har stabilt ID, sida, status, vikt/inställning, reps, RIR, start/slut och en kopia av utrustningskonfigurationen. Höger/vänster summeras aldrig till ett bilateralt max.
- Lägg till explicit partiell setstatus. Befintliga historiska set lämnas oförändrade: saknad sidinformation är okänd, inte två påhittade prestationer.
- Övningsinstansen får separat ändringsbar konfiguration; originalets rekommendationssnapshot bevaras. Endast konfigurationskolumnen får uppdateras, inte förälder, användare eller föreskrift.
- Frivilliga utrustningsprofiler och träningspreferenser sparas i profilens versionskontrollerade JSON. De små personliga listorna kräver ingen separat sökbar katalog. Historiska prestationer läser alltid sin egen kopia.
- Vila sparas med setets detaljstruktur och rekonstrueras från tidsstämplar. Faktisk vila är okänd tills nästa start verkligen har observerats; tiden mellan två avslut får inte felaktigt kallas vilotid. Knappen för att börja nästa moment registrerar start utan att registrera ett färdigt set.
- Ren, deterministisk domänlogik för belastningsjämförbarhet, seträkning, vila och uppvärmning. Centrala produktvärden och förklaringskoder. Ingen språkmodell i träningsbesluten.
- Additiva SQL-kolumner och valfria TypeScript-fält. Ingen duplicering/backfill av gamla set. Befintliga offlineköer och historiska rader fortsätter att fungera.

## Genomförande

1. Datamodell, bakåtkompatibel servervalidering och rena beräkningsfunktioner.
2. Sidregistrering, ofullständiga set och konservativ progression.
3. Utrustningsprofiler, historiska snapshots och jämförelseserier.
4. Sparad adaptiv vila och explicit observerad nästa start.
5. Frivillig uppvärmning och gemensamma setkontroller.
6. Integration, regression, mobil emulering, leveransrapport.

Status: implementation och lokala automatiserade kontroller genomförda. Se [leveransrapporten](LEVERANS_TRANINGSFLODE_2026-10-15.md) för funktioner, migration, testresultat och begränsningar. Fysisk Safari/iOS PWA och Android är inte tillgängliga här och redovisas inte som verifierade.
