import type { TaskType } from "@/types/api";

import { PARSING_REAC_PROMPT } from "./parsing_reac";
import { PARSING_PLANNING_PROMPT } from "./parsing_planning";
import { PARSING_REPARTITION_PROMPT } from "./parsing_repartition";
import { GENERATION_COURS_PROMPT } from "./generation_cours";
import { GENERATION_EXERCICE_INDIVIDUEL_PROMPT } from "./generation_exercice_individuel";
import { GENERATION_EXERCICE_PETIT_GROUPE_PROMPT } from "./generation_exercice_petit_groupe";
import { GENERATION_EXERCICE_COLLECTIF_PROMPT } from "./generation_exercice_collectif";
import { GENERATION_JEU_PEDAGOGIQUE_PROMPT } from "./generation_jeu_pedagogique";
import { GENERATION_MISE_EN_SITUATION_PROMPT } from "./generation_mise_en_situation";
import { GENERATION_FICHE_PEDAGOGIQUE_PROMPT } from "./generation_fiche_pedagogique";
import { ANALYSE_STYLE_PROMPT } from "./analyse_style";
import { AFFINAGE_STYLE_PROMPT } from "./affinage_style";
import { CORRECTION_EXERCICE_PROMPT } from "./correction_exercice";
import { RECOMMANDATIONS_DASHBOARD_PROMPT } from "./recommandations_dashboard";
import { MAIL_COORDINATEUR_PROMPT } from "./mail_coordinateur";
import { CORRECTION_DOSSIER_PROMPT } from "./correction_dossier";
import { PREFILL_DEROULEMENT_PROMPT } from "./prefill_deroulement";

const PROMPTS: Record<TaskType, string> = {
  parsing_reac: PARSING_REAC_PROMPT,
  parsing_planning: PARSING_PLANNING_PROMPT,
  parsing_repartition: PARSING_REPARTITION_PROMPT,
  generation_cours: GENERATION_COURS_PROMPT,
  generation_exercice: GENERATION_EXERCICE_INDIVIDUEL_PROMPT,
  generation_jeu: GENERATION_JEU_PEDAGOGIQUE_PROMPT,
  generation_mise_en_situation: GENERATION_MISE_EN_SITUATION_PROMPT,
  generation_fiche_pedagogique: GENERATION_FICHE_PEDAGOGIQUE_PROMPT,
  analyse_style: ANALYSE_STYLE_PROMPT,
  affinage_style: AFFINAGE_STYLE_PROMPT,
  correction: CORRECTION_EXERCICE_PROMPT,
  recommandations: RECOMMANDATIONS_DASHBOARD_PROMPT,
  mail_redaction: MAIL_COORDINATEUR_PROMPT,
  qcm_simple: GENERATION_EXERCICE_INDIVIDUEL_PROMPT,
  reformulation: GENERATION_COURS_PROMPT,
  correction_dossier: CORRECTION_DOSSIER_PROMPT,
  prefill_deroulement: PREFILL_DEROULEMENT_PROMPT,
};

export function getPromptForTask(task: TaskType): string {
  return PROMPTS[task];
}

// Re-export pour usage direct
export {
  GENERATION_EXERCICE_PETIT_GROUPE_PROMPT,
  GENERATION_EXERCICE_COLLECTIF_PROMPT,
};
