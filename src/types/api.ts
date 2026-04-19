export type ModelTier = "opus" | "sonnet" | "haiku";

export type TaskType =
  | "generation_cours"
  | "generation_exercice"
  | "generation_jeu"
  | "generation_mise_en_situation"
  | "generation_fiche_pedagogique"
  | "analyse_style"
  | "affinage_style"
  | "parsing_reac"
  | "parsing_planning"
  | "parsing_repartition"
  | "correction"
  | "recommandations"
  | "mail_redaction"
  | "qcm_simple"
  | "reformulation"
  | "correction_dossier";

export interface ClaudeTextBlock {
  type: "text";
  text: string;
}

export interface ClaudeDocumentBlock {
  type: "document";
  source: {
    type: "base64";
    media_type: "application/pdf";
    data: string;
  };
}

export interface ClaudeImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
}

export type ClaudeContentBlock = ClaudeTextBlock | ClaudeDocumentBlock | ClaudeImageBlock;

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeRequest {
  task: TaskType;
  messages: ClaudeMessage[];
  systemPromptOverride?: string;
  systemPromptAppend?: string;
  modelOverride?: ModelTier;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  context?: {
    formationId?: string;
    styleProfile?: string;
    learnerLevel?: string;
    groupSize?: number;
    language?: string;
  };
}

export interface ClaudeResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEuros: number;
}

export interface CostEstimate {
  needsConfirmation: boolean;
  estimatedCost: number;
  model: string;
  modelDisplayName: string;
  alternativeModel?: string;
  alternativeModelName?: string;
  alternativeCost?: number;
}

export interface ApiUsageEntry {
  id: string;
  model: string;
  task_type: TaskType;
  input_tokens: number;
  output_tokens: number;
  cost_euros: number;
  related_entity: string | null;
  related_type: string | null;
  created_at: string;
}

export interface MonthlyUsage {
  total_cost: number;
  by_model: Record<string, { cost: number; calls: number; tokens: number }>;
  budget_limit: number;
  budget_percent: number;
}
