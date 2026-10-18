-- Optional explanations and explicit, single-slot choices. No rewriting of workout snapshots.
create table public.exercise_skip_events (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_id uuid not null,
  session_exercise_id uuid not null,
  reason text not null check (reason in ('time','equipment','discomfort','other')),
  action text not null check (action in ('skipped','accepted','dismissed')),
  program_id uuid,
  target_rotation_index integer check (target_rotation_index >= 0),
  replaces_exercise_slug text references public.exercise_catalog(slug),
  created_at timestamptz not null,
  foreign key (session_id,user_id) references public.training_sessions(id,user_id) on delete cascade,
  foreign key (session_exercise_id,user_id) references public.session_exercises(id,user_id) on delete cascade,
  foreign key (program_id,user_id) references public.programs(id,user_id) on delete cascade,
  check ((action = 'accepted' and reason in ('time','equipment') and program_id is not null and target_rotation_index is not null and replaces_exercise_slug is not null)
    or (action <> 'accepted' and program_id is null and target_rotation_index is null and replaces_exercise_slug is null))
);
create index exercise_skip_events_user_idx on public.exercise_skip_events(user_id);
create index exercise_skip_events_session_idx on public.exercise_skip_events(session_id,user_id);
create index exercise_skip_events_exercise_idx on public.exercise_skip_events(session_exercise_id,user_id);
create index exercise_skip_events_program_idx on public.exercise_skip_events(program_id,user_id);
alter table public.exercise_skip_events enable row level security;
revoke all on public.exercise_skip_events from anon, authenticated;
grant select, insert, delete on public.exercise_skip_events to authenticated;
create policy skip_events_read on public.exercise_skip_events for select to authenticated using ((select auth.uid()) = user_id);
create policy skip_events_insert on public.exercise_skip_events for insert to authenticated
  with check ((select auth.uid()) = user_id and (reason <> 'discomfort' or private.has_active_health_consent())
    and exists (select 1 from public.session_exercises e where e.id = session_exercise_id and e.session_id = exercise_skip_events.session_id and e.user_id = (select auth.uid())));
create policy skip_events_delete on public.exercise_skip_events for delete to authenticated using ((select auth.uid()) = user_id);

-- Erase every skip explanation/decision with health data; this also clears derived future adjustments.
create or replace function public.erase_health_data() returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_s int; v_r int; v_n int;
begin
  if v_uid is null then return pg_catalog.jsonb_build_object('status','rejected','code','AUTH_REQUIRED'); end if;
  delete from public.symptom_reports where user_id = v_uid; get diagnostics v_s = row_count;
  delete from public.restriction_rules where user_id = v_uid; get diagnostics v_r = row_count;
  delete from public.notebook_notes where user_id = v_uid; get diagnostics v_n = row_count;
  delete from public.exercise_skip_events where user_id = v_uid;
  update public.health_consents set withdrawn_at = pg_catalog.now(), revision = revision + 1 where user_id = v_uid;
  return pg_catalog.jsonb_build_object('status','applied','symptomReports',v_s,'restrictionRules',v_r,'notebookNotes',v_n);
end;
$$;
revoke all on function public.erase_health_data() from public, anon;
grant execute on function public.erase_health_data() to authenticated;
