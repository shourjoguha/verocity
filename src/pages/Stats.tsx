/** Stats (Essentials):
 *  - Per-movement weight & estimated 1RM trend (Epley)
 *  - Weekly total volume per category
 *  - Sessions/week + total time
 *  - Plan adherence %
 */
import { Fragment, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { useSession } from "@/lib/session";
import { fmtLong } from "@/hooks/useTimer";
import { useStatsLogs } from "@/hooks/queries";
import { appConfig, familyOf } from "@/config/app.config";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { data: logs = [], isError } = useStatsLogs(user?.id);
  const [groupBy, setGroupBy] = useState<"movement" | "family">("family");

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

  const groupedMovements = useMemo(() => {
    if (groupBy === "movement") return perMovement;
    const out = new Map<string, { date: string; weight: number; reps: number; e1rm: number }[]>();
    for (const [name, arr] of perMovement.entries()) {
      const key = familyOf(name);
      const cap = key.charAt(0).toUpperCase() + key.slice(1);
      const merged = out.get(cap) ?? [];
      merged.push(...arr);
      out.set(cap, merged);
    }
    for (const arr of out.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [perMovement, groupBy]);
  const sortedMovements = Array.from(groupedMovements.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const weeks = Array.from(new Set([...weeklyVolume.keys(), ...weeklyMeta.keys()])).sort();

  // Day-of-week consistency heatmap: 7 rows (Mon..Sun) x 8 cols (last 8 ISO weeks).
  const heatmap = useMemo(() => {
    const totalsByDate = new Map<string, number>();
    for (const l of logs) {
      const prev = totalsByDate.get(l.log_date) ?? 0;
      totalsByDate.set(l.log_date, Math.max(prev, l.total_seconds ?? 0));
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Find Monday of current week
    const dow = (today.getDay() + 6) % 7; // 0=Mon
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - dow);
    const weeks: { weekStart: Date; days: { date: string; seconds: number }[] }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() - w * 7);
      const days: { date: string; seconds: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start);
        dt.setDate(start.getDate() + d);
        const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        days.push({ date: iso, seconds: totalsByDate.get(iso) ?? 0 });
      }
      weeks.push({ weekStart: start, days });
    }
    // Tier thresholds (seconds): empty → no fill; else 5 tiers by quintile of non-zero values.
    const nonZero: number[] = [];
    for (const w of weeks) for (const d of w.days) if (d.seconds > 0) nonZero.push(d.seconds);
    nonZero.sort((a, b) => a - b);
    function tier(sec: number): number {
      if (sec <= 0 || nonZero.length === 0) return 0;
      const qIdx = nonZero.findIndex((v) => v >= sec);
      const pct = qIdx < 0 ? 1 : (qIdx + 1) / nonZero.length;
      if (pct <= 0.2) return 1;
      if (pct <= 0.4) return 2;
      if (pct <= 0.6) return 3;
      if (pct <= 0.8) return 4;
      return 5;
    }
    return { weeks, tier };
  }, [logs]);
  const TIER_OPACITY = ["", "opacity-20", "opacity-40", "opacity-60", "opacity-80", "opacity-100"];
  const DOW_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  // RPE fingerprint: per-category distribution across last 30 sessions.
  const RPE_BINS = [5, 6, 7, 8, 9, 10] as const;
  const CANONICAL_FAMILIES = new Set(Object.keys(appConfig.movementFamilies));
  const rpeFingerprint = useMemo(() => {
    const last30 = logs.slice(-30);
    const byCat = new Map<string, number[]>(); // cat -> counts per bin
    let totalSets = 0;
    for (const log of last30) {
      const doc = log.data;
      if (!doc?.sections) continue;
      for (const sec of doc.sections) for (const g of sec.groups) for (const it of g.items) {
        const famKey = familyOf(it.name);
        const cat = CANONICAL_FAMILIES.has(famKey) ? famKey : "other";
        for (const set of it.sets) {
          const r = set.actual.rpe;
          if (typeof r !== "number") continue;
          const rounded = Math.round(r);
          const clamped = Math.max(5, Math.min(10, rounded));
          const bins = byCat.get(cat) ?? [0, 0, 0, 0, 0, 0];
          bins[clamped - 5] += 1;
          byCat.set(cat, bins);
          totalSets += 1;
        }
      }
    }
    const rows = Array.from(byCat.entries())
      .map(([cat, bins]) => ({ cat, bins, total: bins.reduce((a, b) => a + b, 0) }))
      .filter((r) => r.total >= 5)
      .sort((a, b) => b.total - a.total);
    return { rows, totalSets };
  }, [logs]);
  const [rpeShowAll, setRpeShowAll] = useState(false);
  const visibleRpeRows = rpeShowAll ? rpeFingerprint.rows : rpeFingerprint.rows.slice(0, 6);
  const hiddenRpeCount = Math.max(0, rpeFingerprint.rows.length - 6);
  // RPE bin opacity: RPE 10 = 100%, RPE 5 = 30% (linear).
  const rpeBinOpacity = (rpe: number) => {
    const t = (rpe - 5) / 5; // 0..1
    return 0.3 + t * 0.7;
  };

  return (
    <>
      <TopBar title="Stats" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 safe-bottom">
        <EchoHeadline className="text-[2.25rem]">Stats</EchoHeadline>
        {isError && <div className="mt-4 text-xs text-destructive">Failed to load stats.</div>}

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
          <h3 className="font-display text-lg uppercase tracking-[-0.03em]">Consistency</h3>
          <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mt-1">Last 8 weeks · session intensity by weekday</div>
          <div className="mt-3 grid gap-px max-w-md" style={{ gridTemplateColumns: "auto repeat(8, 1fr)" }}>
            {DOW_LABELS.map((label, dowIdx) => (
              <Fragment key={`row-${dowIdx}`}>
                <div className="text-[0.55rem] uppercase tracking-[0.12em] text-muted-foreground pr-2 flex items-center justify-end" style={{ gridRow: dowIdx + 1, gridColumn: 1 }}>{label}</div>
                {heatmap.weeks.map((w, wIdx) => {
                  const day = w.days[dowIdx];
                  const t = heatmap.tier(day.seconds);
                  return (
                    <div
                      key={`c-${wIdx}-${dowIdx}`}
                      title={`${day.date} · ${day.seconds ? fmtLong(day.seconds) : "—"}`}
                      className={cn("aspect-square border hairline", t > 0 && "bg-foreground", t > 0 && TIER_OPACITY[t])}
                      style={{ gridRow: dowIdx + 1, gridColumn: wIdx + 2 }}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-lg uppercase tracking-[-0.03em]">Top movements (e1RM trend)</h3>
            <div className="flex items-center gap-1">
              {(["family","movement"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={cn(
                    "text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border transition-colors",
                    groupBy === g ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
                  )}
                >
                  By {g}
                </button>
              ))}
            </div>
          </div>
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
