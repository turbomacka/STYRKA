-- Optional side prescriptions extend the existing JSON model without rewriting history.
create function private.valid_planned_sides(d jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare s record; f text; v numeric;
begin
  if d is null or not (d ? 'plannedSides') then return true; end if;
  if jsonb_typeof(d->'plannedSides') <> 'object' then return false; end if;
  for s in select * from jsonb_each(d->'plannedSides') loop
    if s.key not in ('both','left','right') or jsonb_typeof(s.value) <> 'object' then return false; end if;
    if not (s.value ?& array['grams','reps','seconds','secondLoad']) then return false; end if;
    foreach f in array array['grams','reps','seconds','secondLoad'] loop
      if s.value->f = 'null'::jsonb then continue; end if;
      if jsonb_typeof(s.value->f) <> 'number' then return false; end if;
      v := (s.value->>f)::numeric;
      if v < 0 or v > (case f when 'grams' then 500000 when 'reps' then 50 when 'seconds' then 900 else 500 end) then return false; end if;
      if f <> 'secondLoad' and v <> trunc(v) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function private.valid_planned_sides(jsonb) from public, anon;
grant execute on function private.valid_planned_sides(jsonb) to authenticated, service_role;
alter table public.training_sets add constraint training_sets_planned_sides_valid check (private.valid_planned_sides(detail));
