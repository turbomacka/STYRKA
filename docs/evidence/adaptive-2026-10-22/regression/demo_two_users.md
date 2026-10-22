# Demo: två oberoende konton, 36 pass vardera och spontanpass

Genererad av `tests/db/demo_two_users.test.ts` mot lokal Supabase (2026-10-22). Simulerad klocka; alla data syntetiska.

## Konton
- **A** (`1b3a9a0d-79c2-4921-9780-839293a3f244`): 2 pass/vecka, 60 min, medelvan, **latsdrag**, RIR anges.
- **B** (`38f35c0f-75ee-4448-9c99-8fd161718b62`): 3 pass/vecka, 45 min, novis, **assisterade chins** (eget variantval), `block_pair_heavy(squat, deadlift)`, inga RIR, offline under pass 5–8.

## Verifierat i databasen
- A: extra: 1, planned: 36 · utförda set på server = lokalt = 387
- B: planned: 36 · utförda set på server = lokalt = 336
- Latsdrag endast hos A, assisterade chins endast hos B: ja
- B: pass med både tung knäböj och tung marklyft: 0
- Set som pekar på annan användares övning: 0; B:s läsning av A:s set: 0 rader
- B assistans (kg) över tid: 40 → 40 → 40 → 40 → 40 → 40 → 35 → 35 → 35 → 35 → 35 → 35 → 30 → 30 → 30 → 30 → 30 → 30 → 25 → 25 → 25 → 25 → 25 → 25 → 20 → 20 → 20 → 20 → 20 → 20 → 15 → 15 → 15 → 15 → 15
- A tung bänkpress (kg) över tid: 75 → 77,5 → 80 → 82,5

## Spontanpass som ändrar nästa ordinarie rekommendation

**Nästa ordinarie (C) före spontanpass:** Marklyft heavy 2×5 @ 125 kg; Knäböj light 2×9 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×8 @ 65 kg; Sidolyft i kabel light 2×12 @ 12 kg

**Spontanpass (30 min, dagsform bra) ~28 h före:** Knäböj heavy 3×7 @ 95 kg; Bänkpress moderate 2×7 @ 70 kg; Latsdrag moderate 2×8 @ 65 kg; Sidolyft i kabel light 1×12 @ 12 kg

**Nästa ordinarie (C) efter spontanpass:** Marklyft heavy 2×5 @ 125 kg; Knäböj light 2×8 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×9 @ 65 kg; Sidolyft i kabel light 2×12 @ 12 kg

Skälkoder efter: TEMPLATE_C, DOUBLE_PROGRESS_WEIGHT, NORMAL_TIME_WINDOW, RECOVERY_HOLD, RECOVERY_24_TO_48H, RECOVERY_MATCHED_WORK, STEP_EXCEEDS_PROGRESS_CAP, DOUBLE_PROGRESS_REPS, NO_RELEVANT_HISTORY

Rotationen oförändrad: ja. Rekommendationen ändrad: ja.

## Passlogg A
| # | Datum | Mall | Status | Föreskrift |
|---|---|---|---|---|
| 1 | 2026-03-02 | A | completed | Knäböj heavy 3×5 @ 92,5 kg; Bänkpress moderate 3×6 @ 67,5 kg; Latsdrag moderate 2×6 @ 57,5 kg; Sidolyft i kabel light 2×8 @ 12 kg |
| 2 | 2026-03-05 | B | completed | Bänkpress heavy 3×5 @ 75 kg; Marklyft light 2×8 @ 90 kg; Latsdrag moderate 2×7 @ 57,5 kg; Bicepscurl light 2×8 @ 18 kg; Triceps pushdown light 2×8 @ 24 kg |
| 3 | 2026-03-09 | C | completed | Marklyft heavy 2×5 @ 115 kg; Knäböj light 2×8 @ 70 kg; Militärpress moderate 3×6 @ 37,5 kg; Latsdrag moderate 2×8 @ 57,5 kg; Sidolyft i kabel light 2×9 @ 12 kg |
| 4 | 2026-03-12 | A | completed | Knäböj heavy 3×6 @ 92,5 kg; Bänkpress moderate 3×7 @ 67,5 kg; Latsdrag moderate 2×9 @ 57,5 kg; Sidolyft i kabel light 2×10 @ 12 kg |
| 5 | 2026-03-16 | B | completed | Bänkpress heavy 3×6 @ 75 kg; Marklyft light 2×9 @ 90 kg; Latsdrag moderate 2×10 @ 57,5 kg; Bicepscurl light 2×9 @ 18 kg; Triceps pushdown light 2×9 @ 24 kg |
| 6 | 2026-03-19 | C | completed | Marklyft heavy 2×6 @ 115 kg; Knäböj light 2×9 @ 70 kg; Militärpress moderate 3×7 @ 37,5 kg; Latsdrag moderate 2×6 @ 60 kg; Sidolyft i kabel light 2×11 @ 12 kg |
| 7 | 2026-03-23 | A | completed | Knäböj heavy 3×7 @ 92,5 kg; Bänkpress moderate 3×8 @ 67,5 kg; Latsdrag moderate 2×7 @ 60 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 8 | 2026-03-26 | B | completed | Bänkpress heavy 3×7 @ 75 kg; Marklyft light 2×10 @ 90 kg; Latsdrag moderate 2×7 @ 60 kg; Bicepscurl light 2×10 @ 18 kg; Triceps pushdown light 2×10 @ 24 kg |
| 9 | 2026-03-30 | C | completed | Marklyft heavy 2×7 @ 115 kg; Knäböj light 2×10 @ 70 kg; Militärpress moderate 3×8 @ 37,5 kg; Latsdrag moderate 2×8 @ 60 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 10 | 2026-04-02 | A | completed | Knäböj heavy 3×7 @ 92,5 kg; Bänkpress moderate 3×8 @ 67,5 kg; Latsdrag moderate 2×9 @ 60 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 11 | 2026-04-06 | B | completed | Bänkpress heavy 3×5 @ 77,5 kg; Marklyft light 2×11 @ 90 kg; Latsdrag moderate 2×10 @ 60 kg; Bicepscurl light 2×11 @ 18 kg; Triceps pushdown light 2×11 @ 24 kg |
| 12 | 2026-04-09 | C | completed | Marklyft heavy 2×5 @ 120 kg; Knäböj light 2×11 @ 70 kg; Militärpress moderate 3×9 @ 37,5 kg; Latsdrag moderate 2×6 @ 62,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 13 | 2026-04-13 | A | completed | Knäböj heavy 3×7 @ 92,5 kg; Bänkpress moderate 3×9 @ 67,5 kg; Latsdrag moderate 2×7 @ 62,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 14 | 2026-04-17 | B | completed | Bänkpress heavy 3×5 @ 77,5 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×8 @ 62,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×12 @ 24 kg |
| 15 | 2026-04-20 | C | partial | Marklyft heavy 2×6 @ 120 kg; Knäböj light 2×12 @ 70 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×8 @ 62,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 16 | 2026-04-24 | A | completed | Knäböj heavy 3×5 @ 95 kg; Bänkpress moderate 3×10 @ 67,5 kg; Latsdrag moderate 2×8 @ 62,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 17 | 2026-04-27 | B | completed | Bänkpress heavy 3×5 @ 77,5 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×9 @ 62,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×12 @ 24 kg |
| 18 | 2026-05-01 | C | completed | Marklyft heavy 2×7 @ 120 kg; Knäböj light 2×8 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×10 @ 62,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 19 | 2026-05-04 | A | completed | Knäböj heavy 3×6 @ 95 kg; Bänkpress moderate 3×6 @ 70 kg; Latsdrag moderate 2×6 @ 65 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 20 | 2026-05-08 | B | completed | Bänkpress heavy 3×6 @ 77,5 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×7 @ 65 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×8 @ 25 kg |
| 0 | 2026-05-10 | Spontan | completed | Knäböj heavy 3×7 @ 95 kg; Bänkpress moderate 2×7 @ 70 kg; Latsdrag moderate 2×8 @ 65 kg; Sidolyft i kabel light 1×12 @ 12 kg |
| 21 | 2026-05-11 | C | completed | Marklyft heavy 2×5 @ 125 kg; Knäböj light 2×8 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×9 @ 65 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 22 | 2026-05-15 | A | completed | Knäböj heavy 3×5 @ 97,5 kg; Bänkpress moderate 3×8 @ 70 kg; Latsdrag moderate 2×9 @ 65 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 23 | 2026-05-18 | B | completed | Bänkpress heavy 3×7 @ 77,5 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×10 @ 65 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×9 @ 25 kg |
| 24 | 2026-05-22 | C | completed | Marklyft heavy 2×5 @ 125 kg; Knäböj light 2×8 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×6 @ 67,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 25 | 2026-05-25 | A | completed | Knäböj heavy 3×6 @ 97,5 kg; Bänkpress moderate 3×9 @ 70 kg; Latsdrag moderate 2×7 @ 67,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 26 | 2026-05-29 | B | completed | Bänkpress heavy 3×5 @ 80 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×8 @ 67,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×10 @ 25 kg |
| 27 | 2026-06-01 | C | completed | Marklyft heavy 2×6 @ 125 kg; Knäböj light 2×9 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×9 @ 67,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 28 | 2026-06-05 | A | completed | Knäböj heavy 3×7 @ 97,5 kg; Bänkpress moderate 3×10 @ 70 kg; Latsdrag moderate 2×10 @ 67,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 29 | 2026-06-08 | B | completed | Bänkpress heavy 3×6 @ 80 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×10 @ 67,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×11 @ 25 kg |
| 30 | 2026-06-12 | C | completed | Marklyft heavy 2×7 @ 125 kg; Knäböj light 2×10 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×6 @ 70 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 31 | 2026-06-15 | A | completed | Knäböj heavy 3×7 @ 97,5 kg; Bänkpress moderate 3×10 @ 70 kg; Latsdrag moderate 2×7 @ 70 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 32 | 2026-06-19 | B | completed | Bänkpress heavy 3×7 @ 80 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×8 @ 70 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×12 @ 25 kg |
| 33 | 2026-06-22 | C | completed | Marklyft heavy 2×5 @ 130 kg; Knäböj light 2×11 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×9 @ 70 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 34 | 2026-06-26 | A | completed | Knäböj heavy 3×5 @ 100 kg; Bänkpress moderate 3×6 @ 72,5 kg; Latsdrag moderate 2×10 @ 70 kg; Sidolyft i kabel light 2×12 @ 12 kg |
| 35 | 2026-06-29 | B | completed | Bänkpress heavy 3×5 @ 82,5 kg; Marklyft light 2×12 @ 90 kg; Latsdrag moderate 2×6 @ 72,5 kg; Bicepscurl light 2×12 @ 18 kg; Triceps pushdown light 2×8 @ 26 kg |
| 36 | 2026-07-03 | C | completed | Marklyft heavy 2×6 @ 130 kg; Knäböj light 2×12 @ 72,5 kg; Militärpress moderate 3×10 @ 37,5 kg; Latsdrag moderate 2×6 @ 72,5 kg; Sidolyft i kabel light 2×12 @ 12 kg |

## Passlogg B
| # | Datum | Mall | Status | Föreskrift |
|---|---|---|---|---|
| 1 | 2026-03-02 | A | completed | Knäböj heavy 2×8 (kalibrera); Bänkpress moderate 2×8 @ 30 kg; Assisterade chins moderate 2×8 (kalibrera); Sidolyft i kabel light 2×10 (kalibrera) |
| 2 | 2026-03-05 | B | completed | Bänkpress heavy 2×8 @ 32,5 kg; Marklyft light 2×10 (kalibrera); Assisterade chins moderate 2×8 @ 40 kg assistans; Bicepscurl light 2×10 @ 2 kg; Triceps pushdown light 2×10 (kalibrera) |
| 3 | 2026-03-07 | C | completed | Marklyft heavy 2×8 (kalibrera); Knäböj light 2×10 @ 30 kg; Militärpress moderate 2×8 (kalibrera); Assisterade chins moderate 2×8 @ 40 kg assistans; Sidolyft i kabel light 2×10 @ 5 kg |
| 4 | 2026-03-09 | A | completed | Knäböj heavy 2×8 @ 40 kg; Bänkpress moderate 2×8 @ 30 kg; Assisterade chins moderate 2×9 @ 40 kg assistans; Sidolyft i kabel light 2×11 @ 5 kg |
| 5 | 2026-03-12 | B | completed | Bänkpress heavy 2×8 @ 32,5 kg; Marklyft light 2×10 @ 50 kg; Assisterade chins moderate 2×9 @ 40 kg assistans; Bicepscurl light 2×10 @ 2 kg; Triceps pushdown light 2×10 @ 15 kg |
| 6 | 2026-03-14 | C | completed | Marklyft heavy 2×8 @ 50 kg; Knäböj light 2×10 @ 30 kg; Militärpress moderate 2×8 @ 20 kg; Assisterade chins moderate 2×10 @ 40 kg assistans; Sidolyft i kabel light 2×11 @ 5 kg |
| 7 | 2026-03-16 | A | completed | Knäböj heavy 2×9 @ 40 kg; Bänkpress moderate 2×9 @ 30 kg; Assisterade chins moderate 2×10 @ 40 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 8 | 2026-03-19 | B | completed | Bänkpress heavy 2×9 @ 32,5 kg; Marklyft light 2×11 @ 50 kg; Assisterade chins moderate 2×8 @ 35 kg assistans; Bicepscurl light 2×11 @ 2 kg; Triceps pushdown light 2×11 @ 15 kg |
| 9 | 2026-03-21 | C | completed | Marklyft heavy 2×9 @ 50 kg; Knäböj light 2×11 @ 30 kg; Militärpress moderate 2×9 @ 20 kg; Assisterade chins moderate 2×8 @ 35 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 10 | 2026-03-23 | A | completed | Knäböj heavy 2×9 @ 40 kg; Bänkpress moderate 2×9 @ 30 kg; Assisterade chins moderate 2×9 @ 35 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 11 | 2026-03-26 | B | completed | Bänkpress heavy 2×9 @ 32,5 kg; Marklyft light 2×11 @ 50 kg; Assisterade chins moderate 2×9 @ 35 kg assistans; Bicepscurl light 2×11 @ 2 kg; Triceps pushdown light 2×11 @ 15 kg |
| 12 | 2026-03-28 | C | completed | Marklyft heavy 2×9 @ 50 kg; Knäböj light 2×11 @ 30 kg; Militärpress moderate 2×9 @ 20 kg; Assisterade chins moderate 2×10 @ 35 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 13 | 2026-03-30 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×10 @ 35 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 14 | 2026-04-02 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×8 @ 30 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 15 | 2026-04-04 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×8 @ 30 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 16 | 2026-04-06 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×9 @ 30 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 17 | 2026-04-09 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×9 @ 30 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 18 | 2026-04-11 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×10 @ 30 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 19 | 2026-04-13 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×10 @ 30 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 20 | 2026-04-16 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×8 @ 25 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 21 | 2026-04-18 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×8 @ 25 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 22 | 2026-04-21 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×9 @ 25 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 23 | 2026-04-23 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×9 @ 25 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 24 | 2026-04-25 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×10 @ 25 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 25 | 2026-04-28 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×10 @ 25 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 26 | 2026-04-30 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×8 @ 20 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 27 | 2026-05-02 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×8 @ 20 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 28 | 2026-05-05 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×9 @ 20 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 29 | 2026-05-07 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×9 @ 20 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 30 | 2026-05-09 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×10 @ 20 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 31 | 2026-05-12 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×10 @ 20 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 32 | 2026-05-14 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×8 @ 15 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 33 | 2026-05-16 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×8 @ 15 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 34 | 2026-05-19 | A | completed | Knäböj heavy 2×10 @ 40 kg; Bänkpress moderate 2×10 @ 30 kg; Assisterade chins moderate 2×9 @ 15 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
| 35 | 2026-05-21 | B | completed | Bänkpress heavy 2×10 @ 32,5 kg; Marklyft light 2×12 @ 50 kg; Assisterade chins moderate 2×9 @ 15 kg assistans; Bicepscurl light 2×12 @ 2 kg; Triceps pushdown light 2×12 @ 15 kg |
| 36 | 2026-05-23 | C | completed | Marklyft heavy 2×10 @ 50 kg; Knäböj light 2×12 @ 30 kg; Militärpress moderate 2×10 @ 20 kg; Assisterade chins moderate 2×10 @ 15 kg assistans; Sidolyft i kabel light 2×12 @ 5 kg |
