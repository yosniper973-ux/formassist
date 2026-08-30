-- Migration v11 : déroulé pédagogique importé
--
-- Un « slot » existant = une journée de formation. On y ajoute :
--   * slot_phases   : le découpage de la journée (apport / jeu / pratique)
--   * slot_savoirs  : les savoirs REAC visés, au niveau du savoir et non de
--                     la compétence entière comme le fait slot_competences.

CREATE TABLE IF NOT EXISTS slot_phases (
    id              TEXT PRIMARY KEY,
    slot_id         TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    phase           TEXT NOT NULL,          -- 'apport' | 'jeu' | 'pratique'
    start_time      TEXT,
    end_time        TEXT,
    duration_hours  REAL,
    label           TEXT NOT NULL,
    task            TEXT,                   -- TaskType visé pour la génération
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slot_phases_slot ON slot_phases(slot_id);

CREATE TABLE IF NOT EXISTS slot_savoirs (
    slot_id     TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    savoir_id   TEXT NOT NULL REFERENCES competence_savoirs(id) ON DELETE CASCADE,
    PRIMARY KEY (slot_id, savoir_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_savoirs_slot ON slot_savoirs(slot_id);

-- Provenance du créneau : distingue un import de déroulé d'un import de
-- planning de centre, pour pouvoir le remplacer sans toucher au reste.
ALTER TABLE slots ADD COLUMN deroule_module TEXT;
ALTER TABLE slots ADD COLUMN deroule_day    INTEGER;
