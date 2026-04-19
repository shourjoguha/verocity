/** Home — horizontal day rail, recent logs, quick actions. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import type { ParsedPlan, PlanDay } from "@/lib/types";

type LogRow = { id: string; log_date: string; day_key: string | null; status: string; total_seconds: number | null; tags: string[] | null };
type PlanRow = { id: string; name: string; parsed: ParsedPlan; start_date: string | null; is_active: boolean };

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isoWeekIndexFromStart(startDateIso: string | null): number {
  if (!startDateIso) return 1;
  const start = new Date(startDateIso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1));
}

export default function Home() {
  const nav = useNavigate();
  const { user } = useSession();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: planData }, { data: logsData }] = await Promise.all([
        supabase.from("plans").select("id,name,parsed,start_date,is_active").eq("owner_user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("workout_logs").select("id,log_date,day_key,status,total_seconds,tags").eq("owner_user_id", user.id).order("log_date", { ascending: false }).limit(7),
      ]);
      setPlan((planData as unknown as PlanRow) ?? null);
      setLogs((logsData as LogRow[]) ?? []);
      const todayName = DAY_NAMES[new Date().getDay()];
      setActiveDay(todayName);
      setLoading(false);
    })();
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
            <div className="flex items-baseline justify-between mb-3">
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
            {logs.map((l) => (
              <li key={l.id}>
                <button onClick={() => nav(`/log/${l.id}`)} className="w-full px-1 py-3 flex items-center justify-between hover:bg-secondary transition-colors duration-slow ease-swiss">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{l.log_date}</span>
                    <span className="font-display text-base tracking-[-0.03em]">{l.day_key ?? "Session"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {(l.tags ?? []).slice(0, 2).map((t) => <span key={t} className="chip">{t}</span>)}
                    <span className="chip">{l.status}</span>
                    <span className="text-xs font-mono text-muted-foreground">{l.total_seconds ? fmtLong(l.total_seconds) : "—"}</span>
                  </div>
                </button>
              </li>
            ))}
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
          <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">{active.dayName}</div>
          <h2 className="mt-1 font-display text-3xl tracking-[-0.04em]">{active.type}</h2>
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
