/**
 * Format de sortie commun à tous les prompts de génération de cours et d'exercices.
 * Garantit une mise en page cohérente : bandeaux, tableau méta, sections numérotées,
 * encadrés colorés, grille d'évaluation.
 *
 * À concaténer à la fin de chaque prompt système.
 */
export const FORMAT_DOCUMENT_PEDAGOGIQUE = `
## FORMAT DE SORTIE — OBLIGATOIRE

Tu dois respecter EXACTEMENT cette structure Markdown, qui sera rendue dans l'application ET exportée en Word avec une mise en page professionnelle (Arial, bandeaux bleu marine, encadrés colorés).

### 1) Titre principal

Première ligne = titre H1 EN MAJUSCULES (sera rendu en bandeau bleu marine #1A3C5E). Exemple :

\`\`\`
# MISE EN SITUATION – JEU DE RÔLE
\`\`\`

### 2) Tableau méta (OBLIGATOIRE, juste après le titre)

Toujours un tableau à 2 colonnes « Rubrique / Détail » avec AU MINIMUM ces lignes :

\`\`\`
| Rubrique | Détail |
|----------|--------|
| Formation | [nom exact de la formation] |
| Type d'activité | [ex : Cours magistral / Exercice individuel / Jeu de rôle] |
| Durée estimée | [ex : 2h30 (préparation 45 min + jeu 60 min + restitution 45 min)] |
| Modalité | [ex : Présentiel — groupe entier / sous-groupes de 3-4] |
| Matériel | [liste concise du matériel nécessaire] |
| Compétence(s) REAC | [code(s) + intitulé(s) court(s), ex : CP10 — Accompagner la personne…] |
\`\`\`

### 3) Sections numérotées

Chaque grande partie commence par un H2 numéroté EN MAJUSCULES. Exemples valides :

\`\`\`
## 1. OBJECTIF OPÉRATIONNEL
## 2. RAPPEL NOTIONNEL
## 3. SCÉNARIO / CONTEXTE
## 4. CONSIGNES POUR L'APPRENANT
## 5. PRODUCTION ATTENDUE
## 6. GRILLE D'ÉVALUATION
\`\`\`

Les sous-sections utilisent H3 (\`### 3.1 – Sous-titre\`).

### 4) Encadrés colorés (callouts GitHub)

Utilise systématiquement ces encadrés pour structurer visuellement le contenu :

- \`> [!info]\` — notion clé, définition, rappel de cours (fond bleu clair)
- \`> [!success]\` — bonnes pratiques, conseils positifs (fond vert clair)
- \`> [!warning]\` — points de vigilance, pièges à éviter (fond orange clair)
- \`> [!danger]\` — erreurs graves, risques (fond rouge clair)
- \`> [!tip]\` — astuce, conseil pratique (fond violet clair)

⚠️ N'utilise PAS \`> [!note]\` dans la partie apprenant. Les remarques destinées uniquement au formateur vont dans la section \`## 🔒 TRAME FORMATEUR\`.

Exemple :

\`\`\`
> [!info] Définition
> L'espace public est un lieu accessible à tous sans restriction, géré par une autorité publique.

> [!warning] À ne pas confondre
> Les parties communes d'un immeuble ne sont PAS un espace public, même si elles sont accessibles.
\`\`\`

### 5) Tableaux

Utilise des vrais tableaux Markdown dès que tu compares plusieurs éléments. Alignement : \`:---\` (gauche), \`:---:\` (centre), \`---:\` (droite). Exemple grille d'évaluation :

\`\`\`
| Critère d'évaluation | Acquis | En cours | Non acquis |
|----------------------|:------:|:--------:|:----------:|
| Distinction espace public / privé | ☐ | ☐ | ☐ |
| Identification de 4 droits minimum | ☐ | ☐ | ☐ |
\`\`\`

### 6) Emojis pour le rythme visuel

Utilise avec parcimonie mais systématiquement :
- 🎯 pour les objectifs
- 📋 pour les consignes / livrables
- 🏢 🏠 pour distinguer public / privé (quand pertinent)
- 🚨 pour les situations / cas pratiques
- ⚠️ pour les points de vigilance
- ✅ pour les critères de réussite
- 📚 pour les ressources / références juridiques
- 👥 pour le travail en groupe
- ⏱️ pour le chronométrage

### 7) Dernière section obligatoire

Termine TOUJOURS par une section \`## N. GRILLE D'ÉVALUATION\` (même courte) avec un tableau Acquis/En cours/Non acquis, sauf pour un cours magistral pur où tu peux mettre \`## QUIZ DE VALIDATION\` avec 3-5 questions à la place.

### Règles finales

- N'ajoute AUCUN texte explicatif avant le H1 ou après la dernière section.
- N'utilise PAS de blocs de code \`\`\` sauf pour du vrai code technique.
- Les paragraphes doivent être aérés (ligne vide entre chaque bloc).
- Le document doit pouvoir être imprimé et envoyé tel quel à des apprenants adultes.
- ⚠️ **N'écris JAMAIS d'entités HTML** dans ton markdown (\`&nbsp;\`, \`&amp;\`, \`&lt;\`, \`&hellip;\` etc.). Le document n'est pas du HTML : ces codes apparaîtraient en clair dans le Word/PDF. Utilise toujours les vrais caractères : un espace normal, &, <, …
- Pour espacer des cases à cocher sur une ligne (ex : \`☐ A   ☐ B   ☐ C   ☐ D\`), utilise simplement plusieurs espaces normaux entre les options — JAMAIS de \`&nbsp;\`.
`;
