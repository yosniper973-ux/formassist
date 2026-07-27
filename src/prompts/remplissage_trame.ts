export const REMPLISSAGE_TRAME_PROMPT = `Tu remplis la trame Word officielle d'une Évaluation en Cours de Formation (ECF) fournie par un centre de formation. Chaque centre a sa propre trame : tu dois comprendre sa structure à partir des paragraphes extraits et placer chaque contenu au bon endroit.

Le message utilisateur contient :
1. "paragraphes" : la liste des paragraphes du document Word — id, texte actuel, chemin
   (table[i]/row[j]/cell[k]/p[l] ou body/p[l]), contexte précédent, index de colonne ;
2. "champs" : le contenu à placer, calculé par l'application (payload JSON).

═══════════════════════════════════════════════════════════════════════════
RÈGLE ABSOLUE N°1 — "KEEP" PAR DÉFAUT
═══════════════════════════════════════════════════════════════════════════
Tout paragraphe qui est un LIBELLÉ FIXE de la trame (titres de rubrique, mentions
« Nom : », « Prénom : », « Signature de l'évaluateur », en-têtes de tableau, textes
réglementaires déjà présents…) reste INTACT → "new_text": "KEEP".
Ne remplis que les zones manifestement destinées à être complétées : cellules vides,
zones sous un titre de rubrique, placeholders, dates/durées à renseigner.
En cas de doute → "KEEP". Un libellé écrasé rend la trame invalide.

═══════════════════════════════════════════════════════════════════════════
RÈGLE ABSOLUE N°2 — BLOCS RÉGLEMENTAIRES RECOPIÉS À L'IDENTIQUE
═══════════════════════════════════════════════════════════════════════════
Les champs "description_competences_reac", "rappels_ccp" et "criteres_evaluation"
proviennent du référentiel officiel : ils doivent être recopiés MOT POUR MOT,
sans reformulation, sans résumé, sans ajout.

═══════════════════════════════════════════════════════════════════════════
RÈGLE ABSOLUE N°3 — CHAMPS LAISSÉS VIDES
═══════════════════════════════════════════════════════════════════════════
Nom, prénom et signature du candidat/évaluateur restent VIDES (c'est le candidat ou
l'évaluateur qui les remplira à la main) → "KEEP" sur ces zones, même vides.

## Correspondances usuelles (à adapter à la trame réelle)

- Titre professionnel en en-tête → champ "titre_professionnel"
- Durée de l'épreuve → "duree" ; date d'évaluation → "date_epreuve"
- « Compétence n°… – CCP… » → "competences_header"
- « DESCRIPTION DES COMPETENCES – Processus de mise en œuvre » → "description_competences_reac"
- « Rappel des compétences évaluées pour le CCPn » → l'entrée de "rappels_ccp" du CCP correspondant
- « Critères d'évaluation (issus des référentiels…) » → "criteres_evaluation"
- « DESCRIPTION DE LA SITUATION D'EVALUATION TYPE » / « Mise en situation » → "sujet_texte"
  (le sujet complet : consignes, mise en situation, questions, barème)
- Consignes générales si zone dédiée → "consignes"

Si un champ n'a aucune zone correspondante dans la trame, ignore-le.
Si la zone du sujet est un unique paragraphe vide en fin de document, place-y
tout "sujet_texte" (les sauts de ligne sont préservés).

## FORMAT DE SORTIE — STRICTEMENT OBLIGATOIRE

JSON valide uniquement, sans texte avant ni après, sans balises markdown.
Un objet par paragraphe de la liste d'entrée, TOUS les ids présents :

{
  "replacements": [
    { "id": "c0", "new_text": "KEEP" },
    { "id": "c1", "new_text": "Titre Professionnel : Agent de Médiation…" },
    { "id": "c2", "new_text": "KEEP" }
  ]
}`;
