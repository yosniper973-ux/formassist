-- Migration 007 : savoirs par compétence (SF techniques, organisationnels, relationnels, savoirs théoriques)

CREATE TABLE IF NOT EXISTS competence_savoirs (
    id            TEXT PRIMARY KEY,
    competence_id TEXT NOT NULL REFERENCES competences(id) ON DELETE CASCADE,
    category      TEXT NOT NULL CHECK(category IN ('sf_technique', 'sf_organisationnel', 'sf_relationnel', 'savoir')),
    content       TEXT NOT NULL,
    sort_order    INTEGER DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_savoirs_competence ON competence_savoirs(competence_id);
CREATE INDEX IF NOT EXISTS idx_savoirs_category ON competence_savoirs(competence_id, category);
