/** Build a fresh log document for a given day from a parsed plan and a week number. */
import { appConfig } from "@/config/app.config";
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
    const item: LogItem = {
      name: ex.variant ?? ex.name,
      metrics: ex.metrics,
      primaryMetric: ex.primaryMetric,
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

export function makeId() { return newId(); }
