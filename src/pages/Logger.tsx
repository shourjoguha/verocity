/** Logger — heart of the app.
 *  - Accordion sections (Warm-up / Main / Secondary / Finisher)
 *  - Compact tables of sets per movement (planned vs actual)
 *  - Long-press to multi-select; group/ungroup as superset / circuit
 *  - Per-movement and per-set rest timers (manual start)
 *  - Session stopwatch with start / pause / resume / cancel / restart
 *  - Swap movement via library picker, add custom movement
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import type { LogDocument, LogGroup, LogItem, LogSection, LogSet, ParsedPlan, PlannedSet } from "@/lib/types";
import { buildLogDocument, makeId } from "@/lib/logBuilder";
import { useLongPress } from "@/hooks/useLongPress";
import { useStopwatch, useCountdown, fmt, fmtLong } from "@/hooks/useTimer";
import { appConfig, type Metric } from "@/config/app.config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pause, Play, RotateCcw, X, Save, Plus, Replace, Trash2, Group, Ungroup, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/LibraryPicker";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isoWeekIndexFromStart(startDateIso: string | null): number {
  if (!startDateIso) return 1;
  const start = new Date(startDateIso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1));
}

const METRIC_ORDER: Metric[] = ["weight", "reps", "rpe", "distance", "time"];

interface SelectionKey { sectionId: string; groupId: string; itemIndex: number }
const keyOf = (s: string, g: string, i: number) => `${s}::${g}::${i}`;
const parseKey = (k: string): SelectionKey => {
  const [sectionId, groupId, idx] = k.split("::");
  return { sectionId, groupId, itemIndex: parseInt(idx, 10) };
};

export default function Logger() {
  const nav = useNavigate();
  const { user } = useSession();
  const params = useParams<{ id?: string }>();
  const [search] = useSearchParams();

  const [logId, setLogId] = useState<string | null>(params.id ?? null);
  const [doc, setDoc] = useState<LogDocument | null>(null);
  const [dayKey, setDayKey] = useState<string>("");
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<"planned" | "in_progress" | "paused" | "done" | "cancelled">("planned");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [accumSec, setAccumSec] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState<{ kind: "swap" | "add"; sectionId: string; groupId?: string; itemIndex?: number } | null>(null);
  const [restTimer, setRestTimer] = useState<{ targetSeconds: number; label: string } | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  const sw = useStopwatch();

  // Initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      if (logId) {
        const { data } = await supabase.from("workout_logs").select("*").eq("id", logId).maybeSingle();
        if (data) {
          setDoc(data.data as unknown as LogDocument);
          setDayKey(data.day_key ?? "");
          setWeekNumber(data.week_number ?? 1);
          setPlanId(data.plan_id);
          setStatus(data.status as typeof status);
          setStartedAt(data.started_at);
          setEndedAt(data.ended_at);
          setAccumSec(data.total_seconds ?? 0);
          sw.setSeconds(data.total_seconds ?? 0);
        }
      } else {
        const day = search.get("day") ?? DAY_NAMES[new Date().getDay()];
        const week = parseInt(search.get("week") ?? "1", 10);
        const { data: planRow } = await supabase
          .from("plans").select("id,parsed,start_date").eq("owner_user_id", user.id).eq("is_active", true).maybeSingle();
        if (!planRow) {
          toast.error("No active plan. Upload one first.");
          nav("/plan/upload");
          return;
        }
        const plan = (planRow.parsed as unknown as ParsedPlan);
        const planDay = plan.days.find((d) => d.dayName === day) ?? plan.days[0];
        setPlanId(planRow.id);
        setDayKey(`${planDay.dayName} — ${planDay.type}`);
        setWeekNumber(week || isoWeekIndexFromStart(planRow.start_date));
        const built = buildLogDocument(plan, planDay, week || isoWeekIndexFromStart(planRow.start_date));
        setDoc(built);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-save every N seconds while doc is dirty
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = true; }, [doc, status, accumSec]);
  useEffect(() => {
    const i = window.setInterval(() => { if (dirtyRef.current && doc && user) saveLog(false); }, appConfig.session.autoSaveIntervalSeconds * 1000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, status, accumSec, user]);

  // Sync stopwatch into accumSec
  useEffect(() => { setAccumSec(sw.seconds); }, [sw.seconds]);

  async function saveLog(showToast = true) {
    if (!user || !doc) return;
    dirtyRef.current = false;
    const payload = {
      owner_user_id: user.id,
      plan_id: planId,
      day_key: dayKey,
      week_number: weekNumber,
      status,
      started_at: startedAt,
      ended_at: endedAt,
      total_seconds: accumSec,
      data: doc as never,
      log_date: (startedAt ?? new Date().toISOString()).slice(0, 10),
    };
    if (logId) {
      const { error } = await supabase.from("workout_logs").update(payload).eq("id", logId);
      if (error) { toast.error(`Save failed`); return; }
    } else {
      const { data, error } = await supabase.from("workout_logs").insert([payload]).select("id").single();
      if (error || !data) { toast.error(`Save failed`); return; }
      setLogId(data.id);
      window.history.replaceState({}, "", `/log/${data.id}`);
    }
    setSavedTick((n) => n + 1);
    if (showToast) toast.success("Saved");
  }

  // Session controls
  function startSession() {
    if (!startedAt) setStartedAt(new Date().toISOString());
    setStatus("in_progress");
    sw.start();
  }
  function pauseSession() { sw.pause(); setStatus("paused"); }
  function resumeSession() { sw.start(); setStatus("in_progress"); }
  function cancelSession() {
    if (!confirm("Cancel this session? It will be marked cancelled.")) return;
    sw.pause();
    setStatus("cancelled");
    setEndedAt(new Date().toISOString());
    void saveLog(true);
  }
  function restartSession() {
    if (!confirm("Restart timer to 00:00? Logged data is kept.")) return;
    sw.reset();
    setStartedAt(new Date().toISOString());
    setEndedAt(null);
    setStatus("in_progress");
    sw.start();
  }
  function finishSession() {
    sw.pause();
    setStatus("done");
    setEndedAt(new Date().toISOString());
    void saveLog(true);
  }

  // Mutators
  function updateDoc(mut: (d: LogDocument) => void) {
    setDoc((prev) => {
      if (!prev) return prev;
      const next: LogDocument = JSON.parse(JSON.stringify(prev));
      mut(next);
      return next;
    });
  }

  function setActual(sectionId: string, groupId: string, itemIdx: number, setIdx: number, metric: Metric, value: number | null) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      it.sets[setIdx].actual[metric] = value;
    });
  }
  function toggleSetComplete(sectionId: string, groupId: string, itemIdx: number, setIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      it.sets[setIdx].actual.completed = !it.sets[setIdx].actual.completed;
    });
  }
  function addSet(sectionId: string, groupId: string, itemIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      const last = it.sets[it.sets.length - 1];
      it.sets.push({ planned: last?.planned ?? null, actual: {}, notations: last?.notations ?? [], restAfterSeconds: it.restBetweenSetsSeconds });
    });
  }
  function removeSet(sectionId: string, groupId: string, itemIdx: number, setIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g.items[itemIdx].sets.splice(setIdx, 1);
    });
  }
  function setItemRest(sectionId: string, groupId: string, itemIdx: number, sec: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g.items[itemIdx].restBetweenSetsSeconds = sec;
      // Update remaining sets too
      for (const st of g.items[itemIdx].sets) st.restAfterSeconds = sec;
    });
  }
  function setGroupRest(sectionId: string, groupId: string, key: "restAfterRoundSeconds" | "restWithinSeconds", sec: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g[key] = sec;
    });
  }
  function changeGroupKind(sectionId: string, groupId: string, kind: LogGroup["kind"]) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      g.kind = kind;
      if (kind !== "single" && g.restWithinSeconds === undefined) g.restWithinSeconds = appConfig.timer.defaults.withinSupersetSeconds;
    });
  }
  function removeItem(sectionId: string, groupId: string, itemIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const gIdx = s.groups.findIndex((x) => x.id === groupId);
      const g = s.groups[gIdx];
      g.items.splice(itemIdx, 1);
      if (g.items.length === 0) s.groups.splice(gIdx, 1);
    });
  }
  function swapMovement(target: { sectionId: string; groupId: string; itemIndex: number }, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === target.sectionId)!;
      const g = s.groups.find((x) => x.id === target.groupId)!;
      const it = g.items[target.itemIndex];
      it.movementId = mov.id;
      it.name = mov.name;
      it.metrics = mov.metrics;
      it.primaryMetric = mov.primaryMetric;
      it.restBetweenSetsSeconds = mov.default_rest_seconds || it.restBetweenSetsSeconds;
    });
  }
  function addMovement(sectionId: string, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      s.groups.push({
        id: makeId(),
        kind: "single",
        items: [{
          movementId: mov.id,
          name: mov.name,
          metrics: mov.metrics,
          primaryMetric: mov.primaryMetric,
          notations: [],
          sets: [{ planned: null, actual: {}, notations: [], restAfterSeconds: mov.default_rest_seconds }],
          restBetweenSetsSeconds: mov.default_rest_seconds || appConfig.timer.defaults.betweenSetsSeconds,
        }],
        restAfterRoundSeconds: mov.default_rest_seconds || appConfig.timer.defaults.betweenSetsSeconds,
      });
    });
  }
  function toggleNotation(sectionId: string, groupId: string, itemIdx: number, setIdx: number, tag: string) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const set = g.items[itemIdx].sets[setIdx];
      const i = set.notations.indexOf(tag);
      if (i >= 0) set.notations.splice(i, 1);
      else set.notations.push(tag);
    });
  }

  // Selection
  function toggleSelect(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }
  function clearSelection() { setSelected(new Set()); }
  function groupSelected(kind: "superset" | "circuit") {
    if (!doc || selected.size < 2) return;
    const keys = Array.from(selected).map(parseKey);
    // Must be in same section
    const sectionId = keys[0].sectionId;
    if (!keys.every((k) => k.sectionId === sectionId)) {
      toast.error("Group items within the same section.");
      return;
    }
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      // Collect items
      const items: LogItem[] = [];
      const removeFrom: { groupId: string; itemIndex: number }[] = [];
      for (const k of keys) {
        const g = s.groups.find((x) => x.id === k.groupId)!;
        items.push(g.items[k.itemIndex]);
        removeFrom.push({ groupId: k.groupId, itemIndex: k.itemIndex });
      }
      // Sort removals descending so indexes stay valid
      removeFrom.sort((a, b) => (a.groupId === b.groupId ? b.itemIndex - a.itemIndex : 0));
      for (const r of removeFrom) {
        const g = s.groups.find((x) => x.id === r.groupId)!;
        g.items.splice(r.itemIndex, 1);
      }
      // Drop empty groups
      s.groups = s.groups.filter((g) => g.items.length > 0);
      // Insert new group
      s.groups.push({
        id: makeId(),
        kind,
        items,
        restAfterRoundSeconds: appConfig.timer.defaults.afterSupersetSeconds,
        restWithinSeconds: appConfig.timer.defaults.withinSupersetSeconds,
      });
    });
    clearSelection();
  }
  function ungroupSelected() {
    if (!doc || selected.size === 0) return;
    const keys = Array.from(selected).map(parseKey);
    updateDoc((d) => {
      for (const k of keys) {
        const s = d.sections.find((x) => x.id === k.sectionId)!;
        const g = s.groups.find((x) => x.id === k.groupId)!;
        if (g.kind === "single") continue;
        const item = g.items[k.itemIndex];
        if (!item) continue;
        g.items.splice(k.itemIndex, 1);
        s.groups.push({
          id: makeId(),
          kind: "single",
          items: [item],
          restAfterRoundSeconds: item.restBetweenSetsSeconds,
        });
        if (g.items.length <= 1 && g.kind !== "single") {
          // Convert remainder back to single if only 1 left
          if (g.items.length === 1) g.kind = "single";
        }
      }
      // Remove empty groups
      for (const s of d.sections) s.groups = s.groups.filter((g) => g.items.length > 0);
    });
    clearSelection();
  }

  if (!doc) {
    return (<><TopBar title="Logger" /><main className="p-8 text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading…</main></>);
  }

  return (
    <>
      <TopBar title={dayKey || "Logger"} />
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <EchoHeadline className="text-[1.75rem] sm:text-[2.25rem]">{dayKey || "Session"}</EchoHeadline>
          <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Week {weekNumber}</div>
        </div>

        <SessionTimer
          accumSec={accumSec}
          status={status}
          startedAt={startedAt}
          endedAt={endedAt}
          onStart={startSession}
          onPause={pauseSession}
          onResume={resumeSession}
          onCancel={cancelSession}
          onRestart={restartSession}
          onFinish={finishSession}
          onSave={() => saveLog(true)}
        />

        <Accordion type="multiple" defaultValue={doc.sections.map((s) => s.id)} className="mt-6">
          {doc.sections.map((section) => (
            <AccordionItem key={section.id} value={section.id} className="border-b hairline">
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-xl uppercase tracking-[-0.04em]">{section.name}</span>
                  <span className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground">
                    {section.groups.reduce((n, g) => n + g.items.length, 0)} mvts · {section.groups.reduce((n, g) => n + g.items.reduce((m, it) => m + it.sets.length, 0), 0)} sets
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="space-y-3">
                  {section.groups.map((group) => (
                    <GroupBlock
                      key={group.id}
                      section={section}
                      group={group}
                      selected={selected}
                      onSelectToggle={toggleSelect}
                      onSetActual={setActual}
                      onToggleComplete={toggleSetComplete}
                      onAddSet={addSet}
                      onRemoveSet={removeSet}
                      onItemRest={setItemRest}
                      onGroupRest={setGroupRest}
                      onChangeKind={changeGroupKind}
                      onRemoveItem={removeItem}
                      onSwap={(g, i) => setPickerOpen({ kind: "swap", sectionId: section.id, groupId: g, itemIndex: i })}
                      onToggleNotation={toggleNotation}
                      onStartRest={(seconds, label) => setRestTimer({ targetSeconds: seconds, label })}
                    />
                  ))}
                  <button
                    onClick={() => setPickerOpen({ kind: "add", sectionId: section.id })}
                    className="w-full border border-dashed hairline py-3 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary transition-colors duration-slow ease-swiss"
                  >
                    <Plus className="inline h-3 w-3 mr-1" /> Add movement
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-8 text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground">
          {savedTick > 0 ? `Saved · ${savedTick} ticks` : "Auto-save every 15s"}
        </div>
      </main>

      {/* Floating selection action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background border-2 border-foreground shadow-lg flex items-center gap-1 px-2 py-1 animate-fade-in">
          <span className="px-2 text-[0.65rem] uppercase tracking-[0.14em]">{selected.size} selected</span>
          <button onClick={() => groupSelected("superset")} className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80 flex items-center gap-1"><Group className="h-3 w-3" /> Superset</button>
          <button onClick={() => groupSelected("circuit")} className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80 flex items-center gap-1"><Group className="h-3 w-3" /> Circuit</button>
          <button onClick={ungroupSelected} className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80 flex items-center gap-1"><Ungroup className="h-3 w-3" /> Ungroup</button>
          <button onClick={clearSelection} className="px-3 py-2 text-[0.65rem] uppercase tracking-[0.14em] hover:opacity-80"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Rest timer overlay */}
      {restTimer && (
        <RestOverlay
          targetSeconds={restTimer.targetSeconds}
          label={restTimer.label}
          onClose={() => setRestTimer(null)}
        />
      )}

      {/* Library picker modal */}
      {pickerOpen && (
        <LibraryPicker
          ownerId={user?.id}
          onClose={() => setPickerOpen(null)}
          onPick={(mov) => {
            if (pickerOpen.kind === "swap" && pickerOpen.groupId !== undefined && pickerOpen.itemIndex !== undefined) {
              swapMovement({ sectionId: pickerOpen.sectionId, groupId: pickerOpen.groupId, itemIndex: pickerOpen.itemIndex }, mov);
            } else {
              addMovement(pickerOpen.sectionId, mov);
            }
            setPickerOpen(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------ Subcomponents ------------------ */

function SessionTimer(props: {
  accumSec: number;
  status: "planned" | "in_progress" | "paused" | "done" | "cancelled";
  startedAt: string | null;
  endedAt: string | null;
  onStart: () => void; onPause: () => void; onResume: () => void;
  onCancel: () => void; onRestart: () => void; onFinish: () => void; onSave: () => void;
}) {
  const { accumSec, status, onStart, onPause, onResume, onCancel, onRestart, onFinish, onSave } = props;
  return (
    <section className="mt-4 border hairline p-3 flex items-center justify-between gap-3">
      <div className="flex items-baseline gap-3">
        <div className="font-mono text-3xl tabular-nums tracking-tight">{fmtLong(accumSec)}</div>
        <span className="chip">{status.replace("_", " ")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {status === "planned" && (
          <button onClick={onStart} className="ll-btn flex items-center gap-1"><Play className="h-3 w-3" /> Start</button>
        )}
        {status === "in_progress" && (
          <>
            <button onClick={onPause} className="ll-btn flex items-center gap-1"><Pause className="h-3 w-3" /> Pause</button>
            <button onClick={onFinish} className="ll-btn">Finish</button>
          </>
        )}
        {status === "paused" && (
          <>
            <button onClick={onResume} className="ll-btn flex items-center gap-1"><Play className="h-3 w-3" /> Resume</button>
            <button onClick={onFinish} className="ll-btn">Finish</button>
          </>
        )}
        <button onClick={onRestart} className="ll-btn flex items-center gap-1" title="Restart timer"><RotateCcw className="h-3 w-3" /></button>
        <button onClick={onCancel} className="ll-btn flex items-center gap-1" title="Cancel"><X className="h-3 w-3" /></button>
        <button onClick={onSave} className="ll-btn flex items-center gap-1" title="Save"><Save className="h-3 w-3" /></button>
      </div>
    </section>
  );
}

function GroupBlock(props: {
  section: LogSection;
  group: LogGroup;
  selected: Set<string>;
  onSelectToggle: (key: string) => void;
  onSetActual: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, metric: Metric, value: number | null) => void;
  onToggleComplete: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onAddSet: (sectionId: string, groupId: string, itemIdx: number) => void;
  onRemoveSet: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onItemRest: (sectionId: string, groupId: string, itemIdx: number, sec: number) => void;
  onGroupRest: (sectionId: string, groupId: string, key: "restAfterRoundSeconds" | "restWithinSeconds", sec: number) => void;
  onChangeKind: (sectionId: string, groupId: string, kind: LogGroup["kind"]) => void;
  onRemoveItem: (sectionId: string, groupId: string, itemIdx: number) => void;
  onSwap: (groupId: string, itemIdx: number) => void;
  onToggleNotation: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, tag: string) => void;
  onStartRest: (seconds: number, label: string) => void;
}) {
  const { section, group } = props;
  const isGrouped = group.kind !== "single";
  return (
    <div className={`border ${isGrouped ? "border-foreground" : "hairline"} p-2`}>
      {isGrouped && (
        <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.16em] px-1 pb-2">
          <span className="font-bold">{group.kind}</span>
          <div className="flex items-center gap-2">
            <RestEditor label="Within" seconds={group.restWithinSeconds ?? appConfig.timer.defaults.withinSupersetSeconds} onChange={(s) => props.onGroupRest(section.id, group.id, "restWithinSeconds", s)} onStart={() => props.onStartRest(group.restWithinSeconds ?? appConfig.timer.defaults.withinSupersetSeconds, "Within")} />
            <RestEditor label="After round" seconds={group.restAfterRoundSeconds ?? appConfig.timer.defaults.afterSupersetSeconds} onChange={(s) => props.onGroupRest(section.id, group.id, "restAfterRoundSeconds", s)} onStart={() => props.onStartRest(group.restAfterRoundSeconds ?? appConfig.timer.defaults.afterSupersetSeconds, "After round")} />
            <button title="Convert to single" onClick={() => props.onChangeKind(section.id, group.id, "single")} className="text-muted-foreground hover:text-foreground"><Ungroup className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}
      {group.items.map((item, idx) => (
        <ItemRow
          key={`${group.id}-${idx}`}
          section={section} group={group} item={item} idx={idx}
          selected={props.selected.has(keyOf(section.id, group.id, idx))}
          onSelectToggle={() => props.onSelectToggle(keyOf(section.id, group.id, idx))}
          onSetActual={(setIdx, metric, value) => props.onSetActual(section.id, group.id, idx, setIdx, metric, value)}
          onToggleComplete={(setIdx) => props.onToggleComplete(section.id, group.id, idx, setIdx)}
          onAddSet={() => props.onAddSet(section.id, group.id, idx)}
          onRemoveSet={(setIdx) => props.onRemoveSet(section.id, group.id, idx, setIdx)}
          onItemRest={(sec) => props.onItemRest(section.id, group.id, idx, sec)}
          onRemoveItem={() => props.onRemoveItem(section.id, group.id, idx)}
          onSwap={() => props.onSwap(group.id, idx)}
          onToggleNotation={(setIdx, tag) => props.onToggleNotation(section.id, group.id, idx, setIdx, tag)}
          onStartRest={props.onStartRest}
        />
      ))}
    </div>
  );
}

function ItemRow(props: {
  section: LogSection;
  group: LogGroup;
  item: LogItem;
  idx: number;
  selected: boolean;
  onSelectToggle: () => void;
  onSetActual: (setIdx: number, metric: Metric, value: number | null) => void;
  onToggleComplete: (setIdx: number) => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onItemRest: (sec: number) => void;
  onRemoveItem: () => void;
  onSwap: () => void;
  onToggleNotation: (setIdx: number, tag: string) => void;
  onStartRest: (seconds: number, label: string) => void;
}) {
  const { item, selected, onSelectToggle, onStartRest } = props;
  const lp = useLongPress(onSelectToggle, undefined);
  const cols = METRIC_ORDER.filter((m) => item.metrics.includes(m));
  return (
    <div className={`border-t hairline first:border-t-0 ${selected ? "bg-secondary" : ""}`}>
      <div className="flex items-center justify-between gap-2 py-2 px-1" {...lp}>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-base tracking-[-0.03em] truncate">{item.name}</span>
          {item.notations.map((n) => <span key={n} className="chip">{n}</span>)}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <RestEditor label="Rest" seconds={item.restBetweenSetsSeconds} onChange={props.onItemRest} onStart={() => onStartRest(item.restBetweenSetsSeconds, item.name)} compact />
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-1 text-muted-foreground hover:text-foreground transition-colors duration-slow ease-swiss" title="Options"><Settings2 className="h-3.5 w-3.5" /></button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button onClick={props.onSwap} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Replace className="h-3 w-3" /> Swap</button>
              <button onClick={props.onAddSet} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Plus className="h-3 w-3" /> Add set</button>
              <button onClick={props.onRemoveItem} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Trash2 className="h-3 w-3" /> Remove</button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="overflow-x-auto edge-fade-x">
        <table className="ll-table min-w-[420px]">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Planned</th>
              {cols.map((m) => <th key={m} className="text-right">{appConfig.metrics.labels[m]}</th>)}
              <th className="w-10"></th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            {item.sets.map((s, i) => (
              <SetRow key={i} idx={i} set={s} cols={cols}
                onChange={(m, v) => props.onSetActual(i, m, v)}
                onToggleComplete={() => props.onToggleComplete(i)}
                onRemove={() => props.onRemoveSet(i)}
                onToggleNotation={(tag) => props.onToggleNotation(i, tag)}
                onStartRest={() => onStartRest(s.restAfterSeconds ?? item.restBetweenSetsSeconds, `${item.name} · set ${i + 1}`)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SetRow(props: {
  idx: number;
  set: LogSet;
  cols: Metric[];
  onChange: (m: Metric, v: number | null) => void;
  onToggleComplete: () => void;
  onRemove: () => void;
  onToggleNotation: (tag: string) => void;
  onStartRest: () => void;
}) {
  const { idx, set, cols } = props;
  return (
    <tr className={set.actual.completed ? "opacity-60" : ""}>
      <td className="font-mono text-xs">{idx + 1}</td>
      <td className="text-xs text-muted-foreground whitespace-nowrap">
        <span className="font-mono">{set.planned?.raw ?? "—"}</span>
        <Popover>
          <PopoverTrigger asChild>
            <button className="ml-1 align-middle text-[0.55rem] uppercase tracking-[0.12em] border hairline px-1">tags</button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-2">
            <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">Notations</div>
            <div className="flex flex-wrap gap-1">
              {appConfig.notations.map((n) => {
                const active = set.notations.includes(n.label);
                return (
                  <button
                    key={n.label}
                    onClick={() => props.onToggleNotation(n.label)}
                    className={`text-[0.6rem] uppercase tracking-[0.1em] px-1.5 py-0.5 border ${active ? "bg-foreground text-background border-foreground" : "hairline"}`}
                    title={n.meaning}
                  >
                    {n.label}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </td>
      {cols.map((m) => (
        <td key={m} className="text-right">
          <input
            type="number"
            inputMode="decimal"
            step={m === "rpe" ? 0.5 : m === "weight" ? 0.5 : 1}
            value={(set.actual[m] as number | null | undefined) ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              props.onChange(m, v === "" ? null : Number(v));
            }}
            className="w-14 text-right bg-transparent border-b hairline focus:border-foreground focus:outline-none transition-colors duration-slow ease-swiss font-mono"
            placeholder="—"
          />
        </td>
      ))}
      <td className="text-right">
        <button
          onClick={props.onStartRest}
          className="text-[0.6rem] uppercase tracking-[0.12em] border hairline px-1.5 py-0.5 hover:bg-secondary transition-colors duration-slow ease-swiss"
          title="Start rest"
        >
          rest
        </button>
      </td>
      <td className="text-right">
        <button
          onClick={props.onToggleComplete}
          className={`h-4 w-4 border ${set.actual.completed ? "bg-foreground border-foreground" : "hairline"}`}
          aria-label="Toggle complete"
        />
      </td>
    </tr>
  );
}

function RestEditor(props: { label: string; seconds: number; onChange: (s: number) => void; onStart: () => void; compact?: boolean }) {
  const { label, seconds, onChange, onStart, compact } = props;
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <button className={`border hairline px-1.5 py-0.5 font-mono text-[0.65rem] hover:bg-secondary transition-colors duration-slow ease-swiss`}>
            {compact ? fmt(seconds) : `${label} ${fmt(seconds)}`}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          <div className="text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">{label}</div>
          <div className="flex flex-wrap gap-1">
            {appConfig.timer.presets.map((p) => (
              <button key={p} onClick={() => onChange(p)}
                className={`text-[0.6rem] font-mono px-2 py-1 border ${seconds === p ? "bg-foreground text-background border-foreground" : "hairline"}`}>
                {fmt(p)}
              </button>
            ))}
          </div>
          <input
            type="number" min={0} step={5} value={seconds}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
            className="mt-2 w-full bg-transparent border-b hairline focus:border-foreground focus:outline-none py-1 font-mono text-sm"
          />
        </PopoverContent>
      </Popover>
      <button onClick={onStart} className="border hairline px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] hover:bg-foreground hover:text-background transition-colors duration-slow ease-swiss">go</button>
    </div>
  );
}

function RestOverlay(props: { targetSeconds: number; label: string; onClose: () => void }) {
  const cd = useCountdown(props.targetSeconds);
  useEffect(() => { cd.start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (cd.seconds === 0) {
      const t = window.setTimeout(() => props.onClose(), 1500);
      return () => window.clearTimeout(t);
    }
  }, [cd.seconds, props]);
  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-6">
      <div className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">{props.label}</div>
      <div className="font-mono text-[6rem] sm:text-[8rem] tabular-nums leading-none mt-3">{fmt(cd.seconds)}</div>
      <div className="mt-6 flex gap-2">
        {!cd.running ? (
          <button onClick={cd.start} className="ll-btn flex items-center gap-1"><Play className="h-3 w-3" /> Start</button>
        ) : (
          <button onClick={cd.stop} className="ll-btn flex items-center gap-1"><Pause className="h-3 w-3" /> Pause</button>
        )}
        <button onClick={() => cd.reset()} className="ll-btn flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Reset</button>
        <button onClick={() => cd.setSeconds(Math.max(0, cd.seconds - 15))} className="ll-btn">-15</button>
        <button onClick={() => cd.setSeconds(cd.seconds + 15)} className="ll-btn">+15</button>
        <button onClick={props.onClose} className="ll-btn flex items-center gap-1"><X className="h-3 w-3" /> Close</button>
      </div>
    </div>
  );
}
