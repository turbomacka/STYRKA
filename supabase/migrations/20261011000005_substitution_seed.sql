-- STYRKA 005: anpassning till produktägarens kandidatmappning (STYRKA_replacement_seed.json, schema 1.0.0).
-- ENDAST ADDITIV: inga rader raderas och ingen träningshistorik ändras.
--  * Ny övning `barbell_row` (krävs av seed-paret cable_row → barbell_row).
--  * `lunge` saknas i kandidatmappningen och erbjuds inte längre (active = false). Raden finns kvar så att
--    eventuell befintlig historik fortsatt är giltig (FK) och kan visas.

insert into public.exercise_catalog (slug, name_sv, pattern, load_kind, equipment, default_increment_kg, version, active, areas, time_kind, recovery_group, catalog_version, load_display_basis, equipment_class, requires_equipment_profile, unilateral, time_multiplier, catalog_since) values
  ('barbell_row', 'Skivstångsrodd', 'horizontal_pull', 'external_kg', array['barbell','plates']::text[], 2.500, 2, true, array['shoulder','elbow','lower_back']::text[], 'barbell_compound', 'pull', '2.0.1', 'total_kg', 'barbell', false, false, 1.00, '2.0.1')
on conflict (slug) do nothing;

update public.exercise_catalog set active = false where slug = 'lunge';
