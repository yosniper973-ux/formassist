-- Migration v8 : N° TVA Intracommunautaire du centre
-- Utilisé sur les factures pour les centres assujettis à la TVA.

ALTER TABLE centres ADD COLUMN tva_intracom TEXT;
