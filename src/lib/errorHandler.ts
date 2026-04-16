/**
 * Gestionnaire d'erreurs centralisé pour FormAssist.
 *
 * Chaque erreur reçoit un code unique (FA-XXXX) que l'utilisatrice
 * peut communiquer pour le diagnostic.
 */

export interface AppError {
  code: string;
  message: string;
  details: string;
  timestamp: string;
  module: string;
}

// Stockage en mémoire des dernières erreurs
const errorLog: AppError[] = [];
const MAX_ERRORS = 50;

// Listeners pour le composant UI
type ErrorListener = (error: AppError) => void;
const listeners: ErrorListener[] = [];

export function onError(listener: ErrorListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ============================================================
// Codes d'erreur
// ============================================================

const ERROR_CODES: Record<string, string> = {
  // Initialisation (FA-01xx)
  "FA-0100": "Impossible d'initialiser la base de données",
  "FA-0101": "Erreur lors des migrations de la BDD",
  "FA-0102": "Erreur lecture configuration",

  // Auth (FA-02xx)
  "FA-0200": "Erreur vérification mot de passe",
  "FA-0201": "Erreur création mot de passe",
  "FA-0202": "Erreur chiffrement/déchiffrement",

  // API Claude (FA-03xx)
  "FA-0300": "Clé API non configurée",
  "FA-0301": "Clé API invalide ou expirée",
  "FA-0302": "Crédit API insuffisant",
  "FA-0303": "Erreur de connexion à l'API Claude",
  "FA-0304": "Réponse API inattendue",
  "FA-0305": "Budget mensuel dépassé",
  "FA-0306": "Trop de requêtes (rate limit)",

  // Base de données (FA-04xx)
  "FA-0400": "Erreur lecture base de données",
  "FA-0401": "Erreur écriture base de données",
  "FA-0402": "Données corrompues ou manquantes",
  "FA-0403": "Erreur sauvegarde base de données",
  "FA-0404": "Erreur restauration base de données",

  // Fichiers (FA-05xx)
  "FA-0500": "Fichier introuvable",
  "FA-0501": "Erreur lecture fichier",
  "FA-0502": "Erreur écriture fichier",
  "FA-0503": "Format de fichier non supporté",
  "FA-0504": "Fichier trop volumineux",

  // Email (FA-06xx)
  "FA-0600": "Configuration SMTP manquante",
  "FA-0601": "Erreur connexion SMTP",
  "FA-0602": "Erreur envoi email",
  "FA-0603": "Adresse email invalide",

  // REAC (FA-07xx)
  "FA-0700": "Erreur parsing REAC",
  "FA-0701": "Format REAC non reconnu",

  // Génération (FA-08xx)
  "FA-0800": "Erreur génération de contenu",
  "FA-0801": "Contenu généré vide ou invalide",

  // Correction (FA-09xx)
  "FA-0900": "Erreur correction",
  "FA-0901": "Soumission vide",

  // Facturation (FA-10xx)
  "FA-1000": "Erreur création facture",
  "FA-1001": "Numéro de facture en doublon",

  // Général (FA-99xx)
  "FA-9900": "Erreur inattendue",
  "FA-9901": "Fonctionnalité non disponible hors-ligne",
};

// ============================================================
// Fonctions publiques
// ============================================================

/**
 * Enregistre une erreur et notifie les listeners.
 */
export function logError(
  code: string,
  module: string,
  details: unknown,
): AppError {
  const error: AppError = {
    code,
    message: ERROR_CODES[code] ?? "Erreur inconnue",
    details: details instanceof Error ? details.message : String(details),
    timestamp: new Date().toISOString(),
    module,
  };

  errorLog.push(error);
  if (errorLog.length > MAX_ERRORS) {
    errorLog.shift();
  }

  // Notifier les listeners
  for (const listener of listeners) {
    try {
      listener(error);
    } catch {
      // Éviter les erreurs dans les listeners
    }
  }

  // Log console pour le debug
  console.error(`[${code}] ${error.message} — ${error.details} (module: ${module})`);

  return error;
}

/**
 * Détermine le code d'erreur approprié à partir d'une erreur brute.
 */
export function classifyError(err: unknown, context: string): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // API Claude
  if (msg.includes("clé api") || msg.includes("api key")) return "FA-0301";
  if (msg.includes("crédit") || msg.includes("credit")) return "FA-0302";
  if (msg.includes("429") || msg.includes("rate limit")) return "FA-0306";
  if (msg.includes("api") && msg.includes("connexion")) return "FA-0303";
  if (msg.includes("budget")) return "FA-0305";

  // BDD
  if (msg.includes("sqlite") || msg.includes("database")) return "FA-0400";
  if (msg.includes("constraint") || msg.includes("unique")) return "FA-0401";

  // Fichiers
  if (msg.includes("no such file") || msg.includes("introuvable")) return "FA-0500";
  if (msg.includes("permission")) return "FA-0502";

  // Email
  if (msg.includes("smtp")) return "FA-0601";
  if (msg.includes("email") && msg.includes("invalid")) return "FA-0603";

  // REAC
  if (context.includes("reac")) return "FA-0700";

  // Chiffrement
  if (msg.includes("decrypt") || msg.includes("encrypt") || msg.includes("chiffr")) return "FA-0202";

  return "FA-9900";
}

/**
 * Retourne les dernières erreurs enregistrées.
 */
export function getErrorLog(): AppError[] {
  return [...errorLog];
}

/**
 * Génère un rapport d'erreur copiable (texte).
 */
export function generateErrorReport(): string {
  if (errorLog.length === 0) return "Aucune erreur enregistrée.";

  const lines = [
    "=== Rapport d'erreurs FormAssist ===",
    `Date : ${new Date().toLocaleString("fr-FR")}`,
    `Nombre d'erreurs : ${errorLog.length}`,
    "",
  ];

  for (const e of errorLog.slice(-10)) {
    lines.push(`[${e.code}] ${e.message}`);
    lines.push(`  Module : ${e.module}`);
    lines.push(`  Détails : ${e.details}`);
    lines.push(`  Heure : ${new Date(e.timestamp).toLocaleString("fr-FR")}`);
    lines.push("");
  }

  lines.push("=== Fin du rapport ===");
  return lines.join("\n");
}
