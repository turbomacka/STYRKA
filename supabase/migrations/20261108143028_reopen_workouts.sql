-- Keep an ordinary workout's original position when it is continued and finished again.
-- Legacy rows remain unchanged; their first counting time is captured on reopening.
alter table public.training_sessions
  add column first_counted_at timestamptz;

comment on column public.training_sessions.first_counted_at is
  'First time an ordinary workout counted in the program. Preserved across reopening and later completion.';
