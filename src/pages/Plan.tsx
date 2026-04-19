/** Plan overview — compressed table per day with sticky movement-name column.
 *  Last completed week is highlighted and shows actual best set. */
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { appConfig } from "@/config/app.config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ParsedPlan, LogDocument } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKS = Array.from({ length: 16 }, (_, i) => i + 1);

type LogRow = { week_number: number | null; day_key: string | null; data: LogDocument; status: string };

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
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [logsByDay, setLogsByDay] = useState<Map<string, LogRow[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: planRow }, { data: logsData }] = await Promise.all([
        supabase.from("plans").select("parsed").eq("owner_user_id", user.id).eq("is_active", true).maybeSingle(),
        supabase.from("workout_logs").select("week_number,day_key,data,status").eq("owner_user_id", user.id).eq("status", "done").order("log_date", { ascending: false }),
      ]);
      setPlan((planRow?.parsed as unknown as ParsedPlan) ?? null);
      const map = new Map<string, LogRow[]>();
      for (const l of (logsData ?? []) as LogRow[]) {
        const key = (l.day_key ?? "").split("—")[0].trim();
        if (!key) continue;
        const arr = map.get(key) ?? [];
        arr.push(l);
        map.set(key, arr);
      }
      setLogsByDay(map);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (<><TopBar title="Plan" /><main className="p-8 text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading…</main></>);
  }

  if (!plan) {
    return (
      <>
        <TopBar title="Plan" />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
          <EchoHeadline className="text-[2rem] sm:text-[2.5rem]">No plan</EchoHeadline>
          <p className="mt-3 text-sm text-muted-foreground">Upload a plan to see the overview.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Plan" />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">
        <EchoHeadline className="text-[2.25rem] sm:text-[3rem]">{plan.title}</EchoHeadline>
        {plan.goal && <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">{plan.goal}</p>}

        <Legend />

        <Accordion type="multiple" className="mt-6">
          {plan.days.map((day) => {
            const dayLogs = logsByDay.get(day.dayName) ?? [];
            const lastWeek = dayLogs[0]?.week_number ?? null;
            return (
              <AccordionItem key={day.dayName} value={day.dayName} className="border-b hairline">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-xl uppercase tracking-[-0.04em]">{day.dayName}</span>
                    <span className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">{day.type}</span>
                    {lastWeek && <span className="chip">Last: W{lastWeek}</span>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <DayTable day={day} lastWeek={lastWeek} dayLogs={dayLogs} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
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

function DayTable({ day, lastWeek, dayLogs }: { day: import("@/lib/types").PlanDay; lastWeek: number | null; dayLogs: LogRow[] }) {
  const lastLog = useMemo(() => lastWeek ? dayLogs.find((l) => l.week_number === lastWeek) : null, [lastWeek, dayLogs]);
  const markers = appConfig.blocks.sectionMarkers;

  return (
    <TooltipProvider delayDuration={200}>
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
            </tr>
          </thead>
          <tbody>
            {day.exercises.map((ex, idx) => {
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
                      <span className="font-display text-sm tracking-[-0.03em] truncate max-w-[160px]">{ex.variant ?? ex.name}</span>
                    </div>
                  </td>
                  {WEEKS.map((w) => {
                    const planned = ex.weeks[w];
                    const isLast = w === lastWeek;
                    const actual = isLast && lastLog ? bestActualForMovement(lastLog.data, ex.variant ?? ex.name) : null;
                    return (
                      <td key={w} className={cn("text-center font-mono text-[0.7rem]", isLast && "bg-foreground text-background")}>
                        {actual ? (
                          <span className="font-bold">{actual}</span>
                        ) : planned ? (
                          <span>{planned.raw}</span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}
