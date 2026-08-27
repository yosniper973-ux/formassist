import type { ModelTier, TaskType } from "@/types/api";

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelConfig {
  id: string;
  displayName: string;
  inputCostPer1M: number;   // € par million de tokens en entrée
  outputCostPer1M: number;  // € par million de tokens en sortie
  /**
   * false pour les modèles qui rejettent `temperature` avec une erreur 400
   * (toute la famille Opus 4.7+ et Sonnet 5). Le champ n'est alors pas envoyé.
   */
  supportsTemperature: boolean;
  /**
   * Profondeur de raisonnement pour les modèles à réflexion adaptative.
   * Non défini = paramètre `output_config` non envoyé (Haiku ne le supporte pas).
   */
  effort?: EffortLevel;
}

/**
 * Modèles Claude disponibles.
 * Mettre à jour les IDs ici quand de nouvelles versions sortent.
 */
export const MODELS: Record<ModelTier, ModelConfig> = {
  opus: {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    supportsTemperature: false,
    effort: "high",
  },
  sonnet: {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    inputCostPer1M: 2.0,
    outputCostPer1M: 10.0,
    supportsTemperature: false,
    effort: "medium",
  },
  haiku: {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    supportsTemperature: true,
  },
};

/** Nombre moyen de tokens de sortie estimés par type de tâche */
export const ESTIMATED_OUTPUT_TOKENS: Record<TaskType, number> = {
  generation_cours: 4000,
  generation_exercice: 2500,
  generation_jeu: 3000,
  generation_mise_en_situation: 3000,
  generation_fiche_pedagogique: 5000,
  analyse_style: 2000,
  affinage_style: 1500,
  parsing_reac: 6000,
  parsing_planning: 2000,
  parsing_repartition: 1500,
  correction: 4000,
  recommandations: 2000,
  mail_redaction: 800,
  qcm_simple: 8000,
  reformulation: 500,
  correction_dossier: 4000,
  prefill_deroulement: 3000,
  generation_evaluation: 6000,
  remplissage_trame: 4000,
};

/** Température par défaut par type de tâche */
export const DEFAULT_TEMPERATURE: Record<TaskType, number> = {
  generation_cours: 0.7,
  generation_exercice: 0.7,
  generation_jeu: 0.8,
  generation_mise_en_situation: 0.8,
  generation_fiche_pedagogique: 0.5,
  analyse_style: 0.3,
  affinage_style: 0.3,
  parsing_reac: 0.1,
  parsing_planning: 0.1,
  parsing_repartition: 0.1,
  correction: 0.3,
  recommandations: 0.5,
  mail_redaction: 0.5,
  qcm_simple: 0.5,
  reformulation: 0.4,
  correction_dossier: 0.3,
  prefill_deroulement: 0.4,
  generation_evaluation: 0.7,
  remplissage_trame: 0.3,
};

/** Préréglages multi-modèles */
export const PRESETS: Record<string, Record<TaskType, ModelTier>> = {
  quality: {
    generation_cours: "opus",
    generation_exercice: "opus",
    generation_jeu: "opus",
    generation_mise_en_situation: "opus",
    generation_fiche_pedagogique: "opus",
    analyse_style: "opus",
    affinage_style: "opus",
    parsing_reac: "sonnet",
    parsing_planning: "sonnet",
    parsing_repartition: "sonnet",
    correction: "sonnet",
    recommandations: "sonnet",
    mail_redaction: "sonnet",
    qcm_simple: "sonnet",
    reformulation: "haiku",
    correction_dossier: "opus",
    prefill_deroulement: "sonnet",
    generation_evaluation: "opus",
    remplissage_trame: "sonnet",
  },
  balanced: {
    generation_cours: "sonnet",
    generation_exercice: "sonnet",
    generation_jeu: "sonnet",
    generation_mise_en_situation: "sonnet",
    generation_fiche_pedagogique: "sonnet",
    analyse_style: "sonnet",
    affinage_style: "sonnet",
    parsing_reac: "sonnet",
    parsing_planning: "sonnet",
    parsing_repartition: "haiku",
    correction: "sonnet",
    recommandations: "sonnet",
    mail_redaction: "haiku",
    qcm_simple: "haiku",
    reformulation: "haiku",
    correction_dossier: "sonnet",
    prefill_deroulement: "sonnet",
    generation_evaluation: "sonnet",
    remplissage_trame: "sonnet",
  },
  economic: {
    generation_cours: "sonnet",
    generation_exercice: "haiku",
    generation_jeu: "haiku",
    generation_mise_en_situation: "haiku",
    generation_fiche_pedagogique: "sonnet",
    analyse_style: "sonnet",
    affinage_style: "haiku",
    parsing_reac: "haiku",
    parsing_planning: "haiku",
    parsing_repartition: "haiku",
    correction: "haiku",
    recommandations: "haiku",
    mail_redaction: "haiku",
    qcm_simple: "haiku",
    reformulation: "haiku",
    correction_dossier: "sonnet",
    prefill_deroulement: "haiku",
    generation_evaluation: "sonnet",
    remplissage_trame: "haiku",
  },
};

/** Noms affichés des préréglages (en français) */
export const PRESET_LABELS: Record<string, { name: string; description: string; budgetRange: string }> = {
  quality: {
    name: "Qualité maximale",
    description: "Les meilleurs résultats pour tes cours et exercices",
    budgetRange: "8 – 25 €/mois",
  },
  balanced: {
    name: "Équilibré",
    description: "Un bon compromis qualité/coût",
    budgetRange: "3 – 10 €/mois",
  },
  economic: {
    name: "Économique",
    description: "Priorité au budget, qualité correcte",
    budgetRange: "1 – 4 €/mois",
  },
  custom: {
    name: "Personnalisé",
    description: "Tu choisis le modèle pour chaque type de tâche",
    budgetRange: "Variable",
  },
};
