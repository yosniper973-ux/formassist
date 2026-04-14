-- ============================================================
-- FormAssist — Schéma initial v1
-- ============================================================

-- Versioning des migrations
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- CONFIGURATION & SÉCURITÉ
-- ============================================================

CREATE TABLE app_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    encrypted   INTEGER DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_usage_log (
    id              TEXT PRIMARY KEY,
    model           TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    input_tokens    INTEGER NOT NULL,
    output_tokens   INTEGER NOT NULL,
    cost_euros      REAL NOT NULL,
    related_entity  TEXT,
    related_type    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_usage_date ON api_usage_log(created_at);
CREATE INDEX idx_api_usage_model ON api_usage_log(model);

-- ============================================================
-- CENTRES DE FORMATION
-- ============================================================

CREATE TABLE centres (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    address             TEXT,
    logo_path           TEXT,
    phone               TEXT,
    email               TEXT,
    website             TEXT,
    color               TEXT NOT NULL DEFAULT '#3B82F6',
    referent_name       TEXT,
    referent_email      TEXT,
    referent_phone      TEXT,
    legal_mentions      TEXT,
    pdf_header          TEXT,
    smtp_host           TEXT,
    smtp_port           INTEGER,
    smtp_user           TEXT,
    smtp_password       TEXT,
    smtp_from_email     TEXT,
    smtp_from_name      TEXT,
    imap_host           TEXT,
    imap_port           INTEGER,
    imap_user           TEXT,
    imap_password       TEXT,
    invoice_template_path TEXT,
    fiche_template_path TEXT,
    hourly_rate         REAL,
    billing_unit        TEXT DEFAULT 'hour',
    payment_delay_days  INTEGER DEFAULT 30,
    invoice_numbering   TEXT,
    bank_details        TEXT,
    purchase_order      TEXT,
    pinned              INTEGER DEFAULT 0,
    archived_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_centres_archived ON centres(archived_at);
CREATE INDEX idx_centres_pinned ON centres(pinned);

-- ============================================================
-- FORMATIONS & REAC
-- ============================================================

CREATE TABLE formations (
    id              TEXT PRIMARY KEY,
    centre_id       TEXT NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    rncp_code       TEXT,
    start_date      TEXT,
    end_date        TEXT,
    language        TEXT NOT NULL DEFAULT 'fr',
    reac_file_path  TEXT,
    reac_parsed     INTEGER DEFAULT 0,
    scope_mode      TEXT DEFAULT 'all',
    archived_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_formations_centre ON formations(centre_id);

CREATE TABLE ccps (
    id              TEXT PRIMARY KEY,
    formation_id    TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    title           TEXT NOT NULL,
    sort_order      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ccps_formation ON ccps(formation_id);

CREATE TABLE competences (
    id              TEXT PRIMARY KEY,
    ccp_id          TEXT NOT NULL REFERENCES ccps(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    sort_order      INTEGER DEFAULT 0,
    in_scope        INTEGER DEFAULT 1,
    assigned_to     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_competences_ccp ON competences(ccp_id);
CREATE INDEX idx_competences_scope ON competences(in_scope);

CREATE TABLE evaluation_criteria (
    id              TEXT PRIMARY KEY,
    competence_id   TEXT NOT NULL REFERENCES competences(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    sort_order      INTEGER DEFAULT 0
);
CREATE INDEX idx_eval_criteria_comp ON evaluation_criteria(competence_id);

CREATE TABLE activities_types (
    id              TEXT PRIMARY KEY,
    formation_id    TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    sort_order      INTEGER DEFAULT 0
);
CREATE INDEX idx_activities_formation ON activities_types(formation_id);

CREATE TABLE extra_activities (
    id              TEXT PRIMARY KEY,
    formation_id    TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    billable        INTEGER DEFAULT 1,
    sort_order      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_extra_activities_formation ON extra_activities(formation_id);

-- ============================================================
-- GROUPES & APPRENANTS
-- ============================================================

CREATE TABLE groups (
    id              TEXT PRIMARY KEY,
    formation_id    TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    archived_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_groups_formation ON groups(formation_id);

CREATE TABLE learners (
    id                  TEXT PRIMARY KEY,
    group_id            TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    email               TEXT,
    phone               TEXT,
    initial_level       TEXT,
    specific_needs      TEXT,
    notes               TEXT,
    archived_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_learners_group ON learners(group_id);

CREATE TABLE learner_progress (
    id              TEXT PRIMARY KEY,
    learner_id      TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    competence_id   TEXT NOT NULL REFERENCES competences(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'not_acquired',
    notes           TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(learner_id, competence_id)
);
CREATE INDEX idx_progress_learner ON learner_progress(learner_id);
CREATE INDEX idx_progress_competence ON learner_progress(competence_id);

-- ============================================================
-- PLANNING
-- ============================================================

CREATE TABLE slots (
    id                  TEXT PRIMARY KEY,
    formation_id        TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    group_id            TEXT REFERENCES groups(id) ON DELETE SET NULL,
    date                TEXT NOT NULL,
    start_time          TEXT,
    end_time            TEXT,
    duration_hours      REAL NOT NULL,
    planning_type       TEXT DEFAULT 'imposed',
    title               TEXT,
    description         TEXT,
    modality            TEXT DEFAULT 'presential',
    is_co_animated      INTEGER DEFAULT 0,
    co_animator_name    TEXT,
    extra_activity_id   TEXT REFERENCES extra_activities(id) ON DELETE SET NULL,
    imported_color      TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_slots_formation ON slots(formation_id);
CREATE INDEX idx_slots_date ON slots(date);
CREATE INDEX idx_slots_group ON slots(group_id);

CREATE TABLE slot_competences (
    slot_id         TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    competence_id   TEXT NOT NULL REFERENCES competences(id) ON DELETE CASCADE,
    PRIMARY KEY (slot_id, competence_id)
);

-- ============================================================
-- CONTENUS PÉDAGOGIQUES
-- ============================================================

CREATE TABLE generated_contents (
    id                  TEXT PRIMARY KEY,
    slot_id             TEXT REFERENCES slots(id) ON DELETE SET NULL,
    formation_id        TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    content_type        TEXT NOT NULL,
    title               TEXT NOT NULL,
    content_markdown    TEXT NOT NULL,
    content_html        TEXT,
    model_used          TEXT NOT NULL,
    generation_cost     REAL,
    bloom_level         TEXT,
    estimated_duration  INTEGER,
    version             INTEGER DEFAULT 1,
    parent_id           TEXT REFERENCES generated_contents(id),
    file_path           TEXT,
    archived_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contents_slot ON generated_contents(slot_id);
CREATE INDEX idx_contents_formation ON generated_contents(formation_id);
CREATE INDEX idx_contents_type ON generated_contents(content_type);

CREATE TABLE content_competences (
    content_id      TEXT NOT NULL REFERENCES generated_contents(id) ON DELETE CASCADE,
    competence_id   TEXT NOT NULL REFERENCES competences(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, competence_id)
);

-- ============================================================
-- PROFIL DE STYLE
-- ============================================================

CREATE TABLE style_profile (
    id                  TEXT PRIMARY KEY DEFAULT 'main',
    self_description    TEXT,
    analyzed_profile    TEXT,
    confirmed           INTEGER DEFAULT 0,
    sample_files        TEXT,
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE style_diffs (
    id                  TEXT PRIMARY KEY,
    content_id          TEXT NOT NULL REFERENCES generated_contents(id) ON DELETE CASCADE,
    original_snippet    TEXT NOT NULL,
    modified_snippet    TEXT NOT NULL,
    processed           INTEGER DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_style_diffs_processed ON style_diffs(processed);

-- ============================================================
-- CORRECTIONS
-- ============================================================

CREATE TABLE corrections (
    id                  TEXT PRIMARY KEY,
    learner_id          TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
    content_id          TEXT REFERENCES generated_contents(id) ON DELETE SET NULL,
    submission_file     TEXT,
    submission_text     TEXT,
    ocr_used            INTEGER DEFAULT 0,
    grade               REAL,
    max_grade           REAL DEFAULT 20,
    feedback_markdown   TEXT,
    criteria_grid       TEXT,
    model_used          TEXT,
    validated           INTEGER DEFAULT 0,
    sent_at             TEXT,
    corrected_file_path TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_corrections_learner ON corrections(learner_id);
CREATE INDEX idx_corrections_content ON corrections(content_id);

-- ============================================================
-- FICHES PÉDAGOGIQUES
-- ============================================================

CREATE TABLE pedagogical_sheets (
    id                  TEXT PRIMARY KEY,
    formation_id        TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    general_objective   TEXT,
    sub_objectives      TEXT,
    targeted_cps        TEXT,
    phases              TEXT NOT NULL,
    model_used          TEXT,
    file_path_docx      TEXT,
    file_path_pdf       TEXT,
    linked_invoice_id   TEXT,
    version             INTEGER DEFAULT 1,
    archived_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sheets_formation ON pedagogical_sheets(formation_id);

CREATE TABLE sheet_slots (
    sheet_id    TEXT NOT NULL REFERENCES pedagogical_sheets(id) ON DELETE CASCADE,
    slot_id     TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    PRIMARY KEY (sheet_id, slot_id)
);

-- ============================================================
-- FACTURATION
-- ============================================================

CREATE TABLE invoices (
    id                  TEXT PRIMARY KEY,
    centre_id           TEXT NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
    formation_id        TEXT REFERENCES formations(id) ON DELETE SET NULL,
    invoice_number      TEXT NOT NULL UNIQUE,
    period_start        TEXT NOT NULL,
    period_end          TEXT NOT NULL,
    total_hours         REAL NOT NULL,
    hourly_rate         REAL NOT NULL,
    total_ht            REAL NOT NULL,
    tva_rate            REAL DEFAULT 0,
    total_ttc           REAL NOT NULL,
    status              TEXT DEFAULT 'draft',
    due_date            TEXT,
    paid_date           TEXT,
    file_path           TEXT,
    adjustments         TEXT,
    sent_at             TEXT,
    notes               TEXT,
    archived_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoices_centre ON invoices(centre_id);
CREATE INDEX idx_invoices_formation ON invoices(formation_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(period_start, period_end);

CREATE TABLE invoice_lines (
    id              TEXT PRIMARY KEY,
    invoice_id      TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    slot_id         TEXT REFERENCES slots(id) ON DELETE SET NULL,
    description     TEXT NOT NULL,
    hours           REAL NOT NULL,
    rate            REAL NOT NULL,
    amount_ht       REAL NOT NULL,
    sort_order      INTEGER DEFAULT 0
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE invoice_sheets (
    invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    sheet_id    TEXT NOT NULL REFERENCES pedagogical_sheets(id) ON DELETE CASCADE,
    PRIMARY KEY (invoice_id, sheet_id)
);

-- ============================================================
-- EMAILS
-- ============================================================

CREATE TABLE email_templates (
    id              TEXT PRIMARY KEY,
    centre_id       TEXT REFERENCES centres(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    template_type   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE email_log (
    id              TEXT PRIMARY KEY,
    centre_id       TEXT REFERENCES centres(id),
    recipient       TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body_preview    TEXT,
    attachments     TEXT,
    status          TEXT DEFAULT 'sent',
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- DOCUMENTS ADMINISTRATIFS
-- ============================================================

CREATE TABLE admin_documents (
    id              TEXT PRIMARY KEY,
    formation_id    TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
    group_id        TEXT REFERENCES groups(id) ON DELETE SET NULL,
    doc_type        TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    date_range      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_admin_docs_formation ON admin_documents(formation_id);

-- ============================================================
-- PRÉFÉRENCES DE GÉNÉRATION
-- ============================================================

CREATE TABLE generation_preferences (
    id                      TEXT PRIMARY KEY DEFAULT 'global',
    exercise_individual     INTEGER DEFAULT 3,
    exercise_small_group    INTEGER DEFAULT 2,
    exercise_collective     INTEGER DEFAULT 2,
    pedagogical_game        INTEGER DEFAULT 2,
    role_play               INTEGER DEFAULT 3,
    qcm                     INTEGER DEFAULT 2,
    open_questions          INTEGER DEFAULT 3,
    case_study              INTEGER DEFAULT 3,
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insérer les préférences par défaut
INSERT INTO generation_preferences (id) VALUES ('global');

-- Insérer le profil de style vide
INSERT INTO style_profile (id) VALUES ('main');

-- ============================================================
-- SAUVEGARDES
-- ============================================================

CREATE TABLE backups (
    id              TEXT PRIMARY KEY,
    reason          TEXT NOT NULL,
    version         TEXT,
    file_path       TEXT NOT NULL,
    size_bytes      INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
