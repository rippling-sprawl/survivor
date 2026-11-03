-- Where each castaway came from. `tribe` follows them through mutinies, swaps and the merge, so
-- after the merge everyone shares one; the home page badge shows the two tribes before that:
--   original_tribe  the tribe they started the game on
--   premerge_tribe  their last tribe before the merge (the same as `tribe` until the merge)
--
-- Filled by the Wikipedia roster sync from the Contestants table's tribe columns. Season 51's
-- castaways are backfilled here since they were swapped before the columns existed.
--
-- Idempotent like 0001.

alter table survivor_castaways
  add column if not exists original_tribe       text,
  add column if not exists original_tribe_color text,
  add column if not exists premerge_tribe       text,
  add column if not exists premerge_tribe_color text;

update survivor_castaways c
set
  original_tribe = coalesce(c.original_tribe, v.original),
  original_tribe_color = coalesce(c.original_tribe_color, v.original_color),
  premerge_tribe = coalesce(c.premerge_tribe, v.premerge),
  premerge_tribe_color = coalesce(c.premerge_tribe_color, v.premerge_color)
from survivor_seasons s,
  (values
    ('Aaliyah',  'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Ana',      'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Rob',      'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Patt',     'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Brady',    'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Linnea',   'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Cristian', 'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Sharonda', 'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Jenna',    'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Kristin',  'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Ori',      'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Lewis',    'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Kilby',    'Toka', '#f0c625', 'Dina', '#e54779'),
    ('Carter',   'Savu', '#6e119b', 'Toka', '#f0c625'),
    ('Alexis',   'Savu', '#6e119b', 'Savu', '#6e119b'),
    ('Jelly',    'Toka', '#f0c625', 'Savu', '#6e119b'),
    ('Eric',     'Savu', '#6e119b', 'Dina', '#e54779'),
    ('Maggie',   'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Thien An', 'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Mike',     'Toka', '#f0c625', 'Toka', '#f0c625'),
    ('Devin',    'Toka', '#f0c625', 'Toka', '#f0c625')
  ) as v(short_name, original, original_color, premerge, premerge_color)
where c.season_id = s.id
  and s.number = 51
  and c.short_name = v.short_name;
