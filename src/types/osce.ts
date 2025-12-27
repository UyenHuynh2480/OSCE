
export type UUID = string;

export type ItemLevelKey = "Fail" | "Pass" | "Good" | "Excellent";

export type FixedRubricItem = {
  id: string;
  text: string;
  levels: Record<ItemLevelKey, { score: number; desc: string }>;
};

export type Level = { id: UUID; name: string };
export type Cohort = { id: UUID; year: number; level_id: UUID };
export type Station = { id: UUID; name: string };
export type ExamRoundView = {
  id: UUID;
  display_name: string;
  cohort_id: UUID;
  round_number: number;
  date: string | null;
  groups: string[] | null;
};
