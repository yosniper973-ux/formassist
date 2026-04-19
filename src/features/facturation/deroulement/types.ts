/** Types pour les fiches de déroulement de séance */

export interface CcpRow {
  id: string;
  formation_id: string;
  code: string;
  title: string;
  sort_order: number;
}

export interface CompetenceRow {
  id: string;
  ccp_id: string;
  code: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface EvaluationCriterionRow {
  id: string;
  competence_id: string;
  description: string;
  sort_order: number;
}

export interface SlotLight {
  id: string;
  date: string;
  duration_hours: number;
  title: string | null;
  description: string | null;
  extra_activity_id: string | null;
}

export interface ContentOption {
  id: string;
  title: string;
  content_type: string;
  markdown_preview: string;
}

/** Données brutes détectées pour une facture : 1 entrée par CCP touché */
export interface DetectedCcp {
  ccp: CcpRow;
  competences: Array<{
    competence: CompetenceRow;
    criteria: EvaluationCriterionRow[];
    availableContents: ContentOption[];
  }>;
  slots: SlotLight[];
  total_duration_hours: number;
}

/** Représentation d'une phase dans le formulaire */
export interface PhaseDraft {
  competence_id: string;
  code: string;
  intitule: string;
  duree_heures: number;
  is_ecf: boolean;
  selected_content_ids: string[];
  objectifs_operationnels: string; // puces rédigées (1 ligne par critère)
  contenu: string;
  methodes: string;
  outils: string;
  evaluation: string;
}

/** Représentation d'une fiche complète en cours d'édition */
export interface DeroulementDraft {
  id?: string;
  invoice_id: string;
  centre_id: string;
  ccp_id: string;
  formation_id: string;
  formation_title: string;
  dates_label: string;
  total_duration_hours: number;
  redacteur: string;
  titre_seance: string;
  objectif_general: string;
  phases: PhaseDraft[];
  file_path_docx: string | null;
}

/** Ligne DB pedagogical_sheets filtrée sur kind='deroulement' */
export interface DeroulementSheetRow {
  id: string;
  formation_id: string;
  title: string;
  general_objective: string | null;
  sub_objectives: string | null;
  targeted_cps: string | null;
  phases: string;
  model_used: string | null;
  file_path_docx: string | null;
  file_path_pdf: string | null;
  linked_invoice_id: string | null;
  kind: string;
  ccp_id: string | null;
  centre_id: string | null;
  redacteur: string | null;
  dates_label: string | null;
  total_duration_hours: number | null;
  selected_exercise_ids: string | null;
  created_at: string;
  updated_at: string;
}
