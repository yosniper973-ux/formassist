export type ContentType =
  | "course"
  | "exercise_individual"
  | "exercise_small_group"
  | "exercise_collective"
  | "pedagogical_game"
  | "role_play"
  | "trainer_sheet";

export type BloomLevel =
  | "remember"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate"
  | "create";

export interface GeneratedContent {
  id: string;
  slot_id: string | null;
  formation_id: string;
  content_type: ContentType;
  title: string;
  content_markdown: string;
  content_html: string | null;
  model_used: string;
  generation_cost: number | null;
  // CSV de BloomLevel (ex: "apply,analyze") — un seul niveau historiquement, plusieurs depuis v0.2.27.
  bloom_level: string | null;
  estimated_duration: number | null;
  version: number;
  parent_id: string | null;
  file_path: string | null;
  source: "ia" | "import";
  original_filename: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationRequest {
  content_type: ContentType;
  formation_id: string;
  slot_id?: string;
  competence_ids: string[];
  bloom_level?: BloomLevel;
  duration_minutes?: number;
  group_size?: number;
  additional_instructions?: string;
  model_override?: "opus" | "sonnet" | "haiku";
}

export interface GenerationPreferences {
  exercise_individual: number;   // 0-3
  exercise_small_group: number;
  exercise_collective: number;
  pedagogical_game: number;
  role_play: number;
  qcm: number;
  open_questions: number;
  case_study: number;
}
