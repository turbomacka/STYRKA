-- Additive JSON fields: old rows stay NULL. No fabricated sides or duplicated sets.
alter table public.profiles add column training_preferences jsonb;
alter table public.session_exercises add column configuration jsonb;
alter table public.training_sets add column detail jsonb;
alter table public.training_sets drop constraint training_sets_status_check;
alter table public.training_sets add constraint training_sets_status_check check (status in ('planned','partial','done','skipped'));
alter table public.profiles add constraint training_preferences_shape check (training_preferences is null or (jsonb_typeof(training_preferences) = 'object' and octet_length(training_preferences::text) <= 200000));

create or replace function private.valid_equipment(e jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare n jsonb; k text;
begin
  if e is null or jsonb_typeof(e) <> 'object' then return false; end if;
  if not (e ?& array['id','name','type','manufacturer','model','unit','measurement','pulleyRatio','ratioVerified','stackCount','handleCount','basis','increments','step','minimum','settings','comparisonGroup']) then return false; end if;
  foreach k in array array['id','name','type','manufacturer','model','unit','measurement','basis','settings'] loop
    if jsonb_typeof(e->k) <> 'string' or length(e->>k) > 200 then return false; end if;
  end loop;
  if jsonb_typeof(e->'ratioVerified') <> 'boolean' or jsonb_typeof(e->'step') <> 'number' or jsonb_typeof(e->'stackCount') <> 'number' or jsonb_typeof(e->'handleCount') <> 'number' then return false; end if;
  if e->>'minimum' is not null and jsonb_typeof(e->'minimum') <> 'number' then return false; end if;
  if e->>'pulleyRatio' is not null and jsonb_typeof(e->'pulleyRatio') <> 'number' then return false; end if;
  if e->>'comparisonGroup' is not null and (jsonb_typeof(e->'comparisonGroup') <> 'string' or length(e->>'comparisonGroup') > 200) then return false; end if;
  if e->>'measurement' not in ('free_mass','per_dumbbell','barbell_total','machine_stack','machine_level','cable_known','cable_unknown','bodyweight_added','bodyweight_assistance','bodyweight','duration') or e->>'unit' not in ('kg','level','s') then return false; end if;
  if ((e->>'measurement' = 'machine_level') <> (e->>'unit' = 'level')) or ((e->>'measurement' = 'duration') <> (e->>'unit' = 's')) then return false; end if;
  if (e->>'stackCount')::int not in (1,2) or (e->>'handleCount')::int not in (1,2) or e->>'basis' not in ('shared','per_handle','per_stack','independent') then return false; end if;
  if (e->>'stackCount')::numeric <> (e->>'stackCount')::int or (e->>'handleCount')::numeric <> (e->>'handleCount')::int then return false; end if;
  if (e->>'step')::numeric <= 0 or (e->>'step')::numeric > 500 or (e->>'minimum')::numeric < 0 or (e->>'minimum')::numeric > 500 then return false; end if;
  if (e->>'pulleyRatio')::numeric <= 0 or (e->>'pulleyRatio')::numeric > 20 then return false; end if;
  if e->>'measurement' = 'cable_known' and (e->>'pulleyRatio' is null or e->>'ratioVerified' <> 'true') then return false; end if;
  if jsonb_typeof(e->'increments') <> 'array' or jsonb_array_length(e->'increments') > 100 then return false; end if;
  for n in select value from jsonb_array_elements(e->'increments') loop
    if jsonb_typeof(n) <> 'number' or n::numeric < 0 or n::numeric > 500 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
create or replace function private.valid_exercise_configuration(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if c is null or jsonb_typeof(c) <> 'object' or not (c ?& array['executionMode','startingSide','equipment','betweenSidesSeconds','restSeconds','warmupVisible']) then return false; end if;
  if jsonb_typeof(c->'betweenSidesSeconds') <> 'number' or (c->>'betweenSidesSeconds')::numeric <> (c->>'betweenSidesSeconds')::int then return false; end if;
  if c->>'restSeconds' is not null and (jsonb_typeof(c->'restSeconds') <> 'number' or (c->>'restSeconds')::numeric <> (c->>'restSeconds')::int) then return false; end if;
  return coalesce(c->>'executionMode' in ('bilateral','sequential','alternating','single_side') and c->>'startingSide' in ('right','left')
    and private.valid_equipment(c->'equipment') and (c->>'betweenSidesSeconds')::int between 0 and 300
    and (c->>'restSeconds' is null or (c->>'restSeconds')::int between 15 and 300)
    and (c->>'warmupVisible' is null or jsonb_typeof(c->'warmupVisible') = 'boolean'), false);
exception when others then return false;
end $$;
create or replace function private.valid_training_preferences(v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare entry record; e jsonb; ids text[] := '{}';
begin
  if v is null then return true; end if;
  if not (v ?& array['showWarmupSets','adaptiveRestEnabled','defaultStartingSide','preferredRestOverrides','exerciseDefaults','equipmentProfiles']) then return false; end if;
  if jsonb_typeof(v->'showWarmupSets') <> 'boolean' or jsonb_typeof(v->'adaptiveRestEnabled') <> 'boolean' or coalesce(v->>'defaultStartingSide','') not in ('right','left') then return false; end if;
  if jsonb_typeof(v->'preferredRestOverrides') <> 'object' or jsonb_typeof(v->'exerciseDefaults') <> 'object' or jsonb_typeof(v->'equipmentProfiles') <> 'array' or jsonb_array_length(v->'equipmentProfiles') > 100 then return false; end if;
  for entry in select * from jsonb_each(v->'preferredRestOverrides') loop
    if length(entry.key) > 64 or jsonb_typeof(entry.value) <> 'number' or entry.value::text::numeric <> entry.value::text::int or entry.value::text::int not between 30 and 300 then return false; end if;
  end loop;
  for entry in select * from jsonb_each(v->'exerciseDefaults') loop
    if length(entry.key) > 64 or not private.valid_exercise_configuration(entry.value) then return false; end if;
  end loop;
  for e in select value from jsonb_array_elements(v->'equipmentProfiles') loop
    if not private.valid_equipment(e) or coalesce(e->>'id','') = '' or e->>'id' = any(ids) then return false; end if;
    ids := array_append(ids,e->>'id');
  end loop;
  return true;
exception when others then return false;
end $$;
create or replace function private.valid_set_detail(d jsonb, s text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare p jsonb; r jsonb; k text; reason jsonb; sides text[]; completed text[] := '{}'; ids text[] := '{}'; seen text[] := '{}'; rest_ids text[] := '{}'; started_count int := 0;
begin
  if d is null then return s <> 'partial'; end if;
  if not (d ?& array['version','configuration','performances','rests','aborted']) then return false; end if;
  if octet_length(d::text) > 64000 or d->>'version' <> '1' or not private.valid_exercise_configuration(d->'configuration') or jsonb_typeof(d->'aborted') <> 'boolean' then return false; end if;
  foreach k in array array['targetLoadValue','targetSecondLoadValue'] loop
    if d->>k is not null and (jsonb_typeof(d->k) <> 'number' or (d->>k)::numeric not between 0 and 500) then return false; end if;
  end loop;
  if jsonb_typeof(d->'version') <> 'number' then return false; end if;
  if jsonb_typeof(d->'performances') <> 'array' or jsonb_array_length(d->'performances') > 2 or jsonb_typeof(d->'rests') <> 'array' or jsonb_array_length(d->'rests') > 40 then return false; end if;
  sides := case d->'configuration'->>'executionMode' when 'bilateral' then array['both'] when 'single_side' then array[d->'configuration'->>'startingSide'] else array['right','left'] end;
  for p in select value from jsonb_array_elements(d->'performances') loop
    if not (p ?& array['id','side','status','repetitions','loadValue','secondLoadValue','seconds','rir','technique','startedAt','completedAt','equipment','executionMode','comparisonKey']) then return false; end if;
    foreach k in array array['id','side','status','executionMode','comparisonKey'] loop
      if jsonb_typeof(p->k) <> 'string' then return false; end if;
    end loop;
    perform (p->>'id')::uuid;
    if p->>'comparisonKey' !~ '^[0-9a-f]{32}$' then return false; end if;
    foreach k in array array['loadValue','secondLoadValue','repetitions','seconds','rir'] loop
      if p->>k is not null and jsonb_typeof(p->k) <> 'number' then return false; end if;
    end loop;
    foreach k in array array['repetitions','seconds','rir'] loop
      if (p->>k)::numeric <> (p->>k)::int then return false; end if;
    end loop;
    if p->>'technique' is not null and p->>'technique' not in ('controlled','uncertain','poor') then return false; end if;
    if p->>'status' = 'started' then
      if p->>'startedAt' is null then return false; end if;
      started_count := started_count + 1;
    end if;
    if p->>'id' is null or p->>'id' = any(ids) or p->>'side' = any(seen) or not (p->>'side' = any(sides)) then return false; end if;
    ids := array_append(ids, p->>'id'); seen := array_append(seen,p->>'side');
    if p->>'status' not in ('started','done','skipped') or p->>'executionMode' <> d->'configuration'->>'executionMode' or not private.valid_equipment(p->'equipment') then return false; end if;
    if (p->>'loadValue')::numeric < 0 or (p->>'loadValue')::numeric > 500 or (p->>'secondLoadValue')::numeric < 0 or (p->>'secondLoadValue')::numeric > 500 then return false; end if;
    if (p->>'repetitions')::int < 0 or (p->>'repetitions')::int > 50 or (p->>'seconds')::int < 0 or (p->>'seconds')::int > 900 or (p->>'rir')::int < 0 or (p->>'rir')::int > 5 then return false; end if;
    if p->>'status' = 'done' then
      if p->>'completedAt' is null or (p->>'repetitions' is null and p->>'seconds' is null) then return false; end if;
      if (p->'equipment'->>'measurement' = 'duration' and p->>'seconds' is null) or (p->'equipment'->>'measurement' <> 'duration' and p->>'repetitions' is null) then return false; end if;
      if p->'equipment'->>'measurement' not in ('bodyweight','duration') and p->>'loadValue' is null then return false; end if;
      if p->'equipment'->>'basis' = 'independent' and p->>'secondLoadValue' is null then return false; end if;
      completed := array_append(completed,p->>'side');
    end if;
    perform (p->>'startedAt')::timestamptz, (p->>'completedAt')::timestamptz;
    if (p->>'startedAt')::timestamptz > (p->>'completedAt')::timestamptz then return false; end if;
  end loop;
  if (s = 'done') <> (sides <@ completed) then return false; end if;
  if s in ('planned','skipped') and cardinality(completed) > 0 then return false; end if;
  if s = 'partial' and cardinality(completed) = 0 and started_count = 0 then return false; end if;
  for r in select value from jsonb_array_elements(d->'rests') loop
    if not (r ?& array['id','precedingPerformanceId','followingPerformanceId','followingSetId','type','startedAt','endedAt','recommendedSeconds','actualSeconds','adjustmentSeconds','reasons','policyVersion','outcome']) then return false; end if;
    if r->>'id' is null or r->>'startedAt' is null or r->>'type' is null or r->>'outcome' is null or r->>'policyVersion' is null or not (r->>'precedingPerformanceId' = any(ids)) then return false; end if;
    perform (r->>'id')::uuid;
    if r->>'id' = any(rest_ids) then return false; end if;
    rest_ids := array_append(rest_ids,r->>'id');
    perform (r->>'followingPerformanceId')::uuid, (r->>'followingSetId')::uuid;
    foreach k in array array['recommendedSeconds','adjustmentSeconds'] loop
      if jsonb_typeof(r->k) <> 'number' or (r->>k)::numeric <> (r->>k)::int then return false; end if;
    end loop;
    if jsonb_typeof(r->'reasons') <> 'array' or jsonb_array_length(r->'reasons') > 10 then return false; end if;
    for reason in select value from jsonb_array_elements(r->'reasons') loop
      if jsonb_typeof(reason) <> 'string' or length(reason::text) > 100 then return false; end if;
    end loop;
    if r->>'type' not in ('between_sides','between_sets','warmup','before_work') or r->>'outcome' not in ('active','started','unobserved','dismissed','session_ended') then return false; end if;
    if (r->>'recommendedSeconds')::int not between 0 and 300 or (r->>'adjustmentSeconds')::int not between -300 and 300 or (r->>'actualSeconds')::int not between 0 and 86400 then return false; end if;
    if (r->>'recommendedSeconds')::int + (r->>'adjustmentSeconds')::int not between 0 and 300 then return false; end if;
    if r->>'actualSeconds' is not null and (r->>'outcome' <> 'started' or r->>'endedAt' is null or jsonb_typeof(r->'actualSeconds') <> 'number') then return false; end if;
    perform (r->>'startedAt')::timestamptz, (r->>'endedAt')::timestamptz;
    if (r->>'startedAt')::timestamptz > (r->>'endedAt')::timestamptz then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function private.valid_equipment(jsonb), private.valid_exercise_configuration(jsonb), private.valid_training_preferences(jsonb), private.valid_set_detail(jsonb,text) from public, anon;
grant execute on function private.valid_equipment(jsonb), private.valid_exercise_configuration(jsonb), private.valid_training_preferences(jsonb), private.valid_set_detail(jsonb,text) to authenticated;
alter table public.profiles add constraint training_preferences_valid check (private.valid_training_preferences(training_preferences));
alter table public.session_exercises add constraint configuration_valid check (configuration is null or (octet_length(configuration::text) <= 16000 and private.valid_exercise_configuration(configuration)));
alter table public.training_sets add constraint detail_valid check (private.valid_set_detail(detail,status));
-- Existing owner RLS applies. Original prescription and ownership remain immutable.
grant update(configuration) on public.session_exercises to authenticated;

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
  v_allowed constant text[] := array['sessionExerciseId','ordinal','kind','status','targetKg','targetReps','targetSeconds','actualKg','actualReps','actualSeconds','rir','technique','occurredAt','deleted','perceivedEffort','detail'];
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
        actual_kg, actual_reps, actual_seconds, rir, technique, occurred_at, client_created_at, revision, deleted_at, server_received_at, perceived_effort, detail)
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
        p_payload->>'perceivedEffort', nullif(p_payload->'detail', 'null'::jsonb));
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
          'server', pg_catalog.jsonb_build_object('detail',v_set.detail,'status',v_set.status,'actualKg',v_set.actual_kg,'actualReps',v_set.actual_reps,'actualSeconds',v_set.actual_seconds,
            'rir',v_set.rir,'technique',v_set.technique,'perceivedEffort',v_set.perceived_effort,'occurredAt',v_set.occurred_at,'deleted',v_set.deleted_at is not null,'targetKg',v_set.target_kg,'targetReps',v_set.target_reps));
      end if;
      if v_set.detail is not null and ((p_payload ? 'detail' and p_payload->'detail' = 'null'::jsonb) or (not (p_payload ? 'detail') and p_payload ?| array['status','actualKg','actualReps','actualSeconds','rir','technique'])) then
        return pg_catalog.jsonb_build_object('status','rejected','code','UPGRADE_REQUIRED','serverTime',v_now);
      end if;
      -- 7. Endast tillåtna attribut; förälder/ägare ändras aldrig.
      update public.training_sets set
        detail = case when p_payload ? 'detail' then nullif(p_payload->'detail','null'::jsonb) else detail end,
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
