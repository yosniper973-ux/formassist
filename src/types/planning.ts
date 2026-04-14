export type PlanningType = "imposed" | "free" | "hybrid";
export type Modality = "presential" | "remote" | "hybrid";

export interface Slot {
  id: string;
  formation_id: string;
  group_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  duration_hours: number;
  planning_type: PlanningType;
  title: string | null;
  description: string | null;
  modality: Modality;
  is_co_animated: boolean;
  co_animator_name: string | null;
  extra_activity_id: string | null;
  imported_color: string | null;
  created_at: string;
  updated_at: string;
}

export type SlotCreate = Omit<Slot, "id" | "created_at" | "updated_at">;

export interface SlotWithCompetences extends Slot {
  competence_ids: string[];
}

export interface CalendarEvent extends Slot {
  centre_id: string;
  centre_name: string;
  centre_color: string;
  formation_title: string;
  formation_code: string | null;
  competence_ids: string[];
  is_extra_activity: boolean;
}

export interface SlotConflict {
  slot_a: Slot;
  slot_b: Slot;
  overlap_minutes: number;
}
