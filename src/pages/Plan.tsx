/** Plan overview — compressed table per day with sticky movement-name column.
 *  Last completed week is highlighted and shows actual best set.
 *  Edit mode allows reordering days (drag-and-drop), inline cell editing,
 *  movement rename/remove, and adding movements via the LibraryPicker. */
import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { appConfig, type Metric } from "@/config/app.config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ParsedPlan, PlanExercise, PlanDay, LogDocument } from "@/lib/types";
import { parsePlannedCell } from "@/lib/planParser";
import { LibraryPicker } from "@/components/LibraryPicker";
import { WarmupStrip } from "@/components/plan/WarmupStrip";
import { cn } from "@/lib/utils";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActivePlan, useDoneLogsForPlan, type PlanLogRow as LogRow } from "@/hooks/queries";
import { weekForDate } from "@/lib/weekPicker";

const WEEKS = Array.from({ length: 16 }, (_, i) => i + 1);

function bestActualForMovement(logDoc: LogDocument, movementName: string): string | null {
  for (const s of logDoc.sections) {
    for (const g of s.groups) {
      for (const it of g.items) {
        if (it.name.toLowerCase() === movementName.toLowerCase()) {
          let best = "";
          for (const set of it.sets) {
            const w = set.actual.weight;
            const r = set.actual.reps;
            if (w != null && r != null) {
              const candidate = `${w}×${r}`;
              if (!best || (w as number) > Number(best.split("×")[0])) best = candidate;
            } else if (set.actual.time != null) {
              best = `${set.actual.time}s`;
            } else if (set.actual.distance != null) {
              best = `${set.actual.distance}m`;
            } else if (r != null) {
              best = `${r}`;
            }
          }
          if (best) return best;
        }
      }
    }
  }
  return null;
}

export default function Plan() {
  const { user } = useSession();
  const planQ = useActivePlan(user?.id);
  const logsQ = useDoneLogsForPlan(user?.id);
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [planDbId, setPlanDbId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [picker, setPicker] = useState<{ dayIdx: number } | null>(null);

  // Load-once hydration: only seed local plan state while we don't yet have a planDbId.
  // Prevents window-focus refetches from clobbering unsaved auto-save edits.
  useEffect(() => {
    if (planDbId) return;
    if (planQ.data) {
      setPlan(planQ.data.parsed);
      setPlanDbId(planQ.data.id);
    }
  }, [planQ.data, planDbId]);

  const logsByDay = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const l of logsQ.data ?? []) {
      const key = (l.day_key ?? "").split("—")[0].trim();
      if (!key) continue;
      const arr = map.get(key) ?? [];
      arr.push(l);
      map.set(key, arr);
    }
    return map;
  }, [logsQ.data]);

  const loading = planQ.isLoading || logsQ.isLoading;
  const loadError = planQ.isError || logsQ.isError;

  // Debounced auto-save in edit mode.
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!editMode) return;
    const i = window.setInterval(() => {
      if (dirtyRef.current && plan && planDbId) {
        dirtyRef.current = false;
        supabase.from("plans").update({ parsed: plan as never }).eq("id", planDbId).then(({ error }) => {
          if (error) toast.error("Plan save failed");
        });
      }
    }, 1500);
    return () => window.clearInterval(i);
  }, [editMode, plan, planDbId]);

  function mutatePlan(mut: (p: ParsedPlan) => void) {
    setPlan((prev) => {
      if (!prev) return prev;
      const next: ParsedPlan = JSON.parse(JSON.stringify(prev));
      mut(next);
      dirtyRef.current = true;
      return next;
    });
  }

  /** Swap session contents between two weekday slots (day-of-week label stays put). */
  function swapSessions(from: number, to: number) {
    if (from === to) return;
    mutatePlan((p) => {
      const a = p.days[from];
      const b = p.days[to];
      // Preserve dayName on each slot; swap everything else.
      const aDay = a.dayName;
      const bDay = b.dayName;
      p.days[from] = { ...b, dayName: aDay };
      p.days[to] = { ...a, dayName: bDay };
    });
  }

  function renameMovement(dayIdx: number, exIdx: number, name: string) {
    if (!name.trim()) return;
    mutatePlan((p) => { p.days[dayIdx].exercises[exIdx].name = name.trim(); });
  }

  function removeMovement(dayIdx: number, exIdx: number) {
    mutatePlan((p) => { p.days[dayIdx].exercises.splice(exIdx, 1); });
  }

  function editWeekCell(dayIdx: number, exIdx: number, week: number, raw: string) {
    mutatePlan((p) => {
      const ex = p.days[dayIdx].exercises[exIdx];
      const parsed = raw.trim() ? parsePlannedCell(raw) : null;
      ex.weeks[week] = parsed;
    });
  }

  function addMovement(dayIdx: number, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric }) {
    mutatePlan((p) => {
      p.days[dayIdx].exercises.push({
        block: "Main",
        name: mov.name,
        weeks: {},
        metrics: mov.metrics,
        primaryMetric: mov.primaryMetric,
        variant: null,
      });
    });
  }

  if (loading) {
    return (<><TopBar title="Plan" /><main className="p-8 text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading…</main></>);
  }

  if (loadError) {
    return (
      <>
        <TopBar title="Plan" />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 safe-bottom">
          <EchoHeadline className="text-[2rem] sm:text-[2.5rem]">Plan unavailable</EchoHeadline>
          <p className="mt-3 text-xs text-destructive">Failed to load your plan. Try again later.</p>
        </main>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <TopBar title="Plan" />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 safe-bottom">
          <EchoHeadline className="text-[2rem] sm:text-[2.5rem]">No plan</EchoHeadline>
          <p className="mt-3 text-sm text-muted-foreground">Upload a plan to see the overview.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Plan" />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 safe-bottom">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <EchoHeadline className="text-[2.25rem] sm:text-[3rem]">{plan.title}</EchoHeadline>
          <button
            onClick={() => setEditMode((e) => !e)}
            className={cn(
              "text-[0.65rem] uppercase tracking-[0.14em] px-3 py-1.5 border transition-colors duration-slow ease-swiss",
              editMode ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
            )}
          >
            {editMode ? "Done" : "Edit plan"}
          </button>
        </div>
        {plan.goal && <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">{plan.goal}</p>}

        <Legend />

        <Accordion type="multiple" className="mt-6">
          {plan.days.map((day, dayIdx) => {
            const dayLogs = logsByDay.get(day.dayName) ?? [];
            const latest = dayLogs[0];
            const planStart = planQ.data?.start_date ?? null;
            const lastWeek = latest && planStart
              ? weekForDate(planStart, latest.log_date)
              : (latest?.week_number ?? null);
            return (
              <DayAccordion
                key={day.dayName + dayIdx}
                day={day}
                dayIdx={dayIdx}
                lastWeek={lastWeek}
                dayLogs={dayLogs}
                editMode={editMode}
                onReorder={swapSessions}
                onRename={renameMovement}
                onRemove={removeMovement}
                onEditCell={editWeekCell}
                onAddMovement={() => setPicker({ dayIdx })}
              />
            );
          })}
        </Accordion>

        {picker && (
          <LibraryPicker
            ownerId={user?.id}
            onClose={() => setPicker(null)}
            onPick={(mov) => {
              addMovement(picker.dayIdx, mov);
              setPicker(null);
            }}
          />
        )}
      </main>
    </>
  );
}

function Legend() {
  const markers = appConfig.blocks.sectionMarkers;
  return (
    <div className="mt-5 flex flex-wrap gap-3 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
      {Object.entries(markers).map(([name, m]) => (
        <span key={name} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-block h-3 w-1", m.className)} />
          {name}
        </span>
      ))}
    </div>
  );
}

function DayAccordion(props: {
  day: PlanDay;
  dayIdx: number;
  lastWeek: number | null;
  dayLogs: LogRow[];
  editMode: boolean;
  onReorder: (from: number, to: number) => void;
  onRename: (dayIdx: number, exIdx: number, name: string) => void;
  onRemove: (dayIdx: number, exIdx: number) => void;
  onEditCell: (dayIdx: number, exIdx: number, week: number, raw: string) => void;
  onAddMovement: () => void;
}) {
  const { day, dayIdx, editMode } = props;
  const [dragOver, setDragOver] = useState(false);
  return (
    <AccordionItem
      value={day.dayName + dayIdx}
      className={cn("border-b hairline transition-colors", dragOver && "bg-secondary")}
      draggable={editMode}
      onDragStart={(e) => {
        if (!editMode) return;
        e.dataTransfer.setData("text/plain", String(dayIdx));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!editMode) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!editMode) return;
        e.preventDefault();
        setDragOver(false);
        const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!Number.isNaN(from)) props.onReorder(from, dayIdx);
      }}
    >
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex items-start justify-between gap-3 w-full">
          <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
            {editMode && <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />}
            <span className="font-display text-sm uppercase tracking-[-0.04em]">{day.type}</span>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">{day.dayName}</span>
            {props.lastWeek && <span className="chip">Last: W{props.lastWeek}</span>}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <DayTable {...props} />
        {editMode && (
          <button
            onClick={props.onAddMovement}
            className="mt-2 w-full border border-dashed hairline py-2 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="inline h-3 w-3 mr-1" /> Add movement
          </button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function DayTable(props: {
  day: PlanDay;
  dayIdx: number;
  lastWeek: number | null;
  dayLogs: LogRow[];
  editMode: boolean;
  onRename: (dayIdx: number, exIdx: number, name: string) => void;
  onRemove: (dayIdx: number, exIdx: number) => void;
  onEditCell: (dayIdx: number, exIdx: number, week: number, raw: string) => void;
}) {
  const { day, dayIdx, lastWeek, dayLogs, editMode } = props;
  const lastLog = useMemo(() => lastWeek ? dayLogs.find((l) => l.week_number === lastWeek) : null, [lastWeek, dayLogs]);
  const markers = appConfig.blocks.sectionMarkers;

  // Partition exercises: warm-ups go to compressed strip, the rest into the main table.
  const { warmupExercises, mainExercises } = useMemo(() => {
    const wu: { idx: number; ex: PlanExercise }[] = [];
    const main: { idx: number; ex: PlanExercise }[] = [];
    day.exercises.forEach((ex, idx) => {
      const sectionKey = (appConfig.sectionAliases[ex.block.toLowerCase()] ?? ex.block) as string;
      if (sectionKey === "Warm-up") wu.push({ idx, ex });
      else main.push({ idx, ex });
    });
    return { warmupExercises: wu, mainExercises: main };
  }, [day.exercises]);

  return (
    <TooltipProvider delayDuration={200}>
      <WarmupStrip exercises={warmupExercises} freeText={day.warmup} />
      <div className="relative overflow-x-auto edge-fade-x border hairline">
        <table className="ll-table text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background min-w-[180px] border-r hairline">Movement</th>
              {WEEKS.map((w) => {
                const isDeload = (appConfig.blocks.deloadWeeks as readonly number[]).includes(w);
                const isLast = w === lastWeek;
                return (
                  <th key={w} className={cn("text-center min-w-[68px]", isLast && "bg-foreground text-background", isDeload && !isLast && "text-muted-foreground")}>
                    W{w}{isDeload ? "·D" : ""}
                  </th>
                );
              })}
              {editMode && <th className="w-10 sticky right-0 bg-background border-l hairline"></th>}
            </tr>
          </thead>
          <tbody>
            {mainExercises.map(({ idx, ex }) => {
              const sectionKey = (appConfig.sectionAliases[ex.block.toLowerCase()] ?? ex.block) as string;
              const marker = markers[sectionKey] ?? markers["Main"];
              return (
                <tr key={idx}>
                  <td className="sticky left-0 z-10 bg-background border-r hairline">
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("inline-block h-5 w-1 shrink-0", marker.className)} aria-label={sectionKey} />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-[0.6rem] uppercase tracking-[0.12em]">{sectionKey}</TooltipContent>
                      </Tooltip>
                      {editMode ? (
                        <EditableText
                          value={ex.variant ?? ex.name}
                          onSave={(v) => props.onRename(dayIdx, idx, v)}
                          className="font-display text-sm tracking-[-0.03em] truncate max-w-[160px]"
                        />
                      ) : (
                        <span className="font-display text-sm tracking-[-0.03em] truncate max-w-[160px]">{ex.variant ?? ex.name}</span>
                      )}
                    </div>
                  </td>
                  {WEEKS.map((w) => {
                    const planned = ex.weeks[w];
                    const isLast = w === lastWeek;
                    const actual = isLast && lastLog ? bestActualForMovement(lastLog.data, ex.variant ?? ex.name) : null;
                    return (
                      <td key={w} className={cn("text-center font-mono text-[0.7rem] p-0", isLast && !editMode && "bg-foreground text-background")}>
                        {editMode ? (
                          <EditableCell
                            value={planned?.raw ?? ""}
                            onSave={(v) => props.onEditCell(dayIdx, idx, w, v)}
                          />
                        ) : actual ? (
                          <span className="font-bold inline-block py-1.5">{actual}</span>
                        ) : planned ? (
                          <span className="inline-block py-1.5">{planned.raw}</span>
                        ) : (
                          <span className="text-muted-foreground inline-block py-1.5">·</span>
                        )}
                      </td>
                    );
                  })}
                  {editMode && (
                    <td className="sticky right-0 bg-background border-l hairline text-center">
                      <button onClick={() => props.onRemove(dayIdx, idx)} className="p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

function EditableText({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn("text-left inline-flex items-center gap-1 group", className)}
      >
        <span className="truncate">{value || <span className="text-muted-foreground italic">untitled</span>}</span>
        <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-muted-foreground" />
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { onSave(v); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setV(value); setEditing(false); }
      }}
      className={cn("bg-transparent border-b border-foreground focus:outline-none w-full", className)}
    />
  );
}

function EditableCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full py-1.5 text-center hover:bg-secondary transition-colors text-[0.7rem] font-mono"
      >
        {value || <span className="text-muted-foreground">·</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { onSave(v); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setV(value); setEditing(false); }
      }}
      className="w-full py-1.5 text-center bg-transparent border-b border-foreground focus:outline-none font-mono text-[0.7rem]"
    />
  );
}
