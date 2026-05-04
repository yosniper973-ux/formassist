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
 * Détecte la section réservée au formateur.
 * On accepte toute variation : le marqueur officiel est l'emoji cadenas 🔒
 * dans un titre de niveau 2 (##). Sinon, on accepte aussi les titres contenant
 * "TRAME FORMATEUR", "CORRIGÉ", "RÉPONSES" ou "ANIMATION FORMATEUR" sans emoji.
 */
const FORMATEUR_HEADING_REGEX =
  /\n##\s+[^\n]*(🔒|TRAME\s*FORMATEUR|CORRIG[ÉE]S?|R[ÉE]PONSES?|ANIMATION\s*FORMATEUR)/i;

/** Retourne true si le markdown contient une section formateur. */
export function hasFormateurSection(markdown: string): boolean {
  return FORMATEUR_HEADING_REGEX.test(markdown);
}

/**
 * Supprime la section formateur du markdown pour produire la version apprenant
 * (sans corrigé ni conseils d'animation). Coupe au séparateur --- qui précède
 * le titre, ou au titre lui-même.
 */
export function stripFormateur(markdown: string): string {
  const trameMatch = markdown.match(FORMATEUR_HEADING_REGEX);
  if (!trameMatch || trameMatch.index === undefined) return markdown;

  let content = markdown.slice(0, trameMatch.index);

  // Supprime uniquement le --- séparateur s'il est en toute fin du contenu étudiant
  // (celui placé juste avant la section formateur, pas les --- internes au document)
  content = content.replace(/\n+---\s*$/, "");

  return content.trimEnd();
}
