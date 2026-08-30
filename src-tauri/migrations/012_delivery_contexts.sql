-- Migration v12 : contexte de réalisation d'une formation
--
-- « centres » désigne l'organisme de formation, pas le lieu où la formation se
-- déroule. Une même formation peut être dispensée en détention, au centre, en
-- entreprise ou à distance, avec des contraintes radicalement différentes.
-- Ce contexte est injecté dans les prompts, comme le profil de style.

CREATE TABLE IF NOT EXISTS delivery_contexts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'centre',   -- penitentiaire | centre | entreprise | distanciel
    body        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE formations ADD COLUMN delivery_context_id TEXT
    REFERENCES delivery_contexts(id) ON DELETE SET NULL;

INSERT OR IGNORE INTO delivery_contexts (id, name, kind, body) VALUES
('ctx-penitentiaire',
 'Centre pénitentiaire de Rémire-Montjoly',
 'penitentiaire',
 'Lieu. L''intégralité de la formation se déroule dans le centre pénitentiaire. Aucune séance n''a lieu au centre de formation, aucune sortie n''est possible, et aucune période en entreprise ne peut être organisée.

Groupe. Douze stagiaires femmes. La pratique se fait en trois sous-groupes de quatre qui tournent sur trois postes d''environ 35 minutes : geste technique sur le matériel, application sur zone réelle, écrit et traçabilité. Concevoir les activités pour qu''un seul poste mobilise la machine à la fois.

Numérique. Les stagiaires n''ont ni téléphone personnel ni accès internet libre. Une salle informatique du centre est accessible chaque jour et les activités peuvent en faire usage sans restriction particulière.

Travail personnel. Ne jamais prévoir de travail à faire entre deux séances : tout doit être réalisable pendant le temps de formation.

Locaux d''intervention. Les mises en situation se déroulent dans la salle de formation et les sanitaires collectifs. Ne pas supposer d''accès à un autre local sans le signaler comme une option à confirmer.

Matériel. Gel hydro-alcoolique et matériel mécanisé disponibles. Les produits dangereux et les objets coupants sont sous régime de remise et de comptage : toute activité qui en emploie doit le mentionner explicitement dans son déroulé.

Ton. Adulte et professionnel. Aucune allusion à la situation pénale, aucune infantilisation, aucun développement sur la réinsertion ou l''estime de soi : les stagiaires préparent un titre professionnel.'),
('ctx-centre',
 'Centre de formation',
 'centre',
 'Lieu. Formation dispensée dans les locaux du centre de formation.

Groupe. Préciser l''effectif et le mode de répartition en sous-groupes.

Numérique. Préciser l''accès aux postes informatiques et à internet.

Travail personnel. Préciser si du travail entre deux séances peut être demandé.

Locaux d''intervention. Préciser les espaces disponibles pour les mises en situation.

Matériel. Préciser le parc disponible et ses éventuelles restrictions.');
