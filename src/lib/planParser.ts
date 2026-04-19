/**
 * Strict-ish Markdown parser for the plan format used in current_plan.md.
 * Returns a ParsedPlan or throws if the layout cannot be recognized.
 *
 * Recognized structure:
 *   # <title>
 *   **Start:** <date>
 *   **End:** <date>
 *   **Goal:** ...
 *   ## Block Structure   (table)
 *   ## Weekly Template   (table)
 *   ## 16-Week Progression by Day
 *     ### <DAY> — <Type> (<...>)
 *     **Warm-up...:** ...
 *     **Substitutions:** ...
 *     | Block | Exercise | W1 | ... | W16 (D) |
 */

import { appConfig, type Metric } from "@/config/app.config";
import type { ParsedPlan, PlanDay, PlanExercise, PlannedSet } from "./types";

function parseRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isSeparator(line: string) {
  return /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line.trim());
}

function parseTable(lines: string[], startIdx: number): { headers: string[]; rows: string[][]; nextIdx: number } | null {
  let i = startIdx;
  while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
  if (i >= lines.length) return null;
  const headers = parseRow(lines[i]);
  if (i + 1 >= lines.length || !isSeparator(lines[i + 1])) return null;
  i += 2;
  const rows: string[][] = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    rows.push(parseRow(lines[i]));
    i++;
  }
  return { headers, rows, nextIdx: i };
}

const NOTATION_PATTERNS: { re: RegExp; tag: string }[] = [
  { re: /\(p\)/i, tag: "p" },
  { re: /\(t\)/i, tag: "t" },
  { re: /\+5%/, tag: "+5%" },
  { re: /\/side/i, tag: "/side" },
  { re: /→/, tag: "→" },
];

export function parsePlannedCell(raw: string): PlannedSet | null {
  const cell = raw.trim();
  if (!cell || cell.toLowerCase() === "skip" || cell === "—" || cell === "-") return null;

  const notations: string[] = [];
  for (const { re, tag } of NOTATION_PATTERNS) if (re.test(cell)) notations.push(tag);

  // RPE
  const rpeMatch = cell.match(/R(\d{1,2})/);
  const rpe = rpeMatch ? parseInt(rpeMatch[1], 10) : undefined;

  // Detect special unit: "x4 trips" → distance (meters), "3x20s" → seconds
  let unit: PlannedSet["unit"] = "reps";
  if (/trips?/i.test(cell)) unit = "distance";
  if (/\b\d+s\b/.test(cell) || /\b\d+\s*sec/.test(cell)) unit = "seconds";

  // sets/reps patterns
  // Examples: "4x5", "3x8/side", "x4 trips", "4xmax", "3x20s/side", "→Back Squat 3x4 R9", "→Wtd 3x5 R8"
  const setReps = cell.match(/(\d+)\s*x\s*(\d+|max)/i);
  let sets: number | undefined;
  let reps: number | "max" | undefined;
  if (setReps) {
    sets = parseInt(setReps[1], 10);
    reps = setReps[2].toLowerCase() === "max" ? "max" : parseInt(setReps[2], 10);
  } else {
    const onlyTrips = cell.match(/x\s*(\d+)\s*trips?/i);
    if (onlyTrips) {
      sets = 1;
      reps = parseInt(onlyTrips[1], 10);
      unit = "distance";
    }
  }

  return {
    raw: cell,
    sets,
    reps,
    perSide: /\/side/i.test(cell),
    rpe,
    notations,
    weightPctChange: /\+5%/.test(cell) ? 5 : undefined,
    unit,
  };
}

function inferMetrics(name: string, anyPlanned: PlannedSet | null, blockName: string): { metrics: Metric[]; primary: Metric } {
  const lower = name.toLowerCase();
  const planned = anyPlanned;
  const isTime = planned?.unit === "seconds" || /plank|hold|carry|carries|zone\s*2|battle ropes/i.test(lower);
  const isDistance = planned?.unit === "distance" || /sled|farmer/i.test(lower);
  const isBodyweight = /pull-?up|dip|push-?up|knee raise|dead bug|pallof|halos|swings?|cars/i.test(lower);

  const metrics = new Set<Metric>();
  if (isTime) metrics.add("time");
  if (isDistance) metrics.add("distance");
  if (!isTime && !isDistance) {
    if (planned?.reps !== undefined) metrics.add("reps");
    if (!isBodyweight) metrics.add("weight");
    if (planned?.rpe !== undefined) metrics.add("rpe");
  }
  // Default fallback: at least reps for accessories
  if (metrics.size === 0) metrics.add("reps");

  let primary: Metric = "reps";
  if (isTime) primary = "time";
  else if (isDistance) primary = "distance";
  else if (metrics.has("weight")) primary = "weight";
  else primary = "reps";

  return { metrics: Array.from(metrics), primary };
}

export function parsePlanMarkdown(md: string): ParsedPlan {
  const lines = md.split(/\r?\n/);

  const titleLine = lines.find((l) => /^#\s+/.test(l)) ?? "# Workout Plan";
  const title = titleLine.replace(/^#\s+/, "").trim();
  const startMatch = md.match(/\*\*Start:\*\*\s*(.+)/);
  const endMatch = md.match(/\*\*End:\*\*\s*(.+)/);
  const goalMatch = md.match(/\*\*Goal:\*\*\s*(.+)/);

  const plan: ParsedPlan = {
    title,
    startDate: startMatch?.[1]?.trim(),
    endDate: endMatch?.[1]?.trim(),
    goal: goalMatch?.[1]?.trim(),
    blocks: [],
    weeklyTemplate: [],
    days: [],
  };

  // Block Structure
  const blockHeaderIdx = lines.findIndex((l) => /^##\s+Block Structure/i.test(l));
  if (blockHeaderIdx !== -1) {
    const t = parseTable(lines, blockHeaderIdx + 1);
    if (t) {
      for (const r of t.rows) {
        const [name, weeks, _dates, _focus, mainRpe, accRpe] = r;
        const weekNums: number[] = [];
        const m = weeks.match(/W?(\d+)\s*-\s*W?(\d+)/i);
        if (m) for (let w = parseInt(m[1]); w <= parseInt(m[2]); w++) weekNums.push(w);
        plan.blocks.push({ name, weeks: weekNums, mainRpe, accessoryRpe: accRpe });
      }
    }
  }

  // Weekly Template
  const weeklyHeaderIdx = lines.findIndex((l) => /^##\s+Weekly Template/i.test(l));
  if (weeklyHeaderIdx !== -1) {
    const t = parseTable(lines, weeklyHeaderIdx + 1);
    if (t) {
      for (const r of t.rows) {
        const [day, type, focus, conditioning] = r;
        plan.weeklyTemplate.push({ day, type, focus, conditioning });
      }
    }
  }

  // Days
  const dayHeaderRe = /^###\s+([A-Z][A-Z]+)\s*[—\-]\s*(.+)$/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(dayHeaderRe);
    if (!m) continue;
    const dayName = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    const type = m[2].trim();
    let warmup: string | undefined;
    let substitutions: string | undefined;
    let j = i + 1;
    // Collect day metadata until next table
    while (j < lines.length && !lines[j].trim().startsWith("|") && !dayHeaderRe.test(lines[j]) && !/^##\s+/.test(lines[j])) {
      const wm = lines[j].match(/\*\*Warm-?up[^*]*:\*\*\s*(.+)/i);
      if (wm) warmup = wm[1].trim();
      const sm = lines[j].match(/\*\*Substitutions:\*\*\s*(.+)/i);
      if (sm) substitutions = sm[1].trim();
      j++;
    }
    const t = parseTable(lines, j);
    if (!t) continue;

    // Identify week columns from headers
    const weekColIdx: { week: number; idx: number; deload: boolean }[] = [];
    t.headers.forEach((h, idx) => {
      const wm = h.match(/W(\d+)/i);
      if (wm) weekColIdx.push({ week: parseInt(wm[1], 10), idx, deload: /\(D\)/.test(h) });
    });

    const exercises: PlanExercise[] = [];
    for (const row of t.rows) {
      const blockRaw = row[0]?.replace(/\*\*/g, "").trim();
      const exerciseName = row[1]?.trim();
      if (!exerciseName) continue;

      const weeks: Record<number, PlannedSet | null> = {};
      let firstPlanned: PlannedSet | null = null;
      let variant: string | null = null;
      for (const { week, idx } of weekColIdx) {
        const cell = row[idx] ?? "";
        const ps = parsePlannedCell(cell);
        // detect variant override ("→Back Squat 3x4 R9")
        const variantMatch = cell.match(/→\s*([A-Za-z][A-Za-z0-9 ./-]+?)\s+\d/);
        if (variantMatch && !variant) variant = variantMatch[1].trim();
        weeks[week] = ps;
        if (!firstPlanned && ps) firstPlanned = ps;
      }
      const { metrics, primary } = inferMetrics(exerciseName, firstPlanned, blockRaw ?? "");
      const blockKey = (appConfig.sectionAliases[blockRaw?.toLowerCase() ?? ""] ?? blockRaw ?? "Main");
      exercises.push({
        block: blockKey,
        name: exerciseName,
        weeks,
        metrics,
        primaryMetric: primary,
        variant,
      });
    }

    plan.days.push({ dayName, type, warmup, substitutions, exercises });
    i = t.nextIdx;
  }

  if (plan.days.length === 0) {
    throw new Error("Plan parser: no days detected. Markdown layout not recognized.");
  }
  return plan;
}
