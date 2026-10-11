-- STYRKA 007: ÄA-BAL-001 "Balans" – användarens beslut om balansförslag (avböjt/godkänt).
-- ENDAST ADDITIV. Balansanalysen är en härledd läsvy; här lagras inga träningsset, symtom eller härledda värden,
-- bara att användaren aktivt avböjt eller godkänt en viss kandidat (för att inte visa den igen).

create table if not exists public.balance_suggestion_decisions (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  candidate_key text not null check (char_length(candidate_key) = 64),
  -- Kandidatens underlag utan planrevision: ett godkänt förslag visas inte igen för samma utförda set.
  basis_key text not null check (char_length(basis_key) = 64),
  pattern_id text not null check (pattern_id in ('knee_dominant','hip_dominant','horizontal_push','vertical_push','horizontal_pull','vertical_pull')),
  status text not null check (status in ('previewed','accepted','dismissed','invalidated')),
  policy_version text not null,
  event_id uuid not null,
  updated_at timestamptz not null default now(),
  unique (user_id, candidate_key),
  unique (id, user_id)
);
create index if not exists ix_balance_decisions_user on public.balance_suggestion_decisions(user_id, updated_at);

alter table public.balance_suggestion_decisions enable row level security;
revoke all on public.balance_suggestion_decisions from anon, authenticated;
grant select, insert, update, delete on public.balance_suggestion_decisions to authenticated;
create policy balance_decisions_read_own on public.balance_suggestion_decisions for select to authenticated using ((select auth.uid()) = user_id);
create policy balance_decisions_create_own on public.balance_suggestion_decisions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy balance_decisions_update_own on public.balance_suggestion_decisions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy balance_decisions_delete_own on public.balance_suggestion_decisions for delete to authenticated using ((select auth.uid()) = user_id);
