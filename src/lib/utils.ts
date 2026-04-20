import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extract the workout type from a `day_key` like "Sunday — Lower A (Squat-Dominant)".
 *  Mirrors the split logic used by the "Pick a day" rail (Home.tsx / Plan.tsx). */
export function sessionTypeFromDayKey(dayKey: string | null | undefined): string {
  if (!dayKey) return "Session";
  const parts = dayKey.split("—");
  return (parts[1] ?? parts[0]).trim() || "Session";
}
