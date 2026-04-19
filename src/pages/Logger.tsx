/** Logger — heart of the app.
 *  - Accordion sections (configurable / custom)
 *  - Compact tables of sets per movement (planned vs actual)
 *  - Long-press to multi-select; group/ungroup as superset / circuit
 *  - Per-movement and per-set rest timers (manual start)
 *  - Session stopwatch with start / pause / resume / cancel / restart
 *  - Swap movement via library picker, add custom movement
 *  - Date picker for log_date
 *  - Swappable metric column headers (reps ↔ time ↔ distance)
 *  - Custom workout mode with editable section names
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { useSession } from "@/lib/session";
import { useConfirm } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import type { LogDocument, LogGroup, LogItem, LogSection, LogSet, ParsedPlan } from "@/lib/types";
import { buildBlankDocument, buildLogDocument, makeId, migrateDocument } from "@/lib/logBuilder";
import { useLongPress } from "@/hooks/useLongPress";
import { useStopwatch, useCountdown, fmt, fmtLong } from "@/hooks/useTimer";
import { appConfig, type Metric, type SwappableMetric } from "@/config/app.config";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Pause, Play, RotateCcw, X, Save, Plus, Replace, Trash2, Group, Ungroup, Settings2, CalendarIcon, Pencil, ChevronUp, ChevronDown, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/LibraryPicker";
import { loadHistory, prefillFromHistory } from "@/lib/lastPerformance";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isoWeekIndexFromStart(startDateIso: string | null): number {
  if (!startDateIso) return 1;
  const start = new Date(startDateIso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, Math.min(16, Math.floor(diffDays / 7) + 1));
}

const METRIC_ORDER: Metric[] = ["weight", "reps", "rpe", "distance", "time"];
const SWAPPABLE = appConfig.metrics.swappable as readonly SwappableMetric[];

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
  const confirm = useConfirm();
  const isCustomMode = search.get("mode") === "custom";

  const [logId, setLogId] = useState<string | null>(params.id ?? null);
  const [doc, setDoc] = useState<LogDocument | null>(null);
  const [dayKey, setDayKey] = useState<string>("");
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string>(appConfig.activity.defaultType);
  const [tags, setTags] = useState<string[]>(["strength"]);
  const [logDate, setLogDate] = useState<Date>(new Date());
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
          setDoc(migrateDocument(data.data as unknown as LogDocument));
          setDayKey(data.day_key ?? "");
          setWeekNumber(data.week_number ?? 1);
          setPlanId(data.plan_id);
          setStatus(data.status as typeof status);
          setStartedAt(data.started_at);
          setEndedAt(data.ended_at);
          setAccumSec(data.total_seconds ?? 0);
          setLogDate(data.log_date ? new Date(data.log_date + "T00:00:00") : new Date());
          setActivityType(data.activity_type ?? appConfig.activity.defaultType);
          setTags(data.tags ?? ["strength"]);
          sw.setSeconds(data.total_seconds ?? 0);
        }
      } else {
        // Seed log date from ?date= if present.
        const dateParam = search.get("date");
        if (dateParam) setLogDate(new Date(dateParam + "T00:00:00"));

        if (isCustomMode) {
          const blank = buildBlankDocument();
          const history = await loadHistory(user.id);
          setDoc(prefillFromHistory(blank, history));
          setDayKey("Custom workout");
          setWeekNumber(0);
          setActivityType("strength");
          setTags(["strength"]);
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
          const history = await loadHistory(user.id);
          setDoc(prefillFromHistory(built, history));
          const inferred = appConfig.activity.dayTypeTag(planDay.type);
          setActivityType(inferred);
          setTags([inferred]);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-save every N seconds while doc is dirty
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = true; }, [doc, status, accumSec, logDate, tags]);
  useEffect(() => {
    const i = window.setInterval(() => { if (dirtyRef.current && doc && user) saveLog(false); }, appConfig.session.autoSaveIntervalSeconds * 1000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, status, accumSec, user, logDate, tags]);

  // Sync stopwatch into accumSec
  useEffect(() => { setAccumSec(sw.seconds); }, [sw.seconds]);

  async function saveLog(showToast = true) {
    if (!user || !doc) return;
    dirtyRef.current = false;
    const payload = {
      owner_user_id: user.id,
      plan_id: planId,
      day_key: dayKey,
      week_number: weekNumber || null,
      status,
      started_at: startedAt,
      ended_at: endedAt,
      total_seconds: accumSec,
      data: doc as never,
      log_date: format(logDate, "yyyy-MM-dd"),
      activity_type: activityType,
      tags,
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
  async function cancelSession() {
    const ok = await confirm({
      title: "Delete this session?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!ok) return;
    sw.pause();
    if (logId) {
      const { error } = await supabase.from("workout_logs").delete().eq("id", logId);
      if (error) { toast.error("Delete failed"); return; }
    }
    toast.success("Session deleted");
    nav("/");
  }
  async function restartSession() {
    const ok = await confirm({
      title: "Restart timer?",
      description: "Timer resets to 00:00. Logged sets are kept.",
      confirmLabel: "Restart timer",
    });
    if (!ok) return;
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
      // First user edit promotes prefilled values to confirmed.
      if (it.sets[setIdx].actual.prefilled) it.sets[setIdx].actual.prefilled = false;
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
  function toggleItemComplete(sectionId: string, groupId: string, itemIdx: number) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      const anyIncomplete = it.sets.some((st) => !st.actual.completed);
      for (const st of it.sets) {
        st.actual.completed = anyIncomplete;
        if (st.actual.prefilled) st.actual.prefilled = false;
      }
    });
  }
  function moveItem(sectionId: string, groupId: string, itemIdx: number, dstSectionId: string) {
    if (sectionId === dstSectionId) return;
    updateDoc((d) => {
      const src = d.sections.find((x) => x.id === sectionId)!;
      const dst = d.sections.find((x) => x.id === dstSectionId);
      if (!dst) return;
      const gIdx = src.groups.findIndex((x) => x.id === groupId);
      if (gIdx < 0) return;
      const g = src.groups[gIdx];
      const [item] = g.items.splice(itemIdx, 1);
      if (g.items.length === 0) src.groups.splice(gIdx, 1);
      dst.groups.push({
        id: makeId(),
        kind: "single",
        items: [item],
        restAfterRoundSeconds: item.restBetweenSetsSeconds,
      });
    });
  }
  function swapMovement(target: { sectionId: string; groupId: string; itemIndex: number }, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === target.sectionId)!;
      const g = s.groups.find((x) => x.id === target.groupId)!;
      const it = g.items[target.itemIndex];
      it.movementId = mov.id;
      it.name = mov.name;
      // Enforce: weight always present + only one swappable.
      const set = new Set<Metric>(mov.metrics);
      set.add("weight");
      const present = SWAPPABLE.filter((m) => set.has(m));
      const keep = present[0] ?? "reps";
      for (const m of SWAPPABLE) set.delete(m);
      set.add(keep);
      it.metrics = Array.from(set);
      it.primaryMetric = mov.primaryMetric;
      it.restBetweenSetsSeconds = mov.default_rest_seconds || it.restBetweenSetsSeconds;
    });
  }
  function addMovement(sectionId: string, mov: { id: string; name: string; metrics: Metric[]; primaryMetric: Metric; default_rest_seconds: number }) {
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const set = new Set<Metric>(mov.metrics);
      set.add("weight");
      const present = SWAPPABLE.filter((m) => set.has(m));
      const keep = present[0] ?? "reps";
      for (const m of SWAPPABLE) set.delete(m);
      set.add(keep);
      s.groups.push({
        id: makeId(),
        kind: "single",
        items: [{
          movementId: mov.id,
          name: mov.name,
          metrics: Array.from(set),
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
  function swapMetric(sectionId: string, groupId: string, itemIdx: number, oldMetric: SwappableMetric, newMetric: SwappableMetric) {
    if (oldMetric === newMetric) return;
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const g = s.groups.find((x) => x.id === groupId)!;
      const it = g.items[itemIdx];
      it.metrics = it.metrics.filter((m) => m !== oldMetric).concat(newMetric);
      // Ensure weight stays
      if (!it.metrics.includes("weight")) it.metrics.unshift("weight");
      // Clear stale values for the replaced metric
      for (const set of it.sets) {
        delete set.actual[oldMetric];
      }
      if (it.primaryMetric === oldMetric) it.primaryMetric = newMetric;
    });
  }

  // Custom-section editing
  function addSection() {
    updateDoc((d) => {
      d.sections.push({ id: makeId(), name: "New section", groups: [] });
    });
  }
  function renameSection(sectionId: string, name: string) {
    if (!name.trim()) return;
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId);
      if (s) s.name = name.trim();
    });
  }
  async function removeSection(sectionId: string) {
    const ok = await confirm({
      title: "Remove section?",
      description: "All movements within will be removed.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    updateDoc((d) => {
      d.sections = d.sections.filter((s) => s.id !== sectionId);
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
    const sectionId = keys[0].sectionId;
    if (!keys.every((k) => k.sectionId === sectionId)) {
      toast.error("Group items within the same section.");
      return;
    }
    updateDoc((d) => {
      const s = d.sections.find((x) => x.id === sectionId)!;
      const items: LogItem[] = [];
      const removeFrom: { groupId: string; itemIndex: number }[] = [];
      for (const k of keys) {
        const g = s.groups.find((x) => x.id === k.groupId)!;
        items.push(g.items[k.itemIndex]);
        removeFrom.push({ groupId: k.groupId, itemIndex: k.itemIndex });
      }
      removeFrom.sort((a, b) => (a.groupId === b.groupId ? b.itemIndex - a.itemIndex : 0));
      for (const r of removeFrom) {
        const g = s.groups.find((x) => x.id === r.groupId)!;
        g.items.splice(r.itemIndex, 1);
      }
      s.groups = s.groups.filter((g) => g.items.length > 0);
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
        if (g.items.length === 1) g.kind = "single";
      }
      for (const s of d.sections) s.groups = s.groups.filter((g) => g.items.length > 0);
    });
    clearSelection();
  }

  function toggleTag(t: string) {
    setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  if (!doc) {
    return (<><TopBar title="Logger" /><main className="p-8 text-xs uppercase tracking-[0.16em] text-muted-foreground">Loading…</main></>);
  }

  const allowSectionEdit = isCustomMode || !planId;

  return (
    <>
      <TopBar title={dayKey || "Logger"} />
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <EchoHeadline className="text-[1.75rem] sm:text-[2.25rem]">{dayKey || "Session"}</EchoHeadline>
          {weekNumber > 0 && <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">Week {weekNumber}</div>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 border hairline px-3 py-1.5 text-xs hover:bg-secondary transition-colors duration-slow ease-swiss">
                <CalendarIcon className="h-3 w-3" />
                <span className="font-mono">{format(logDate, "yyyy-MM-dd")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={logDate}
                onSelect={(d) => d && setLogDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1">
            {appConfig.activity.tags.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    "text-[0.6rem] uppercase tracking-[0.12em] px-2 py-1 border transition-colors duration-slow ease-swiss",
                    on ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
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
                <div className="flex items-baseline gap-3 w-full">
                  <SectionTitle
                    name={section.name}
                    editable={allowSectionEdit}
                    onRename={(n) => renameSection(section.id, n)}
                    onRemove={() => removeSection(section.id)}
                  />
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
                      allSections={doc.sections}
                      group={group}
                      selected={selected}
                      onSelectToggle={toggleSelect}
                      onSetActual={setActual}
                      onToggleComplete={toggleSetComplete}
                      onToggleItemComplete={toggleItemComplete}
                      onAddSet={addSet}
                      onRemoveSet={removeSet}
                      onItemRest={setItemRest}
                      onGroupRest={setGroupRest}
                      onChangeKind={changeGroupKind}
                      onRemoveItem={removeItem}
                      onMoveItem={moveItem}
                      onSwap={(g, i) => setPickerOpen({ kind: "swap", sectionId: section.id, groupId: g, itemIndex: i })}
                      onSwapMetric={swapMetric}
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

        {allowSectionEdit && (
          <button
            onClick={addSection}
            className="mt-4 w-full border border-dashed hairline py-3 text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary transition-colors duration-slow ease-swiss"
          >
            <Plus className="inline h-3 w-3 mr-1" /> Add section
          </button>
        )}

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

function SectionTitle({ name, editable, onRename, onRemove }: { name: string; editable: boolean; onRename: (n: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  if (!editable) {
    return <span className="font-display text-xl uppercase tracking-[-0.04em]">{name}</span>;
  }
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { onRename(value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.currentTarget.blur(); }
          if (e.key === "Escape") { setValue(name); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="font-display text-xl uppercase tracking-[-0.04em] bg-transparent border-b hairline focus:border-foreground focus:outline-none"
      />
    );
  }
  return (
    <div className="flex items-center gap-1 group" onClick={(e) => e.stopPropagation()}>
      <span className="font-display text-xl uppercase tracking-[-0.04em]">{name}</span>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity"><Pencil className="h-3 w-3" /></button>
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-opacity"><Trash2 className="h-3 w-3" /></button>
    </div>
  );
}

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
  allSections: LogSection[];
  group: LogGroup;
  selected: Set<string>;
  onSelectToggle: (key: string) => void;
  onSetActual: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, metric: Metric, value: number | null) => void;
  onToggleComplete: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onToggleItemComplete: (sectionId: string, groupId: string, itemIdx: number) => void;
  onAddSet: (sectionId: string, groupId: string, itemIdx: number) => void;
  onRemoveSet: (sectionId: string, groupId: string, itemIdx: number, setIdx: number) => void;
  onItemRest: (sectionId: string, groupId: string, itemIdx: number, sec: number) => void;
  onGroupRest: (sectionId: string, groupId: string, key: "restAfterRoundSeconds" | "restWithinSeconds", sec: number) => void;
  onChangeKind: (sectionId: string, groupId: string, kind: LogGroup["kind"]) => void;
  onRemoveItem: (sectionId: string, groupId: string, itemIdx: number) => void;
  onMoveItem: (sectionId: string, groupId: string, itemIdx: number, dstSectionId: string) => void;
  onSwap: (groupId: string, itemIdx: number) => void;
  onSwapMetric: (sectionId: string, groupId: string, itemIdx: number, oldMetric: SwappableMetric, newMetric: SwappableMetric) => void;
  onToggleNotation: (sectionId: string, groupId: string, itemIdx: number, setIdx: number, tag: string) => void;
  onStartRest: (seconds: number, label: string) => void;
}) {
  const { section, group, allSections } = props;
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
          section={section} allSections={allSections} group={group} item={item} idx={idx}
          selected={props.selected.has(keyOf(section.id, group.id, idx))}
          onSelectToggle={() => props.onSelectToggle(keyOf(section.id, group.id, idx))}
          onSetActual={(setIdx, metric, value) => props.onSetActual(section.id, group.id, idx, setIdx, metric, value)}
          onToggleComplete={(setIdx) => props.onToggleComplete(section.id, group.id, idx, setIdx)}
          onToggleItemComplete={() => props.onToggleItemComplete(section.id, group.id, idx)}
          onAddSet={() => props.onAddSet(section.id, group.id, idx)}
          onRemoveSet={(setIdx) => props.onRemoveSet(section.id, group.id, idx, setIdx)}
          onItemRest={(sec) => props.onItemRest(section.id, group.id, idx, sec)}
          onRemoveItem={() => props.onRemoveItem(section.id, group.id, idx)}
          onMoveItem={(dstSectionId) => props.onMoveItem(section.id, group.id, idx, dstSectionId)}
          onSwap={() => props.onSwap(group.id, idx)}
          onSwapMetric={(oldM, newM) => props.onSwapMetric(section.id, group.id, idx, oldM, newM)}
          onToggleNotation={(setIdx, tag) => props.onToggleNotation(section.id, group.id, idx, setIdx, tag)}
          onStartRest={props.onStartRest}
        />
      ))}
    </div>
  );
}

function ItemRow(props: {
  section: LogSection;
  allSections: LogSection[];
  group: LogGroup;
  item: LogItem;
  idx: number;
  selected: boolean;
  onSelectToggle: () => void;
  onSetActual: (setIdx: number, metric: Metric, value: number | null) => void;
  onToggleComplete: (setIdx: number) => void;
  onToggleItemComplete: () => void;
  onAddSet: () => void;
  onRemoveSet: (setIdx: number) => void;
  onItemRest: (sec: number) => void;
  onRemoveItem: () => void;
  onMoveItem: (dstSectionId: string) => void;
  onSwap: () => void;
  onSwapMetric: (oldMetric: SwappableMetric, newMetric: SwappableMetric) => void;
  onToggleNotation: (setIdx: number, tag: string) => void;
  onStartRest: (seconds: number, label: string) => void;
}) {
  const { item, section, allSections, selected, onSelectToggle, onStartRest } = props;
  const lp = useLongPress(onSelectToggle, undefined);
  const cols = METRIC_ORDER.filter((m) => item.metrics.includes(m));

  const totalSets = item.sets.length;
  const completedCount = item.sets.filter((s) => s.actual.completed).length;
  const allComplete = totalSets > 0 && completedCount === totalSets;
  const noneComplete = completedCount === 0;
  const lastIsComplete = totalSets > 0 && !!item.sets[totalSets - 1].actual.completed;
  // Show ghost row when last set just completed but not all sets are bulk-complete.
  const showGhostRow = lastIsComplete && !allComplete;

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
            <PopoverContent align="end" className="w-52 p-1">
              <button onClick={props.onSwap} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Replace className="h-3 w-3" /> Swap</button>
              <button onClick={props.onAddSet} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Plus className="h-3 w-3" /> Add set</button>
              <MoveToSubmenu sections={allSections} currentSectionId={section.id} onMove={props.onMoveItem} />
              <button onClick={props.onRemoveItem} className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"><Trash2 className="h-3 w-3" /> Remove</button>
            </PopoverContent>
          </Popover>
          <ItemCompleteCheckbox allComplete={allComplete} noneComplete={noneComplete} onClick={props.onToggleItemComplete} />
        </div>
      </div>

      <div className="overflow-x-auto edge-fade-x">
        <table className="ll-table min-w-[420px]">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>Planned</th>
              {cols.map((m) => (
                <th key={m} className="text-right">
                  {(SWAPPABLE as readonly string[]).includes(m) ? (
                    <SwapMetricHeader current={m as SwappableMetric} onSwap={(nm) => props.onSwapMetric(m as SwappableMetric, nm)} />
                  ) : (
                    appConfig.metrics.labels[m]
                  )}
                </th>
              ))}
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
        {showGhostRow && (
          <button
            onClick={props.onAddSet}
            className="w-full border-t border-dashed hairline py-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="inline h-2.5 w-2.5 mr-1" /> add set
          </button>
        )}
      </div>
    </div>
  );
}

function ItemCompleteCheckbox({ allComplete, noneComplete, onClick }: { allComplete: boolean; noneComplete: boolean; onClick: () => void }) {
  const indeterminate = !allComplete && !noneComplete;
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-5 w-5 border flex items-center justify-center transition-colors",
        allComplete ? "bg-foreground border-foreground text-background" : "hairline hover:bg-secondary",
      )}
      title={allComplete ? "Mark all incomplete" : "Mark all complete"}
      aria-label="Toggle all sets complete"
    >
      {allComplete && <span className="text-[0.7rem] leading-none">✓</span>}
      {indeterminate && <span className="block h-0.5 w-2.5 bg-foreground" />}
    </button>
  );
}

function MoveToSubmenu({ sections, currentSectionId, onMove }: { sections: LogSection[]; currentSectionId: string; onMove: (dstId: string) => void }) {
  const [open, setOpen] = useState(false);
  const others = sections.filter((s) => s.id !== currentSectionId);
  if (others.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center gap-2"
      >
        <ArrowRightLeft className="h-3 w-3" /> Move to…
      </button>
      {open && (
        <div className="border-t hairline pl-2">
          {others.map((s) => (
            <button
              key={s.id}
              onClick={() => onMove(s.id)}
              className="w-full text-left px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.1em] hover:bg-secondary truncate"
            >
              → {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SwapMetricHeader({ current, onSwap }: { current: SwappableMetric; onSwap: (m: SwappableMetric) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors duration-slow ease-swiss border-b border-dashed hairline pb-0.5">
          {appConfig.metrics.labels[current]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <div className="text-[0.55rem] uppercase tracking-[0.14em] text-muted-foreground px-2 pt-1 pb-2">Track as</div>
        {SWAPPABLE.map((m) => (
          <button
            key={m}
            onClick={() => onSwap(m)}
            className={cn(
              "w-full text-left px-3 py-2 text-xs uppercase tracking-[0.1em] font-bold hover:bg-secondary flex items-center justify-between",
              m === current && "bg-foreground text-background hover:bg-foreground",
            )}
          >
            <span>{appConfig.metrics.labels[m]}</span>
            <span className="opacity-60 text-[0.6rem]">{appConfig.metrics.units[m]}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function StepperInput(props: {
  value: number | null | undefined;
  step: number;
  placeholder?: string;
  prefilled?: boolean;
  onChange: (v: number | null) => void;
}) {
  const { value, step, placeholder, prefilled, onChange } = props;
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const show = hover || focused;
  const decimals = step < 1 ? 1 : 0;
  const adjust = useCallback((dir: 1 | -1) => {
    const cur = value ?? 0;
    const next = Math.max(0, Number((cur + dir * step).toFixed(decimals)));
    onChange(next);
  }, [value, step, onChange, decimals]);

  // Long-press accelerator
  const repeatRef = useRef<number | null>(null);
  function startRepeat(dir: 1 | -1) {
    adjust(dir);
    let delay = 250;
    const tick = () => {
      adjust(dir);
      delay = Math.max(40, delay * 0.85);
      repeatRef.current = window.setTimeout(tick, delay);
    };
    repeatRef.current = window.setTimeout(tick, delay);
  }
  function stopRepeat() {
    if (repeatRef.current) { window.clearTimeout(repeatRef.current); repeatRef.current = null; }
  }
  useEffect(() => () => stopRepeat(), []);

  return (
    <div className="relative inline-block" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : Number(v));
        }}
        className={cn(
          "w-16 text-right bg-transparent border-b hairline focus:border-foreground focus:outline-none transition-colors duration-slow ease-swiss font-mono pr-4",
          prefilled && "italic text-muted-foreground",
        )}
        placeholder={placeholder}
      />
      {show && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); startRepeat(1); }}
            onMouseUp={stopRepeat} onMouseLeave={stopRepeat}
            onTouchStart={(e) => { e.preventDefault(); startRepeat(1); }}
            onTouchEnd={stopRepeat}
            className="h-3 w-3 flex items-center justify-center text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label="Increase"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); startRepeat(-1); }}
            onMouseUp={stopRepeat} onMouseLeave={stopRepeat}
            onTouchStart={(e) => { e.preventDefault(); startRepeat(-1); }}
            onTouchEnd={stopRepeat}
            className="h-3 w-3 flex items-center justify-center text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label="Decrease"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}
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
  const [dx, setDx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startX = useRef<number | null>(null);
  const REVEAL = 72;
  const THRESHOLD = 40;

  function onPointerDown(e: React.PointerEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("input,button")) return;
    startX.current = e.clientX;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  }
  function onPointerMove(e: React.PointerEvent<HTMLTableRowElement>) {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    const base = revealed ? -REVEAL : 0;
    const next = Math.min(0, Math.max(-REVEAL, base + delta));
    setDx(next);
  }
  function onPointerUp(e: React.PointerEvent<HTMLTableRowElement>) {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    startX.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (revealed) {
      if (delta > THRESHOLD) { setRevealed(false); setDx(0); }
      else { setDx(-REVEAL); }
    } else {
      if (delta < -THRESHOLD) { setRevealed(true); setDx(-REVEAL); }
      else { setDx(0); }
    }
  }
  function closeSwipe() { setRevealed(false); setDx(0); }

  return (
    <tr
      className={cn("relative", set.actual.completed && "opacity-60")}
      style={{ transform: `translateX(${dx}px)`, transition: startX.current == null ? "transform 200ms cubic-bezier(0.22,1,0.36,1)" : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
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
      {cols.map((m) => {
        const step = m === "rpe" || m === "weight" ? 0.5 : 1;
        return (
          <td key={m} className="text-right">
            <StepperInput
              value={set.actual[m] as number | null | undefined}
              step={step}
              prefilled={set.actual.prefilled}
              placeholder={m === "weight" ? "0" : "—"}
              onChange={(v) => props.onChange(m, v)}
            />
          </td>
        );
      })}
      <td className="text-right">
        <button
          onClick={props.onStartRest}
          className="text-[0.6rem] uppercase tracking-[0.12em] border hairline px-1.5 py-0.5 hover:bg-secondary transition-colors duration-slow ease-swiss"
          title="Start rest"
        >
          rest
        </button>
      </td>
      <td className="text-right relative">
        <button
          onClick={props.onToggleComplete}
          className={`h-4 w-4 border ${set.actual.completed ? "bg-foreground border-foreground" : "hairline"}`}
          aria-label="Toggle complete"
        />
        <div
          aria-hidden={!revealed}
          className="absolute top-0 left-full h-full flex items-center justify-center"
          style={{ width: REVEAL, backgroundColor: "hsl(0 50% 27%)" }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); props.onRemove(); closeSwipe(); }}
            className="text-background h-full w-full flex items-center justify-center hover:bg-black/10 transition-colors"
            aria-label="Delete set"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
