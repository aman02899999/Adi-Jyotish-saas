-- Numerology readings: columns for what the reading actually says.
--
-- src/lib/numerology.ts stores lifePathNumber, destinyNumber and narrative on every reading, but
-- 0003 gave the table only id, member_id, name, birth_date and an unused payload. The copy script
-- drops fields with no column (stripUnknownColumns), so every copied reading would have kept who
-- it was for and lost its result.
alter table public.numerology_readings add column if not exists life_path_number integer;
alter table public.numerology_readings add column if not exists destiny_number integer;
alter table public.numerology_readings add column if not exists narrative text not null default '';
