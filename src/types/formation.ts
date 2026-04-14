export interface Formation {
  id: string;
  centre_id: string;
  title: string;
  rncp_code: string | null;
  start_date: string | null;
  end_date: string | null;
  language: string;
  reac_file_path: string | null;
  reac_parsed: boolean;
  scope_mode: "all" | "partial" | "imported";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type FormationCreate = Omit<Formation, "id" | "created_at" | "updated_at" | "archived_at" | "reac_parsed">;
export type FormationUpdate = Partial<FormationCreate> & { id: string };
