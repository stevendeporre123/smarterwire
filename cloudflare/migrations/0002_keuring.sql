ALTER TABLE project ADD COLUMN ean TEXT;
  ALTER TABLE project ADD COLUMN owner TEXT;
  ALTER TABLE project ADD COLUMN supply TEXT;                -- 1x230 | 3N400 | 3x230
  ALTER TABLE circuit ADD COLUMN fire_class TEXT;            -- brandklasse kabel (Eca, Cca, ...)
  ALTER TABLE circuit ADD COLUMN install TEXT;               -- in muur | op muur | in buis | los
  ALTER TABLE circuit ADD COLUMN level TEXT;                 -- verdieping
  ALTER TABLE circuit ADD COLUMN lock_group TEXT;            -- kringen met zelfde waarde blijven samen (bv. gedeelde nul)
  ALTER TABLE circuit ADD COLUMN feeds_board_id TEXT;        -- deze kring voedt een onderverdeler
  ALTER TABLE device ADD COLUMN phase TEXT;                  -- L1 | L2 | L3 | 3P
  ALTER TABLE board ADD COLUMN src_board_id TEXT;            -- nieuwe kast ontstaat uit deze bestaande kast
  ALTER TABLE symbol ADD COLUMN board_id TEXT;               -- verdeelbord-symbool verwijst naar een kast
