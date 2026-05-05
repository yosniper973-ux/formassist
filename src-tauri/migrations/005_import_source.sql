-- Migration v5 : ajout colonne source sur generated_contents
-- Valeurs : 'ia' (généré par Claude) | 'import' (importé manuellement)

ALTER TABLE generated_contents ADD COLUMN source TEXT NOT NULL DEFAULT 'ia';
ALTER TABLE generated_contents ADD COLUMN original_filename TEXT;

INSERT INTO schema_version (version, description) VALUES (5, 'ajout source et original_filename sur generated_contents');
