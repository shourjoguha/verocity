/** Calendar — month view, dot per logged session. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import { ChevronLeft, ChevronRight } from "lucide-react";

type LogRow = { id: string; log_date: string; day_key: string | null; status: string; total_seconds: number | null };

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Calendar() {
  const nav = useNavigate();
  const { user } = useSession();
  const [cursor, setCursor] = useState(new Date());
  const [logs, setLogs] = useState<Record<string, LogRow[]>>({});
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  useEffect(() => {
    if (!user) return;
    supabase.from("workout_logs")
      .select("id,log_date,day_key,status,total_seconds")
      .eq("owner_user_id", user.id)
      .gte("log_date", ymd(monthStart))
      .lte("log_date", ymd(monthEnd))
      .order("log_date", { ascending: true })
      .then(({ data }) => {
        const map: Record<string, LogRow[]> = {};
        (data as LogRow[] | null)?.forEach((r) => { (map[r.log_date] ??= []).push(r); });
        setLogs(map);
      });
  }, [user, cursor]);

  const cells = useMemo(() => {
    const offset = monthStart.getDay(); // Sun=0
    const days = monthEnd.getDate();
    const arr: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < offset; i++) arr.push({ date: null, key: `b${i}` });
    for (let d = 1; d <= days; d++) {
      const dt = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      arr.push({ date: dt, key: ymd(dt) });
    }
    return arr;
  }, [cursor, monthEnd, monthStart]);

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <TopBar title="Calendar" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <div className="flex items-baseline justify-between">
          <EchoHeadline className="text-[2rem] sm:text-[2.5rem]">{monthLabel}</EchoHeadline>
          <div className="flex items-center gap-1">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 border hairline"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setCursor(new Date())} className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.12em] border hairline">Today</button>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 border hairline"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-7 text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="px-1 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-l border-t hairline">
          {cells.map((c) => {
            if (!c.date) return <div key={c.key} className="aspect-square border-r border-b hairline bg-secondary/40" />;
            const todays = logs[c.key] ?? [];
            const total = todays.reduce((n, r) => n + (r.total_seconds ?? 0), 0);
            const intensity = Math.min(1, total / 4500); // 75min => max
            return (
              <button
                key={c.key}
                onClick={() => todays[0] && nav(`/log/${todays[0].id}`)}
                disabled={todays.length === 0}
                className="relative aspect-square border-r border-b hairline p-1 text-left hover:bg-secondary transition-colors duration-slow ease-swiss disabled:hover:bg-transparent"
              >
                <div className="text-[0.65rem] font-mono text-muted-foreground">{c.date.getDate()}</div>
                {todays.length > 0 && (
                  <div className="absolute inset-x-1 bottom-1 flex items-center gap-1">
                    <div
                      className="h-1 flex-1 bg-foreground"
                      style={{ opacity: 0.25 + intensity * 0.75 }}
                    />
                    {todays[0].status === "done" && <div className="h-1.5 w-1.5 bg-foreground" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <section className="mt-8">
          <h3 className="font-display text-lg uppercase tracking-[-0.03em]">This month</h3>
          <ul className="mt-3 border-y hairline divide-y hairline">
            {Object.values(logs).flat().sort((a, b) => b.log_date.localeCompare(a.log_date)).map((l) => (
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
            {Object.keys(logs).length === 0 && <li className="py-4 text-xs text-muted-foreground uppercase tracking-[0.12em]">No sessions this month</li>}
          </ul>
        </section>
      </main>
    </>
  );
}
