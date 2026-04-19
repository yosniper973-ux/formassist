-- Migration v2 : Dossiers DP / Projet + RC/RE par formation

ALTER TABLE formations ADD COLUMN rcre_text TEXT;
ALTER TABLE formations ADD COLUMN rcre_pdf_b64 TEXT;

CREATE TABLE IF NOT EXISTS dossier_corrections (
    id                TEXT PRIMARY KEY,
    learner_id        TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    formation_id      TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    dossier_type      TEXT NOT NULL,
    filename          TEXT,
    submission_text   TEXT,
    feedback_markdown TEXT,
    model_used        TEXT,
    validated         INTEGER DEFAULT 0,
    sent_at           TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dossier_learner     ON dossier_corrections(learner_id);
CREATE INDEX IF NOT EXISTS idx_dossier_formation   ON dossier_corrections(formation_id);
