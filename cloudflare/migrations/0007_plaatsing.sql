ALTER TABLE circuit ADD COLUMN conduit INTEGER;            -- 1 = leiding in buis, 0 = los
  ALTER TABLE symbol ADD COLUMN spos REAL;                   -- volgorde van het symbool binnen zijn kring op het eendraadschema
  UPDATE circuit SET conduit=1 WHERE install='In buis';
  UPDATE circuit SET conduit=0 WHERE install='Los';
  UPDATE circuit SET install='In wand' WHERE install IN ('In muur', 'Op muur');
  UPDATE circuit SET install=NULL WHERE install IN ('In buis', 'Los');
