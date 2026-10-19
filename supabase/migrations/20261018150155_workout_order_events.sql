-- Immutable moves keep recommendation order intact and merge across devices.
create table public.workout_order_events (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_id uuid not null,
  session_exercise_id uuid not null,
  before_id uuid,
  created_at timestamptz not null,
  foreign key (session_id,user_id) references public.training_sessions(id,user_id) on delete cascade,
  foreign key (session_exercise_id,user_id) references public.session_exercises(id,user_id) on delete cascade,
  foreign key (before_id,user_id) references public.session_exercises(id,user_id) on delete cascade,
  check (before_id is distinct from session_exercise_id)
);
create index workout_order_events_user_idx on public.workout_order_events(user_id);
create index workout_order_events_session_idx on public.workout_order_events(session_id,user_id);
create index workout_order_events_exercise_idx on public.workout_order_events(session_exercise_id,user_id);
create index workout_order_events_before_idx on public.workout_order_events(before_id,user_id);
alter table public.workout_order_events enable row level security;
revoke all on public.workout_order_events from public,anon,authenticated;
grant select,insert on public.workout_order_events to authenticated;
create policy workout_order_read on public.workout_order_events for select to authenticated using ((select auth.uid())=user_id);
create policy workout_order_insert on public.workout_order_events for insert to authenticated with check (
  (select auth.uid())=user_id
  and exists (select 1 from public.session_exercises e where e.id=session_exercise_id and e.session_id=workout_order_events.session_id and e.user_id=(select auth.uid()))
  and (before_id is null or exists (select 1 from public.session_exercises e where e.id=before_id and e.session_id=workout_order_events.session_id and e.user_id=(select auth.uid())))
);
