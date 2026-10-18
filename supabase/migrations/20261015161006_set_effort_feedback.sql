-- Preserve all old answers. New descriptive effort never invents a numeric RIR.
alter table public.training_sets drop constraint training_sets_perceived_effort_check;
alter table public.training_sets add constraint training_sets_perceived_effort_check
  check (perceived_effort is null or perceived_effort in ('too_easy','easy','ok','hard','maximal','too_heavy'));
alter table public.training_sets add constraint maximal_effort_reserve_check
  check (perceived_effort is distinct from 'maximal' or rir is null or rir = 0);

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
    if p ? 'effort' and p->'effort' <> 'null'::jsonb then
      if jsonb_typeof(p->'effort') <> 'string' or p->>'effort' not in ('too_easy','easy','ok','hard','maximal','too_heavy') or p->>'status' <> 'done' then return false; end if;
      if p->>'effort' = 'maximal' and p->>'rir' is not null and (p->>'rir')::numeric <> 0 then return false; end if;
    end if;
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

-- Existing function identity and grants are retained. No new public entry point or data rewrite.
