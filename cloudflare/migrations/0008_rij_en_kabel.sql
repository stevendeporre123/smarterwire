ALTER TABLE symbol ADD COLUMN sgrp TEXT;                   -- zelfde waarde = zelfde rij op het eendraadschema
  ALTER TABLE schema_load ADD COLUMN grp TEXT;
  ALTER TABLE project ADD COLUMN supply_cable TEXT;
