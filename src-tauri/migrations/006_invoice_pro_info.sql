-- Migration v6 : champ SIRET du centre (utilisé sur les factures)
-- Le SIRET du centre destinataire apparaît automatiquement sur la facture PDF.

ALTER TABLE centres ADD COLUMN siret TEXT;
