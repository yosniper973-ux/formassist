-- Migration v4 : Corrections de groupe
-- Quand plusieurs apprenants réalisent un exercice en groupe, on enregistre
-- une ligne corrections par apprenant, partageant un même group_correction_id.
-- Chaque apprenant conserve ainsi sa progression individuelle.

ALTER TABLE corrections ADD COLUMN group_correction_id TEXT;

CREATE INDEX IF NOT EXISTS idx_corrections_group ON corrections(group_correction_id);
