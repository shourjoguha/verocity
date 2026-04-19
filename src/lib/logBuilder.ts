/** Build a fresh log document for a given day from a parsed plan and a week number. */
import { appConfig, type Metric, type SwappableMetric } from "@/config/app.config";
import type { LogDocument, LogGroup, LogItem, LogSection, LogSet } from "./types";
import type { ParsedPlan, PlanDay, PlannedSet } from "./types";

let gid = 0;
const newId = () => `g_${Date.now().toString(36)}_${(gid++).toString(36)}`;

function plannedToLogSets(planned: PlannedSet | null, defaultRest: number): LogSet[] {
  if (!planned) return [{ planned: null, actual: {}, notations: [], restAfterSeconds: defaultRest }];
  const count = planned.sets ?? 1;
  const out: LogSet[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      planned,
      actual: {},
      notations: planned.notations,
      restAfterSeconds: defaultRest,
    });
  }
  return out;
}

/** Pick the swappable metric implied by a planned cell's unit. */
function swappableFromPlanned(planned: PlannedSet | null): SwappableMetric {
  if (!planned) return "reps";
  if (planned.unit === "seconds") return "time";
  if (planned.unit === "distance") return "distance";
  return "reps";
}

/** Enforce: weight is always present; only one of swappable metrics is present. */
export function normalizeMetrics(metrics: Metric[], primary: Metric, planned?: PlannedSet | null): { metrics: Metric[]; primary: Metric } {
  const set = new Set<Metric>(metrics);
  // Always include weight.
  set.add("weight");
  // Decide which swappable to keep.
  const swappable = appConfig.metrics.swappable as readonly SwappableMetric[];
  const present = swappable.filter((m) => set.has(m));
  let keep: SwappableMetric;
  if (present.length === 1) keep = present[0];
  else if (present.length > 1) keep = present.includes(primary as SwappableMetric) ? (primary as SwappableMetric) : present[0];
  else keep = swappableFromPlanned(planned ?? null);
  for (const m of swappable) set.delete(m);
  set.add(keep);
  return { metrics: Array.from(set), primary };
}

export function buildLogDocument(plan: ParsedPlan, day: PlanDay, weekNumber: number): LogDocument {
  const sectionsMap = new Map<string, LogSection>();
  for (const sectionName of appConfig.blocks.sections) {
    sectionsMap.set(sectionName, { id: newId(), name: sectionName, groups: [] });
  }

  for (const ex of day.exercises) {
    const sectionKey = (appConfig.sectionAliases[ex.block.toLowerCase()] ?? ex.block) as string;
    if (!sectionsMap.has(sectionKey)) {
      sectionsMap.set(sectionKey, { id: newId(), name: sectionKey, groups: [] });
    }
    const planned = ex.weeks[weekNumber] ?? null;
    const { metrics, primary } = normalizeMetrics(ex.metrics, ex.primaryMetric, planned);
    const item: LogItem = {
      name: ex.variant ?? ex.name,
      metrics,
      primaryMetric: primary,
      notations: planned?.notations ?? [],
      sets: plannedToLogSets(planned, appConfig.timer.defaults.betweenSetsSeconds),
      restBetweenSetsSeconds: appConfig.timer.defaults.betweenSetsSeconds,
    };
    const group: LogGroup = {
      id: newId(),
      kind: "single",
      items: [item],
      restAfterRoundSeconds: appConfig.timer.defaults.betweenSetsSeconds,
    };
    sectionsMap.get(sectionKey)!.groups.push(group);
  }

  return { sections: Array.from(sectionsMap.values()).filter((s) => s.groups.length > 0) };
}

/** Build a blank log document for custom workouts. */
export function buildBlankDocument(initialSection = "Main"): LogDocument {
  return { sections: [{ id: newId(), name: initialSection, groups: [] }] };
}

/** Run on load: ensure existing logs comply with current metric rules. */
export function migrateDocument(doc: LogDocument): LogDocument {
  for (const s of doc.sections) {
    for (const g of s.groups) {
      for (const it of g.items) {
        const { metrics, primary } = normalizeMetrics(it.metrics, it.primaryMetric, it.sets[0]?.planned ?? null);
        it.metrics = metrics;
        it.primaryMetric = primary;
      }
    }
  }
  return doc;
}

export function makeId() { return newId(); }
