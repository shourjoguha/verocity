/** Home — horizontal day rail, recent logs, quick actions. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { DayPreviewDialog } from "@/components/DayPreviewDialog";
import { AddSessionMenu } from "@/components/AddSessionMenu";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import { cn, sessionTypeFromDayKey } from "@/lib/utils";
import { appConfig } from "@/config/app.config";
import type { ParsedPlan, PlanDay, LogDocument } from "@/lib/types";

type LogRow = { id: string; log_date: string; day_key: string | null; status: string; total_seconds: number | null; tags: string[] | null; activity_type: string | null };
type StatsLogRow = LogRow & { data?: LogDocument };
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [allLogs, setAllLogs] = useState<StatsLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [previewDay, setPreviewDay] = useState<PlanDay | null>(null);
  const [logMenuOpen, setLogMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchAll() {
      const [{ data: planData }, { data: recentData }, { data: allLogsData }] = await Promise.all([
        supabase.from("plans").select("id,name,parsed,start_date,end_date,is_active").eq("owner_user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("workout_logs").select("id,log_date,day_key,status,total_seconds,tags,activity_type,created_at").eq("owner_user_id", user.id).in("status", ["done", "in_progress"]).order("log_date", { ascending: false }).order("created_at", { ascending: false }).limit(5),
        supabase.from("workout_logs").select("id,log_date,day_key,status,total_seconds,tags,activity_type,data,created_at").eq("owner_user_id", user.id).neq("status", "cancelled").order("log_date", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setPlan((planData as unknown as PlanRow) ?? null);
      setLogs((recentData as LogRow[]) ?? []);
      setAllLogs((allLogsData as unknown as StatsLogRow[]) ?? []);
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
  const todayStr = ymd(today);
  const week = isoWeekIndexFromStart(plan?.start_date ?? plan?.parsed?.startDate ?? null);

  const lastByDay = useMemo(() => {
    const map = new Map<string, LogRow>();
    for (const l of logs) {
      const dn = (l.day_key ?? "").split("—")[0].trim();
      if (dn && !map.has(dn)) map.set(dn, l);
    }
    return map;
  }, [logs]);

  // ---- Inline stats (computed from allLogs) ----
  const homeStats = useMemo(() => {
    let totalSeconds = 0;
    const oneRm = new Map<string, { weight: number; reps: number; e1rm: number; date: string }>();
    for (const l of allLogs) {
      if (l.status !== "done") continue;
      totalSeconds += l.total_seconds ?? 0;
    }
    return { sessions: allLogs.filter((l) => l.status === "done").length, totalSeconds, oneRm };
  }, [allLogs]);

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
              onPreview={(d) => setPreviewDay(d)}
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
                        <div className="font-display text-base tracking-[-0.03em] truncate">{sessionTypeFromDayKey(l.day_key)}</div>
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

        <HomeStats logs={allLogs} sessions={homeStats.sessions} totalSeconds={homeStats.totalSeconds} />

        <section className="mt-10 grid grid-cols-3 sm:grid-cols-5 gap-2">
          <button onClick={() => setLogMenuOpen(true)} className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">New</div>
            <div className="font-display text-base mt-1">Log</div>
          </button>
          <button onClick={() => nav("/plan")} className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">View</div>
            <div className="font-display text-base mt-1">Plan</div>
          </button>
          <button onClick={() => nav("/calendar")} className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">View</div>
            <div className="font-display text-base mt-1">Calendar</div>
          </button>
          <button onClick={() => nav("/library")} className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Library</div>
            <div className="font-display text-base mt-1">Movements</div>
          </button>
          <button onClick={() => nav("/plan/upload")} className="border hairline p-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Plan</div>
            <div className="font-display text-base mt-1">Upload</div>
          </button>
        </section>
      </main>
      <DayPreviewDialog
        day={previewDay}
        week={week}
        open={previewDay !== null}
        onOpenChange={(o) => { if (!o) setPreviewDay(null); }}
        onStart={() => {
          if (previewDay) {
            nav(`/log/new?day=${encodeURIComponent(previewDay.dayName)}&week=${week}`);
            setPreviewDay(null);
          }
        }}
      />
      <AddSessionMenu open={logMenuOpen} onClose={() => setLogMenuOpen(false)} date={todayStr} />
    </>
  );
}

type TimelinePoint = {
  date: string;
  state: "done" | "planned" | "blank";
  color: string;
  isToday: boolean;
  label: string;
  fullLabel: string;
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
    let fullLabel: string;

    if (log) {
      state = "done";
      color = colorForLog(log);
      const dn = (log.day_key ?? "").split("—")[1]?.trim() ?? log.day_key ?? "Done";
      label = abbrev(dn) || "Done";
      fullLabel = dn || "Done";
    } else if (planDay && cursor.getTime() >= today.getTime()) {
      const tag = appConfig.activity.dayTypeTag(planDay.type);
      color = appConfig.activity.tagColors[tag] ?? appConfig.activity.fallbackColor;
      label = abbrev(planDay.type) || planDay.type.slice(0, 5);
      fullLabel = planDay.type;
      state = "planned";
    } else {
      state = "blank";
      color = appConfig.activity.fallbackColor;
      label = "Rest";
      fullLabel = "Rest";
    }

    points.push({ date: dateStr, state, color, isToday, label, fullLabel });
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
              style.borderColor = `color-mix(in srgb, ${p.color} 50%, transparent)`;
              style.borderWidth = "1px";
              style.borderStyle = "solid";
              style.backgroundColor = "transparent";
            } else {
              // blank (rest / off-plan / past unplanned) — diagonal hatch texture
              style.backgroundImage = `repeating-linear-gradient(45deg, hsl(var(--muted-foreground) / 0.35) 0, hsl(var(--muted-foreground) / 0.35) 1px, transparent 1px, transparent 3px)`;
              style.backgroundColor = "hsl(var(--muted) / 0.25)";
              style.opacity = 0.55;
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
                onMouseEnter={() => setPeekIndex(i)}
                onMouseLeave={() => setPeekIndex((cur) => (cur === i ? null : cur))}
                className={cls}
                style={style}
                aria-label={`${p.date} ${p.fullLabel}`}
                title={`${p.fullLabel} · ${p.date}`}
              >
                {isPeek && (
                  <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-20 px-2 py-1 bg-foreground text-background text-[0.6rem] uppercase tracking-[0.12em] font-mono whitespace-nowrap pointer-events-none flex flex-col items-center gap-0.5">
                    <span>{p.fullLabel}</span>
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
  onPreview: (d: PlanDay) => void;
}) {
  const { days, activeDay, setActiveDay, todayDayName, lastByDay, onStart, onPreview } = props;
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
                onClick={() => { setActiveDay(d.dayName); onPreview(d); }}
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

/** Brzycki 1RM — more aggressive than Epley. */
function brzycki(weight: number, reps: number): number {
  if (reps <= 0) return weight;
  return reps >= 37 ? weight * (1 + reps / 30) : (weight * 36) / (37 - reps);
}

function HomeStats({ logs, sessions, totalSeconds }: { logs: StatsLogRow[]; sessions: number; totalSeconds: number }) {
  const nav = useNavigate();
  const oneRm = useMemo(() => {
    const best = new Map<string, { e1rm: number; weight: number; reps: number; date: string }>();
    for (const l of logs) {
      if (l.status !== "done") continue;
      const doc = l.data;
      if (!doc?.sections) continue;
      for (const sec of doc.sections) for (const g of sec.groups) for (const it of g.items) {
        for (const set of it.sets) {
          const w = set.actual.weight, r = set.actual.reps;
          if (typeof w !== "number" || typeof r !== "number" || w <= 0 || r <= 0) continue;
          const e = brzycki(w, r);
          const cur = best.get(it.name);
          if (!cur || e > cur.e1rm) best.set(it.name, { e1rm: e, weight: w, reps: r, date: l.log_date });
        }
      }
    }
    return Array.from(best.entries()).sort((a, b) => b[1].e1rm - a[1].e1rm).slice(0, 5);
  }, [logs]);

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl uppercase tracking-[-0.04em]">Stats</h3>
        <button onClick={() => nav("/stats")} className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss">All</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="border hairline p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">Sessions</div>
          <div className="font-display text-2xl tracking-[-0.04em] mt-1">{sessions}</div>
        </div>
        <div className="border hairline p-3">
          <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">Total time</div>
          <div className="font-display text-2xl tracking-[-0.04em] mt-1">{fmtLong(totalSeconds)}</div>
        </div>
      </div>
      <div className="mt-3 border hairline">
        <div className="px-3 py-2 text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground border-b hairline">All-time 1RM (Brzycki)</div>
        {oneRm.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground uppercase tracking-[0.12em]">Log some sets to see estimates</div>
        ) : (
          <ul className="divide-y hairline">
            {oneRm.map(([name, v]) => (
              <li key={name} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="font-display text-sm tracking-[-0.03em] truncate">{name}</span>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  <span className="text-foreground">{Math.round(v.e1rm)}kg</span>
                  <span className="ml-2 text-[0.6rem] uppercase tracking-[0.12em]">from {v.weight}×{v.reps}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
