-- STYRKA 004: STYRKA-CR-2026-10-10-01 – övningssubstitution med övningsspecifik kalibrering.
-- ENDAST ADDITIV: inga befintliga rader, set, rekommendationer eller snapshots ändras eller raderas.
-- Kräver manuell säkerhetsgranskning av ändrad private.apply_set_mutation före produktion (09 §5).

-- 1. Katalog 2.0.0: variantmetadata (exercise_variant_metadata) och nya övningar
alter table public.exercise_catalog
  add column if not exists load_display_basis text not null default 'total_kg' check (load_display_basis in ('total_kg','per_hand_kg','assistance_kg','bodyweight_plus_kg','reps_only','seconds')),
  add column if not exists equipment_class text not null default 'barbell' check (equipment_class in ('barbell','specialty_bar','smith','dumbbell','machine','cable','bodyweight','plate')),
  add column if not exists requires_equipment_profile boolean not null default false,
  add column if not exists unilateral boolean not null default false,
  add column if not exists time_multiplier numeric(3,2) not null default 1.00 check (time_multiplier between 1 and 4),
  add column if not exists catalog_since text not null default '1.0.0';

-- Metadata för version 1-övningarna (värden och regler oförändrade; tidsfaktor 1).
update public.exercise_catalog c set load_display_basis = v.basis, equipment_class = v.eq_class, requires_equipment_profile = v.req_profile, unilateral = v.unilateral, time_multiplier = v.time_mult
from (values
('squat', 'total_kg', 'barbell', false, false, 1.00),
  ('bench_press', 'total_kg', 'barbell', false, false, 1.00),
  ('deadlift', 'total_kg', 'barbell', false, false, 1.00),
  ('romanian_deadlift', 'total_kg', 'barbell', false, false, 1.00),
  ('overhead_press', 'total_kg', 'barbell', false, false, 1.00),
  ('lat_pulldown', 'total_kg', 'cable', true, false, 1.00),
  ('assisted_pullup', 'assistance_kg', 'machine', true, false, 1.00),
  ('pullup', 'bodyweight_plus_kg', 'bodyweight', false, false, 1.00),
  ('cable_row', 'total_kg', 'cable', true, false, 1.00),
  ('chest_supported_row', 'total_kg', 'machine', true, false, 1.00),
  ('cable_lateral_raise', 'total_kg', 'cable', true, false, 1.00),
  ('biceps_curl', 'total_kg', 'dumbbell', false, false, 1.00),
  ('triceps_pushdown', 'total_kg', 'cable', true, false, 1.00),
  ('cable_crunch', 'total_kg', 'cable', true, false, 1.00),
  ('plank', 'seconds', 'bodyweight', false, false, 1.00),
  ('split_squat', 'total_kg', 'dumbbell', false, true, 1.00),
  ('leg_press', 'total_kg', 'machine', true, false, 1.00)
) as v(slug, basis, eq_class, req_profile, unilateral, time_mult)
where c.slug = v.slug;

insert into public.exercise_catalog (slug, name_sv, pattern, load_kind, equipment, default_increment_kg, version, active, areas, time_kind, recovery_group, catalog_version, load_display_basis, equipment_class, requires_equipment_profile, unilateral, time_multiplier, catalog_since) values
('front_squat', 'Frontböj', 'squat', 'external_kg', array['rack','barbell','plates']::text[], 2.500, 2, true, array['knee','hip','lower_back','ankle_foot','wrist']::text[], 'barbell_compound', 'lower', '2.0.0', 'total_kg', 'barbell', false, false, 1.00, '2.0.0'),
  ('safety_bar_squat', 'Safety bar-knäböj', 'squat', 'external_kg', array['rack','safety_bar','plates']::text[], 2.500, 2, true, array['knee','hip','lower_back','ankle_foot']::text[], 'barbell_compound', 'lower', '2.0.0', 'total_kg', 'specialty_bar', false, false, 1.00, '2.0.0'),
  ('smith_squat', 'Smithknäböj', 'squat', 'external_kg', array['smith_machine','plates']::text[], 2.500, 2, true, array['knee','hip','lower_back']::text[], 'other_compound', 'lower', '2.0.0', 'total_kg', 'smith', true, false, 1.00, '2.0.0'),
  ('hack_squat', 'Hack squat', 'squat', 'external_kg', array['machines','plates']::text[], 5.000, 2, true, array['knee','hip','lower_back']::text[], 'other_compound', 'lower', '2.0.0', 'total_kg', 'machine', true, false, 1.00, '2.0.0'),
  ('goblet_squat', 'Gobletknäböj', 'squat', 'external_kg', array['dumbbell']::text[], 2.000, 2, true, array['knee','hip','lower_back','ankle_foot']::text[], 'other_compound', 'lower', '2.0.0', 'total_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('sumo_deadlift', 'Sumomarklyft', 'hinge', 'external_kg', array['barbell','plates']::text[], 5.000, 2, true, array['knee','hip','lower_back','hamstring','neck_upper_back']::text[], 'barbell_compound', 'lower', '2.0.0', 'total_kg', 'barbell', false, false, 1.00, '2.0.0'),
  ('trap_bar_deadlift', 'Trap bar-marklyft', 'hinge', 'external_kg', array['trap_bar','plates']::text[], 5.000, 2, true, array['knee','hip','lower_back','hamstring']::text[], 'barbell_compound', 'lower', '2.0.0', 'total_kg', 'specialty_bar', false, false, 1.00, '2.0.0'),
  ('dumbbell_romanian_deadlift', 'Rumänska marklyft med hantlar', 'hinge', 'external_kg', array['dumbbell']::text[], 2.000, 2, true, array['hip','lower_back','hamstring']::text[], 'other_compound', 'lower', '2.0.0', 'per_hand_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('stiff_leg_deadlift', 'Stiff leg-marklyft', 'hinge', 'external_kg', array['barbell','plates']::text[], 2.500, 2, true, array['hip','lower_back','hamstring']::text[], 'barbell_compound', 'lower', '2.0.0', 'total_kg', 'barbell', false, false, 1.00, '2.0.0'),
  ('dumbbell_bench_press', 'Hantelpress liggande', 'horizontal_press', 'external_kg', array['bench','dumbbell']::text[], 2.000, 2, true, array['shoulder','elbow','wrist']::text[], 'other_compound', 'press', '2.0.0', 'per_hand_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('smith_bench_press', 'Smithbänkpress', 'horizontal_press', 'external_kg', array['smith_machine','bench','plates']::text[], 2.500, 2, true, array['shoulder','elbow','wrist']::text[], 'other_compound', 'press', '2.0.0', 'total_kg', 'smith', true, false, 1.00, '2.0.0'),
  ('chest_press_machine', 'Bröstpressmaskin', 'horizontal_press', 'external_kg', array['machines']::text[], 2.500, 2, true, array['shoulder','elbow','wrist']::text[], 'other_compound', 'press', '2.0.0', 'total_kg', 'machine', true, false, 1.00, '2.0.0'),
  ('incline_bench_press', 'Lutande bänkpress', 'horizontal_press', 'external_kg', array['bench','barbell','plates']::text[], 2.500, 2, true, array['shoulder','elbow','wrist']::text[], 'barbell_compound', 'press', '2.0.0', 'total_kg', 'barbell', false, false, 1.00, '2.0.0'),
  ('dumbbell_shoulder_press', 'Hantelpress över huvudet', 'vertical_press', 'external_kg', array['dumbbell']::text[], 2.000, 2, true, array['shoulder','elbow','wrist','neck_upper_back']::text[], 'other_compound', 'press', '2.0.0', 'per_hand_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('seated_barbell_press', 'Sittande stångpress', 'vertical_press', 'external_kg', array['bench','barbell','plates']::text[], 2.500, 2, true, array['shoulder','elbow','wrist','neck_upper_back']::text[], 'barbell_compound', 'press', '2.0.0', 'total_kg', 'barbell', false, false, 1.00, '2.0.0'),
  ('shoulder_press_machine', 'Axelpressmaskin', 'vertical_press', 'external_kg', array['machines']::text[], 2.500, 2, true, array['shoulder','elbow','wrist']::text[], 'other_compound', 'press', '2.0.0', 'total_kg', 'machine', true, false, 1.00, '2.0.0'),
  ('neutral_grip_lat_pulldown', 'Latsdrag med neutralt grepp', 'vertical_pull', 'external_kg', array['cable']::text[], 2.500, 2, true, array['shoulder','elbow']::text[], 'other_compound', 'pull', '2.0.0', 'total_kg', 'cable', true, false, 1.00, '2.0.0'),
  ('seated_machine_row', 'Sittande maskinrodd', 'horizontal_pull', 'external_kg', array['machines']::text[], 2.500, 2, true, array['shoulder','elbow']::text[], 'other_compound', 'pull', '2.0.0', 'total_kg', 'machine', true, false, 1.00, '2.0.0'),
  ('one_arm_dumbbell_row', 'Enarms hantelrodd', 'horizontal_pull', 'external_kg', array['dumbbell','bench']::text[], 2.000, 2, true, array['shoulder','elbow','lower_back']::text[], 'other_compound', 'pull', '2.0.0', 'per_hand_kg', 'dumbbell', false, true, 2.00, '2.0.0'),
  ('dumbbell_lateral_raise', 'Sidolyft med hantlar', 'isolation_shoulder', 'external_kg', array['dumbbell']::text[], 1.000, 2, true, array['shoulder']::text[], 'isolation', 'own', '2.0.0', 'per_hand_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('lateral_raise_machine', 'Sidolyft i maskin', 'isolation_shoulder', 'external_kg', array['machines']::text[], 1.000, 2, true, array['shoulder']::text[], 'isolation', 'own', '2.0.0', 'total_kg', 'machine', true, false, 1.00, '2.0.0'),
  ('dumbbell_curl', 'Hantelcurl', 'isolation_arm', 'external_kg', array['dumbbell']::text[], 1.000, 2, true, array['elbow','wrist']::text[], 'isolation', 'own', '2.0.0', 'per_hand_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('cable_curl', 'Kabelcurl', 'isolation_arm', 'external_kg', array['cable']::text[], 1.000, 2, true, array['elbow','wrist']::text[], 'isolation', 'own', '2.0.0', 'total_kg', 'cable', true, false, 1.00, '2.0.0'),
  ('incline_dumbbell_curl', 'Lutande hantelcurl', 'isolation_arm', 'external_kg', array['dumbbell','bench']::text[], 1.000, 2, true, array['elbow','wrist','shoulder']::text[], 'isolation', 'own', '2.0.0', 'per_hand_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('rope_pushdown', 'Triceps pushdown med rep', 'isolation_arm', 'external_kg', array['cable']::text[], 1.000, 2, true, array['elbow','wrist']::text[], 'isolation', 'own', '2.0.0', 'total_kg', 'cable', true, false, 1.00, '2.0.0'),
  ('overhead_triceps_extension', 'Triceps extension över huvudet', 'isolation_arm', 'external_kg', array['dumbbell']::text[], 1.000, 2, true, array['elbow','shoulder']::text[], 'isolation', 'own', '2.0.0', 'total_kg', 'dumbbell', false, false, 1.00, '2.0.0'),
  ('machine_crunch', 'Magcrunch i maskin', 'trunk', 'external_kg', array['machines']::text[], 2.500, 2, true, array['lower_back']::text[], 'isolation', 'own', '2.0.0', 'total_kg', 'machine', true, false, 1.00, '2.0.0'),
  ('weighted_crunch', 'Viktad crunch', 'trunk', 'external_kg', array['plates']::text[], 2.500, 2, true, array['lower_back','neck_upper_back']::text[], 'isolation', 'own', '2.0.0', 'total_kg', 'plate', false, false, 1.00, '2.0.0'),
  ('bulgarian_split_squat', 'Bulgarisk split squat', 'squat', 'external_kg', array['dumbbell','bench']::text[], 2.000, 2, true, array['knee','hip','ankle_foot']::text[], 'other_compound', 'lower', '2.0.0', 'per_hand_kg', 'dumbbell', false, true, 2.00, '2.0.0'),
  ('lunge', 'Utfall', 'squat', 'external_kg', array['dumbbell']::text[], 2.000, 2, true, array['knee','hip','ankle_foot']::text[], 'other_compound', 'lower', '2.0.0', 'per_hand_kg', 'dumbbell', false, true, 2.00, '2.0.0'),
  ('step_up', 'Step up', 'squat', 'external_kg', array['dumbbell','bench']::text[], 2.000, 2, true, array['knee','hip','ankle_foot']::text[], 'other_compound', 'lower', '2.0.0', 'per_hand_kg', 'dumbbell', false, true, 2.00, '2.0.0')
on conflict (slug) do nothing;

-- 2. Additiva kolumner
-- Aktiv maskinprofil per övning, t.ex. {"leg_press": "gym-b"}.
alter table public.profiles add column if not exists equipment_profiles jsonb not null default '{}' check (jsonb_typeof(equipment_profiles) = 'object');
-- Lastbas för planerad övning (per_hand_kg: 24 = 24 kg per hantel). Null för äldre rader (ospecificerat).
alter table public.session_exercises add column if not exists load_basis text check (load_basis is null or load_basis in ('total_kg','per_hand_kg','assistance_kg','bodyweight_plus_kg','reps_only','seconds'));
-- Frivilligt enkelt svar vid kalibrering.
alter table public.training_sets add column if not exists perceived_effort text check (perceived_effort is null or perceived_effort in ('easy','ok','too_heavy'));

-- 3. Nya persondatatabeller med ägarbaserad RLS
create table if not exists public.user_exercise_calibrations (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  exercise_slug text not null references public.exercise_catalog(slug),
  variant_key text not null default 'default' check (char_length(variant_key) between 1 and 64),
  familiarity text not null default 'unknown' check (familiarity in ('familiar','unfamiliar','unknown')),
  quality text not null default 'none' check (quality in ('none','calibrating','calibrated')),
  -- Referenser till utförda set (id), inte kopior av hälsodata.
  observations uuid[] not null default '{}',
  calibrated_at timestamptz,
  updated_at timestamptz not null default now(),
  revision integer not null default 1,
  unique (user_id, exercise_slug, variant_key),
  unique (id, user_id)
);

create table if not exists public.session_exercise_substitution_events (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_id uuid not null,
  original_exercise_slug text not null references public.exercise_catalog(slug),
  replacement_exercise_slug text not null references public.exercise_catalog(slug),
  original_session_exercise_id uuid,
  replacement_session_exercise_id uuid,
  choice_scope text not null check (choice_scope in ('today','future')),
  event_id uuid not null unique,
  engine_version text not null,
  substitution_catalog_version text not null,
  algorithm_rule_version text not null,
  source_evidence_ids text[] not null default '{}',
  load_estimation_kind text not null check (load_estimation_kind in ('target_observed','target_estimated','calibration','population_prior_low_confidence','none')),
  reason_codes text[] not null default '{}',
  user_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.training_sessions(id, user_id) on delete cascade,
  foreign key (original_session_exercise_id, user_id) references public.session_exercises(id, user_id) on delete set null (original_session_exercise_id),
  foreign key (replacement_session_exercise_id, user_id) references public.session_exercises(id, user_id) on delete set null (replacement_session_exercise_id)
);

create index if not exists ix_sub_events_session on public.session_exercise_substitution_events(session_id);
create index if not exists ix_calibrations_user on public.user_exercise_calibrations(user_id, exercise_slug);

alter table public.user_exercise_calibrations enable row level security;
alter table public.session_exercise_substitution_events enable row level security;
revoke all on public.user_exercise_calibrations from anon, authenticated;
revoke all on public.session_exercise_substitution_events from anon, authenticated;
grant select, insert, update, delete on public.user_exercise_calibrations to authenticated;
-- Revisionsposter är append-only för klienten (radering sker via kontoradering/kaskad).
grant select, insert on public.session_exercise_substitution_events to authenticated;

create policy user_exercise_calibrations_read_own on public.user_exercise_calibrations for select to authenticated using ((select auth.uid()) = user_id);
create policy user_exercise_calibrations_create_own on public.user_exercise_calibrations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_exercise_calibrations_update_own on public.user_exercise_calibrations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_exercise_calibrations_delete_own on public.user_exercise_calibrations for delete to authenticated using ((select auth.uid()) = user_id);
create policy session_exercise_substitution_events_read_own on public.session_exercise_substitution_events for select to authenticated using ((select auth.uid()) = user_id);
create policy session_exercise_substitution_events_create_own on public.session_exercise_substitution_events for insert to authenticated with check ((select auth.uid()) = user_id);

-- 4. apply_set_mutation: tillåter även fältet perceivedEffort (övrig logik identisk med 003)
create or replace function private.apply_set_mutation(p_event_id uuid, p_set_id uuid, p_base_revision integer, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_hash text;
  v_receipt public.mutation_receipts%rowtype;
  v_set public.training_sets%rowtype;
  v_se_id uuid;
  v_rev integer;
  v_key text;
  v_allowed constant text[] := array['sessionExerciseId','ordinal','kind','status','targetKg','targetReps','targetSeconds','actualKg','actualReps','actualSeconds','rir','technique','occurredAt','deleted','perceivedEffort'];
  v_occurred timestamptz;
begin
  -- 1. Autentisering
  if v_uid is null then
    return pg_catalog.jsonb_build_object('status','rejected','code','AUTH_REQUIRED','serverTime',v_now);
  end if;
  -- 2. Schemavalidering
  if p_event_id is null or p_set_id is null or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','serverTime',v_now);
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if not (v_key = any (v_allowed)) then
      return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','field',v_key,'serverTime',v_now);
    end if;
  end loop;
  if p_payload ? 'occurredAt' and p_payload->>'occurredAt' is not null then
    begin
      v_occurred := (p_payload->>'occurredAt')::timestamptz;
    exception when others then
      return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','field','occurredAt','serverTime',v_now);
    end;
    if v_occurred > v_now + interval '24 hours' then
      return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','field','occurredAt','serverTime',v_now);
    end if;
  end if;

  -- Hash över kanoniserad (jsonb-normaliserad) begäran, beräknad på servern.
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_set_id::text || '|' || coalesce(p_base_revision::text, 'null') || '|' || p_payload::text, 'UTF8')), 'hex');

  -- 3. Serialisera samtidiga försök med samma eventId
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id::text, 0));

  -- 4. Idempotens
  select * into v_receipt from public.mutation_receipts where event_id = p_event_id;
  if found then
    if v_receipt.user_id <> v_uid then
      return pg_catalog.jsonb_build_object('status','rejected','code','EVENT_ID_UNAVAILABLE','serverTime',v_now);
    end if;
    if v_receipt.payload_hash = v_hash then
      select revision into v_rev from public.training_sets where id = v_receipt.record_id and user_id = v_uid;
      return pg_catalog.jsonb_build_object('status','duplicate','recordId',v_receipt.record_id,'revision',v_rev,'serverTime',v_now);
    end if;
    return pg_catalog.jsonb_build_object('status','conflict','code','EVENT_REUSE_MISMATCH','recordId',v_receipt.record_id,'serverTime',v_now);
  end if;

  begin
    select * into v_set from public.training_sets where id = p_set_id for update;
    if not found then
      -- 6. Skapande: baseRevision null och förälder ägd av anroparen
      if p_base_revision is not null then
        return pg_catalog.jsonb_build_object('status','rejected','code','NOT_FOUND','serverTime',v_now);
      end if;
      if (p_payload->>'sessionExerciseId') is null then
        return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','field','sessionExerciseId','serverTime',v_now);
      end if;
      select se.id into v_se_id from public.session_exercises se
        where se.id = (p_payload->>'sessionExerciseId')::uuid and se.user_id = v_uid;
      if not found then
        -- 5. Avslöja aldrig om främmande resurs existerar
        return pg_catalog.jsonb_build_object('status','rejected','code','NOT_FOUND','serverTime',v_now);
      end if;
      insert into public.training_sets (id, user_id, session_exercise_id, ordinal, kind, status, target_kg, target_reps, target_seconds,
        actual_kg, actual_reps, actual_seconds, rir, technique, occurred_at, client_created_at, revision, deleted_at, server_received_at, perceived_effort)
      values (p_set_id, v_uid, v_se_id,
        (p_payload->>'ordinal')::smallint,
        p_payload->>'kind',
        coalesce(p_payload->>'status', 'planned'),
        (p_payload->>'targetKg')::numeric,
        (p_payload->>'targetReps')::smallint,
        (p_payload->>'targetSeconds')::smallint,
        (p_payload->>'actualKg')::numeric,
        (p_payload->>'actualReps')::smallint,
        (p_payload->>'actualSeconds')::smallint,
        (p_payload->>'rir')::smallint,
        p_payload->>'technique',
        v_occurred,
        v_now, 1,
        case when (p_payload->>'deleted')::boolean then v_now else null end,
        v_now,
        p_payload->>'perceivedEffort');
      v_rev := 1;
    else
      if v_set.user_id <> v_uid then
        return pg_catalog.jsonb_build_object('status','rejected','code','NOT_FOUND','serverTime',v_now);
      end if;
      if p_payload ? 'sessionExerciseId' and (p_payload->>'sessionExerciseId')::uuid is distinct from v_set.session_exercise_id then
        return pg_catalog.jsonb_build_object('status','rejected','code','PARENT_CHANGE_FORBIDDEN','serverTime',v_now);
      end if;
      if p_base_revision is null or p_base_revision <> v_set.revision then
        -- Ingen tyst last-write-wins: returnera serverversionen (användarens egen) för konfliktvy.
        return pg_catalog.jsonb_build_object('status','conflict','code','REVISION_CONFLICT','recordId',v_set.id,'revision',v_set.revision,'serverTime',v_now,
          'server', pg_catalog.jsonb_build_object('status',v_set.status,'actualKg',v_set.actual_kg,'actualReps',v_set.actual_reps,'actualSeconds',v_set.actual_seconds,
            'rir',v_set.rir,'technique',v_set.technique,'perceivedEffort',v_set.perceived_effort,'occurredAt',v_set.occurred_at,'deleted',v_set.deleted_at is not null,'targetKg',v_set.target_kg,'targetReps',v_set.target_reps));
      end if;
      -- 7. Endast tillåtna attribut; förälder/ägare ändras aldrig.
      update public.training_sets set
        ordinal = case when p_payload ? 'ordinal' then (p_payload->>'ordinal')::smallint else ordinal end,
        kind = case when p_payload ? 'kind' then p_payload->>'kind' else kind end,
        status = case when p_payload ? 'status' then p_payload->>'status' else status end,
        target_kg = case when p_payload ? 'targetKg' then (p_payload->>'targetKg')::numeric else target_kg end,
        target_reps = case when p_payload ? 'targetReps' then (p_payload->>'targetReps')::smallint else target_reps end,
        target_seconds = case when p_payload ? 'targetSeconds' then (p_payload->>'targetSeconds')::smallint else target_seconds end,
        actual_kg = case when p_payload ? 'actualKg' then (p_payload->>'actualKg')::numeric else actual_kg end,
        actual_reps = case when p_payload ? 'actualReps' then (p_payload->>'actualReps')::smallint else actual_reps end,
        actual_seconds = case when p_payload ? 'actualSeconds' then (p_payload->>'actualSeconds')::smallint else actual_seconds end,
        rir = case when p_payload ? 'rir' then (p_payload->>'rir')::smallint else rir end,
        technique = case when p_payload ? 'technique' then p_payload->>'technique' else technique end,
        perceived_effort = case when p_payload ? 'perceivedEffort' then p_payload->>'perceivedEffort' else perceived_effort end,
        occurred_at = case when p_payload ? 'occurredAt' then v_occurred else occurred_at end,
        deleted_at = case when p_payload ? 'deleted' then (case when (p_payload->>'deleted')::boolean then coalesce(deleted_at, v_now) else null end) else deleted_at end,
        revision = revision + 1,
        server_received_at = v_now
      where id = p_set_id and user_id = v_uid
      returning revision into v_rev;
    end if;

    -- 8. Kvitto i samma transaktion
    insert into public.mutation_receipts (event_id, user_id, record_id, record_type, payload_hash, status, received_at)
    values (p_event_id, v_uid, p_set_id, 'training_set', v_hash, 'applied', v_now);
  exception
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
      return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','serverTime',v_now);
    when unique_violation then
      -- t.ex. samma (övning, ordinal, kind) två gånger
      return pg_catalog.jsonb_build_object('status','rejected','code','VALIDATION_ERROR','field','ordinal','serverTime',v_now);
    when foreign_key_violation then
      return pg_catalog.jsonb_build_object('status','rejected','code','NOT_FOUND','serverTime',v_now);
  end;

  -- 9. Ack efter (implicit) commit av anropande transaktion
  return pg_catalog.jsonb_build_object('status','applied','recordId',p_set_id,'revision',v_rev,'serverTime',v_now);
end;
$$;
revoke all on function private.apply_set_mutation(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function private.apply_set_mutation(uuid, uuid, integer, jsonb) to authenticated;
