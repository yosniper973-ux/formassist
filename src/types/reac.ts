export interface CCP {
  id: string;
  formation_id: string;
  code: string;
  title: string;
  sort_order: number;
  created_at: string;
}

export interface Competence {
  id: string;
  ccp_id: string;
  code: string;
  title: string;
  description: string | null;
  sort_order: number;
  in_scope: boolean;
  assigned_to: string | null;
  created_at: string;
}

export interface EvaluationCriterion {
  id: string;
  competence_id: string;
  description: string;
  sort_order: number;
}

export interface ActivityType {
  id: string;
  formation_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export interface ExtraActivity {
  id: string;
  formation_id: string;
  name: string;
  description: string | null;
  billable: boolean;
  sort_order: number;
  created_at: string;
}

/** REAC tree structure for display */
export interface ReacTree {
  formation_id: string;
  ccps: Array<CCP & { competences: Array<Competence & { criteria: EvaluationCriterion[] }> }>;
  activity_types: ActivityType[];
  extra_activities: ExtraActivity[];
}
