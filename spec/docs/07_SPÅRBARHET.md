# 07 · Kravspårbarhet och implementeringsmatris

| Krav | Kontrakt | Kodartefakt | Acceptanstest |
|---|---|---|---|
| FR01–05 onboarding och profil | 01 §2, 03 §2 | profilvy, profiles, user_exercise_profiles | 02,03,25 |
| FR06–11 program | 02 §7, 08 §1–5, 01 S06/S07 | planner + programs | 07,09,22,26,44 |
| FR12–17 setloggning | 01 S08/S11, 03 §3–5 | training_sets, local outbox | 12,15,28,29,37,42 |
| FR18–21 spontanpass | 02 §8, 01 S10 | extra planner | 17,27 |
| FR22–27 rekommendation | 02 §1–6, src/decision_engine.ts | domain module | 01–21,23 |
| FR28–32 datalagring | 03 §4–7, SQL | auth, RLS, sync, export | 28–36 |
| FR33–36 UX | 01 §3 | React komponenter | 38–40 |
| FR37–40 drift | 04 §3–6 | CI / dashboard / audit | G0–G5 |

**Definition av testspårning:** för varje accepterat krav måste det finnas en verifierbar testlogg och eventuell skärmbild. Enbart 'implementerat' i checklista är inte godkänt.

## Ändringskontroll
Varje regeländring kräver (1) versionshöjning `engineVersion`, (2) ändring i 02, (3) testfixture och enhetstest, (4) ny evidensklass/regelmotivering i 05, (5) beslut om påverkan på tidigare föreslagna men ännu inte genomförda pass.

## Restgränser som är explicit delegerade till utveckling, inte produktosäkerhet
Val av UI komponentbibliotek, forms, graph library, CSS utility eller inte, router, hostingadapter, exakt färgpalett inom WCAG, indexoptimering och teknisk koduppdelning får väljas av kodagent. Katalogen får kompletteras med transparent versionering. Inga sådana beslut får ändra träningsrekommendationernas betydelse.
