/** Stats (Essentials):
 *  - Per-movement weight & estimated 1RM trend (Epley)
 *  - Weekly total volume per category
 *  - Sessions/week + total time
 *  - Plan adherence %
 */
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import type { LogDocument } from "@/lib/types";

type LogRow = { id: string; log_date: string; status: string; total_seconds: number | null; data: LogDocument };

/** Brzycki 1RM — more aggressive than Epley at moderate reps. Falls back to Epley above 36 reps. */
function brzycki(weight: number, reps: number) {
  if (reps <= 0) return weight;
  return reps >= 37 ? weight * (1 + reps / 30) : (weight * 36) / (37 - reps);
}
function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;
}

export default function Stats() {
  const { user } = useSession();
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("workout_logs")
      .select("id,log_date,status,total_seconds,data")
      .eq("owner_user_id", user.id)
      .order("log_date", { ascending: true })
      .then(({ data }) => setLogs((data as unknown as LogRow[]) ?? []));
  }, [user]);

  const { perMovement, weeklyVolume, weeklyMeta, adherence } = useMemo(() => {
    const perMovement = new Map<string, { date: string; weight: number; reps: number; e1rm: number }[]>();
    const weeklyVolume = new Map<string, number>();
    const weeklyMeta = new Map<string, { sessions: number; seconds: number }>();
    let plannedSets = 0, completedSets = 0;

    for (const log of logs) {
      const wk = isoWeek(new Date(log.log_date));
      const meta = weeklyMeta.get(wk) ?? { sessions: 0, seconds: 0 };
      meta.sessions += 1;
      meta.seconds += log.total_seconds ?? 0;
      weeklyMeta.set(wk, meta);

      let vol = weeklyVolume.get(wk) ?? 0;
      const doc = log.data;
      if (!doc?.sections) continue;
      for (const sec of doc.sections) for (const g of sec.groups) for (const it of g.items) {
        for (const set of it.sets) {
          if (set.planned) plannedSets += 1;
          const w = set.actual.weight, r = set.actual.reps;
          if (set.actual.completed || (w != null && r != null)) completedSets += 1;
          if (typeof w === "number" && typeof r === "number" && w > 0 && r > 0) {
            vol += w * r;
            const arr = perMovement.get(it.name) ?? [];
            arr.push({ date: log.log_date, weight: w, reps: r, e1rm: brzycki(w, r) });
            perMovement.set(it.name, arr);
          }
        }
      }
      weeklyVolume.set(wk, vol);
    }
    const adherence = plannedSets ? Math.round((completedSets / plannedSets) * 100) : 0;
    return { perMovement, weeklyVolume, weeklyMeta, adherence };
  }, [logs]);

  const sortedMovements = Array.from(perMovement.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const weeks = Array.from(new Set([...weeklyVolume.keys(), ...weeklyMeta.keys()])).sort();

  return (
    <>
      <TopBar title="Stats" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 safe-bottom">
        <EchoHeadline className="text-[2.25rem]">Stats</EchoHeadline>

        <section className="mt-6 grid grid-cols-3 gap-2">
          <Stat label="Sessions" value={String(logs.length)} />
          <Stat label="Total time" value={fmtLong(logs.reduce((n, l) => n + (l.total_seconds ?? 0), 0))} />
          <Stat label="Adherence" value={`${adherence}%`} />
        </section>

        <section className="mt-8">
          <h3 className="font-display text-lg uppercase tracking-[-0.03em]">Weekly</h3>
          <div className="mt-2 overflow-x-auto edge-fade-x">
            <table className="ll-table min-w-[440px]">
              <thead>
                <tr><th>Week</th><th className="text-right">Sessions</th><th className="text-right">Time</th><th className="text-right">Volume (kg·reps)</th></tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w}>
                    <td className="font-mono text-xs">{w}</td>
                    <td className="text-right font-mono">{weeklyMeta.get(w)?.sessions ?? 0}</td>
                    <td className="text-right font-mono">{fmtLong(weeklyMeta.get(w)?.seconds ?? 0)}</td>
                    <td className="text-right font-mono">{Math.round(weeklyVolume.get(w) ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
                {weeks.length === 0 && <tr><td colSpan={4} className="text-xs text-muted-foreground py-4">No data yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h3 className="font-display text-lg uppercase tracking-[-0.03em]">Top movements (e1RM trend)</h3>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {sortedMovements.map(([name, points]) => {
              const max = Math.max(...points.map((p) => p.e1rm));
              const min = Math.min(...points.map((p) => p.e1rm));
              return (
                <div key={name} className="border hairline p-3">
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-base tracking-[-0.03em]">{name}</div>
                    <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">e1RM {Math.round(min)}-{Math.round(max)}</div>
                  </div>
                  <Sparkline points={points.map((p) => p.e1rm)} />
                  <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mt-1">{points.length} entries · last {points[points.length - 1].date}</div>
                </div>
              );
            })}
            {sortedMovements.length === 0 && <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">Log some sets to see trends.</div>}
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border hairline p-3">
      <div className="text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="font-display text-2xl tracking-[-0.04em] mt-1 truncate">{value}</div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const w = 240, h = 40;
  const dx = points.length === 1 ? w / 2 : w / (points.length - 1);
  const norm = (v: number) => (max === min ? h / 2 : h - ((v - min) / (max - min)) * h);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${i * dx} ${norm(p)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full h-10">
      <path d={d} fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5" />
    </svg>
  );
}
