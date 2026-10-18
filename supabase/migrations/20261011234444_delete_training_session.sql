-- Workout contents are physically deleted. This minimal ledger prevents resurrection
-- by offline clients and reserves existing pass numbers in the notebook.
create table public.deleted_training_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  sequence integer check (sequence > 0),
  deleted_at timestamptz not null default now()
);
create index deleted_training_sessions_user_idx on public.deleted_training_sessions(user_id);
alter table public.deleted_training_sessions enable row level security;
revoke all on public.deleted_training_sessions from anon, authenticated;
grant select on public.deleted_training_sessions to authenticated;
create policy own_deleted_sessions on public.deleted_training_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

create function private.prevent_deleted_session_restore() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text, 8721));
  if exists (select 1 from public.deleted_training_sessions where id = new.id) then
    raise exception 'WORKOUT_DELETED' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_deleted_session_restore() from public, anon, authenticated;
create trigger prevent_deleted_session_restore before insert or update on public.training_sessions
  for each row execute function private.prevent_deleted_session_restore();

-- Strip references to removed sets even when a stale device uploads an old calibration.
create function private.clean_calibration_observations() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare kept uuid[]; exposures integer;
begin
  select coalesce(array_agg(s.id), '{}'::uuid[]), count(distinct e.session_id)
    into kept, exposures
    from public.training_sets s join public.session_exercises e on e.id = s.session_exercise_id
    where s.user_id = new.user_id and s.id = any(new.observations) and s.deleted_at is null;
  if cardinality(kept) < cardinality(new.observations) then
    new.observations := kept;
    new.quality := case when exposures >= 2 then 'calibrated' when exposures = 1 then 'calibrating' else 'none' end;
    if exposures < 2 then new.calibrated_at := null; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.clean_calibration_observations() from public, anon, authenticated;
create trigger clean_calibration_observations before insert or update on public.user_exercise_calibrations
  for each row execute function private.clean_calibration_observations();

-- Definer is necessary to write the protected ledger and delete immutable audit rows.
-- The public invoker wrapper exposes only this owner-checked atomic operation.
create function private.delete_training_session(p_session_id uuid, p_sequence integer) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); owner_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_session_id is null or p_sequence <= 0 then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 8721));
  select user_id into owner_id from public.deleted_training_sessions where id = p_session_id;
  if found then
    if owner_id <> uid then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    return;
  end if;
  select user_id into owner_id from public.training_sessions where id = p_session_id for update;
  if found and owner_id <> uid then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  -- Also supports a workout created and deleted offline before its first upload.
  insert into public.deleted_training_sessions(id, user_id, sequence) values(p_session_id, uid, p_sequence);
  delete from public.recommendation_audits where session_id = p_session_id and user_id = uid;
  delete from public.training_sessions where id = p_session_id and user_id = uid;
  -- Children/notes cascade; symptoms keep their content with a null session reference.
  update public.user_exercise_calibrations set updated_at = now()
    where user_id = uid and cardinality(observations) > 0;
end;
$$;
revoke all on function private.delete_training_session(uuid, integer) from public, anon;
grant execute on function private.delete_training_session(uuid, integer) to authenticated;
create function public.delete_training_session(p_session_id uuid, p_sequence integer default null) returns void
language sql security invoker set search_path = '' as $$
  select private.delete_training_session(p_session_id, p_sequence);
$$;
revoke all on function public.delete_training_session(uuid, integer) from public, anon;
grant execute on function public.delete_training_session(uuid, integer) to authenticated;
