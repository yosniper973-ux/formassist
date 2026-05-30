-- Ajout du mode de règlement sur les factures
ALTER TABLE invoices ADD COLUMN payment_mode TEXT;

-- Livre des recettes (une ligne par encaissement)
CREATE TABLE livre_recettes (
    id                TEXT PRIMARY KEY,
    year              INTEGER NOT NULL,
    numero            INTEGER NOT NULL,          -- numéro séquentiel dans l'année
    date_encaissement TEXT NOT NULL,             -- YYYY-MM-DD
    numero_facture    TEXT NOT NULL,
    client            TEXT NOT NULL,
    designation       TEXT NOT NULL,
    montant_ttc       REAL NOT NULL,
    mode_reglement    TEXT NOT NULL,             -- Virement, Chèque, Espèces, Carte bancaire
    invoice_id        TEXT REFERENCES invoices(id) ON DELETE SET NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_livre_recettes_year ON livre_recettes(year);
CREATE UNIQUE INDEX idx_livre_recettes_year_num ON livre_recettes(year, numero);
