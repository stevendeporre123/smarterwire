-- Aarding is nu drieweg (onbekend = NULL / aanwezig = 1 / afwezig = 0). De oude standaardwaarde 1 was een aanname:
-- bij kringen waarvan nog niets over de kabel gekend is, terug naar "onbekend".
UPDATE circuit SET has_earth = NULL
  WHERE has_earth = 1 AND cable_type IS NULL AND section_mm2 IS NULL AND wires IS NULL;
