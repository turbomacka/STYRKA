-- STYRKA schema baseline, PostgreSQL 15+. SECURITY REVIEW REQUIRED before production.
-- Designed to run in Supabase local environment; apply via migrations after local tests.
create extension if not exists pgcrypto;

create table if not exists public.exercise_catalog (
  slug text primary key,
  name_sv text not null,
  pattern text not null,
  load_kind text not null check (load_kind in ('external_kg','assistance_kg','bodyweight_plus_kg','reps_only','duration_sec')),
  equipment text[] not null default '{}',
  default_increment_kg numeric(8,3) not null default 2.500 check (default_increment_kg>0),
  version integer not null default 1,
  active boolean not null default true
);

create table if not exists public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 planned_sessions_per_week smallint not null default 2 check(planned_sessions_per_week between 1 and 7),
 minutes_per_session smallint not null default 40 check(minutes_per_session between 15 and 120),
 experience text not null default 'novice' check(experience in('novice','intermediate','experienced')),
 age_years smallint check(age_years between 18 and 120),
 adult_confirmed boolean not null default false,
 timezone text not null default 'Europe/Stockholm',
 goals jsonb not null default '{"squat":1,"bench_press":1,"deadlift":1}',
 revision integer not null default 1 check(revision>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.user_equipment (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 equipment_slug text not null, created_at timestamptz not null default now(),
 unique(user_id,equipment_slug), unique(id,user_id)
);

create table if not exists public.user_exercise_profiles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 exercise_slug text not null references public.exercise_catalog(slug),
 variant_key text not null default 'default',
 experience text not null default 'novice' check(experience in('novice','intermediate','experienced')),
 increment_kg numeric(8,3) not null default 2.500 check(increment_kg>0 and increment_kg<=10),
 estimate_kg numeric(8,3) check(estimate_kg>0 and estimate_kg<=500),
 estimate_kind text check(estimate_kind in('1rm','3rm','submax')),
 estimate_confidence text not null default 'unknown' check(estimate_confidence in('unknown','low','medium','high')),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 unique(user_id,exercise_slug,variant_key), unique(id,user_id)
);

create table if not exists public.health_consents (
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 consent_version text not null, granted_at timestamptz,
 withdrawn_at timestamptz,
 revision integer not null default 1,
 check(granted_at is not null or withdrawn_at is not null)
);

create table if not exists public.restriction_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 rule_kind text not null check(rule_kind in('block_exercise','block_pair_heavy','limit_sets','limit_mode','region_note')),
 exercise_a text references public.exercise_catalog(slug), exercise_b text references public.exercise_catalog(slug),
 affected_area text check(affected_area in ('knee','hip','lower_back','shoulder','elbow','wrist','neck_upper_back','hamstring','ankle_foot','other')),
 side text check(side in ('left','right','both','not_applicable')),
 max_sets smallint check(max_sets between 1 and 6), max_mode text check(max_mode in ('heavy','moderate','light')),
 active boolean not null default true,
 description text check (char_length(description)<=500),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id)
);

create table if not exists public.programs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 template text not null, version text not null, rotation_index integer not null default 0,
 active boolean not null default true, created_at timestamptz not null default now(),
 unique(id,user_id)
);

create table if not exists public.training_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 program_id uuid, kind text not null check(kind in('planned','extra','calibration')),
 status text not null check(status in('preview','in_progress','paused','completed','partial','abandoned')),
 local_timezone text not null default 'Europe/Stockholm',
 started_at timestamptz, finished_at timestamptz,
 planned_minutes smallint check(planned_minutes between 15 and 120),
 perceived_readiness text check(perceived_readiness in ('good','normal','tired','pain')),
 is_replacement_for_planned boolean not null default false,
 revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id),
 foreign key(program_id,user_id) references public.programs(id,user_id) on delete set null (program_id)
);

create table if not exists public.session_exercises (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 session_id uuid not null, exercise_slug text not null references public.exercise_catalog(slug),
 variant_key text not null default 'default', order_index smallint not null,
 mode text not null check(mode in('heavy','moderate','light')),
 band_min smallint not null check(band_min between 1 and 50),
 band_max smallint not null check(band_max between 1 and 50 and band_max>=band_min),
 target_sets smallint not null check(target_sets between 1 and 6),
 recommendation_snapshot jsonb not null default '{}',
 created_at timestamptz not null default now(),
 unique(session_id,order_index), unique(id,user_id),
 foreign key(session_id,user_id) references public.training_sessions(id,user_id) on delete cascade
);

create table if not exists public.training_sets (
 id uuid primary key, user_id uuid not null references public.profiles(user_id) on delete cascade,
 session_exercise_id uuid not null,
 ordinal smallint not null check(ordinal between 1 and 20),
 kind text not null check(kind in('work','warmup')),
 status text not null check(status in('planned','done','skipped')),
 target_kg numeric(8,3) check(target_kg>=0 and target_kg<=500), target_reps smallint check(target_reps between 0 and 50), target_seconds smallint check(target_seconds between 1 and 900),
 actual_kg numeric(8,3) check(actual_kg>=0 and actual_kg<=500), actual_reps smallint check(actual_reps between 0 and 50), actual_seconds smallint check(actual_seconds between 0 and 900),
 rir smallint check(rir between 0 and 5), technique text check(technique in('controlled','uncertain','poor')),
 occurred_at timestamptz, client_created_at timestamptz not null default now(), revision integer not null default 1,
 deleted_at timestamptz,
 unique(session_exercise_id,ordinal,kind), unique(id,user_id),
 foreign key(session_exercise_id,user_id) references public.session_exercises(id,user_id) on delete cascade,
 check(status<>'done' or ((actual_reps is not null or actual_seconds is not null) and occurred_at is not null))
);

create table if not exists public.symptom_reports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 session_id uuid,
 area text not null check(area in ('knee','hip','lower_back','shoulder','elbow','wrist','neck_upper_back','hamstring','ankle_foot','other')),
 side text check(side in ('left','right','both','not_applicable')),
 reaction text not null check(reaction in('baseline','transient','persistent','limping','swelling','unknown')),
 pain smallint check(pain between 0 and 10),
 reported_at timestamptz not null default now(), resolved_at timestamptz,
 unique(id,user_id),
 foreign key(session_id,user_id) references public.training_sessions(id,user_id) on delete set null (session_id)
);

create table if not exists public.recommendation_audits (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(user_id) on delete cascade,
 session_id uuid, engine_version text not null,
 inputs_hash text not null, reason_codes text[] not null default '{}',
 plan_snapshot jsonb not null, generated_at timestamptz not null default now(),
 unique(id,user_id),
 foreign key(session_id,user_id) references public.training_sessions(id,user_id) on delete set null (session_id)
);

create table if not exists public.mutation_receipts (
 event_id uuid primary key, user_id uuid not null references public.profiles(user_id) on delete cascade,
 record_id uuid not null, record_type text not null, payload_hash text not null,
 status text not null check(status in ('applied','conflict','rejected')),
 received_at timestamptz not null default now(), unique(event_id,user_id)
);

create index if not exists ix_sessions_user_start on public.training_sessions(user_id,started_at desc);
create index if not exists ix_sets_user_occurred on public.training_sets(user_id,occurred_at desc);
create index if not exists ix_symptom_user_area on public.symptom_reports(user_id,area,reported_at desc);
create index if not exists ix_exercises_session on public.session_exercises(session_id,order_index);

-- SECURITY: default deny for all user data; explicitly authorize own rows.
alter table public.exercise_catalog enable row level security;
revoke all on public.exercise_catalog from anon, authenticated;
grant select on public.exercise_catalog to anon, authenticated;
create policy catalog_read on public.exercise_catalog for select to anon, authenticated using (true);

DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['profiles','user_equipment','user_exercise_profiles','health_consents','restriction_rules','programs','training_sessions','session_exercises','training_sets','symptom_reports','recommendation_audits','mutation_receipts']
 LOOP
   EXECUTE format('alter table public.%I enable row level security',tbl);
   EXECUTE format('revoke all on public.%I from anon, authenticated',tbl);
   EXECUTE format('grant select, insert, update, delete on public.%I to authenticated',tbl);
   EXECUTE format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',tbl||'_read_own',tbl);
   EXECUTE format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',tbl||'_create_own',tbl);
   EXECUTE format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',tbl||'_update_own',tbl);
   EXECUTE format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',tbl||'_delete_own',tbl);
 END LOOP;
END $$;

-- WARNING: direct table CRUD + RLS is a defense layer, not the complete
-- optimistic revision / atomic event replay implementation. Implement and test
-- an authenticated server operation for revision checks and deduplication prior
-- to shipping. Access through direct writes should then be restricted as needed.

-- Restrict direct mutation of audit/deduplication records. Privileged server flow
-- must implement revision-aware, authenticated writes and be security reviewed.
revoke insert, update, delete on public.mutation_receipts from authenticated;
revoke update, delete on public.recommendation_audits from authenticated;
