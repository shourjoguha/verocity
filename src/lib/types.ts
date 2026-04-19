/** Domain types used across the app. */
import type { Metric, SectionName } from "@/config/app.config";

export type Notation = "p" | "t" | "+5%" | "/side" | "→" | string;

export interface PlannedSet {
  /** Sets x reps notation, e.g. "4x5", "3x8/side", "x4 trips", "3x20s" */
  raw: string;
  sets?: number;
  reps?: number | "max";
  perSide?: boolean;
  rpe?: number;
  notations: Notation[];
  weightPctChange?: number; // +5%
  /** primary value type that "reps" actually represents (reps | distance-meters | seconds) */
  unit?: "reps" | "distance" | "seconds";
}

export interface PlanExercise {
  block: SectionName | string;
  name: string;
  /** Per-week planned sets */
  weeks: Record<number, PlannedSet | null>;
  /** Inferred metrics for this movement */
  metrics: Metric[];
  primaryMetric: Metric;
  /** Optional override movement (e.g. "→Back Squat") */
  variant?: string | null;
}

export interface PlanDay {
  dayName: string; // Sunday, Monday, ...
  type: string;   // Lower A, Upper A, Recovery, etc
  warmup?: string;
  substitutions?: string;
  exercises: PlanExercise[];
}

export interface ParsedPlan {
  title: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
  blocks: { name: string; weeks: number[]; mainRpe?: string; accessoryRpe?: string }[];
  weeklyTemplate: { day: string; type: string; focus: string; conditioning: string }[];
  days: PlanDay[];
}

/** Workout log document (stored in workout_logs.data) */
export interface LogSetActual {
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  distance?: number | null;
  time?: number | null;
  completed?: boolean;
}
export interface LogSet {
  planned?: PlannedSet | null;
  actual: LogSetActual;
  notations: Notation[];
  restAfterSeconds?: number;
}
export interface LogItem {
  movementId?: string;
  name: string;
  metrics: Metric[];
  primaryMetric: Metric;
  notes?: string;
  notations: Notation[];
  sets: LogSet[];
  /** rest seconds between sets default for this movement */
  restBetweenSetsSeconds: number;
}
export interface LogGroup {
  id: string;
  kind: "single" | "superset" | "circuit";
  /** rest after each round/set of the group */
  restAfterRoundSeconds?: number;
  /** rest between movements within the group (for supersets/circuits) */
  restWithinSeconds?: number;
  items: LogItem[];
}
export interface LogSection {
  id: string;
  /** Free-form for custom workouts; one of appConfig.blocks.sections for plan-driven. */
  name: SectionName | string;
  groups: LogGroup[];
}
export interface LogDocument {
  sections: LogSection[];
}
