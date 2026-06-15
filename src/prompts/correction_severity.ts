/**
 * Niveaux de sévérité pour la correction.
 *
 * Le prompt de correction de base (CORRECTION_EXERCICE_PROMPT) reste inchangé :
 * on lui ajoute simplement un bloc de règles de notation via `systemPromptAppend`,
 * selon le niveau choisi par la formatrice au moment de corriger.
 *
 * « standard » = comportement historique → aucun bloc ajouté.
 */
export type CorrectionSeverity = "souple" | "standard" | "strict";

const SOUPLE_MODIFIER = `## Mode de notation : SOUPLE (correction bienveillante)

Adapte ta notation à un apprenant qui a besoin d'être valorisé et encouragé :
- **Note au fond** : valorise le raisonnement et l'idée juste même si l'expression est maladroite ou incomplète.
- **Points partiels généreux** : dès qu'une réponse contient un élément correct, accorde des points partiels. Ne mets 0 que si la réponse est fausse, hors-sujet ou absente.
- **Synonymes acceptés** : compte comme correcte toute formulation équivalente au fond, même si le vocabulaire métier exact n'est pas employé.
- **Forme non pénalisée** : signale les fautes d'orthographe ou de syntaxe dans le commentaire, sans les déduire de la note.
- **Doute à l'avantage de l'apprenant** : en cas d'hésitation sur l'attribution d'un point, arrondis en sa faveur.
- **Ton** : reste encourageant et constructif, mets en avant les progrès.`;

const STRICT_MODIFIER = `## Mode de notation : STRICT (correction exigeante)

Adapte ta notation à un apprenant qu'il faut tirer vers le haut, dans une logique proche du jury d'examen :
- **Barème à la lettre** : n'accorde des points que si l'élément attendu est explicitement présent, exact et correctement formulé.
- **Exige le vocabulaire métier** : une idée juste mais imprécise ou mal formulée ne vaut que des points partiels.
- **Pénalise les manques** : compte le nombre d'éléments demandés (« citez 2 / citez 3 ») et retire des points pour chaque élément manquant ou approximatif.
- **Pas de demi-mesure sur le hors-sujet** : une réponse à côté de la question = 0.
- **Doute défavorable** : en cas d'hésitation, n'accorde pas le point.
- **Ton** : reste respectueux et pédagogique, mais sois exigeant et précis sur ce qui doit être corrigé.`;

/**
 * Retourne le bloc à ajouter au prompt système, ou une chaîne vide
 * pour le mode standard (aucune modification).
 */
export function getSeverityModifier(severity: CorrectionSeverity): string {
  switch (severity) {
    case "souple":
      return SOUPLE_MODIFIER;
    case "strict":
      return STRICT_MODIFIER;
    default:
      return "";
  }
}
