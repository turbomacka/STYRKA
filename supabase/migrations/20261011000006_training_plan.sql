-- STYRKA 006: ÄA-PLAN-001 "Min träningsplan" – planrevisioner och personliga anteckningar.
-- ENDAST ADDITIV: inga befintliga rader, set, pass eller rekommendationer ändras eller raderas.
--
-- Kontrakt → schema:
--   program_id                → programs.id (befintlig)
--   workout_session_id        → training_sessions.id (befintlig; genomförda set i training_sets, oförändrat)
--   planned_slot_id           → deterministiskt UUID ur (användare, slot_sequence); slot_sequence = löpande
--                               ordinarie passnummer över alla programversioner (härleds ur befintlig historik)
--   plan_revision_id          → plan_revisions.id (ny, append-only)
--   planned_session_snapshot  → plan_revisions.slots[] (strukturell framtidsplan, inga framtidsvikter)
--   user_note                 → notebook_notes (ny), knuten till slot_sequence eller training_sessions.id

create table if not exists public.plan_revisions (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  program_id uuid,
  previous_revision_id uuid,
  base_sequence integer not null check (base_sequence >= 1),
  horizon smallint not null check (horizon between 1 and 200),
  change_type text not null check (change_type in ('INITIAL','SESSION_COMPLETED','EXTRA_COUNTED_AS_PLANNED','EXTRA_SESSION_COMPLETED','PROFILE_CHANGED','SUBSTITUTION_CHANGED','RESTRICTION_CHANGED','SYMPTOM_CHANGED','EXERCISE_SETTINGS_CHANGED','HISTORY_CHANGED','ALGORITHM_VERSION_CHANGED')),
  reason_codes text[] not null default '{}',
  summary text not null default '' check (char_length(summary) <= 1000),
  inputs_hash text not null check (char_length(inputs_hash) = 64),
  input_parts jsonb not null default '{}' check (jsonb_typeof(input_parts) = 'object'),
  content_hash text not null check (char_length(content_hash) = 64),
  engine_version text not null,
  planner_version text not null,
  ruleset_version text not null,
  catalog_version text not null,
  substitution_catalog_version text not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'array'),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (program_id, user_id) references public.programs(id, user_id) on delete set null (program_id)
);
create index if not exists ix_plan_revisions_user_created on public.plan_revisions(user_id, created_at);
create index if not exists ix_plan_revisions_user_program_seq on public.plan_revisions(user_id, program_id, base_sequence);

create table if not exists public.notebook_notes (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  target_type text not null check (target_type in ('slot','session')),
  slot_sequence integer check (slot_sequence >= 1),
  session_id uuid,
  -- Fri text; kan innehålla hälsouppgifter ⇒ raderas av erase_health_data (nedan). Visas alltid som ren text.
  body text not null default '' check (char_length(body) <= 2000),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_type = 'slot' and slot_sequence is not null and session_id is null) or (target_type = 'session' and session_id is not null and slot_sequence is null)),
  unique (id, user_id),
  foreign key (session_id, user_id) references public.training_sessions(id, user_id) on delete cascade
);
create unique index if not exists ux_notes_slot on public.notebook_notes(user_id, slot_sequence) where target_type = 'slot';
create unique index if not exists ux_notes_session on public.notebook_notes(user_id, session_id) where target_type = 'session';

-- Genomförda pass i ordning (Genomförda-listan och passnumrering).
create index if not exists ix_sessions_user_finished on public.training_sessions(user_id, finished_at);

alter table public.plan_revisions enable row level security;
alter table public.notebook_notes enable row level security;
revoke all on public.plan_revisions from anon, authenticated;
revoke all on public.notebook_notes from anon, authenticated;
-- Planrevisioner är oföränderliga för klienten (append-only); radering sker via kontoradering/kaskad.
grant select, insert on public.plan_revisions to authenticated;
grant select, insert, update, delete on public.notebook_notes to authenticated;

create policy plan_revisions_read_own on public.plan_revisions for select to authenticated using ((select auth.uid()) = user_id);
create policy plan_revisions_create_own on public.plan_revisions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notebook_notes_read_own on public.notebook_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy notebook_notes_create_own on public.notebook_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notebook_notes_update_own on public.notebook_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notebook_notes_delete_own on public.notebook_notes for delete to authenticated using ((select auth.uid()) = user_id);

-- "Radera mina hälsorelaterade uppgifter" omfattar även personliga anteckningar (fri text kan innehålla hälsouppgifter).
-- Övrig logik identisk med migration 003. SECURITY INVOKER: verkar endast på egna rader via RLS.
create or replace function public.erase_health_data()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_s int; v_r int; v_n int;
begin
  if v_uid is null then return pg_catalog.jsonb_build_object('status','rejected','code','AUTH_REQUIRED'); end if;
  delete from public.symptom_reports where user_id = v_uid; get diagnostics v_s = row_count;
  delete from public.restriction_rules where user_id = v_uid; get diagnostics v_r = row_count;
  delete from public.notebook_notes where user_id = v_uid; get diagnostics v_n = row_count;
  update public.health_consents set withdrawn_at = pg_catalog.now(), revision = revision + 1 where user_id = v_uid;
  return pg_catalog.jsonb_build_object('status','applied','symptomReports',v_s,'restrictionRules',v_r,'notebookNotes',v_n);
end;
$$;
revoke all on function public.erase_health_data() from public, anon;
grant execute on function public.erase_health_data() to authenticated;
