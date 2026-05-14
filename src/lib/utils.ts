import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combine et déduplique les classes Tailwind */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un nombre en euros */
export function formatEuros(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Parse une date qui peut être au format YYYY-MM-DD (date "civile" sans heure)
 * en respectant le fuseau local. Évite le décalage UTC qui peut faire reculer
 * la date d'un jour selon le fuseau.
 */
export function parseLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const y = parseInt(m[1]!, 10);
    const mo = parseInt(m[2]!, 10) - 1;
    const d = parseInt(m[3]!, 10);
    return new Date(y, mo, d, 12, 0, 0, 0);
  }
  return new Date(value);
}

/** Formate une date ISO en format français */
export function formatDate(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Formate une date courte */
export function formatDateShort(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Formate une durée en heures */
export function formatHours(hours: number): string {
  if (hours === Math.floor(hours)) {
    return `${hours}h`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Tronque un texte avec ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + "…";
}

/**
 * Détecte la section réservée au formateur via un titre markdown (##, ###…).
 * Variantes couvertes :
 *   🔒 · TRAME FORMATEUR · CORRIGÉ(S) · RÉPONSE(S) · ANIMATION FORMATEUR
 *   NOTES FORMATEUR · GUIDE D'ANIMATION · GUIDE FORMATEUR · CONSEILS FORMATEUR
 *   CONSIGNES POUR L'ACCOMPAGNATEUR · ACCOMPAGNATEUR
 */
const FORMATEUR_HEADING_REGEX =
  /(?:^|\n)[ \t]*#{2,}[ \t]+[^\n]*(🔒|TRAME\s*FORMATEUR|CORRIG[ÉE]S?|CORRECTIONS?|R[ÉE]PONSES?\s*(?:AUX\s*\w+)?|SOLUTIONS?|CL[EÉ]S?\s*(?:DE\s*)?R[ÉE]PONSE|ANIMATION\s*FORMATEUR|NOTES?\s*FORMATEUR|GUIDE\s*(?:D['']ANIMATION|FORMATEUR)|CONSEILS?\s*FORMATEUR|CONSIGNES?\s*(?:POUR\s*L[''])?ACCOMPAGNATEUR)/i;

/**
 * Détecte le cas où l'IA insère un corrigé en texte gras hors section formateur,
 * ex. : `**Corrigé indicatif formateur** :` après la grille d'évaluation.
 */
const FORMATEUR_BOLD_REGEX =
  /(?:^|\n)[ \t]*\*\*[^*\n]*(🔒|TRAME\s*FORMATEUR|CORRIG[ÉE]S?\s*(?:INDICATIF\s*)?FORMATEUR)/i;

/** Retourne true si le markdown contient une section formateur. */
export function hasFormateurSection(markdown: string): boolean {
  return FORMATEUR_HEADING_REGEX.test(markdown) || FORMATEUR_BOLD_REGEX.test(markdown);
}

/**
 * Supprime la section formateur du markdown pour produire la version apprenant.
 * Coupe à la première occurrence d'un titre formateur (## ou ###) OU d'une ligne
 * en gras contenant un mot-clé formateur (cas où l'IA génère le corrigé hors
 * section, par ex. après la grille d'évaluation).
 * Supprime aussi le séparateur --- éventuel qui précède immédiatement la coupe.
 *
 * Ensuite, supprime les indications de bonne réponse qui pourraient avoir
 * fuité dans la zone questions (gras dans les cellules de tableau, gras sur
 * les options de QCM en liste, ✓/✅ en début de ligne, etc.).
 */
export function stripFormateur(markdown: string): string {
  const headingMatch = markdown.match(FORMATEUR_HEADING_REGEX);
  const boldMatch = markdown.match(FORMATEUR_BOLD_REGEX);

  let cutIndex: number | undefined;
  if (headingMatch?.index !== undefined) cutIndex = headingMatch.index;
  if (boldMatch?.index !== undefined) {
    cutIndex =
      cutIndex === undefined ? boldMatch.index : Math.min(cutIndex, boldMatch.index);
  }

  let content = markdown;
  if (cutIndex !== undefined) {
    content = markdown.slice(0, cutIndex);
    content = content.replace(/\n+---\s*$/, "");
    content = content.trimEnd();
  }

  return stripCorrectAnswerHints(content);
}

/**
 * Décode les entités HTML les plus courantes qui peuvent traîner dans le
 * markdown généré par l'IA (qui pense parfois écrire pour le web). Sans ce
 * traitement, on retrouve des "&nbsp;", "&amp;" littéraux dans le docx/pdf.
 */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&ensp;/g, " ")
    .replace(/&emsp;/g, " ")
    .replace(/&thinsp;/g, " ")
    .replace(/&#8201;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    // &amp; doit être traité EN DERNIER pour éviter de double-décoder
    .replace(/&amp;/g, "&");
}

/**
 * Retire les indices visuels de bonne réponse dans la version apprenant :
 *
 * 1. Lignes de tableau (commencent par `|`) → enlève le gras des cellules.
 *    Cas typique : `| 1 | Q ? | A | **B** | C | D |` → `| 1 | Q ? | A | B | C | D |`
 *
 * 2. Options de QCM en liste à puces ou numérotée, dont le marqueur est
 *    suivi d'une lettre A/B/C/D (parenthèse ou point) → enlève le gras.
 *    Cas typique : `- B) **Paris**` → `- B) Paris`
 *
 * 3. Préfixes ✓ / ✅ / ☑ en début de ligne d'option → retirés.
 *
 * Les autres usages du gras (titres, mises en avant pédagogiques) sont
 * préservés.
 */
export function stripCorrectAnswerHints(markdown: string): string {
  const removeBold = (s: string): string =>
    s.replace(/\*\*([^*\n]+)\*\*/g, "$1");

  const lines = markdown.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();

    // Cas 1 : ligne de tableau
    if (trimmed.startsWith("|")) {
      out.push(removeBold(line));
      continue;
    }

    // Cas 2 : option QCM en liste — marqueur (-, *, 1.) suivi
    // d'une lettre A/B/C/D ou a/b/c/d et d'un séparateur ) . :
    if (
      /^(?:[-*•]|\d+[.)])\s+(?:\[\s?[xX✓]?\s?\]\s+)?[A-Da-d][).:]\s+/.test(trimmed)
    ) {
      // Retire d'éventuels ✓ ✅ ☑ après le marqueur de lettre
      let cleaned = line.replace(
        /([A-Da-d][).:]\s+)(?:[✓✅☑]\s*)+/,
        "$1",
      );
      cleaned = removeBold(cleaned);
      out.push(cleaned);
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}
