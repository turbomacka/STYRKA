-- STYRKA 003: applikationsfält, skärpt åtkomst och atomisk, idempotent setmutation (09).
-- SÄKERHETSGRANSKNING KRÄVS före produktion (09 §5). Alla SECURITY DEFINER-funktioner ligger i
-- ett icke-exponerat schema `private`, har `search_path = ''`, härleder ägare ENBART från auth.uid()
-- och anropas via tunna SECURITY INVOKER-omslag i `public`.

-- ---------------------------------------------------------------------------
-- 1. Kolumner som appen behöver (katalog 1.1.0, profilval, sessionsmetadata)
-- ---------------------------------------------------------------------------
alter table public.exercise_catalog
  add column if not exists areas text[] not null default '{}',
  add column if not exists time_kind text not null default 'other_compound' check (time_kind in ('barbell_compound','other_compound','isolation')),
  add column if not exists recovery_group text not null default 'own' check (recovery_group in ('lower','press','pull','own')),
  add column if not exists catalog_version text not null default '1.1.0';

update public.exercise_catalog c set areas = v.areas, time_kind = v.time_kind, recovery_group = v.recovery_group, name_sv = coalesce(v.name_sv, c.name_sv)
from (values
  ('squat', array['knee','hip','lower_back','ankle_foot'], 'barbell_compound', 'lower', null),
  ('bench_press', array['shoulder','elbow','wrist'], 'barbell_compound', 'press', null),
  ('deadlift', array['knee','hip','lower_back','hamstring','neck_upper_back'], 'barbell_compound', 'lower', null),
  ('romanian_deadlift', array['hip','lower_back','hamstring'], 'barbell_compound', 'lower', null),
  ('overhead_press', array['shoulder','elbow','wrist','neck_upper_back'], 'barbell_compound', 'press', null),
  ('lat_pulldown', array['shoulder','elbow'], 'other_compound', 'pull', null),
  ('assisted_pullup', array['shoulder','elbow','wrist'], 'other_compound', 'pull', null),
  ('pullup', array['shoulder','elbow','wrist'], 'other_compound', 'pull', null),
  ('cable_row', array['shoulder','elbow','lower_back'], 'other_compound', 'pull', null),
  ('chest_supported_row', array['shoulder','elbow'], 'other_compound', 'pull', null),
  ('cable_lateral_raise', array['shoulder'], 'isolation', 'own', 'Sidolyft i kabel'),
  ('biceps_curl', array['elbow','wrist'], 'isolation', 'own', null),
  ('triceps_pushdown', array['elbow','wrist'], 'isolation', 'own', null),
  ('cable_crunch', array['lower_back'], 'isolation', 'own', null),
  ('plank', array['lower_back','shoulder'], 'isolation', 'own', null),
  ('split_squat', array['knee','hip','ankle_foot'], 'other_compound', 'lower', null),
  ('leg_press', array['knee','hip','lower_back'], 'other_compound', 'lower', null)
) as v(slug, areas, time_kind, recovery_group, name_sv)
where c.slug = v.slug;

alter table public.profiles
  add column if not exists substitutions jsonb not null default '{}' check (jsonb_typeof(substitutions) = 'object'),
  add column if not exists favorites text[] not null default '{}',
  add column if not exists bodyweight_kg numeric(6,3) check (bodyweight_kg is null or (bodyweight_kg > 0 and bodyweight_kg <= 400)),
  add column if not exists privacy_notice_version text,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.user_exercise_profiles
  add column if not exists estimate_reps smallint check (estimate_reps between 1 and 8),
  add column if not exists estimate_rir smallint check (estimate_rir between 0 and 5),
  add column if not exists estimate_measured boolean not null default false,
  add column if not exists estimate_tested_at date,
  add column if not exists max_load_kg numeric(8,3) check (max_load_kg is null or (max_load_kg > 0 and max_load_kg <= 500)),
  add column if not exists machine_min_kg numeric(8,3) check (machine_min_kg is null or machine_min_kg >= 0),
  add column if not exists machine_max_kg numeric(8,3) check (machine_max_kg is null or machine_max_kg <= 500),
  add column if not exists experience_override boolean not null default false;

alter table public.programs
  add column if not exists planned_sessions_per_week smallint check (planned_sessions_per_week between 1 and 7),
  add column if not exists revision integer not null default 1,
  add column if not exists ended_at timestamptz;

alter table public.training_sessions
  add column if not exists template_key text,
  add column if not exists rotation_index integer,
  add column if not exists counts_as_planned_at timestamptz,
  add column if not exists client_created_at timestamptz,
  add column if not exists server_received_at timestamptz not null default now();

alter table public.training_sets
  add column if not exists server_received_at timestamptz not null default now();

-- Framtidstider (felställd klocka) valideras (03 §3): högst 24 h framåt.
alter table public.training_sets add constraint training_sets_occurred_not_future check (occurred_at is null or occurred_at <= server_received_at + interval '24 hours');

-- ---------------------------------------------------------------------------
-- 2. Hälsosamtycke: symtomrapporter och områdesbaserade begränsningar kräver aktivt samtycke
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.has_active_health_consent()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.health_consents c
    where c.user_id = (select auth.uid()) and c.granted_at is not null and c.withdrawn_at is null
  );
$$;
revoke all on function private.has_active_health_consent() from public, anon;
grant execute on function private.has_active_health_consent() to authenticated;

drop policy if exists symptom_reports_create_own on public.symptom_reports;
create policy symptom_reports_create_own on public.symptom_reports for insert to authenticated
  with check ((select auth.uid()) = user_id and private.has_active_health_consent());
drop policy if exists symptom_reports_update_own on public.symptom_reports;
create policy symptom_reports_update_own on public.symptom_reports for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and private.has_active_health_consent());

drop policy if exists restriction_rules_create_own on public.restriction_rules;
create policy restriction_rules_create_own on public.restriction_rules for insert to authenticated
  with check ((select auth.uid()) = user_id and (affected_area is null or private.has_active_health_consent()));
drop policy if exists restriction_rules_update_own on public.restriction_rules;
create policy restriction_rules_update_own on public.restriction_rules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (affected_area is null or private.has_active_health_consent()));

-- ---------------------------------------------------------------------------
-- 3. Append-only och skrivskydd
-- ---------------------------------------------------------------------------
-- Planens föreskrifter är immutabla snapshots (02 §9 p10).
revoke update on public.session_exercises from authenticated;
-- Set får endast skrivas via apply_set_mutation (09). Läsning via RLS.
revoke insert, update, delete on public.training_sets from authenticated;
-- Ägarbyte av session förhindras av RLS (with check); föräldrabyte av set av RPC.

-- ---------------------------------------------------------------------------
-- 4. apply_set_mutation (09 §1–2)
-- ---------------------------------------------------------------------------
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
  v_allowed constant text[] := array['sessionExerciseId','ordinal','kind','status','targetKg','targetReps','targetSeconds','actualKg','actualReps','actualSeconds','rir','technique','occurredAt','deleted'];
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
        actual_kg, actual_reps, actual_seconds, rir, technique, occurred_at, client_created_at, revision, deleted_at, server_received_at)
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
        v_now);
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
            'rir',v_set.rir,'technique',v_set.technique,'occurredAt',v_set.occurred_at,'deleted',v_set.deleted_at is not null,'targetKg',v_set.target_kg,'targetReps',v_set.target_reps));
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

-- Exponerat omslag: SECURITY INVOKER, inga egna rättigheter.
create or replace function public.apply_set_mutation(event_id uuid, set_id uuid, base_revision integer, payload jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.apply_set_mutation(event_id, set_id, base_revision, payload); $$;
revoke all on function public.apply_set_mutation(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.apply_set_mutation(uuid, uuid, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Radering av hälsouppgifter (atomiskt, egna rader via RLS) och konto
-- ---------------------------------------------------------------------------
create or replace function public.erase_health_data()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_s int; v_r int;
begin
  if v_uid is null then return pg_catalog.jsonb_build_object('status','rejected','code','AUTH_REQUIRED'); end if;
  delete from public.symptom_reports where user_id = v_uid; get diagnostics v_s = row_count;
  delete from public.restriction_rules where user_id = v_uid; get diagnostics v_r = row_count;
  update public.health_consents set withdrawn_at = pg_catalog.now(), revision = revision + 1 where user_id = v_uid;
  return pg_catalog.jsonb_build_object('status','applied','symptomReports',v_s,'restrictionRules',v_r);
end;
$$;
revoke all on function public.erase_health_data() from public, anon;
grant execute on function public.erase_health_data() to authenticated;

-- Kontoradering kräver borttag i auth.users (kaskad till all användardata via profiles).
create or replace function private.delete_my_account()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_n int;
begin
  if v_uid is null then return pg_catalog.jsonb_build_object('status','rejected','code','AUTH_REQUIRED'); end if;
  delete from auth.users where id = v_uid;
  get diagnostics v_n = row_count;
  return pg_catalog.jsonb_build_object('status', case when v_n = 1 then 'applied' else 'rejected' end);
end;
$$;
revoke all on function private.delete_my_account() from public, anon;
grant execute on function private.delete_my_account() to authenticated;

create or replace function public.delete_my_account()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select private.delete_my_account(); $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Kvittoretention: idempotensgaranti minst 90 dagar (09 §4). Körs av drift (service role), aldrig av klient.
create or replace function private.purge_mutation_receipts(p_keep_days integer default 120)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n int;
begin
  if p_keep_days < 90 then raise exception 'RETENTION_BELOW_90_DAYS'; end if;
  delete from public.mutation_receipts where received_at < pg_catalog.now() - pg_catalog.make_interval(days => p_keep_days);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function private.purge_mutation_receipts(integer) from public, anon, authenticated;

create index if not exists ix_receipts_user on public.mutation_receipts(user_id, received_at);
create index if not exists ix_sets_session_exercise on public.training_sets(session_exercise_id);
