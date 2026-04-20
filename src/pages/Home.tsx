/** Home — horizontal day rail, recent logs, quick actions. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import { appConfig } from "@/config/app.config";
import type { ParsedPlan, PlanDay } from "@/lib/types";

type LogRow = { id: string; log_date: string; day_key: string | null; status: string; total_seconds: number | null; tags: string[] | null; activity_type: string | null };
type PlanRow = { id: string; name: string; parsed: ParsedPlan; start_date: string | null; end_date: string | null; is_active: boolean };

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isoWeekIndexFromStart(startDateIso: string | null): number {
  if (!startDateIso) return 1;
  const start = new Date(startDateIso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1));
}

function daysAgo(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function colorForLog(l: LogRow): string {
  const tags = l.tags ?? [];
  const dominant = tags[0] ?? l.activity_type ?? "strength";
  return appConfig.activity.tagColors[dominant] ?? appConfig.activity.fallbackColor;
}

export default function Home() {
  const nav = useNavigate();
  const { user } = useSession();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [allLogs, setAllLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchAll() {
      const [{ data: planData }, { data: recentData }, { data: allLogsData }] = await Promise.all([
        supabase.from("plans").select("id,name,parsed,start_date,end_date,is_active").eq("owner_user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("workout_logs").select("id,log_date,day_key,status,total_seconds,tags,activity_type").eq("owner_user_id", user.id).in("status", ["done", "in_progress"]).order("log_date", { ascending: false }).limit(5),
        supabase.from("workout_logs").select("id,log_date,day_key,status,total_seconds,tags,activity_type").eq("owner_user_id", user.id).neq("status", "cancelled").order("log_date", { ascending: false }),
      ]);
      if (cancelled) return;
      setPlan((planData as unknown as PlanRow) ?? null);
      setLogs((recentData as LogRow[]) ?? []);
      setAllLogs((allLogsData as LogRow[]) ?? []);
      setActiveDay((cur) => cur ?? DAY_NAMES[new Date().getDay()]);
      setLoading(false);
    }

    fetchAll();

    // Refetch on tab focus (returning from Logger after save)
    function onVisible() {
      if (document.visibilityState === "visible") fetchAll();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fetchAll);

    // Realtime: refetch when this user's workout_logs change
    const channel = supabase
      .channel(`home-logs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workout_logs", filter: `owner_user_id=eq.${user.id}` },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fetchAll);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const today = new Date();
  const todayDayName = DAY_NAMES[today.getDay()];
  const week = isoWeekIndexFromStart(plan?.start_date ?? plan?.parsed?.startDate ?? null);

  const lastByDay = useMemo(() => {
    const map = new Map<string, LogRow>();
    for (const l of logs) {
      const dn = (l.day_key ?? "").split("—")[0].trim();
      if (dn && !map.has(dn)) map.set(dn, l);
    }
    return map;
  }, [logs]);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <EchoHeadline className="text-[2.5rem] sm:text-[3.5rem]">Today</EchoHeadline>
        <div className="mt-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {today.toDateString()} · Week {week}
        </div>

        {loading ? (
          <div className="mt-8 text-xs text-muted-foreground">Loading…</div>
        ) : !plan ? (
          <section className="mt-10 border hairline p-6">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">No active plan</div>
            <h2 className="mt-2 font-display text-3xl tracking-[-0.04em]">Upload your plan</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Drop in a markdown file and LIFTLOG will build daily logger sessions for you.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={() => nav("/plan/upload")} className="ll-btn">Upload plan</button>
              <button onClick={() => nav("/log/new?mode=custom")} className="ll-btn">Blank workout</button>
              <button onClick={() => nav("/log/activity")} className="ll-btn">Log activity</button>
            </div>
          </section>
        ) : (
          <section className="mt-8">
            <ProgressTimeline plan={plan} logs={allLogs} />
            <div className="flex items-baseline justify-between mb-3 mt-6">
              <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">Pick a day</div>
              <button onClick={() => nav("/plan")} className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss">Plan overview →</button>
            </div>
            <DayRail
              days={plan.parsed.days}
              activeDay={activeDay}
              setActiveDay={setActiveDay}
              todayDayName={todayDayName}
              lastByDay={lastByDay}
              onStart={(d) => nav(`/log/new?day=${encodeURIComponent(d.dayName)}&week=${week}`)}
            />
          </section>
        )}

        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-xl uppercase tracking-[-0.04em]">Recent</h3>
            <button onClick={() => nav("/calendar")} className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss">All</button>
          </div>
          <ul className="mt-3 border-y hairline divide-y hairline">
            {logs.length === 0 && <li className="py-4 text-xs text-muted-foreground uppercase tracking-[0.12em]">No sessions yet</li>}
            {logs.map((l) => {
              const color = colorForLog(l);
              return (
                <li key={l.id}>
                  <button
                    onClick={() => nav(`/log/${l.id}`)}
                    className="w-full flex items-stretch gap-3 hover:bg-secondary transition-colors duration-slow ease-swiss text-left"
                  >
                    <span className="w-[3px] shrink-0" style={{ backgroundColor: color }} aria-hidden />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-3 py-3 pr-1">
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base tracking-[-0.03em] truncate">{l.day_key ?? "Session"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{daysAgo(l.log_date)}</div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{l.total_seconds ? fmtLong(l.total_seconds) : "—"}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button onClick={() => nav("/log/new?mode=custom")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">New</div>
            <div className="font-display text-lg mt-1">Blank workout</div>
          </button>
          <button onClick={() => nav("/log/activity")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">New</div>
            <div className="font-display text-lg mt-1">Activity</div>
          </button>
          <button onClick={() => nav("/plan")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">View</div>
            <div className="font-display text-lg mt-1">Plan</div>
          </button>
          <button onClick={() => nav("/calendar")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">View</div>
            <div className="font-display text-lg mt-1">Calendar</div>
          </button>
          <button onClick={() => nav("/library")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Library</div>
            <div className="font-display text-lg mt-1">Movements</div>
          </button>
          <button onClick={() => nav("/stats")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Insight</div>
            <div className="font-display text-lg mt-1">Stats</div>
          </button>
          <button onClick={() => nav("/plan/upload")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Plan</div>
            <div className="font-display text-lg mt-1">Upload</div>
          </button>
        </section>
      </main>
    </>
  );
}

type TimelinePoint = {
  date: string;
  state: "done" | "planned" | "blank";
  color: string;
  isToday: boolean;
  label: string;
};

function abbrev(s: string): string {
  // Strip vowels (lowercase only), keep caps + digits + first char, truncate to 5.
  if (!s) return "";
  const first = s[0];
  const rest = s.slice(1).replace(/[aeiou\s\-_]/g, "");
  return (first + rest).slice(0, 5);
}

function buildTimeline(plan: PlanRow, logs: LogRow[]): TimelinePoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);

  // Index completed/in-progress logs by date (most recent wins for that date).
  const logByDate = new Map<string, LogRow>();
  const doneDates: string[] = [];
  for (const l of logs) {
    if (l.status === "done" || l.status === "in_progress") {
      if (!logByDate.has(l.log_date)) {
        logByDate.set(l.log_date, l);
        doneDates.push(l.log_date);
      }
    }
  }
  // logs are ordered desc by log_date already
  // Window start: 30th most-recent done log date, fallback today-30d
  let start: Date;
  if (doneDates.length > 0) {
    const anchor = doneDates[Math.min(doneDates.length - 1, 29)];
    start = new Date(anchor + "T00:00:00");
  } else {
    start = new Date(today.getTime() - 30 * 86_400_000);
  }
  // Window end: plan.end_date if set, else today + 30d
  const end = plan.end_date
    ? new Date(plan.end_date + "T00:00:00")
    : new Date(today.getTime() + 30 * 86_400_000);

  // Index plan days by day name
  const planByDayName = new Map<string, PlanDay>();
  for (const d of plan.parsed.days) planByDayName.set(d.dayName, d);

  const points: TimelinePoint[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const dateStr = ymd(cursor);
    const dayName = DAY_NAMES[cursor.getDay()];
    const planDay = planByDayName.get(dayName);
    const log = logByDate.get(dateStr);
    const isToday = dateStr === todayStr;

    let state: TimelinePoint["state"];
    let color: string;
    let label: string;

    if (log) {
      state = "done";
      color = colorForLog(log);
      const dn = (log.day_key ?? "").split("—")[1]?.trim() ?? log.day_key ?? "Done";
      label = abbrev(dn) || "Done";
    } else if (planDay && cursor.getTime() >= today.getTime()) {
      const tag = appConfig.activity.dayTypeTag(planDay.type);
      color = appConfig.activity.tagColors[tag] ?? appConfig.activity.fallbackColor;
      label = abbrev(planDay.type) || planDay.type.slice(0, 5);
      state = "planned";
    } else {
      state = "blank";
      color = appConfig.activity.fallbackColor;
      label = "Rest";
    }

    points.push({ date: dateStr, state, color, isToday, label });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

function ProgressTimeline({ plan, logs }: { plan: PlanRow; logs: LogRow[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const points = useMemo(() => buildTimeline(plan, logs), [plan, logs]);
  const todayIndex = points.findIndex((p) => p.isToday);
  // Anchor scroll to most-recent done log if any, else today
  const anchorIndex = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].state === "done") return i;
    }
    return todayIndex;
  }, [points, todayIndex]);
  const [peekIndex, setPeekIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || anchorIndex < 0) return;
    // Each bar is 6px wide + 2px gap = 8px. Right-align with ~20% padding so upcoming peeks in.
    const bw = 8;
    const target = anchorIndex * bw - el.clientWidth * 0.8;
    el.scrollTo({ left: Math.max(0, target), behavior: "auto" });
  }, [anchorIndex]);

  // Outside-click dismiss for the peek popover
  useEffect(() => {
    if (peekIndex === null) return;
    function onPointerDown(e: PointerEvent) {
      const root = containerRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setPeekIndex(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [peekIndex]);

  const peek = peekIndex !== null ? points[peekIndex] : null;

  return (
    <div ref={containerRef} className="border-b hairline pb-3 relative">
      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground mb-2">Plan progress</div>
      <div ref={scrollRef} className="-mx-4 px-4 overflow-x-auto edge-fade-x relative">
        <div className="flex items-center gap-0.5 min-h-[28px] relative">
          {points.map((p, i) => {
            const base = "w-1.5 h-6 shrink-0 cursor-pointer relative";
            const style: React.CSSProperties = {};
            let cls = base;
            if (p.state === "done") {
              style.backgroundColor = p.color;
            } else if (p.state === "planned") {
              style.borderColor = p.color;
              style.borderWidth = "1px";
              style.borderStyle = "solid";
              style.backgroundColor = "transparent";
            } else {
              // blank (rest / off-plan / past unplanned)
              style.backgroundColor = "hsl(var(--muted))";
              style.opacity = 0.4;
            }
            if (p.isToday) {
              cls = cn(cls, "outline outline-1 outline-foreground outline-offset-1");
            }
            const isPeek = peekIndex === i;
            return (
              <button
                key={p.date + i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setPeekIndex((cur) => (cur === i ? null : i)); }}
                className={cls}
                style={style}
                aria-label={`${p.date} ${p.label}`}
              >
                {isPeek && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-20 px-2 py-1 bg-foreground text-background text-[0.6rem] uppercase tracking-[0.12em] font-mono whitespace-nowrap pointer-events-none flex flex-col items-center gap-0.5">
                    <span>{p.label}</span>
                    <span className="text-background/60 normal-case tracking-normal text-[0.55rem]">{p.date}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayRail(props: {
  days: PlanDay[];
  activeDay: string | null;
  setActiveDay: (d: string) => void;
  todayDayName: string;
  lastByDay: Map<string, LogRow>;
  onStart: (d: PlanDay) => void;
}) {
  const { days, activeDay, setActiveDay, todayDayName, lastByDay, onStart } = props;
  const active = days.find((d) => d.dayName === activeDay) ?? null;
  return (
    <div>
      <div className="-mx-4 px-4 overflow-x-auto edge-fade-x snap-x snap-mandatory">
        <div className="flex gap-2 pb-2">
          {days.map((d) => {
            const isActive = d.dayName === activeDay;
            const isToday = d.dayName === todayDayName;
            return (
              <button
                key={d.dayName}
                onClick={() => setActiveDay(d.dayName)}
                className={cn(
                  "snap-start shrink-0 min-w-[140px] border p-3 text-left transition-colors duration-slow ease-swiss",
                  isActive ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
                )}
              >
                <div className="font-display text-base tracking-[-0.04em] truncate">{d.type}</div>
                <div className={cn("text-[0.6rem] uppercase tracking-[0.14em] mt-1", isActive ? "text-background/70" : "text-muted-foreground")}>
                  {d.dayName.slice(0, 3)}{isToday ? " · today" : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {active && (
        <div className="mt-3 border hairline p-5 animate-fade-in">
          <h2 className="font-display text-3xl tracking-[-0.04em]">{active.type}</h2>
          <div className="mt-1 text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">{active.dayName}</div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{active.exercises.length} movements</span>
            {lastByDay.get(active.dayName) && (
              <span>· last logged {lastByDay.get(active.dayName)!.log_date}</span>
            )}
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={() => onStart(active)} className="ll-btn">Start workout</button>
          </div>
        </div>
      )}
    </div>
  );
}
