/** Home — today's session, recent logs, quick actions. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import type { ParsedPlan } from "@/lib/types";

type LogRow = { id: string; log_date: string; day_key: string | null; status: string; total_seconds: number | null };
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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: planData }, { data: logsData }] = await Promise.all([
        supabase.from("plans").select("id,name,parsed,start_date,is_active").eq("owner_user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("workout_logs").select("id,log_date,day_key,status,total_seconds").eq("owner_user_id", user.id).order("log_date", { ascending: false }).limit(7),
      ]);
      setPlan((planData as PlanRow) ?? null);
      setLogs((logsData as LogRow[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const today = new Date();
  const todayDayName = DAY_NAMES[today.getDay()];
  const todaysSession = plan?.parsed?.days?.find((d) => d.dayName === todayDayName);
  const week = isoWeekIndexFromStart(plan?.start_date ?? plan?.parsed?.startDate ?? null);

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
            <button onClick={() => nav("/plan/upload")} className="ll-btn mt-6">Upload plan</button>
          </section>
        ) : todaysSession ? (
          <section className="mt-8 border hairline p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">Today's session</div>
            <h2 className="mt-2 font-display text-3xl tracking-[-0.04em]">{todaysSession.dayName} — {todaysSession.type}</h2>
            <div className="mt-3 text-xs text-muted-foreground">
              {todaysSession.exercises.length} movements
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => nav(`/log/new?day=${encodeURIComponent(todaysSession.dayName)}&week=${week}`)} className="ll-btn">Start workout</button>
              <button onClick={() => nav("/calendar")} className="ll-btn">Calendar</button>
            </div>
          </section>
        ) : (
          <section className="mt-8 border hairline p-5">
            <div className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">Today</div>
            <h2 className="mt-2 font-display text-3xl tracking-[-0.04em]">Rest day</h2>
            <p className="mt-2 text-sm text-muted-foreground">No session scheduled for {todayDayName}. Pick another day below.</p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {plan.parsed.days.map((d) => (
                <button key={d.dayName} onClick={() => nav(`/log/new?day=${encodeURIComponent(d.dayName)}&week=${week}`)} className="border hairline px-3 py-3 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">{d.dayName}</div>
                  <div className="font-display text-lg tracking-[-0.04em] mt-1">{d.type}</div>
                </button>
              ))}
            </div>
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
                    <span className="chip">{l.status}</span>
                    <span className="text-xs font-mono text-muted-foreground">{l.total_seconds ? fmtLong(l.total_seconds) : "—"}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button onClick={() => nav("/plan/upload")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Plan</div>
            <div className="font-display text-lg mt-1">Upload / replace</div>
          </button>
          <button onClick={() => nav("/library")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Library</div>
            <div className="font-display text-lg mt-1">Movements</div>
          </button>
          <button onClick={() => nav("/calendar")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">View</div>
            <div className="font-display text-lg mt-1">Calendar</div>
          </button>
          <button onClick={() => nav("/stats")} className="border hairline p-4 text-left hover:bg-secondary transition-colors duration-slow ease-swiss">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">Insight</div>
            <div className="font-display text-lg mt-1">Stats</div>
          </button>
        </section>
      </main>
    </>
  );
}
