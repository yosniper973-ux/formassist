export interface Group {
  id: string;
  formation_id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Learner {
  id: string;
  group_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  initial_level: string | null;
  specific_needs: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LearnerCreate = Omit<Learner, "id" | "created_at" | "updated_at" | "archived_at">;

export type ProgressStatus = "not_acquired" | "in_progress" | "acquired" | "validated";

export interface LearnerProgress {
  id: string;
  learner_id: string;
  competence_id: string;
  status: ProgressStatus;
  notes: string | null;
  updated_at: string;
}
