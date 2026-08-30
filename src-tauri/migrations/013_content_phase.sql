-- Migration v13 : rattacher un contenu généré à la phase précise de la journée
--
-- generated_contents.slot_id disait déjà « ce contenu appartient à cette
-- journée ». Il faut descendre d'un cran pour savoir de quelle phase il
-- s'agit — apport, jeu ou pratique — et pouvoir régénérer l'une sans
-- toucher aux deux autres.

ALTER TABLE generated_contents ADD COLUMN slot_phase_id TEXT
    REFERENCES slot_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contents_slot_phase ON generated_contents(slot_phase_id);
