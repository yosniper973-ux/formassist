export interface Correction {
  id: string;
  learner_id: string;
  content_id: string | null;
  submission_file: string | null;
  submission_text: string | null;
  ocr_used: boolean;
  grade: number | null;
  max_grade: number;
  feedback_markdown: string | null;
  criteria_grid: CriteriaGrid | null;
  model_used: string | null;
  validated: boolean;
  sent_at: string | null;
  corrected_file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriterionEvaluation {
  criterion: string;
  max_points: number;
  awarded_points: number;
  comment: string;
}

export interface CriteriaGrid {
  criteria: CriterionEvaluation[];
  general_comment: string;
}
