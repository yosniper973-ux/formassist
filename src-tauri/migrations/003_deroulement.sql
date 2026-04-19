-- Migration v3 : Fiches de déroulement de séance liées aux factures

-- Chemin du modèle DOCX de fiche de déroulement par centre
ALTER TABLE centres ADD COLUMN deroulement_template_path TEXT;

-- Distinguer fiche pédagogique / fiche de déroulement de séance
ALTER TABLE pedagogical_sheets ADD COLUMN kind TEXT NOT NULL DEFAULT 'pedagogique';

-- Colonnes spécifiques fiche de déroulement
ALTER TABLE pedagogical_sheets ADD COLUMN ccp_id TEXT REFERENCES ccps(id) ON DELETE SET NULL;
ALTER TABLE pedagogical_sheets ADD COLUMN centre_id TEXT REFERENCES centres(id) ON DELETE SET NULL;
ALTER TABLE pedagogical_sheets ADD COLUMN redacteur TEXT;
ALTER TABLE pedagogical_sheets ADD COLUMN dates_label TEXT;
ALTER TABLE pedagogical_sheets ADD COLUMN total_duration_hours REAL;
-- JSON : { "<competence_id>": ["<content_id>", ...], ... }
ALTER TABLE pedagogical_sheets ADD COLUMN selected_exercise_ids TEXT;

CREATE INDEX IF NOT EXISTS idx_sheets_kind    ON pedagogical_sheets(kind);
CREATE INDEX IF NOT EXISTS idx_sheets_invoice ON pedagogical_sheets(linked_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sheets_ccp     ON pedagogical_sheets(ccp_id);
