-- Read-only system catalog baseline. Names and load semantics versioned.
insert into public.exercise_catalog(slug,name_sv,pattern,load_kind,equipment,default_increment_kg,version,active) values
 ('squat','Knäböj','squat','external_kg',array['rack','barbell','plates'],2.500,1,true),
 ('bench_press','Bänkpress','horizontal_press','external_kg',array['bench','barbell','plates'],2.500,1,true),
 ('deadlift','Marklyft','hinge','external_kg',array['barbell','plates'],5.000,1,true),
 ('romanian_deadlift','Rumänska marklyft','hinge','external_kg',array['barbell','plates'],2.500,1,true),
 ('overhead_press','Militärpress','vertical_press','external_kg',array['barbell','plates'],2.500,1,true),
 ('lat_pulldown','Latsdrag','vertical_pull','external_kg',array['cable'],2.500,1,true),
 ('assisted_pullup','Assisterade chins','vertical_pull','assistance_kg',array['pullup-assist'],5.000,1,true),
 ('pullup','Chins','vertical_pull','bodyweight_plus_kg',array['bodyweight'],2.500,1,true),
 ('cable_row','Sittande kabelrodd','horizontal_pull','external_kg',array['cable'],2.500,1,true),
 ('chest_supported_row','Bröststödd rodd','horizontal_pull','external_kg',array['machines'],2.500,1,true),
 ('cable_lateral_raise','Cable lateral raise','isolation_shoulder','external_kg',array['cable'],1.000,1,true),
 ('biceps_curl','Bicepscurl','isolation_arm','external_kg',array['dumbbell'],1.000,1,true),
 ('triceps_pushdown','Triceps pushdown','isolation_arm','external_kg',array['cable'],1.000,1,true),
 ('cable_crunch','Magcrunch i kabel','trunk','external_kg',array['cable'],2.500,1,true),
 ('plank','Plankan','trunk','duration_sec',array['bodyweight'],1.000,1,true),
 ('split_squat','Split squat','squat','external_kg',array['dumbbell'],1.000,1,true),
 ('leg_press','Benpress','squat','external_kg',array['machines'],5.000,1,true)
on conflict(slug) do update set name_sv=excluded.name_sv,pattern=excluded.pattern,load_kind=excluded.load_kind,equipment=excluded.equipment,default_increment_kg=excluded.default_increment_kg,version=excluded.version,active=excluded.active;
