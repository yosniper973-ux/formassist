-- Migration v14 : modalités de certification, importées du référentiel d'évaluation
--
-- Le REAC décrit le métier, le RC décrit l'épreuve. FormAssist ne connaissait
-- que le premier : les durées, le nombre de parties et l'existence d'un
-- entretien technique devaient être devinés. Un ECF ou une évaluation blanche
-- ne peut être calé sans ces données, et elles changent d'un titre à l'autre.

ALTER TABLE formations ADD COLUMN rc_file_path TEXT;
ALTER TABLE formations ADD COLUMN rc_parsed    INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS certification_epreuves (
    id             TEXT PRIMARY KEY,
    formation_id   TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    -- 'titre' pour la session complète, 'ccp' pour une session par CCP
    scope          TEXT NOT NULL DEFAULT 'titre',
    ccp_code       TEXT,
    -- mise_en_situation | entretien_technique | questionnaire | questionnement_production | entretien_final
    modalite       TEXT NOT NULL,
    duree_minutes  INTEGER,
    detail         TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cert_epreuves_formation
    ON certification_epreuves(formation_id);

-- Les parties d'une mise en situation : « nettoyage d'un bureau et d'un local
-- sanitaire, 40 min », « lavage de vitres, 15 min », etc.
CREATE TABLE IF NOT EXISTS certification_parties (
    id             TEXT PRIMARY KEY,
    epreuve_id     TEXT NOT NULL REFERENCES certification_epreuves(id) ON DELETE CASCADE,
    intitule       TEXT NOT NULL,
    duree_minutes  INTEGER,
    detail         TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cert_parties_epreuve
    ON certification_parties(epreuve_id);
