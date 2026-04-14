export interface StyleProfile {
  id: string;
  self_description: string | null;
  analyzed_profile: string | null;
  confirmed: boolean;
  sample_files: string[] | null;
  updated_at: string;
}

export interface StyleDiff {
  id: string;
  content_id: string;
  original_snippet: string;
  modified_snippet: string;
  processed: boolean;
  created_at: string;
}
