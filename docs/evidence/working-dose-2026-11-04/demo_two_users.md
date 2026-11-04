# Demo: två oberoende konton, 36 pass vardera och spontanpass

Genererad av `tests/db/demo_two_users.test.ts` mot lokal Supabase (2026-11-04). Simulerad klocka; alla data syntetiska.

## Konton
- **A** (`7a89a515-8cfb-40f2-b768-6b44d3251a3e`): 2 pass/vecka, 60 min, medelvan, **latsdrag**, RIR anges.
- **B** (`baabbd36-196a-4c37-b018-cc6cd0a2c495`): 3 pass/vecka, 45 min, novis, **assisterade chins** (eget variantval), `block_pair_heavy(squat, deadlift)`, inga RIR, offline under pass 5–8.

## Verifierat i databasen
- A: extra: 1, planned: 36 · utförda set på server = lokalt = 365
- B: planned: 36 · utförda set på server = lokalt = 215
- Latsdrag endast hos A, assisterade chins endast hos B: ja
- B: pass med både tung knäböj och tung marklyft: 0
- Set som pekar på annan användares övning: 0; B:s läsning av A:s set: 0 rader
- B assistans (kg) över tid: 40 → 40 → 40 → 40 → 40 → 40 → 40 → 40 → 40 → 40 → 35 → 35 → 35 → 35 → 35 → 35 → 35 → 35 → 35 → 35 → 30 → 30 → 30
- A tung bänkpress (kg) över tid: 67,5 → 70 → 72,5

## Spontanpass som ändrar nästa ordinarie rekommendation

**Nästa ordinarie (C) före spontanpass:** Knäböj light 2×5 @ 97,5 kg; Militärpress moderate 3×9 @ 37,5 kg; Latsdrag moderate 2×7 @ 60 kg; Marklyft heavy 2×7 @ 100 kg; Sidolyft i kabel light 2×9 @ 13 kg

**Spontanpass (30 min, dagsform bra) ~28 h före:** Knäböj heavy 2×5 @ 97,5 kg; Bänkpress moderate 2×5 @ 72,5 kg; Latsdrag moderate 2×7 @ 60 kg; Sidolyft i kabel light 1×9 @ 13 kg

**Nästa ordinarie (C) efter spontanpass:** Militärpress moderate 3×9 @ 37,5 kg; Knäböj light 2×5 @ 92,5 kg; Marklyft heavy 2×7 @ 100 kg; Latsdrag moderate 2×7 @ 55 kg; Sidolyft i kabel light 2×9 @ 13 kg

Skälkoder efter: TEMPLATE_C, GOAL_PRIORITY_ORDER, WAIT_FOR_SECOND_CONFIRMED_PASS, NO_RELEVANT_HISTORY, TEMPORARY_LOAD_REDUCED, RECOVERY_MATCHED_WORK, DOUBLE_PROGRESS_REPS, TEMPORARY_SETS_RESTORED

Rotationen oförändrad: ja. Rekommendationen ändrad: ja.

## Passlogg A
| # | Datum | Mall | Status | Föreskrift |
|---|---|---|---|---|
| 1 | 2026-03-02 | A | completed | Knäböj heavy 3×5 @ 92,5 kg; Bänkpress moderate 3×6 @ 67,5 kg; Latsdrag moderate 2×6 @ 57,5 kg; Sidolyft i kabel light 2×8 @ 12 kg |
| 2 | 2026-03-05 | B | completed | Marklyft light 2×8 @ 90 kg; Sittande kabelrodd moderate 2×6 (kalibrera); Bänkpress heavy 3×7 @ 67,5 kg; Bicepscurl light 2×8 @ 18 kg; Triceps pushdown light 2×8 @ 24 kg |
| 3 | 2026-03-09 | C | completed | Militärpress moderate 3×6 @ 37,5 kg; Knäböj light 2×6 @ 92,5 kg; Latsdrag moderate 2×7 @ 57,5 kg; Marklyft heavy 2×5 @ 95 kg; Sidolyft i kabel light 2×9 @ 12 kg |
| 4 | 2026-03-12 | A | completed | Bänkpress moderate 3×7 @ 67,5 kg; Knäböj heavy 2×6 @ 92,5 kg; Latsdrag moderate 2×7 @ 57,5 kg; Sidolyft i kabel light 2×9 @ 12 kg |
| 5 | 2026-03-16 | B | completed | Sittande kabelrodd moderate 2×7 @ 20 kg; Marklyft light 2×5 @ 95 kg; Bänkpress heavy 3×5 @ 70 kg; Bicepscurl light 2×9 @ 18 kg; Triceps pushdown light 2×9 @ 24 kg |
| 6 | 2026-03-19 | C | completed | Knäböj light 2×7 @ 92,5 kg; Militärpress moderate 3×7 @ 37,5 kg; Latsdrag moderate 2×8 @ 57,5 kg; Marklyft heavy 2×6 @ 95 kg; Sidolyft i kabel light 2×10 @ 12 kg |
| 7 | 2026-03-23 | A | completed | Bänkpress moderate 3×5 @ 70 kg; Knäböj heavy 2×7 @ 92,5 kg; Latsdrag moderate 2×8 @ 57,5 kg; Sidolyft i kabel light 2×10 @ 12 kg |
| 8 | 2026-03-26 | B | completed | Sittande kabelrodd moderate 2×7 @ 20 kg; Marklyft light 2×6 @ 95 kg; Bänkpress heavy 3×5 @ 70 kg; Bicepscurl light 2×9 @ 18 kg; Triceps pushdown light 2×9 @ 24 kg |
| 9 | 2026-03-30 | C | completed | Knäböj light 2×7 @ 92,5 kg; Militärpress moderate 3×7 @ 37,5 kg; Latsdrag moderate 2×8 @ 57,5 kg; Marklyft heavy 2×7 @ 95 kg; Sidolyft i kabel light 2×10 @ 12 kg |
| 10 | 2026-04-02 | A | completed | Bänkpress moderate 3×6 @ 70 kg; Knäböj heavy 2×5 @ 95 kg; Latsdrag moderate 2×9 @ 57,5 kg; Sidolyft i kabel light 2×11 @ 12 kg |
| 11 | 2026-04-06 | B | completed | Sittande kabelrodd moderate 2×8 @ 20 kg; Marklyft light 2×7 @ 95 kg; Bänkpress heavy 3×5 @ 70 kg; Bicepscurl light 2×10 @ 18 kg; Triceps pushdown light 2×10 @ 24 kg |
| 12 | 2026-04-09 | C | completed | Knäböj light 2×5 @ 95 kg; Militärpress moderate 3×8 @ 37,5 kg; Latsdrag moderate 2×9 @ 57,5 kg; Marklyft heavy 2×5 @ 100 kg; Sidolyft i kabel light 2×11 @ 12 kg |
| 13 | 2026-04-13 | A | completed | Bänkpress moderate 3×5 @ 70 kg; Knäböj heavy 2×6 @ 95 kg; Latsdrag moderate 2×10 @ 57,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 14 | 2026-04-17 | B | completed | Sittande kabelrodd moderate 2×7 @ 20 kg; Marklyft light 2×5 @ 100 kg; Bänkpress heavy 3×6 @ 70 kg; Bicepscurl light 2×10 @ 18 kg; Triceps pushdown light 2×10 @ 24 kg |
| 15 | 2026-04-20 | C | partial | Knäböj light 2×6 @ 95 kg; Militärpress moderate 3×8 @ 37,5 kg; Latsdrag moderate 2×10 @ 57,5 kg; Marklyft heavy 2×5 @ 100 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 16 | 2026-04-24 | A | completed | Bänkpress moderate 3×6 @ 70 kg; Knäböj heavy 2×7 @ 95 kg; Latsdrag moderate 2×10 @ 57,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 17 | 2026-04-27 | B | completed | Marklyft light 2×5 @ 100 kg; Sittande kabelrodd moderate 2×7 @ 20 kg; Bänkpress heavy 3×7 @ 70 kg; Bicepscurl light 2×10 @ 18 kg; Triceps pushdown light 2×10 @ 24 kg |
| 18 | 2026-05-01 | C | completed | Knäböj light 2×7 @ 95 kg; Militärpress moderate 3×9 @ 37,5 kg; Latsdrag moderate 2×6 @ 60 kg; Marklyft heavy 2×6 @ 100 kg; Sidolyft i kabel light 2×8 @ 13 kg |
| 19 | 2026-05-04 | A | completed | Bänkpress moderate 3×7 @ 70 kg; Knäböj heavy 2×5 @ 97,5 kg; Latsdrag moderate 2×6 @ 60 kg; Sidolyft i kabel light 2×8 @ 13 kg |
| 20 | 2026-05-08 | B | completed | Sittande kabelrodd moderate 2×7 @ 20 kg; Marklyft light 2×6 @ 100 kg; Bänkpress heavy 3×5 @ 72,5 kg; Bicepscurl light 2×11 @ 18 kg; Triceps pushdown light 2×11 @ 24 kg |
| 0 | 2026-05-10 | Spontan | completed | Knäböj heavy 2×5 @ 97,5 kg; Bänkpress moderate 2×5 @ 72,5 kg; Latsdrag moderate 2×7 @ 60 kg; Sidolyft i kabel light 1×9 @ 13 kg |
| 21 | 2026-05-11 | C | completed | Militärpress moderate 3×9 @ 37,5 kg; Knäböj light 2×5 @ 92,5 kg; Marklyft heavy 2×7 @ 100 kg; Latsdrag moderate 2×7 @ 55 kg; Sidolyft i kabel light 2×9 @ 13 kg |
| 22 | 2026-05-15 | A | completed | Knäböj heavy 2×5 @ 92,5 kg; Bänkpress moderate 2×5 @ 72,5 kg; Latsdrag moderate 2×7 @ 55 kg; Sidolyft i kabel light 2×9 @ 13 kg |
| 23 | 2026-05-18 | B | completed | Sittande kabelrodd moderate 2×8 @ 20 kg; Marklyft light 2×7 @ 100 kg; Bänkpress heavy 2×6 @ 72,5 kg; Bicepscurl light 2×11 @ 18 kg; Triceps pushdown light 2×11 @ 24 kg |
| 24 | 2026-05-22 | C | completed | Knäböj light 2×6 @ 92,5 kg; Militärpress moderate 3×9 @ 37,5 kg; Latsdrag moderate 2×8 @ 55 kg; Marklyft heavy 2×5 @ 105 kg; Sidolyft i kabel light 2×10 @ 13 kg |
| 25 | 2026-05-25 | A | completed | Bänkpress moderate 2×6 @ 72,5 kg; Knäböj heavy 2×6 @ 92,5 kg; Latsdrag moderate 2×8 @ 55 kg; Sidolyft i kabel light 2×10 @ 13 kg |
| 26 | 2026-05-29 | B | completed | Sittande kabelrodd moderate 2×8 @ 20 kg; Marklyft light 2×5 @ 105 kg; Bänkpress heavy 2×7 @ 72,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×12 @ 24 kg |
| 27 | 2026-06-01 | C | completed | Knäböj light 2×7 @ 92,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×9 @ 55 kg; Marklyft heavy 2×6 @ 105 kg; Sidolyft i kabel light 2×11 @ 13 kg |
| 28 | 2026-06-05 | A | completed | Bänkpress moderate 2×7 @ 72,5 kg; Knäböj heavy 2×7 @ 92,5 kg; Latsdrag moderate 2×9 @ 55 kg; Sidolyft i kabel light 2×11 @ 13 kg |
| 29 | 2026-06-08 | B | completed | Sittande kabelrodd moderate 2×9 @ 20 kg; Marklyft light 2×6 @ 105 kg; Bänkpress heavy 2×7 @ 72,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×12 @ 24 kg |
| 30 | 2026-06-12 | C | completed | Knäböj light 2×7 @ 92,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×9 @ 55 kg; Marklyft heavy 2×7 @ 105 kg; Sidolyft i kabel light 2×11 @ 13 kg |
| 31 | 2026-06-15 | A | completed | Bänkpress moderate 2×8 @ 72,5 kg; Knäböj heavy 2×5 @ 95 kg; Latsdrag moderate 2×10 @ 55 kg; Sidolyft i kabel light 2×12 @ 13 kg |
| 32 | 2026-06-19 | B | completed | Sittande kabelrodd moderate 2×9 @ 20 kg; Marklyft light 2×7 @ 105 kg; Bänkpress heavy 2×8 @ 72,5 kg; Bicepscurl light 2×8 @ 19 kg; Triceps pushdown light 2×8 @ 25 kg |
| 33 | 2026-06-22 | C | completed | Knäböj light 2×5 @ 95 kg; Militärpress moderate 3×6 @ 40 kg; Latsdrag moderate 2×10 @ 55 kg; Marklyft heavy 2×5 @ 110 kg; Sidolyft i kabel light 2×12 @ 13 kg |
| 34 | 2026-06-26 | A | completed | Bänkpress moderate 2×9 @ 72,5 kg; Knäböj heavy 2×6 @ 95 kg; Latsdrag moderate 2×6 @ 57,5 kg; Sidolyft i kabel light 2×8 @ 14 kg |
| 35 | 2026-06-29 | B | completed | Sittande kabelrodd moderate 2×10 @ 20 kg; Marklyft light 2×5 @ 110 kg; Bänkpress heavy 2×9 @ 72,5 kg; Bicepscurl light 2×8 @ 19 kg; Triceps pushdown light 2×8 @ 25 kg |
| 36 | 2026-07-03 | C | completed | Knäböj light 2×6 @ 95 kg; Militärpress moderate 3×6 @ 40 kg; Latsdrag moderate 2×6 @ 57,5 kg; Marklyft heavy 2×5 @ 110 kg; Sidolyft i kabel light 2×8 @ 14 kg |

## Passlogg B
| # | Datum | Mall | Status | Föreskrift |
|---|---|---|---|---|
| 1 | 2026-03-02 | A | completed | Knäböj heavy 2×8 (kalibrera); Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×8 (kalibrera); Sidolyft i kabel light 1×10 (kalibrera) |
| 2 | 2026-03-05 | B | completed | Marklyft light 1×10 (kalibrera); Sittande kabelrodd moderate 1×8 (kalibrera); Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×10 @ 2 kg; Triceps pushdown light 1×10 (kalibrera) |
| 3 | 2026-03-07 | C | completed | Militärpress moderate 1×8 (kalibrera); Knäböj light 1×8 @ 40 kg; Marklyft heavy 2×10 @ 50 kg; Assisterade chins moderate 1×8 @ 40 kg assistans; Sidolyft i kabel light 1×10 @ 5 kg |
| 4 | 2026-03-09 | A | completed | Knäböj heavy 2×8 @ 40 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×8 @ 40 kg assistans; Sidolyft i kabel light 1×10 @ 5 kg |
| 5 | 2026-03-12 | B | completed | Knäböj moderate 2×8 @ 40 kg; Marklyft light 1×10 @ 50 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×10 @ 2 kg; Triceps pushdown light 1×10 @ 15 kg |
| 6 | 2026-03-14 | C | completed | Knäböj light 1×9 @ 40 kg; Militärpress moderate 1×8 @ 20 kg; Marklyft heavy 2×10 @ 50 kg; Assisterade chins moderate 1×9 @ 40 kg assistans; Sidolyft i kabel light 1×11 @ 5 kg |
| 7 | 2026-03-16 | A | completed | Knäböj heavy 2×9 @ 40 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×9 @ 40 kg assistans; Sidolyft i kabel light 1×11 @ 5 kg |
| 8 | 2026-03-19 | B | completed | Sittande kabelrodd moderate 1×8 @ 17,5 kg; Knäböj moderate 2×9 @ 40 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×10 @ 2 kg; Triceps pushdown light 1×10 @ 15 kg |
| 9 | 2026-03-21 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 1×10 @ 40 kg; Militärpress moderate 1×8 @ 20 kg; Assisterade chins moderate 1×9 @ 40 kg assistans; Sidolyft i kabel light 1×11 @ 5 kg |
| 10 | 2026-03-23 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×9 @ 40 kg assistans; Sidolyft i kabel light 1×11 @ 5 kg |
| 11 | 2026-03-26 | B | completed | Knäböj moderate 2×10 @ 40 kg; Marklyft light 1×10 @ 50 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×11 @ 2 kg; Triceps pushdown light 1×11 @ 15 kg |
| 12 | 2026-03-28 | C | completed | Knäböj light 1×11 @ 40 kg; Militärpress moderate 1×9 @ 20 kg; Marklyft heavy 2×10 @ 50 kg; Assisterade chins moderate 1×10 @ 40 kg assistans; Sidolyft i kabel light 1×12 @ 5 kg |
| 13 | 2026-03-30 | A | completed | Knäböj heavy 2×11 @ 40 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×10 @ 40 kg assistans; Sidolyft i kabel light 1×12 @ 5 kg |
| 14 | 2026-04-02 | B | completed | Sittande kabelrodd moderate 1×8 @ 15 kg; Knäböj moderate 2×11 @ 40 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×11 @ 2 kg; Triceps pushdown light 1×11 @ 15 kg |
| 15 | 2026-04-04 | C | completed | Marklyft heavy 2×11 @ 50 kg; Knäböj light 1×12 @ 40 kg; Militärpress moderate 1×9 @ 20 kg; Assisterade chins moderate 1×10 @ 40 kg assistans; Sidolyft i kabel light 1×12 @ 5 kg |
| 16 | 2026-04-06 | A | completed | Knäböj heavy 2×12 @ 40 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×10 @ 40 kg assistans; Sidolyft i kabel light 1×12 @ 5 kg |
| 17 | 2026-04-09 | B | completed | Knäböj moderate 2×12 @ 40 kg; Marklyft light 1×11 @ 50 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×11 @ 2 kg; Triceps pushdown light 1×11 @ 15 kg |
| 18 | 2026-04-11 | C | completed | Knäböj light 1×12 @ 40 kg; Militärpress moderate 1×9 @ 20 kg; Marklyft heavy 2×11 @ 50 kg; Assisterade chins moderate 1×8 @ 35 kg assistans; Sidolyft i kabel light 1×13 @ 5 kg |
| 19 | 2026-04-13 | A | completed | Knäböj heavy 2×12 @ 40 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×8 @ 35 kg assistans; Sidolyft i kabel light 1×13 @ 5 kg |
| 20 | 2026-04-16 | B | completed | Sittande kabelrodd moderate 1×8 @ 12,5 kg; Knäböj moderate 2×8 @ 42,5 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×12 @ 2 kg; Triceps pushdown light 1×11 @ 15 kg |
| 21 | 2026-04-18 | C | completed | Marklyft heavy 2×11 @ 50 kg; Knäböj light 1×8 @ 42,5 kg; Militärpress moderate 1×9 @ 20 kg; Assisterade chins moderate 1×8 @ 35 kg assistans; Sidolyft i kabel light 1×13 @ 5 kg |
| 22 | 2026-04-20 | A | completed | Knäböj heavy 2×8 @ 42,5 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×8 @ 35 kg assistans; Sidolyft i kabel light 1×13 @ 5 kg |
| 23 | 2026-04-23 | B | completed | Knäböj moderate 2×8 @ 42,5 kg; Marklyft light 1×11 @ 50 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×12 @ 2 kg; Triceps pushdown light 1×12 @ 15 kg |
| 24 | 2026-04-25 | C | completed | Knäböj light 1×9 @ 42,5 kg; Militärpress moderate 1×10 @ 20 kg; Marklyft heavy 2×11 @ 50 kg; Assisterade chins moderate 1×9 @ 35 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 25 | 2026-04-27 | A | completed | Knäböj heavy 2×9 @ 42,5 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×9 @ 35 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 26 | 2026-04-30 | B | completed | Sittande kabelrodd moderate 1×8 @ 10 kg; Knäböj moderate 2×9 @ 42,5 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×12 @ 2 kg; Triceps pushdown light 1×12 @ 15 kg |
| 27 | 2026-05-02 | C | completed | Marklyft heavy 2×12 @ 50 kg; Knäböj light 1×10 @ 42,5 kg; Militärpress moderate 1×10 @ 20 kg; Assisterade chins moderate 1×9 @ 35 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 28 | 2026-05-04 | A | completed | Knäböj heavy 2×10 @ 42,5 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×10 @ 35 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 29 | 2026-05-07 | B | completed | Knäböj moderate 2×10 @ 42,5 kg; Marklyft light 1×12 @ 50 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×13 @ 2 kg; Triceps pushdown light 1×12 @ 15 kg |
| 30 | 2026-05-09 | C | completed | Knäböj light 1×11 @ 42,5 kg; Militärpress moderate 1×10 @ 20 kg; Marklyft heavy 2×12 @ 50 kg; Assisterade chins moderate 1×10 @ 35 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 31 | 2026-05-11 | A | completed | Knäböj heavy 2×11 @ 42,5 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×10 @ 35 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 32 | 2026-05-14 | B | completed | Sittande kabelrodd moderate 1×8 @ 7,5 kg; Knäböj moderate 2×11 @ 42,5 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×13 @ 2 kg; Triceps pushdown light 1×12 @ 15 kg |
| 33 | 2026-05-16 | C | completed | Marklyft heavy 2×12 @ 50 kg; Knäböj light 1×12 @ 42,5 kg; Militärpress moderate 1×10 @ 20 kg; Assisterade chins moderate 1×8 @ 30 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 34 | 2026-05-19 | A | completed | Knäböj heavy 2×12 @ 42,5 kg; Bänkpress moderate 1×8 @ 30 kg; Assisterade chins moderate 1×8 @ 30 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
| 35 | 2026-05-21 | B | completed | Knäböj moderate 2×12 @ 42,5 kg; Marklyft light 1×12 @ 50 kg; Bänkpress heavy 2×8 @ 30 kg; Bicepscurl light 1×13 @ 2 kg; Triceps pushdown light 1×13 @ 15 kg |
| 36 | 2026-05-23 | C | completed | Knäböj light 1×12 @ 42,5 kg; Militärpress moderate 1×11 @ 20 kg; Marklyft heavy 2×12 @ 50 kg; Assisterade chins moderate 1×8 @ 30 kg assistans; Sidolyft i kabel light 1×14 @ 5 kg |
