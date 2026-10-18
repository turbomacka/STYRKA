-- Additive: null retains the legacy single estimate; [] explicitly removes all observations.
create or replace function public.valid_strength_inputs(value jsonb) returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare item jsonb; kinds text[] := array[]::text[]; d date; n numeric;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 3 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'object'
      or not (item ?& array['kind','grams','reps','rir','measured','testedAt'])
      or item - array['kind','grams','reps','rir','measured','testedAt'] <> '{}'::jsonb
      or coalesce(item->>'kind','') not in ('1rm','3rm','submax')
      or item->>'kind' = any(kinds)
      or jsonb_typeof(item->'grams') <> 'number'
      or jsonb_typeof(item->'measured') <> 'boolean' then return false; end if;
    kinds := array_append(kinds, item->>'kind');
    n := (item->>'grams')::numeric;
    if n <> trunc(n) or n <= 0 or n > 500000 then return false; end if;
    if item->>'kind' = 'submax' then
      if jsonb_typeof(item->'reps') <> 'number' then return false; end if;
      n := (item->>'reps')::numeric;
      if n <> trunc(n) or n < 1 or n > 8 then return false; end if;
      if item->'rir' <> 'null'::jsonb then
        if jsonb_typeof(item->'rir') <> 'number' then return false; end if;
        n := (item->>'rir')::numeric;
        if n <> trunc(n) or n < 0 or n > 3 then return false; end if;
      end if;
    elsif item->'reps' <> 'null'::jsonb or item->'rir' <> 'null'::jsonb then return false;
    end if;
    if item->'testedAt' <> 'null'::jsonb then
      if jsonb_typeof(item->'testedAt') <> 'string' or item->>'testedAt' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      d := (item->>'testedAt')::date;
      if d < date '1900-01-01' or d > current_date or to_char(d, 'YYYY-MM-DD') <> item->>'testedAt' then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.valid_strength_inputs(jsonb) from public, anon;
grant execute on function public.valid_strength_inputs(jsonb) to authenticated;

alter table public.user_exercise_profiles
  add column strength_inputs jsonb,
  add constraint user_exercise_profiles_strength_inputs_valid check (public.valid_strength_inputs(strength_inputs));
comment on column public.user_exercise_profiles.strength_inputs is
  'Separate optional 1RM, 3RM and set observations. Owner RLS and account deletion inherited from exercise profile. Policy strength-inputs/1.';
