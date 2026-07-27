-- Bibliothèque de trames ECF par centre (upload unique, réutilisable)
CREATE TABLE evaluation_templates (
    id                TEXT PRIMARY KEY,
    centre_id         TEXT NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path         TEXT NOT NULL,
    analysis_json     TEXT,              -- réservé v2 (cache d'analyse de structure)
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_eval_templates_centre ON evaluation_templates(centre_id);
